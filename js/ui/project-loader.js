// 選択フォルダ内の pXXX_page.svg を XXX 数値順にページとして取り込むローダ。
// 既存ページはすべて破棄し新規プロジェクトとして再構築する。

const PROJECT_LOADER_FILES_API='/api/files';
const PROJECT_LOADER_FILE_API='/api/file';
const PROJECT_LOADER_PATTERN='^p\\d+_page\\.svg$';

window.ProjectLoader={
loadFromFolder:loadProjectPagesFromFolder
};

async function loadProjectPagesFromFolder(folderPath,folderDisplayPath){
const url=`${PROJECT_LOADER_FILES_API}?path=${encodeURIComponent(folderPath)}&pattern=${encodeURIComponent(PROJECT_LOADER_PATTERN)}`;
let listJson;
try{
const res=await fetch(url);
if(!res.ok) throw new Error('list http '+res.status);
listJson=await res.json();
}catch(err){
folderPickerLogger.error('list files failed',err);
createToastError(plText('projectLoaderError'),[err.message||'']);
return;
}

const sorted=(listJson.entries||[])
.map(entry=>{
const m=entry.name.match(/^p(\d+)_page\.svg$/);
return m?{...entry,num:parseInt(m[1],10)}:null;
})
.filter(Boolean)
.sort((a,b)=>a.num-b.num);

if(sorted.length===0){
createToastError(plText('projectLoaderError'),[plText('projectLoaderNoPages')]);
return;
}

resetProjectBtm();

let loaded=0;
for(const file of sorted){
try{
const svgRes=await fetch(`${PROJECT_LOADER_FILE_API}?path=${encodeURIComponent(file.path)}`);
if(!svgRes.ok) throw new Error('file http '+svgRes.status);
const svgText=await svgRes.text();
await addSvgAsPage(svgText);
loaded++;
}catch(err){
folderPickerLogger.error('page load failed',err,file);
}
}

if(loaded===0){
createToastError(plText('projectLoaderError'),[]);
return;
}
createToast(plText('projectLoaderLoaded'),[`${loaded} / ${sorted.length}`,folderDisplayPath||folderPath]);
}

function resetProjectBtm(){
btmProjectsMap.clear();
const container=$("btm-image-container");
if(container) container.innerHTML='';
}

function addSvgAsPage(svgText){
return new Promise((resolve,reject)=>{
const newGuid=generateGUID();
setCanvasGUID(newGuid);
canvas.clear();
fabric.loadSVGFromString(svgText,async (objects,options)=>{
try{
if(!objects||objects.length===0){
reject(new Error('empty svg'));
return;
}
const grouped=fabric.util.groupSVGElements(objects,options);
addInitialImageToCanvas(grouped);
await btmSaveProjectFile(newGuid,false);
resolve();
}catch(err){
reject(err);
}
});
});
}

function plText(key){
if(typeof i18next!=='undefined'&&i18next.isInitialized){
return i18next.t(key);
}
return key;
}
