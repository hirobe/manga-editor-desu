// Canvas object right-click context menu
const languageSelector=$('fabricjs-language-selector');
let lastClickType=null;
let objectMenu=null;

var menuIconMap={
"visibleOn":"visibility",
"visibleOff":"visibility_off",
"movementOn":"lock_open",
"movementOff":"lock",
"editOn":"edit",
"editOff":"edit",
"knifeOn":"content_cut",
"knifeOff":"content_cut",
"delete":"delete",
"selectClear":"deselect",
"generate":"auto_awesome",
"rembg":"auto_fix_high",
"upscale":"zoom_in",
"inpaint":"brush",
"angleGenerate":"view_in_ar",
"replaceImage":"swap_horiz",
"flipHorizontal":"flip",
"flipVertical":"flip",
"cropImage":"crop",
"clearAllClipPaths":"content_cut",
"clearTopClipPath":"content_cut",
"clearBottomClipPath":"content_cut",
"clearRightClipPath":"content_cut",
"clearLeftClipPath":"content_cut",
"panelIn":"fit_screen",
"panelInNotFit":"fit_screen",
"canvasFit":"aspect_ratio",
"boldOn":"format_bold",
"boldOff":"format_bold",
"copyAndPast":"content_copy"
};

var menuAiActions=["generate","rembg","upscale","inpaint","angleGenerate"];

function createObjectMenu(){
if(objectMenu){
objectMenu.remove();
}
objectMenu=document.createElement('div');
objectMenu.className='fabricjs-object-menu';
objectMenu.style.display='none';
document.body.appendChild(objectMenu);
objectMenu.addEventListener('click',handleMenuClick);
objectMenu.addEventListener('input',handleSliderInput);
}


function updateObjectMenuPosition(){
if(!objectMenu){
return;
}
const activeObject=canvas.getActiveObject();
if(!activeObject){
return;
}

const boundingRect=activeObject.getBoundingRect(true,true);
const menuPadding=20;
const canvasRect=canvas.getElement().getBoundingClientRect();
const canvasOffsetLeft=canvasRect.left;
const canvasOffsetTop=canvasRect.top;
const canvasWidth=canvasRect.width;
const canvasHeight=canvasRect.height;

let left=canvasOffsetLeft+boundingRect.left*canvasContinerScale+boundingRect.width*canvasContinerScale+menuPadding;
let top=canvasOffsetTop+boundingRect.top*canvasContinerScale;

if(left+objectMenu.offsetWidth>canvasOffsetLeft+canvasWidth){
left=Math.min(
canvasOffsetLeft+canvasWidth+5,
window.innerWidth-objectMenu.offsetWidth
);
}else if(left<canvasOffsetLeft){
left=Math.max(canvasOffsetLeft-5,0);
}

top=Math.max(top,canvasOffsetTop-5);
if(top+objectMenu.offsetHeight>canvasOffsetTop+canvasHeight){
top=Math.min(
canvasOffsetTop+canvasHeight+5,
window.innerHeight-objectMenu.offsetHeight
);
}

objectMenu.style.left=`${left}px`;
objectMenu.style.top=`${top}px`;
}

function createObjectMenuDiv(itemValue){
return {type:'div',value:itemValue};
}
function createObjectMenuButton(itemValue){
return {type:'button',value:itemValue};
}
function createObjectMenuGroupHeader(labelKey){
return {type:'groupHeader',value:labelKey};
}
function createObjectMenuSlider(itemValue,min,max,step,value){
return {type:'slider',label:itemValue,
options:{id:itemValue,min:min,max:max,step:step,value:value}};
}
function createObjectMenuColor(itemValue,defaultColor,rgba){
return {
type:'colorpicker',label:itemValue,
options:{id:itemValue,
value:defaultColor||'#000000',
rgba:rgba
}
};
}
function createObjectMenuSubmenu(labelKey,children){
return {type:'submenu',value:labelKey,children:children};
}


