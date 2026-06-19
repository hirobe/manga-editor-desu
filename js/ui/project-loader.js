// 選択プロジェクトフォルダ配下の pages/pXXX_page.json をページとして取り込むローダ。
// 仕様: llm_doc/format.md
// 既存ページはすべて破棄し新規プロジェクトとして再構築する。

const PROJECT_LOADER_FILES_API='/api/files';
const PROJECT_LOADER_FILE_API='/api/file';
const PROJECT_LOADER_PAGES_SUBDIR='pages';
const PROJECT_LOADER_PATTERN='^p\\d+_page(?:_edit)?\\.json$';
const projectLoaderPageFiles=new Map();
let projectLoaderRestoring=false;

window.ProjectLoader={
loadFromFolder:loadProjectPagesFromFolder,
syncCurrentPageEdit:syncCurrentPageEdit,
fileUrl:fileUrlForProjectLoaderPath
};

async function loadProjectPagesFromFolder(folderPath,folderDisplayPath){
const pagesPath=folderPath?`${folderPath}/${PROJECT_LOADER_PAGES_SUBDIR}`:PROJECT_LOADER_PAGES_SUBDIR;
const url=`${PROJECT_LOADER_FILES_API}?path=${encodeURIComponent(pagesPath)}&pattern=${encodeURIComponent(PROJECT_LOADER_PATTERN)}`;

let listJson;
try{
const res=await fetch(url);
if(res.status===404){
createToastError(plText('projectLoaderError'),[plText('projectLoaderNoPagesDir')]);
return;
}
if(!res.ok) throw new Error('list http '+res.status);
listJson=await res.json();
}catch(err){
folderPickerLogger.error('list files failed',err);
createToastError(plText('projectLoaderError'),[err.message||'']);
return;
}

const fileByPage=(listJson.entries||[])
.map(entry=>{
const m=entry.name.match(/^p(\d+)_page(_edit)?\.json$/);
return m?{...entry,num:parseInt(m[1],10),isEdit:!!m[2]}:null;
})
.filter(Boolean)
.reduce((map,entry)=>{
const current=map.get(entry.num);
if(!current||entry.isEdit){
map.set(entry.num,entry);
}
return map;
},new Map());

const sorted=Array.from(fileByPage.values())
.sort((a,b)=>a.num-b.num);

if(sorted.length===0){
createToastError(plText('projectLoaderError'),[plText('projectLoaderNoPages')]);
return;
}

resetProjectBtm();
projectLoaderPageFiles.clear();

let loaded=0;
for(const file of sorted){
try{
const res=await fetch(`${PROJECT_LOADER_FILE_API}?path=${encodeURIComponent(file.path)}`);
if(!res.ok) throw new Error('file http '+res.status);
const pageJson=await res.json();
await addJsonAsPage(pageJson,pagesPath,file);
loaded++;
}catch(err){
folderPickerLogger.error('page load failed',err,file);
}
}

if(loaded===0){
createToastError(plText('projectLoaderError'),[]);
return;
}
// 取り込み中は_projectLoaderBuildingでリサイズが抑止され、各ページは生ページ寸法の
// まま表示されている。先頭ページを再表示してウィンドウに合わせ拡大率を正す(issue #76)。
const firstGuid=btmGetFirstGuidByIndex();
if(firstGuid){
await chengeCanvasByGuid(firstGuid);
}
createToast(plText('projectLoaderLoaded'),[`${loaded} / ${sorted.length}`,folderDisplayPath||folderPath]);
}

function resetProjectBtm(){
btmProjectsMap.clear();
const container=$("btm-image-container");
if(container) container.innerHTML='';
}

async function addJsonAsPage(pageJson,pagesBasePath,file){
const newGuid=pageJson.canvasGuid||generateGUID();
setCanvasGUID(newGuid);
canvas.clear();

// ページサイズはresizeCanvasByNumで設定する。raw setWidth/setHeightだと
// aspectRatioが更新されず、後続のadjustCanvasSizeが旧アスペクト(A4等)で
// 合わせてコマを非一様に歪ませるため。
if(pageJson.pageSize&&pageJson.pageSize.width&&pageJson.pageSize.height){
resizeCanvasByNum(pageJson.pageSize.width,pageJson.pageSize.height);
}

// canvas.clear()で背景色がクリアされるため、ひな形パネルと同様にページ背景を
// bg-color(既定#ffffff=白)に設定する。既定の灰色のままにしない。
canvas.backgroundColor=$("bg-color").value;

// ビルド中の画像ロードawait中にリサイズが割り込んでスケールが累積するのを防ぐ。
window._projectLoaderBuilding=true;
try{
const layers=Array.isArray(pageJson.layers)?pageJson.layers:[];
for(const layerSpec of layers){
await addLayerWithChildren(layerSpec,pagesBasePath);
}
// 全オブジェクトの基準状態をページサイズ(scale=1)で揃えてから保存する。
// 画像のclipPathもここでinitialが設定され、画像と同一canvasサイズで同期する。
canvas.getObjects().forEach(obj=>saveInitialState(obj));
}finally{
window._projectLoaderBuilding=false;
}

canvas.renderAll();
registerProjectLoaderPageFile(newGuid,file);
projectLoaderRestoring=true;
try{
await btmSaveProjectFile(newGuid,false);
}finally{
projectLoaderRestoring=false;
}
}

