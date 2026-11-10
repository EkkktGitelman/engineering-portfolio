import {createViewer} from './viewer.js?v=20261109labels';
const visual=document.getElementById('visual-alignment');
if(visual){
  const button=visual.querySelector('.open3d'),status=document.getElementById('alignment-status');let started=false;
  const editing=false,key='portfolio-alignment-draft-v1';
  async function start(){if(started)return;started=true;button.disabled=true;button.textContent='Загрузка модели…';try{
    const response=await fetch('content/alignment.json');if(!response.ok)throw new Error('Alignment content: '+response.status);
    const content=await response.json(),cards=document.getElementById('alignment-callouts');
    const originalCallouts=JSON.parse(JSON.stringify(content.callouts));let draftApplied=false,recoverableDraft=false;
    try{const draft=JSON.parse(localStorage.getItem(key)||'null');recoverableDraft=!!(draft&&Array.isArray(draft.callouts)&&(draft.baseSavedAt||null)===(content.savedAt||null));if(editing&&recoverableDraft){
      for(const c of content.callouts){const d=draft.callouts.find(x=>x.id===c.id);if(!d)continue;for(const field of ['label','claim','why','dx','dy','ax','ay','anchor']){delete c[field];if(d[field]!==undefined)c[field]=d[field];}}draftApplied=true;
    }}catch{}
    cards.replaceChildren();
    for(const c of content.callouts){const li=document.createElement('li');li.dataset.callout=c.id;li.tabIndex=0;li.setAttribute('role','button');li.setAttribute('aria-pressed','false');
      const b=document.createElement('b'),lab=document.createElement('span'),body=document.createElement('div');lab.className='lab';lab.textContent=c.label;b.append(document.createTextNode(c.n+' · '),lab);body.className='cbody';
      for(const [title,field] of [['Конструкция','claim'],['Назначение','why']]){if(!c[field])continue;const p=document.createElement('p');if(field==='why'){const strong=document.createElement('b');strong.textContent=title;p.append(strong,document.createTextNode(' · '));}p.append(document.createTextNode(c[field]));body.append(p);}li.append(b,body);cards.append(li);
    }
    const host=document.createElement('div');host.className='v3d-host';visual.append(host);
    const viewer=await createViewer({container:host,model:'models/alignment.min.glb',fitModel:true,clampLabels:true,nodeMap:content.nodeMap,callouts:content.callouts,cardsRoot:cards});
    const highlight=document.getElementById('alignment-highlight');
    host.addEventListener('v3d:select',e=>{highlight.setAttribute('aria-pressed',String(e.detail.id==='alignment-axis'));cards?.querySelectorAll('[data-callout]').forEach(card=>card.setAttribute('aria-pressed',String(card.dataset.callout===e.detail.id)));});
    highlight.disabled=false;highlight.onclick=()=>viewer.select(viewer.selected==='alignment-axis'?null:'alignment-axis');
    cards?.querySelectorAll('[data-callout]').forEach(card=>card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();viewer.select(viewer.selected===card.dataset.callout?null:card.dataset.callout);}}));
    for(const [drawing,id] of [['alignment-drawing','alignment-axis'],['alignment-roller-drawing','alignment-roller']])document.getElementById(drawing)?.addEventListener('toggle',e=>{if(e.target.open)viewer.select(id);else if(viewer.selected===id)viewer.select(null);});
    button.remove();const reset=document.getElementById('alignment-reset');reset.disabled=false;reset.onclick=()=>{viewer.select(null);viewer.resetView();};status.textContent='Вращайте модель мышью или пальцем. Нажмите на номер или описание, чтобы выделить детали.';

    const edit=document.getElementById('alignment-edit');if(edit&&!editing&&['127.0.0.1','localhost'].includes(location.hostname)){const url=new URL(location.href);url.searchParams.set('edit','alignment');url.hash='visual-alignment';edit.href=url.href;edit.textContent=recoverableDraft?'Продолжить правки — есть черновик':'Редактировать позиции и подписи';edit.hidden=false;}
    if(document.fullscreenEnabled){const fs=document.createElement('button');fs.type='button';fs.className='fs';fs.textContent='На весь экран';fs.onclick=()=>document.fullscreenElement?document.exitFullscreen():visual.requestFullscreen();visual.append(fs);}
  }catch(e){console.error(e);started=false;button.disabled=false;button.textContent='Повторить загрузку 3D';status.textContent='Не удалось открыть модель. Чертёж доступен ниже.';visual.querySelector('.v3d-host')?.remove();}}
  button.onclick=start;
  if(editing)start();
  else if(innerWidth>=700&&!navigator.connection?.saveData&&'IntersectionObserver' in window)new IntersectionObserver((entries,observer)=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();start();}},{rootMargin:'200px'}).observe(visual);
}