function renderMenuButton(itemValue){
var iconName=menuIconMap[itemValue]||"";
var iconHtml=iconName?`<i class="material-icons menu-btn-icon">${iconName}</i>`:"";
var isAi=menuAiActions.indexOf(itemValue)!==-1;
var extraClass=isAi?" menu-ai-action":"";
var flipStyle=itemValue==="flipVertical"?' style="transform:rotate(90deg)"':"";
if(flipStyle&&iconHtml){
iconHtml=`<i class="material-icons menu-btn-icon"${flipStyle}>${iconName}</i>`;
}
return `<button id="fabricjs-${itemValue}-btn" class="menu-btn${extraClass}">${iconHtml}<span>${getText(itemValue)}</span></button>`;
}

function renderSubmenu(item){
var iconName=menuIconMap[item.value]||"content_cut";
var iconHtml=`<i class="material-icons menu-btn-icon">${iconName}</i>`;
var html=`<div class="menu-submenu-wrap">`;
html+=`<button class="menu-btn menu-submenu-toggle" data-submenu="${item.value}">${iconHtml}<span>${getText(item.value)}</span><i class="material-icons menu-submenu-arrow">expand_more</i></button>`;
html+=`<div class="menu-submenu-content" id="submenu-${item.value}" style="display:none">`;
item.children.forEach(function(child){
html+=renderMenuButton(child.value);
});
html+=`</div></div>`;
return html;
}