async function addLayerWithChildren(spec,pagesBasePath){
// 吹き出しはグループにまとめず、本体(シェイプ)とテキストを別オブジェクトで配置する。
if(spec&&spec.type==='group'&&spec.customType==='speechBubbleSVG'){
await addSpeechBubbleSeparate(spec,pagesBasePath);
return;
}
const obj=await enlivenLayer(spec,pagesBasePath);
if(obj) canvas.add(obj);
if(spec.type!=='group'&&Array.isArray(spec.children)){
for(const childSpec of spec.children){
await addLayerWithChildren(childSpec,pagesBasePath);
}
}
}

// 吹き出しグループを「本体シェイプ(speechBubbleSVG)」と「テキスト(通常のテキスト)」の
// 2オブジェクトに分けて配置する。子のローカル座標はグループのleft/topを足して絶対化する。
async function addSpeechBubbleSeparate(spec,pagesBasePath){
const gx=numOr(spec.left,0);
const gy=numOr(spec.top,0);
const children=Array.isArray(spec.children)?spec.children:[];
const shapeSpec=children.find(c=>c&&(c.type==='path'||c.type==='polygon'||c.type==='rect'));
const textSpec=children.find(c=>c&&(c.type==='vertical-textbox'||c.type==='textbox'||c.type==='text'||c.type==='i-text'));

let bubble=null;
if(shapeSpec){
bubble=await enlivenLayer({...shapeSpec,left:gx+numOr(shapeSpec.left,0),top:gy+numOr(shapeSpec.top,0)},pagesBasePath);
}
let text=null;
if(textSpec){
text=await enlivenLayer({...textSpec,left:gx+numOr(textSpec.left,0),top:gy+numOr(textSpec.top,0)},pagesBasePath);
}

if(bubble){
bubble.customType='speechBubbleSVG';
if(spec.guid) bubble.guid=spec.guid;
if(spec.name) bubble.name=spec.name;
if(spec.relatedPoly) bubble.relatedPoly=spec.relatedPoly;
// reSetSpeechBubbleTextがobj.guidsを参照するため必ず配列を持たせる。
bubble.guids=(text&&text.guid)?[text.guid]:[];
canvas.add(bubble);
}
if(text){
if(bubble&&bubble.guid) text.relatedPoly=bubble.guid;
canvas.add(text);
}
}

async function enlivenLayer(spec,pagesBasePath){
if(!spec||!spec.type){
folderPickerLogger.warn('layer spec missing type',spec);
return null;
}

let obj=null;
switch(spec.type){
case 'image':
obj=await createImageLayer(spec,pagesBasePath);
break;
case 'rect':
obj=createRectLayer(spec);
break;
case 'polygon':
obj=createPolygonLayer(spec);
break;
case 'path':
obj=createPathLayer(spec);
break;
case 'textbox':
case 'text':
case 'i-text':
obj=createTextboxLayer(spec);
break;
case 'vertical-textbox':
obj=createVerticalTextboxLayer(spec);
break;
case 'group':
obj=await createGroupLayer(spec,pagesBasePath);
break;
default:
folderPickerLogger.warn('unsupported layer type',spec.type,spec);
return null;
}

if(obj) applyMetaProps(obj,spec);
return obj;
}

function applyMetaProps(obj,spec){
if(spec.scaleX!==undefined) obj.scaleX=spec.scaleX;
if(spec.scaleY!==undefined) obj.scaleY=spec.scaleY;
if(spec.originX!==undefined) obj.originX=spec.originX;
if(spec.originY!==undefined) obj.originY=spec.originY;
if(spec.angle!==undefined) obj.angle=spec.angle;
if(spec.opacity!==undefined) obj.opacity=spec.opacity;
if(spec.visible!==undefined) obj.visible=spec.visible;
if(spec.selectable!==undefined) obj.selectable=spec.selectable;
if(spec.flipX!==undefined) obj.flipX=spec.flipX;
if(spec.flipY!==undefined) obj.flipY=spec.flipY;
if(spec.skewX!==undefined) obj.skewX=spec.skewX;
if(spec.skewY!==undefined) obj.skewY=spec.skewY;
if(spec.guid) obj.guid=spec.guid;
if(Array.isArray(spec.guids)) obj.guids=spec.guids.slice();
if(spec.relatedPoly) obj.relatedPoly=spec.relatedPoly;
if(spec.isPanel) obj.isPanel=true;
if(spec.customType) obj.customType=spec.customType;
if(spec.name) obj.name=spec.name;
}

