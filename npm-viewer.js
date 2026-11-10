import {createViewer} from './viewer.js?v=20261109npmfit';
const visual=document.getElementById('visual-npm');
if(visual){
 const open=visual.querySelector('.open3d'),status=document.getElementById('npm-model-status');let started=false;
 async function start(){
  if(started)return;started=true;open.disabled=true;open.textContent='Загружаю модель…';
  try{
   const data=await(await fetch('content/npm.json')).json();
   const host=document.createElement('div');host.className='v3d-host';visual.appendChild(host);
   let panels=[],interiorHidden=[];
   const viewer=await createViewer({container:host,model:'models/npm.min.glb',rotateY:Math.PI/2,fitModel:true,fixups:[m=>{panels=data.panels.map(p=>({...p,object:m.getObjectByName(p.node)})).filter(p=>p.object);interiorHidden=(data.interiorHiddenNodes||[]).map(name=>m.getObjectByName(name)).filter(Boolean);} ]});
   open.remove();status.textContent='Вращайте мышью или пальцем. Колесо — масштаб. Крышу, двери и каждый лист обшивки можно скрыть отдельно.';
   const reset=document.getElementById('npm-reset');reset.disabled=false;reset.onclick=()=>viewer.resetView();
   const list=document.getElementById('npm-parts-list');
   const order=['roof','doors','left','right','back','partition'];
   panels.sort((a,b)=>order.indexOf(a.group)-order.indexOf(b.group));
   for(const part of panels){
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';input.checked=true;input.dataset.part=part.node;
    input.addEventListener('change',()=>{part.object.visible=input.checked;viewer.render();});
    label.append(input,document.createTextNode(part.label));list.append(label);part.input=input;
   }
   const setParts=(predicate,showExtras)=>{panels.forEach(p=>{p.object.visible=predicate(p);p.input.checked=p.object.visible;});interiorHidden.forEach(object=>object.visible=showExtras);viewer.render();};
   const inside=document.getElementById('npm-inside');inside.disabled=false;
   inside.onclick=()=>setParts(p=>!['roof','right','doors','partition'].includes(p.group),false);
   const showAll=document.getElementById('npm-show-all');showAll.disabled=false;showAll.onclick=()=>setParts(()=>true,true);
   if(document.fullscreenEnabled){const fs=document.createElement('button');fs.className='fs';fs.type='button';fs.textContent='На весь экран';fs.onclick=()=>document.fullscreenElement?document.exitFullscreen():visual.requestFullscreen();visual.appendChild(fs);}
  }catch(error){console.error(error);started=false;open.disabled=false;open.textContent='Повторить загрузку 3D';status.textContent='Не удалось загрузить модель. Попробуйте ещё раз.';visual.querySelector('.v3d-host')?.remove();}
 }
 open.addEventListener('click',start);
 if(innerWidth>=700&&!navigator.connection?.saveData&&'IntersectionObserver'in window)new IntersectionObserver((entries,observer)=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();start();}},{rootMargin:'200px'}).observe(visual);
}