function showObjectMenu(clickType){
const activeObject=canvas.getActiveObject();
if(!activeObject){
return;
}
if(!objectMenu){
createObjectMenu();
}

let menuItems=[];
var visible=createObjectMenuButton(activeObject.visible?'visibleOff':'visibleOn');
var movement=createObjectMenuButton(!activeObject.selectable?'movementOn':'movementOff');
var edit=createObjectMenuButton(activeObject.edit?'editOff':'editOn');
var knife=createObjectMenuButton(isKnifeMode?'knifeOff':'knifeOn');
var deleteMenu=createObjectMenuButton('delete');
var duplicate=createObjectMenuButton('copyAndPast');
var generate=createObjectMenuButton('generate');
var panelIn=createObjectMenuButton('panelIn');
var panelInNotFit=createObjectMenuButton('panelInNotFit');
var canvasFit=createObjectMenuButton('canvasFit');
var selectClear=createObjectMenuButton('selectClear');
var rembg=createObjectMenuButton('rembg');
var upscale=createObjectMenuButton('upscale');
var inpaint=createObjectMenuButton('inpaint');
var angleGenerate=createObjectMenuButton('angleGenerate');
var replaceImage=createObjectMenuButton('replaceImage');
var clearAllClipPaths=createObjectMenuButton('clearAllClipPaths');

var clearTopClipPath=createObjectMenuButton('clearTopClipPath');
var clearBottomClipPath=createObjectMenuButton('clearBottomClipPath');
var clearRightClipPath=createObjectMenuButton('clearRightClipPath');
var clearLeftClipPath=createObjectMenuButton('clearLeftClipPath');

var flipHorizontal=createObjectMenuButton('flipHorizontal');
var flipVertical=createObjectMenuButton('flipVertical');
var cropImage=createObjectMenuButton('cropImage');

var font=createObjectMenuDiv('fontSelectorMenu');

let fillTemp=null;
let strokeWidthTemp=null;
let strokeTemp=null;
if(isSpeechBubbleSVG(activeObject)){
fillTemp=getSpeechBubbleTextFill(activeObject,"fill");
strokeWidthTemp=getSpeechBubbleTextFill(activeObject,"strokeWidth");
strokeTemp=getSpeechBubbleTextFill(activeObject,"stroke");
}else{
fillTemp=activeObject.fill;
strokeWidthTemp=activeObject.strokeWidth;
strokeTemp=activeObject.stroke;
}


let min=0,max=100,step=1,value=(activeObject.opacity*100),labelAndId='com-opacity';
let opacity=createObjectMenuSlider(labelAndId,min,max,step,value);

min=0,max=40,step=0.1,value=strokeWidthTemp,labelAndId='com-lineWidth';
let strokeWidth=createObjectMenuSlider(labelAndId,min,max,step,value);

min=7,max=150,step=1,value=activeObject.fontSize,labelAndId='com-fontSize';
let fontSize=createObjectMenuSlider(labelAndId,min,max,step,value);

uiLogger.debug("fillTemp",fillTemp);
let fillColor=createObjectMenuColor("com-fill",rgbaToHex(fillTemp),fillTemp);
uiLogger.debug("fillColor",fillColor);
let strokeColor=createObjectMenuColor("com-strokeColor",rgbaToHex(strokeTemp),strokeTemp);

if(isPanel(activeObject)){
if(clickType!=='left'){
menuItems.push(selectClear);
menuItems.push(createObjectMenuGroupHeader('menuGroupOperation'));
menuItems.push(visible,movement,edit,knife,duplicate);
var aiItems=[];
if(hasRole(AI_ROLES.Text2Image))aiItems.push(generate);
if(aiItems.length>0){
menuItems.push(createObjectMenuGroupHeader('menuGroupAI'));
menuItems=menuItems.concat(aiItems);
}
menuItems.push(createObjectMenuGroupHeader('menuGroupStyle'));
menuItems.push(opacity,strokeWidth,fillColor,strokeColor);
menuItems.push({type:'separator'});
menuItems.push(deleteMenu);
}
}else if(isImage(activeObject)){
if(clickType!=='left'){
menuItems.push(selectClear);
menuItems.push(createObjectMenuGroupHeader('menuGroupOperation'));
menuItems.push(visible,movement,duplicate,replaceImage);
var aiItems=[];
if(hasRole(AI_ROLES.Image2Image))aiItems.push(generate);
if(hasRole(AI_ROLES.RemoveBG))aiItems.push(rembg);
if(hasRole(AI_ROLES.Upscaler))aiItems.push(upscale);
if(hasRole(AI_ROLES.I2I_Angle))aiItems.push(angleGenerate);
if(aiItems.length>0){
menuItems.push(createObjectMenuGroupHeader('menuGroupAI'));
menuItems=menuItems.concat(aiItems);
}
menuItems.push(createObjectMenuGroupHeader('menuGroupTransform'));
menuItems.push(flipHorizontal,flipVertical,cropImage);
if(haveClipPath(activeObject)){
var clippingSub=createObjectMenuSubmenu('menuClipping',[
clearAllClipPaths,clearTopClipPath,clearBottomClipPath,clearRightClipPath,clearLeftClipPath
]);
menuItems.push(createObjectMenuGroupHeader('menuGroupViewLimit'));
menuItems.push(clippingSub);
}else{
menuItems.push(createObjectMenuGroupHeader('menuGroupPanel'));
menuItems.push(panelIn,canvasFit);
}
menuItems.push({type:'separator'});
menuItems.push(deleteMenu);
}
}else if(isSpeechBubbleSVG(activeObject)||isSpeechBubbleText(activeObject)){
menuItems.push(selectClear);
menuItems.push(createObjectMenuGroupHeader('menuGroupOperation'));
menuItems.push(visible,panelInNotFit,duplicate);
menuItems.push(createObjectMenuGroupHeader('menuGroupStyle'));
menuItems.push(opacity,strokeWidth,fillColor,strokeColor);
if(isSpeechBubbleText(activeObject)){
menuItems.push(fontSize,font);
}
menuItems.push({type:'separator'});
menuItems.push(deleteMenu);
}else if(isText(activeObject)){
menuItems.push(selectClear);
menuItems.push(createObjectMenuGroupHeader('menuGroupOperation'));
menuItems.push(visible,duplicate);
menuItems.push(createObjectMenuGroupHeader('menuGroupStyle'));
let textColor=createObjectMenuColor("com-textColor",rgbaToHex(fillTemp),fillTemp);
let outlineColor=createObjectMenuColor("com-outlineColor",rgbaToHex(strokeTemp),strokeTemp);
let bgColorTemp=isVerticalText(activeObject)?(activeObject.textBackgroundColor||''):(activeObject.backgroundColor||'');
let bgColor=createObjectMenuColor("com-bgColor",rgbaToHex(bgColorTemp)||'#ffffff',bgColorTemp||'#ffffff');
menuItems.push(opacity,strokeWidth,textColor,outlineColor,bgColor);
var isBoldNow=activeObject.fontWeight==="bold";
var boldMenu=createObjectMenuButton(isBoldNow?'boldOff':'boldOn');
menuItems.push(fontSize,boldMenu,font);
menuItems.push({type:'separator'});
menuItems.push(deleteMenu);
}else if(isPath(activeObject)){
menuItems.push(selectClear);
menuItems.push(createObjectMenuGroupHeader('menuGroupOperation'));
menuItems.push(visible,duplicate);
menuItems.push(createObjectMenuGroupHeader('menuGroupStyle'));
menuItems.push(opacity,strokeWidth,fillColor,strokeColor);
menuItems.push({type:'separator'});
menuItems.push(deleteMenu);
}
if(menuItems.length===0){
return;
}

let menuContent='';
let groupOpen=false;
menuItems.forEach(function(item){
switch(item.type){
case 'groupHeader':
if(groupOpen)menuContent+=`</div>`;
menuContent+=`<div class="menu-group-header"><span>${getText(item.value)}</span></div>`;
menuContent+=`<div class="menu-group">`;
groupOpen=true;
break;
case 'div':
menuContent+=`<div id="${item.value}" class="menu-group-wide"></div>`;
break;
case 'slider':
let label=getText(item.options.id);
menuContent+=`<div class="input-container-leftSpace menu-group-wide" data-label="${label}">`;
menuContent+=`<input type="range" id="${item.options.id}" name="${item.options.id}" min="${item.options.min}" max="${item.options.max}" step="${item.options.step}" value="${item.options.value}" aria-label="${label}" aria-valuemin="${item.options.min}" aria-valuemax="${item.options.max}" aria-valuenow="${item.options.value}">`;
menuContent+=`</div>`;
break;
case 'colorpicker':
let labelColor=getText(item.options.id);
menuContent+=`<div class="input-group-multi menu-group-wide">`;
menuContent+=`<label for="${item.options.id}">${labelColor}</label>`;
menuContent+=`<input id="${item.options.id}" name="${item.options.id}" value="${item.options.value}" tabindex="0" aria-label="${labelColor}" class="jscolor-color-picker" data-initial-color="${item.options.rgba}">`;
menuContent+=`</div>`;
break;
case 'button':
if(groupOpen){
menuContent+=renderMenuButton(item.value);
}else{
menuContent+=`<div class="menu-group">`;
menuContent+=renderMenuButton(item.value);
menuContent+=`</div>`;
}
break;
case 'submenu':
menuContent+=renderSubmenu(item);
break;
case 'separator':
if(groupOpen){
menuContent+=`</div>`;
groupOpen=false;
}
menuContent+=`<div class="menu-separator"></div>`;
break;
}
});
if(groupOpen)menuContent+=`</div>`;

objectMenu.innerHTML=menuContent;
jsColorSet();
objectMenu.style.display='flex';
updateObjectMenuPosition();
requestAnimationFrame(function(){
objectMenu.classList.add('active');
});
lastClickType=clickType;

const sliders2=document.querySelectorAll('.input-container-leftSpace input[type="range"]');
sliders2.forEach(function(slider){
setupSlider(slider,'.input-container-leftSpace',false);
});
var fontSelectorMenuEl=$("fontSelectorMenu");
if(fontSelectorMenuEl){
var menuActiveObj=canvas.getActiveObject();
new FontSelector("fontSelectorMenu",menuActiveObj&&menuActiveObj.fontFamily||"Font");
}

var submenuToggles=objectMenu.querySelectorAll('.menu-submenu-toggle');
submenuToggles.forEach(function(toggle){
toggle.addEventListener('click',function(ev){
ev.stopPropagation();
var subId=toggle.getAttribute('data-submenu');
var subContent=document.getElementById('submenu-'+subId);
var arrow=toggle.querySelector('.menu-submenu-arrow');
if(subContent){
if(subContent.style.display==='none'){
subContent.style.display='block';
if(arrow)arrow.textContent='expand_less';
}else{
subContent.style.display='none';
if(arrow)arrow.textContent='expand_more';
}
updateObjectMenuPosition();
}
});
});

var deleteBtn=objectMenu.querySelector('#fabricjs-delete-btn');
if(deleteBtn){
deleteBtn.classList.add('menu-destructive');
}
}