function createImageLayer(spec,pagesBasePath){
return new Promise((resolve,reject)=>{
const src=resolveSrc(spec.src,pagesBasePath);
if(!src){
reject(new Error('image src missing'));
return;
}
fabric.Image.fromURL(src,(img)=>{
if(!img){
reject(new Error('image load failed: '+spec.src));
return;
}
const ax=numOr(spec.left,0);
const ay=numOr(spec.top,0);
const areaW=numOr(spec.width,0);
const areaH=numOr(spec.height,0);
img.set({left:ax,top:ay});
img.projectLoaderSrc=spec.src;
img.projectLoaderPath=resolveProjectLoaderAssetPath(spec.src,pagesBasePath);
img.projectLoaderBasePath=pagesBasePath;
if(spec.scaleX!==undefined) img.scaleX=spec.scaleX;
if(spec.scaleY!==undefined) img.scaleY=spec.scaleY;
if(spec.preserveTransform){
if(spec.clipPath&&spec.clipPath.width&&spec.clipPath.height){
img.clipPath=new fabric.Rect({
left:numOr(spec.clipPath.left,0),
top:numOr(spec.clipPath.top,0),
width:numOr(spec.clipPath.width,0),
height:numOr(spec.clipPath.height,0),
strokeWidth:0,
absolutePositioned:true
});
}
}else if(areaW&&areaH&&img.width&&img.height){
// アスペクト比を保ったままコマを埋める(cover)。長辺基準で倍率を決め余白を
// 出さず中央配置する。
const scale=Math.max(areaW/img.width,areaH/img.height);
img.scaleX=scale;
img.scaleY=scale;
img.left=ax+(areaW-img.width*scale)/2;
img.top=ay+(areaH-img.height*scale)/2;
// コマ枠内だけ表示する(画像オブジェクト自体は無傷=ひな形パネルと同じ)。
// コマ領域(幾何矩形)を窓にする絶対配置clipPath。再読込時はupdateRectClipPathが
// 再生成する。initialはaddJsonAsPageのsaveInitialStateで画像と同期させる。
img.clipPath=new fabric.Rect({left:ax,top:ay,width:areaW,height:areaH,strokeWidth:0,absolutePositioned:true});
}else if(areaW&&img.width){
img.scaleX=img.scaleY=areaW/img.width;
}else if(areaH&&img.height){
img.scaleX=img.scaleY=areaH/img.height;
}
resolve(img);
},{crossOrigin:'anonymous'});
});
}

// 線の種類(strokeDashArray)・線端/結合・角丸(rx/ry)を読み込み側へ反映。
function applyStrokeStyle(obj,spec){
if(Array.isArray(spec.strokeDashArray)) obj.strokeDashArray=spec.strokeDashArray.slice();
if(spec.strokeLineCap!==undefined) obj.strokeLineCap=spec.strokeLineCap;
if(spec.strokeLineJoin!==undefined) obj.strokeLineJoin=spec.strokeLineJoin;
if(spec.rx!==undefined) obj.rx=spec.rx;
if(spec.ry!==undefined) obj.ry=spec.ry;
return obj;
}

function createRectLayer(spec){
const shift=strokeShift(spec);
return applyStrokeStyle(new fabric.Rect({
left:numOr(spec.left,0)-shift,
top:numOr(spec.top,0)-shift,
width:numOr(spec.width,100),
height:numOr(spec.height,100),
fill:spec.fill||'transparent',
stroke:spec.stroke,
strokeWidth:numOr(spec.strokeWidth,0)
}),spec);
}

function createPolygonLayer(spec){
const points=Array.isArray(spec.points)?spec.points:[];
const shift=strokeShift(spec);
return applyStrokeStyle(new fabric.Polygon(points,{
left:numOr(spec.left,0)-shift,
top:numOr(spec.top,0)-shift,
fill:spec.fill||'transparent',
stroke:spec.stroke,
strokeWidth:numOr(spec.strokeWidth,0)
}),spec);
}

function createPathLayer(spec){
const shift=strokeShift(spec);
return applyStrokeStyle(new fabric.Path(spec.d||'M 0 0',{
left:numOr(spec.left,0)-shift,
top:numOr(spec.top,0)-shift,
fill:spec.fill||'transparent',
stroke:spec.stroke,
strokeWidth:numOr(spec.strokeWidth,0)
}),spec);
}

