import {createViewer} from './viewer.js?v=20261109labels';
const visual=document.getElementById('visual-berm');
if(visual){
  const button=visual.querySelector('.open3d'),status=document.getElementById('berm-model-status');let started=false;
  const params=new URLSearchParams(location.search),editing=false,key='portfolio-berm-draft-v1';
  let modeName='assembled',recoverableDraft=false;
  function updateLinks(){
    const url=new URL(location.href);url.searchParams.set('berm-view',modeName);url.hash='visual-berm';
    const edit=document.getElementById('berm-edit');url.searchParams.set('edit','berm');if(edit)edit.href=url.href;
    const done=document.querySelector('#story-berm .editor-done');url.searchParams.delete('edit');if(done)done.href=url.href;
  }
  async function start(){
    if(started)return;started=true;button.disabled=true;button.textContent='Загрузка модели…';
    try{
      const data=await (await fetch('content/berm.json')).json(),originalCallouts=JSON.parse(JSON.stringify(data.callouts));let draftApplied=false;
      try{const draft=JSON.parse(localStorage.getItem(key)||'null');recoverableDraft=!!(draft&&Array.isArray(draft.callouts)&&(draft.baseSavedAt||null)===(data.savedAt||null));if(editing&&recoverableDraft){
        for(const c of data.callouts){const d=draft.callouts.find(x=>x.id===c.id);if(!d)continue;for(const field of ['label','claim','why','dx','dy','ax','ay','anchor']){delete c[field];if(d[field]!==undefined)c[field]=d[field];}}draftApplied=true;
      }}catch{}
      const list=document.getElementById('berm-callouts');list.replaceChildren();
      for(const c of data.callouts){const li=document.createElement('li');li.dataset.callout=c.id;li.tabIndex=0;li.setAttribute('role','button');
        const b=document.createElement('b'),n=document.createElement('span'),lab=document.createElement('span'),body=document.createElement('div');
        n.textContent=c.n+' · ';lab.className='lab';lab.textContent=c.label;b.append(n,lab);body.className='cbody';
        for(const [title,field] of [['Конструкция','claim'],['Назначение','why']]){if(!c[field])continue;const p=document.createElement('p'),strong=document.createElement('b');strong.textContent=title;p.append(strong,document.createTextNode(' · '+c[field]));body.append(p);}li.append(b,body);list.append(li);
      }
      const host=document.createElement('div');host.className='v3d-host';visual.appendChild(host);
      let model;const moving=[],pipeMeshes=[];
      const viewer=await createViewer({container:host,model:'models/berm.min.glb',nodeMap:data.nodeMap,callouts:data.callouts,cardsRoot:list,rotateY:0,clampLabels:true,fitModel:true,fixups:[m=>{
        // Every rail's insertion axis is the assembly Z axis. Pull the end
        // supports away twice as far as the rails to release both rail ends.
        // Height, transverse location, rotations and spring/rail groups stay fixed.
        model=m;const offsets={component_0008:[0,0,-.42],component_0024:[0,0,.42],component_0027:[0,0,-.21],component_0030:[0,0,.21],component_0033:[0,0,-.21],component_0036:[0,0,.21],component_0039:[0,0,-.21],component_0042:[0,0,.21],component_0043:[0,0,-.42],component_0044:[0,0,.42]};
        m.traverse(o=>{if(offsets[o.name])moving.push({o,base:o.position.clone(),delta:offsets[o.name]});});
      }]});
      model.traverse(o=>{if(o.isMesh&&o.userData.tag==='pipes')pipeMeshes.push({o,material:o.material});});
      button.remove();status.textContent='Вращайте модель мышью или пальцем. Выберите номер для выделения элемента.';
      const reset=document.getElementById('berm-reset'),assembled=document.getElementById('berm-assembled'),exploded=document.getElementById('berm-exploded'),joint=document.getElementById('berm-joint');
      function unghost(){viewer.select(null);for(const it of viewer.items){it.label.visible=true;it.dot.visible=true;it.path.style.display='';}for(const name of ['component_0043','component_0044','component_0045']){const o=model.getObjectByName(name);if(o)o.visible=true;}for(const {o,material} of pipeMeshes){if(o.material!==material){const old=o.material;o.material=material;old.dispose();}}}
      function mode(explode){modeName=explode?'exploded':'assembled';updateLinks();joint.setAttribute('aria-pressed','false');unghost();for(const {o,base,delta} of moving)o.position.copy(base).add({x:delta[0]*explode,y:delta[1]*explode,z:delta[2]*explode});model.updateMatrixWorld(true);viewer.resetView();viewer.camera.zoom=1;viewer.render();assembled.setAttribute('aria-pressed',String(!explode));exploded.setAttribute('aria-pressed',String(!!explode));status.textContent=explode?'Трубы выведены из соединений вдоль своих осей. Крайние стойки отодвинуты, чтобы освободить оба конца труб.':'Собранный прямой участок: три стойки и два пролёта.';}
      for(const control of [reset,assembled,exploded,joint])control.disabled=false;
      assembled.onclick=()=>mode(0);exploded.onclick=()=>mode(1);reset.onclick=()=>mode(exploded.getAttribute('aria-pressed')==='true'?1:0);
      joint.onclick=()=>{mode(0);joint.setAttribute('aria-pressed','true');assembled.setAttribute('aria-pressed','false');for(const {o,material} of pipeMeshes){o.material=material.clone();o.material.transparent=true;o.material.opacity=.18;o.material.depthWrite=false;}for(const name of ['component_0043','component_0044','component_0045']){const o=model.getObjectByName(name);if(o)o.visible=false;}for(const it of viewer.items){if(it.src.id!=='berm-spring'){it.label.visible=false;it.dot.visible=false;it.path.style.display='none';}}viewer.focus('berm-spring',10);status.textContent='Пружинные кнопки выделены оранжевым. Трубы показаны полупрозрачными, чтобы было видно пружины внутри.';};
      for(const li of list.children)li.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();viewer.select(li.dataset.callout);}});

      const edit=document.getElementById('berm-edit');if(edit&&!editing&&['127.0.0.1','localhost'].includes(location.hostname)){edit.textContent=recoverableDraft?'Продолжить правки — есть черновик':'Редактировать позиции и подписи';edit.hidden=false;}
      mode(params.get('berm-view')==='exploded'?1:0);updateLinks();
      if(document.fullscreenEnabled){const fs=document.createElement('button');fs.className='fs';fs.type='button';fs.textContent='На весь экран';fs.onclick=()=>document.fullscreenElement?document.exitFullscreen():visual.requestFullscreen();visual.appendChild(fs);}
    }catch(error){console.error(error);started=false;button.disabled=false;button.textContent='Повторить загрузку 3D';status.textContent='Не удалось загрузить модель. Нажмите «Повторить загрузку 3D».';visual.querySelector('.v3d-host')?.remove();}
  }
  button.addEventListener('click',start);
  if(editing)start();
  else if(innerWidth>=700&&!navigator.connection?.saveData&&'IntersectionObserver' in window)new IntersectionObserver((entries,observer)=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();start();}},{rootMargin:'200px'}).observe(visual);
}