function handleSliderInput(e){
const activeObject=canvas.getActiveObject();
if(!activeObject)return;

switch(e.target.id){
case 'com-fontSize':
const fontSizeValue=parseInt(e.target.value);
activeObject.fontSize=fontSizeValue;

if(isSpeechBubbleText(activeObject)){
let newSettings=mainSpeechBubbleObjectResize(activeObject);
const svgObj=activeObject.targetObject;
svgObj.set(newSettings);
updateShapeMetrics(svgObj);
}
break
case 'com-opacity':
const opacityValue=parseInt(e.target.value);
activeObject.opacity=opacityValue/100;
break;
case 'com-lineWidth':
const strokeWidthValue=parseFloat(e.target.value);
activeObject.set("strokeWidth",strokeWidthValue);
break;
case 'com-fill':
const fillColor=e.target.value;
activeObject.set("fill",fillColor);
break;
case 'com-strokeColor':
const strokeColor=e.target.value;
activeObject.set("stroke",strokeColor);
if(isText(activeObject)&&(!activeObject.strokeWidth||activeObject.strokeWidth===0)){
activeObject.set("strokeWidth",1);
var lineWidthSlider=$("com-lineWidth");
if(lineWidthSlider)lineWidthSlider.value=1;
}
break;
case 'com-textColor':
activeObject.set("fill",e.target.value);
break;
case 'com-outlineColor':
activeObject.set("stroke",e.target.value);
if(isText(activeObject)&&(!activeObject.strokeWidth||activeObject.strokeWidth===0)){
activeObject.set("strokeWidth",1);
var lws=$("com-lineWidth");
if(lws)lws.value=1;
}
break;
case 'com-bgColor':
if(isVerticalText(activeObject)){
activeObject.set("textBackgroundColor",e.target.value);
}else{
activeObject.set("backgroundColor",e.target.value);
}
break;
}

if(isSpeechBubbleSVG(activeObject)){
var bubbleStrokewidht=parseFloat($("com-lineWidth").value);
var fillColorsvg=$("com-fill").value;
var strokeColorsvg=$("com-strokeColor").value;
var opacity=$("com-opacity").value;
changeSpeechBubbleSVG(bubbleStrokewidht,fillColorsvg,strokeColorsvg,opacity);
}

canvas.requestRenderAll();
}