// テキスト装飾系(太字/斜体/下線類/輪郭/文字間隔/背景色)をopts/objへ反映する。
// 保存側plSerializeTextの出力と対になる。strokeWidthは保存時にページ空間化済み。
function applyTextStyle(opts,spec){
if(spec.fontFamily) opts.fontFamily=spec.fontFamily;
if(spec.fill) opts.fill=spec.fill;
if(spec.textAlign) opts.textAlign=spec.textAlign;
if(spec.lineHeight!==undefined) opts.lineHeight=spec.lineHeight;
if(spec.fontWeight!==undefined) opts.fontWeight=spec.fontWeight;
if(spec.fontStyle!==undefined) opts.fontStyle=spec.fontStyle;
if(spec.underline!==undefined) opts.underline=spec.underline;
if(spec.linethrough!==undefined) opts.linethrough=spec.linethrough;
if(spec.overline!==undefined) opts.overline=spec.overline;
if(spec.backgroundColor!==undefined) opts.backgroundColor=spec.backgroundColor;
if(spec.textBackgroundColor!==undefined) opts.textBackgroundColor=spec.textBackgroundColor;
if(spec.charSpacing!==undefined) opts.charSpacing=spec.charSpacing;
if(spec.stroke!==undefined) opts.stroke=spec.stroke;
if(spec.strokeWidth!==undefined) opts.strokeWidth=spec.strokeWidth;
return opts;
}

function createTextboxLayer(spec){
const opts=applyTextStyle({
left:numOr(spec.left,0),
top:numOr(spec.top,0),
fontSize:numOr(spec.fontSize,16)
},spec);
if(spec.width!==undefined) opts.width=spec.width;
return new fabric.Textbox(spec.text||'',opts);
}

function createVerticalTextboxLayer(spec){
if(typeof fabric.VerticalTextbox==='function'){
if(spec.preserveTransform){
const opts={
left:numOr(spec.left,0),
top:numOr(spec.top,0),
fontSize:numOr(spec.fontSize,16),
originX:spec.originX||'center',
originY:spec.originY||'top',
textAlign:spec.textAlign||'center'
};
if(spec.width!==undefined) opts.width=spec.width;
if(spec.height!==undefined) opts.height=spec.height;
if(spec.fontFamily) opts.fontFamily=spec.fontFamily;
if(spec.fill) opts.fill=spec.fill;
return new fabric.VerticalTextbox(spec.text||'',opts);
}
// 縦書きはテキスト領域の左上ではなく、領域内に中央寄せで配置する(ネイティブ準拠)。
// VerticalTextboxのwidthは列数から自動算出されるため設定しない。heightが
// 縦列の折返し長になるので、領域の高さ(無ければ幅で近似)を渡す。
const areaW=numOr(spec.width,0);
const colLen=numOr(spec.height,areaW);
const opts=applyTextStyle({
left:numOr(spec.left,0)+areaW/2,
top:numOr(spec.top,0),
fontSize:numOr(spec.fontSize,16),
originX:'center',
originY:'top',
textAlign:'center'
},spec);
// 縦書きは領域中央寄せが既定。specにtextAlignが無ければcenterを維持。
if(spec.textAlign===undefined) opts.textAlign='center';
if(colLen) opts.height=colLen;
return new fabric.VerticalTextbox(spec.text||'',opts);
}
folderPickerLogger.warn('fabric.VerticalTextbox not available; vertical-textbox is unsupported',spec);
return null;
}

async function createGroupLayer(spec,pagesBasePath){
const children=[];
const childSpecs=Array.isArray(spec.children)?spec.children:[];
for(const childSpec of childSpecs){
const childObj=await enlivenLayer(childSpec,pagesBasePath);
if(childObj) children.push(childObj);
}
const shift=groupStrokeShift(spec);
const group=new fabric.Group(children,{
left:numOr(spec.left,0)-shift,
top:numOr(spec.top,0)-shift
});
// speechBubbleSVG等はreSetSpeechBubbleTextがobj.guidsを参照するため、
// specにguidsが無くても子のguidから補完する(未設定だと読込時に例外)。
if(!Array.isArray(spec.guids)){
const childGuids=childSpecs.map(child=>child.guid).filter(Boolean);
if(childGuids.length) group.guids=childGuids;
}
return group;
}

function resolveSrc(src,pagesBasePath){
const fullPath=resolveProjectLoaderAssetPath(src,pagesBasePath);
if(!fullPath) return null;
if(fullPath===src&&(src.startsWith('data:')||src.startsWith('http://')||src.startsWith('https://'))){
return src;
}
return fileUrlForProjectLoaderPath(fullPath);
}

function resolveProjectLoaderAssetPath(src,pagesBasePath){
if(!src) return null;
if(src.startsWith('data:')||src.startsWith('http://')||src.startsWith('https://')){
return src;
}
const clean=src.replace(/^\.\//,'');
return pagesBasePath?`${pagesBasePath}/${clean}`:clean;
}

function fileUrlForProjectLoaderPath(path){
return `${PROJECT_LOADER_FILE_API}?path=${encodeURIComponent(path)}`;
}

function numOr(v,fallback){
return (v===undefined||v===null||isNaN(v))?fallback:v;
}

// fabricのleft/topはstroke外側を指すため、SVG/外部座標(幾何形状の角)に合わせて
// strokeWidth/2だけ左上に補正する。これをしないと枠線分(strokeWidth/2)右下にズレる。
function strokeShift(spec){
return numOr(spec.strokeWidth,0)/2;
}

// グループ(吹き出し等)はfabricが子のbboxで再配置するため、bbox端を成す子のstroke分だけ
// グループ自体を補正する。子要素中の最大strokeWidthを端の枠線とみなす。
function groupStrokeShift(spec){
const children=Array.isArray(spec.children)?spec.children:[];
let max=0;
for(const child of children){
const sw=numOr(child.strokeWidth,0);
if(sw>max) max=sw;
}
return max/2;
}

function plText(key){
if(typeof i18next!=='undefined'&&i18next.isInitialized){
return i18next.t(key);
}
return key;
}

function registerProjectLoaderPageFile(guid,file){
if(!guid||!file) return;
const sourcePath=file.path;
const editPath=sourcePath.replace(/_page(?:_edit)?\.json$/,'_page_edit.json');
const originalPath=sourcePath.replace(/_page_edit\.json$/,'_page.json');
projectLoaderPageFiles.set(guid,{
sourcePath:sourcePath,
editPath:editPath,
copyFrom:file.isEdit?null:originalPath
});
}

async function syncCurrentPageEdit(guid){
if(projectLoaderRestoring) return;
guid=guid||getCanvasGUID();
const pageFile=projectLoaderPageFiles.get(guid);
if(!pageFile) return;
const pageJson=serializeCurrentPageForProjectLoader(guid);
const res=await fetch(PROJECT_LOADER_FILE_API,{
method:'PUT',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
path:pageFile.editPath,
copyFrom:pageFile.copyFrom,
content:JSON.stringify(pageJson,null,2)+"\n"
})
});
if(!res.ok) throw new Error('page edit save http '+res.status);
pageFile.copyFrom=null;
pageFile.sourcePath=pageFile.editPath;
}

// 編集ページを入力フォーマット(pXXX_page.json, llm_doc/format.md)と同一スキーマで
// 書き出す。表示中(フィット済み)キャンバスを、実ページ寸法・scale=1・階層構造へ
// 正規化する。ローダ側(addJsonAsPage系)は変更せず、入力フォーマットの読込パスで
// そのまま読める形にする(preserveTransform/明示clipPath/明示scaleXは出力しない)。
function serializeCurrentPageForProjectLoader(guid){
const F=plPageScaleFactor();
const objs=canvas.getObjects();
// 副作用なしのguid->objマップ(createGUIDMapはguid生成代入の副作用があるため使わない)
const guidMap=new Map();
objs.forEach(o=>{ if(o&&o.guid) guidMap.set(o.guid,o); });
// パネル/吹き出し本体が「子」として参照するguid。これらはchildrenにネストし
// top-levelには出さない。freehand等は子を吸い上げずloose展開する。
const childGuids=new Set();
objs.forEach(o=>{
if(o&&Array.isArray(o.guids)&&(o.isPanel||isSpeechBubbleSVG(o))){
o.guids.forEach(g=>childGuids.add(g));
}
});
const layers=objs
.filter(o=>plIsSerializable(o)&&!(o.guid&&childGuids.has(o.guid)))
.map(o=>plSerializeNode(o,F,guidMap))
.filter(Boolean);
return {
version:'1.0',
pageSize:{
width:initialCanvasWidth||canvas.getWidth(),
height:initialCanvasHeight||canvas.getHeight()
},
canvasGuid:guid||getCanvasGUID(),
layers:layers
};
}

// 表示空間→論理ページ空間の倍率(縦横一様)。initialCanvasWidth/Heightはエディタの
// 論理キャンバス寸法で、ウィンドウフィット用resizeCanvasでは不変=安定した基準。
// これによりpageSizeがウィンドウ依存でドリフトしない。
function plPageScaleFactor(){
const w=canvas.getWidth();
if(!initialCanvasWidth||!w) return 1;
return initialCanvasWidth/w;
}

// レイヤーパネル非表示やアイコン等の一時オブジェクトは保存対象外。
function plIsSerializable(obj){
if(!obj) return false;
if(obj.excludeFromLayerPanel) return false;
if(obj.isIcon) return false;
return true;
}

function plSerializeNode(obj,F,guidMap){
if(!plIsSerializable(obj)) return null;
if(obj.isPanel) return plSerializePanel(obj,F,guidMap);
if(isSpeechBubbleSVG(obj)) return plSerializeBubbleGroup(obj,F,guidMap);
const type=normalizeProjectLoaderType(obj);
if(type==='image') return plSerializeImage(obj,F);
if(type==='textbox'||type==='text'||type==='i-text'||type==='vertical-textbox') return plSerializeText(obj,F);
if(type==='rect'||type==='polygon'||type==='path') return plSerializeShape(obj,F);
if(type==='group') return plSerializeGenericGroup(obj,F,guidMap);
return plSerializeBase(obj,F);
}