function handleMenuClick(e){
const activeObject=canvas.getActiveObject();
if(!activeObject){
return;
}

let clickedElement=e.target.closest('button.menu-btn');
if(!clickedElement){
return;
}

const action=clickedElement.id.replace('fabricjs-','').replace('-btn','');
if(!action){
return;
}

switch(action){
case 'flipHorizontal':
flipHorizontally();
break
case 'flipVertical':
flipVertically();
break
case 'fontSize':
const fontSizeValue=parseInt(e.target.value);
activeObject.fontSize=fontSizeValue;

if(isSpeechBubbleText(activeObject)){
let newSettings=mainSpeechBubbleObjectResize(activeObject);
const svgObj=activeObject.targetObject;
svgObj.set(newSettings);
updateShapeMetrics(svgObj);
}
break
case 'opacity':
const opacityValue=parseInt(e.target.value);
activeObject.opacity=opacityValue/100;
break;
case 'lineWidth':
const strokeWidthValue=parseFloat(e.target.value);
activeObject.set("strokeWidth",strokeWidthValue);
break;
case 'canvasFit':
fitImageToCanvas(activeObject);
break;
case 'panelIn':
var canvasX=activeObject.left+(activeObject.width*activeObject.scaleX)/2;
var canvasY=activeObject.top+(activeObject.height*activeObject.scaleY)/2;
putImageInFrame(activeObject,canvasX,canvasY,true,true);
updateLayerPanel();
break;
case 'panelInNotFit':
var canvasX=activeObject.left+(activeObject.width*activeObject.scaleX)/2;
var canvasY=activeObject.top+(activeObject.height*activeObject.scaleY)/2;
putImageInFrame(activeObject,canvasX,canvasY,true,true,false);
updateLayerPanel();
break;
case 'visibleOn':
case 'visibleOff':
visibleChange(activeObject);
break;

case 'movementOn':
case 'movementOff':
moveLockChange(activeObject);
break;

case 'rembg':
var spinner=createSpinner(getGUID(activeObject),'BG');
aiRembg(activeObject,spinner);
break;
case 'upscale':
var spinner=createSpinner(getGUID(activeObject),'UP');
aiUpscale(activeObject,spinner);
break;
case 'inpaint':
openInpaintEditor(activeObject);
break;
case 'angleGenerate':
openAngleEditor(activeObject);
break;
case 'replaceImage':
if(isImage(activeObject)){
openProjectImageReplacePicker(activeObject);
}
break;
case 'generate':
if(isPanel(activeObject)){
var spinner=createSpinner(getGUID(activeObject),'T2I');
T2I(activeObject,spinner);
}else if(isImage(activeObject)){
var spinner=createSpinner(getGUID(activeObject),'I2I');
I2I(activeObject,spinner);
}
break;
case 'selectClear':
canvas.discardActiveObject();
canvas.requestRenderAll();
return;
case 'delete':
changeDoNotSaveHistory();
canvas.remove(activeObject);
changeDoSaveHistory();
saveStateByManual();
canvas.renderAll();
updateLayerPanel();
return;
case 'copyAndPast':
activeObject.clone(function(cloned){
cloned.set({
left:cloned.left+10,
top:cloned.top+10
});
canvas.add(cloned);
});
break;
case 'moveUp':
canvas.bringForward(activeObject);
break;
case 'moveDown':
canvas.sendBackwards(activeObject);
break;
case 'editOff':
case 'editOn':
if(isPanel(activeObject)){
Edit();
}
break;

case 'knifeOff':
case 'knifeOn':
if(isPanel(activeObject)){
changeKnifeMode();
}
break;
case 'addPoint':
if(activeObject instanceof fabric.Polygon){
let points=activeObject.points;
let newPoint={
x:(points[0].x+points[1].x)/2,
y:(points[0].y+points[1].y)/2
};
points.splice(1,0,newPoint);
activeObject.set({points:points});
}
break;
case 'removePoint':
if(activeObject instanceof fabric.Polygon&&activeObject.points.length>3){
let points=activeObject.points;
points.pop();
activeObject.set({points:points});
}
break;

case 'clearAllClipPaths':
case 'clearTopClipPath':
case 'clearBottomClipPath':
case 'clearRightClipPath':
case 'clearLeftClipPath':
removeClipPath(activeObject,action);
break;
case 'cropImage':
if(isImage(activeObject)){
startCropMode(activeObject);
}
break;
case 'boldOn':
case 'boldOff':
toggleBold();
break;
}
canvas.requestRenderAll();
closeMenu();
}