// 共通プロパティ(scaleX/scaleY/originX/originY/preserveTransform/clipPathは出さない)。
// left/topは実ページ空間へ(×F)。
function plSerializeBase(obj,F){
const spec={
guid:obj.guid||generateGUID(),
type:normalizeProjectLoaderType(obj),
left:numOr(obj.left,0)*F,
top:numOr(obj.top,0)*F
};
copyProjectLoaderProp(spec,obj,'customType');
copyProjectLoaderProp(spec,obj,'name');
copyProjectLoaderProp(spec,obj,'angle');
copyProjectLoaderProp(spec,obj,'opacity');
copyProjectLoaderProp(spec,obj,'visible');
copyProjectLoaderProp(spec,obj,'selectable');
// 反転・スキューは初期値(false/0)以外のときのみ出力する。flipは真偽、skewは
// 角度(度)なのでページ空間倍率Fの影響を受けない。
if(obj.flipX) spec.flipX=true;
if(obj.flipY) spec.flipY=true;
if(obj.skewX) spec.skewX=obj.skewX;
if(obj.skewY) spec.skewY=obj.skewY;
return spec;
}

// パネル直下の子(画像・吹き出し)をchildrenにネストし、guids/relatedPolyを整える。
function plAttachPanelChildren(spec,obj,F,guidMap){
if(!Array.isArray(obj.guids)) return;
const children=[];
const guids=[];
obj.guids.forEach(g=>{
const child=guidMap.get(g);
if(!child||!plIsSerializable(child)) return;
const childSpec=plSerializeNode(child,F,guidMap);
if(!childSpec) return;
childSpec.relatedPoly=obj.guid;
children.push(childSpec);
guids.push(g);
});
if(guids.length) spec.guids=guids;
if(children.length) spec.children=children;
}

// パネル(rect/polygon, isPanel)。width/height/strokeWidthへscaleを畳んでページ空間化。
function plSerializePanel(obj,F,guidMap){
const type=normalizeProjectLoaderType(obj);
const spec=plSerializeBase(obj,F);
spec.isPanel=true;
const scaleX=numOr(obj.scaleX,1),scaleY=numOr(obj.scaleY,1);
spec.width=numOr(obj.width,0)*scaleX*F;
spec.height=numOr(obj.height,0)*scaleY*F;
copyProjectLoaderProp(spec,obj,'fill');
copyProjectLoaderProp(spec,obj,'stroke');
spec.strokeWidth=numOr(obj.strokeWidth,0)*F;
plSerializeStrokeStyle(spec,obj,F);
if(type==='polygon'){
// pointsは形状ローカル座標(obj.scaleXで拡縮される)。読込側はpointsをscale=1で
// 使うため、scaleXとFを畳んでページ空間の実寸へする(F だけだと scaleX 分はみ出す)。
spec.points=plScalePoints(obj,F);
}
restoreProjectLoaderStrokeShift(spec);
plAttachPanelChildren(spec,obj,F,guidMap);
return spec;
}

// polygon等のpointsをページ空間(scale畳み込み)へ。x*scaleX*F, y*scaleY*F。
function plScalePoints(obj,F){
const sx=numOr(obj.scaleX,1)*F,sy=numOr(obj.scaleY,1)*F;
return Array.isArray(obj.points)?obj.points.map(p=>({x:p.x*sx,y:p.y*sy})):[];
}

// path の d をページ空間へ。d座標もローカル(scaleXで拡縮)のため、scaleとFを畳む。
// パネル/吹き出しはアスペクト一様(scaleX==scaleY)のため一様倍率で全数値をスケール。
function plScalePathD(obj,F){
const s=numOr(obj.scaleX,1)*F;
if(!Array.isArray(obj.path)) return obj.d||'';
return obj.path.map(cmd=>cmd.map((t,i)=>(i===0||typeof t!=='number')?t:+(t*s).toFixed(3)).join(' ')).join(' ');
}