function closeMenu(){
if(objectMenu){
objectMenu.classList.remove('active');
setTimeout(function(){
if(!objectMenu.classList.contains('active')){
objectMenu.style.display='none';
}
},150);
}
}

canvas.wrapperEl.addEventListener('contextmenu',function(e){
e.preventDefault();
const pointer=canvas.getPointer(e);
const clickedObject=canvas.findTarget(e,false);
if(clickedObject){
canvas.setActiveObject(clickedObject);
canvas.renderAll();
showObjectMenu('right');
}else{
canvas.discardActiveObject();
closeMenu();
}
});

canvas.wrapperEl.addEventListener('mousedown',function(e){
if(e.button===0&&lastClickType==='right'){
closeMenu();
lastClickType='left';
}
});

document.addEventListener('mousedown',function(e){
if(!objectMenu||objectMenu.style.display==='none')return;
if(objectMenu.contains(e.target)||canvas.wrapperEl.contains(e.target))return;
closeMenu();
});

var introContent=document.getElementById('intro_content');
if(introContent){
introContent.addEventListener('mousedown',function(e){
if(e.button!==0)return;
if(canvas.wrapperEl.contains(e.target))return;
if(canvas.getActiveObject()){
canvas.discardActiveObject();
canvas.requestRenderAll();
closeMenu();
}
});
}

createObjectMenu();

async function openProjectImageReplacePicker(imageObject){
const currentPath=getProjectImagePath(imageObject);
if(!currentPath){
createToastError(getText('replaceImage'),[getText('projectImageReplaceNoPath')]);
return;
}
const dirPath=currentPath.split('/').slice(0,-1).join('/');
if(!dirPath){
createToastError(getText('replaceImage'),[getText('projectImageReplaceNoPath')]);
return;
}

const overlay=document.createElement('div');
overlay.className='project-image-replace-overlay';
overlay.innerHTML=`
<div class="project-image-replace-modal" role="dialog" aria-modal="true">
<div class="project-image-replace-header">
<h3>${getText('projectImageReplaceTitle')}</h3>
<span class="project-image-replace-gen">
<label>${getText('projectImageGenerateCount')}
<select class="project-image-replace-count">
<option value="1">1</option>
<option value="2">2</option>
<option value="4" selected>4</option>
<option value="6">6</option>
<option value="8">8</option>
</select></label>
<button type="button" class="project-image-replace-generate">${getText('projectImageGenerate')}</button>
</span>
<button type="button" class="project-image-replace-close" aria-label="Close">&times;</button>
</div>
<div class="project-image-replace-list">
<div class="project-image-replace-status">${getText('projectImageReplaceLoading')}</div>
</div>
<div class="project-image-replace-spinner" hidden>
<div class="project-image-replace-spinner-circle"></div>
<span>${getText('projectImageGenerating')}</span>
</div>
</div>
`;
document.body.appendChild(overlay);

let closed=false;
const close=()=>{
closed=true;
overlay.remove();
document.removeEventListener('keydown',onKey);
};
const onKey=(e)=>{if(e.key==='Escape') close();};
document.addEventListener('keydown',onKey);
overlay.addEventListener('click',(e)=>{
if(e.target===overlay) close();
});
overlay.querySelector('.project-image-replace-close').addEventListener('click',close);

// 画像生成ボタン: 対象パネル(pXXX_panelYY)に対し、指定枚数で画像生成シェルを
// runner(/llm/) の非同期キューに投入する。完了後はこのモーダルを開き直すと候補が増える。
const genBtn=overlay.querySelector('.project-image-replace-generate');
if(genBtn){
genBtn.addEventListener('click',async ()=>{
const panel=dirPath.split('/').pop();
const project=dirPath.split('/pages/')[0];
if(!/^p\d+_panel\d+$/.test(panel)||project===dirPath){
createToastError(getText('projectImageGenerate'),[getText('projectImageReplaceNoPath')]);
return;
}
const sel=overlay.querySelector('.project-image-replace-count');
const count=parseInt(sel&&sel.value,10)||4;
const spinner=overlay.querySelector('.project-image-replace-spinner');
const genLabel=genBtn.textContent;
genBtn.disabled=true;
try{
const res=await fetch(`/llm/api/projects/gen-panel?project=${encodeURIComponent(project)}`,{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({panel:panel,count:count})
});
if(!res.ok) throw new Error('gen-panel http '+res.status);
const data=await res.json().catch(()=>({}));
createToast(getText('projectImageGenerateQueued'),[`${panel} ×${count}`]);
if(data&&data.task_id){
// 生成完了をポーリングで待ち、終わったら候補リストを自動リロードする。
// 待っている間はモーダル内にインジケーター（ぐるぐる）を表示する。
genBtn.textContent=getText('projectImageGenerating');
if(spinner) spinner.hidden=false;
const status=await waitForTask(project,data.task_id);
if(closed) return;
if(status){
await loadList();
if(status==='success') createToast(getText('projectImageGenerateDone'),[panel]);
else createToastError(getText('projectImageGenerate'),[getText('projectImageGenerateFailed')]);
}
}
}catch(err){
uiLogger.error('gen panel failed',err);
createToastError(getText('projectImageGenerate'),[err.message||'']);
}finally{
if(!closed){genBtn.disabled=false;genBtn.textContent=genLabel;if(spinner) spinner.hidden=true;}
}
});
}

const list=overlay.querySelector('.project-image-replace-list');

// runner のタスク完了をポーリングで待つ。完了状態(success/aborted/error)を返す。
// モーダルが閉じられた・タイムアウト(約20分)した場合は null。
async function waitForTask(project,taskId){
const DONE={success:1,aborted:1,error:1};
for(let i=0;i<400;i++){
await new Promise(r=>setTimeout(r,3000));
if(closed) return null;
let snap;
try{
const r=await fetch(`/llm/api/projects/queues?project=${encodeURIComponent(project)}`);
if(!r.ok) continue;
snap=await r.json();
}catch(e){
continue;
}
const t=(snap.tasks||[]).find(x=>x.task_id===taskId);
if(t&&DONE[t.status]) return t.status;
}
return null;
}

// 候補PNG一覧を取得して再描画する（初期表示・生成完了後の自動リロードで共用）。
async function loadList(){
try{
const entries=await fetchProjectPngList(dirPath);
list.innerHTML='';
if(entries.length===0){
list.innerHTML=`<div class="project-image-replace-status">${getText('projectImageReplaceEmpty')}</div>`;
return;
}
entries.forEach(entry=>{
const item=document.createElement('button');
item.type='button';
item.className='project-image-replace-item';
if(entry.path===currentPath){
item.classList.add('current');
}
item.innerHTML=`<img alt=""><span></span>`;
item.querySelector('img').src=getProjectFileUrl(entry.path);
item.querySelector('span').textContent=entry.name;
item.addEventListener('click',async ()=>{
if(entry.path===currentPath){
close();
return;
}
try{
await replaceProjectImage(imageObject,entry.path,currentPath);
close();
}catch(err){
uiLogger.error('replace image failed',err);
createToastError(getText('replaceImage'),[err.message||'']);
}
});
list.appendChild(item);
});
}catch(err){
uiLogger.error('list replacement images failed',err);
list.innerHTML=`<div class="project-image-replace-status error">${getText('projectImageReplaceError')}</div>`;
}
}
loadList();
}