// 画像。コマ内で手動移動/ズームした状態を往復で保持するため、画像の実変換
// (実位置left/top・scaleX/scaleY・コマ窓clipPath)を preserveTransform 付きで保存する。
// ローダはこの場合 cover-fit せず実変換を復元する。コマ外の loose 画像は
// boundingRect から left/top/width/height を出す(従来通り)。
function plSerializeImage(obj,F){
const spec=plSerializeBase(obj,F);
spec.src=obj.projectLoaderSrc||extractProjectLoaderImageSrc(obj);
const cp=obj.clipPath;
if(cp&&numOr(cp.width,0)&&numOr(cp.height,0)){
spec.preserveTransform=true;
// plSerializeBaseがleft/top=画像の実位置(×F)を設定済み。スケールも×Fで
// ページ空間化する(ローダはscaleXをそのまま使う)。
spec.scaleX=numOr(obj.scaleX,1)*F;
spec.scaleY=numOr(obj.scaleY,1)*F;
// 表示サイズ(レンダラ用。ローダはpreserveTransform時これを使わない)。
spec.width=numOr(obj.width,0)*numOr(obj.scaleX,1)*F;
spec.height=numOr(obj.height,0)*numOr(obj.scaleY,1)*F;
// コマ窓(絶対配置clipPath)をページ空間で。
spec.clipPath={
left:numOr(cp.left,0)*F,
top:numOr(cp.top,0)*F,
width:numOr(cp.width,0)*numOr(cp.scaleX,1)*F,
height:numOr(cp.height,0)*numOr(cp.scaleY,1)*F
};
}else{
const br=obj.getBoundingRect(true,true);
spec.left=br.left*F;
spec.top=br.top*F;
spec.width=br.width*F;
spec.height=br.height*F;
}
return spec;
}

// 線の種類(破線/点線)・線端形状・角丸をシリアライズ。strokeDashArrayの各要素は
// strokeWidth同様にページ空間化(×F)する。rx/ryは寸法なのでwidth/height同様にscaleを
// 畳み込む(×scaleX×F / ×scaleY×F)。
function plSerializeStrokeStyle(spec,obj,F){
if(Array.isArray(obj.strokeDashArray)&&obj.strokeDashArray.length){
spec.strokeDashArray=obj.strokeDashArray.map(n=>numOr(n,0)*F);
}
copyProjectLoaderProp(spec,obj,'strokeLineCap');
copyProjectLoaderProp(spec,obj,'strokeLineJoin');
if(obj.rx) spec.rx=numOr(obj.rx,0)*numOr(obj.scaleX,1)*F;
if(obj.ry) spec.ry=numOr(obj.ry,0)*numOr(obj.scaleY,1)*F;
}

// loose な path/rect/polygon(非パネル)。freehand吹き出し等はcustomType/guidsを保持。
function plSerializeShape(obj,F){
const type=normalizeProjectLoaderType(obj);
const spec=plSerializeBase(obj,F);
const scaleX=numOr(obj.scaleX,1),scaleY=numOr(obj.scaleY,1);
spec.width=numOr(obj.width,0)*scaleX*F;
spec.height=numOr(obj.height,0)*scaleY*F;
copyProjectLoaderProp(spec,obj,'fill');
copyProjectLoaderProp(spec,obj,'stroke');
spec.strokeWidth=numOr(obj.strokeWidth,0)*F;
plSerializeStrokeStyle(spec,obj,F);
if(type==='polygon'){
spec.points=plScalePoints(obj,F);
}else if(type==='path'){
spec.d=plScalePathD(obj,F);
}
restoreProjectLoaderStrokeShift(spec);
if(Array.isArray(obj.guids)) spec.guids=obj.guids.slice();
return spec;
}

// テキスト。width/fontSizeへscaleを畳んでページ空間化。vertical-textbox(およびcenter
// originの横書き)は読込側が領域中央へ寄せるため、中心X→領域左上に逆補正する。
function plSerializeText(obj,F){
const type=normalizeProjectLoaderType(obj);
const spec=plSerializeBase(obj,F);
spec.text=obj.text||'';
const w=numOr(obj.width,0)*numOr(obj.scaleX,1)*F;
spec.width=w;
spec.height=numOr(obj.height,0)*numOr(obj.scaleY,1)*F;
copyProjectLoaderProp(spec,obj,'fontFamily');
copyProjectLoaderProp(spec,obj,'fill');
copyProjectLoaderProp(spec,obj,'textAlign');
copyProjectLoaderProp(spec,obj,'lineHeight');
// 装飾系スカラー。fontWeight/fontStyle/各種下線/背景色は寸法でないため換算不要。
copyProjectLoaderProp(spec,obj,'fontWeight');
copyProjectLoaderProp(spec,obj,'fontStyle');
copyProjectLoaderProp(spec,obj,'underline');
copyProjectLoaderProp(spec,obj,'linethrough');
copyProjectLoaderProp(spec,obj,'overline');
copyProjectLoaderProp(spec,obj,'backgroundColor');
copyProjectLoaderProp(spec,obj,'textBackgroundColor');
// charSpacingはfabricでは1/1000em(fontSize比)の相対値なのでscale非依存。
copyProjectLoaderProp(spec,obj,'charSpacing');
// テキスト輪郭(ネオン含む)。strokeWidthはオブジェクトscaleで拡縮されるため
// fontSize同様に×scaleX×Fで畳み込む。
copyProjectLoaderProp(spec,obj,'stroke');
if(obj.strokeWidth!==undefined&&obj.strokeWidth!==0){
spec.strokeWidth=numOr(obj.strokeWidth,0)*numOr(obj.scaleX,1)*F;
}
// fontSizeも幅/高さと同様にscaleを畳み込む(×scaleX×F)。fontSizeはresizeCanvasの
// ウィンドウフィットで変化せずscaleXに吸収されるため、×Fだけだとフィット倍率(scaleX)
// 分ずれ、保存→再読込のたびにfontSizeがドリフトする。アスペクト一様でscaleX==scaleY。
if(obj.fontSize!==undefined) spec.fontSize=numOr(obj.fontSize,16)*numOr(obj.scaleX,1)*F;
if(type==='vertical-textbox'||obj.originX==='center'){
spec.left=numOr(obj.left,0)*F-w/2;
}
return spec;
}