async function fetchProjectPngList(dirPath){
const url=`/api/files?path=${encodeURIComponent(dirPath)}&pattern=${encodeURIComponent('(?i)\\.png$')}`;
const res=await fetch(url);
if(!res.ok) throw new Error('list png http '+res.status);
const data=await res.json();
return (data.entries||[]).filter(entry=>/\.png$/i.test(entry.name)&&entry.name.toLowerCase()!=='tile.png');
}

async function replaceProjectImage(imageObject,nextPath,currentPath){
const oldDisplayWidth=imageObject.width*numOrMenu(imageObject.scaleX,1);
const oldDisplayHeight=imageObject.height*numOrMenu(imageObject.scaleY,1);
const nextUrl=getProjectFileUrl(nextPath);
const nextImage=await loadFabricImageForReplace(nextUrl);
imageObject.setElement(nextImage.getElement());
imageObject.width=nextImage.width;
imageObject.height=nextImage.height;
if(imageObject.width){
imageObject.scaleX=oldDisplayWidth/imageObject.width;
}
if(imageObject.height){
imageObject.scaleY=oldDisplayHeight/imageObject.height;
}
imageObject.projectLoaderPath=nextPath;
imageObject.projectLoaderSrc=relativeProjectImagePath(imageObject.projectLoaderBasePath,currentPath,nextPath);
imageObject.dirty=true;
canvas.setActiveObject(imageObject);
canvas.requestRenderAll();
updateLayerPanel();
saveStateByManual();
await btmSaveProjectFile(null,false);
}

function loadFabricImageForReplace(src){
return new Promise((resolve,reject)=>{
fabric.Image.fromURL(src,(img)=>{
if(!img){
reject(new Error('image load failed'));
return;
}
resolve(img);
},{crossOrigin:'anonymous'});
});
}

function getProjectImagePath(imageObject){
if(imageObject.projectLoaderPath) return imageObject.projectLoaderPath;
const src=imageObject.projectLoaderSrc;
if(src&&/^[^:]+\/.*\.png$/i.test(src)) return src;
return null;
}

function getProjectFileUrl(path){
if(window.ProjectLoader&&typeof window.ProjectLoader.fileUrl==='function'){
return window.ProjectLoader.fileUrl(path);
}
return `/api/file?path=${encodeURIComponent(path)}`;
}

function relativeProjectImagePath(basePath,currentPath,nextPath){
if(basePath&&nextPath.startsWith(basePath+'/')){
return nextPath.substring(basePath.length+1);
}
const currentDir=currentPath.split('/').slice(0,-1).join('/');
if(currentDir&&nextPath.startsWith(currentDir+'/')){
return nextPath.substring(currentDir.length+1);
}
return nextPath;
}

function numOrMenu(v,fallback){
return (v===undefined||v===null||isNaN(v))?fallback:v;
}