// 吹き出し(speechBubbleSVG)を入力フォーマットの group(customType)+children[shape,text]
// へ再合成する。シェイプとテキストは「別々に移動できる対等な子」なので、グループ原点は
// シェイプではなく shape+text を囲む安定アンカー(両者の左上の最小)に置き、shape も text も
// そのアンカー基準の独立した相対座標で出力する(従来の shape=0,0 固定はやめる)。
function plSerializeBubbleGroup(shape,F,guidMap){
const type=normalizeProjectLoaderType(shape);
const sw=numOr(shape.strokeWidth,0)*F;
// シェイプ幾何左上(ページ空間)。strokeShiftぶん(sw/2)を足して角に揃える。
const shapeX=numOr(shape.left,0)*F+sw/2;
const shapeY=numOr(shape.top,0)*F+sw/2;
// テキスト子(guidsの中からテキストを探す)。先にシリアライズして絶対座標を得る。
let text=null;
(shape.guids||[]).forEach(g=>{
const c=guidMap.get(g);
if(c&&isText(c)&&plIsSerializable(c)&&!text) text=c;
});
const textSpec=text?plSerializeText(text,F):null; // 絶対(ページ空間)left/top
// アンカー = shape と text を囲む左上。textが無ければシェイプ角。
let ax=shapeX,ay=shapeY;
if(textSpec){
ax=Math.min(ax,numOr(textSpec.left,shapeX));
ay=Math.min(ay,numOr(textSpec.top,shapeY));
}
const group={
guid:shape.guid||generateGUID(),
type:'group',
customType:'speechBubbleSVG',
left:ax,
top:ay
};
copyProjectLoaderProp(group,shape,'name');
// 本体シェイプ(アンカー基準の独立相対座標)。d/pointsはシェイプ自身のローカル原点
// 基準のままで、配置は left/top が担う。
const shapeChild={
guid:(shape.guid||generateGUID())+'-shape',
type:type,
left:shapeX-ax,
top:shapeY-ay
};
if(type==='path'){
shapeChild.d=plScalePathD(shape,F);
}else if(type==='polygon'){
shapeChild.points=plScalePoints(shape,F);
}else{
shapeChild.width=numOr(shape.width,0)*numOr(shape.scaleX,1)*F;
shapeChild.height=numOr(shape.height,0)*numOr(shape.scaleY,1)*F;
}
copyProjectLoaderProp(shapeChild,shape,'fill');
copyProjectLoaderProp(shapeChild,shape,'stroke');
shapeChild.strokeWidth=sw;
plSerializeStrokeStyle(shapeChild,shape,F);
const children=[shapeChild];
const guids=[shapeChild.guid];
if(text&&textSpec){
// plSerializeTextが返す絶対(ページ空間)left/topをアンカー基準の相対へ。
textSpec.left=numOr(textSpec.left,0)-ax;
textSpec.top=numOr(textSpec.top,0)-ay;
children.push(textSpec);
guids.push(text.guid||textSpec.guid);
}
group.guids=guids;
group.children=children;
return group;
}

// customType無しの汎用group(稀)。子をそのまま再帰シリアライズ。
function plSerializeGenericGroup(obj,F,guidMap){
const spec=plSerializeBase(obj,F);
const kids=(obj.getObjects?obj.getObjects():[]);
spec.children=kids.map(k=>plSerializeNode(k,F,guidMap)).filter(Boolean);
return spec;
}

function normalizeProjectLoaderType(obj){
if(obj.type==='vertical-textbox') return 'vertical-textbox';
if(obj.type==='textbox'||obj.type==='text'||obj.type==='i-text') return obj.type;
if(obj.type==='image'||obj.type==='rect'||obj.type==='polygon'||obj.type==='path'||obj.type==='group') return obj.type;
return obj.type||'object';
}

function copyProjectLoaderProp(spec,obj,prop){
if(obj[prop]!==undefined) spec[prop]=obj[prop];
}

function extractProjectLoaderImageSrc(obj){
if(typeof obj.getSrc==='function'){
return obj.getSrc();
}
return obj.src||'';
}

function restoreProjectLoaderStrokeShift(spec){
const shift=strokeShift(spec);
spec.left=numOr(spec.left,0)+shift;
spec.top=numOr(spec.top,0)+shift;
}
