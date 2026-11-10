import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {cutTriangles,makeBender,stage} from './long-fold.mjs';

export function shapeFrom(data) {
 const shape=new THREE.Shape(data.outline.map(p=>new THREE.Vector2(...p)));
 for(const hole of data.holes||[])shape.holes.push(new THREE.Path(hole.map(p=>new THREE.Vector2(...p))));
 return shape;
}
export function createLongModel(data) {
 const material=new THREE.MeshStandardMaterial({color:0xa6b1b8,metalness:.38,roughness:.48,side:THREE.DoubleSide});
 const original=new THREE.ExtrudeGeometry(shapeFrom(data),{depth:2,bevelEnabled:false});
 const pos=original.attributes.position,triangles=[];
 for(let i=0;i<pos.count;i+=3)triangles.push([0,1,2].map(k=>[pos.getX(i+k),pos.getY(i+k),pos.getZ(i+k)]));
 const bender=makeBender(data),points=cutTriangles(triangles,bender.planes);
 original.dispose();
 const g=new THREE.BufferGeometry(),array=new Float32Array(points.length*3);
 g.setAttribute('position',new THREE.BufferAttribute(array,3));
 const mesh=new THREE.Mesh(g,material),root=new THREE.Group();root.add(mesh);
 mesh.castShadow=mesh.receiveShadow=true;
 const outlinePoints=[];
 for(const path of [data.outline,...data.holes])for(let i=0;i<path.length;i++){
  const a=path[i],b=path[(i+1)%path.length],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4));
  for(let k=0;k<steps;k++)for(const t of [k/steps,(k+1)/steps])outlinePoints.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,2.035]);
 }
 const outlineArray=new Float32Array(outlinePoints.length*3),outlineGeometry=new THREE.BufferGeometry();
 outlineGeometry.setAttribute('position',new THREE.BufferAttribute(outlineArray,3));
 root.add(new THREE.LineSegments(outlineGeometry,new THREE.LineBasicMaterial({color:0x526473,transparent:true,opacity:.6})));
 const mounts=new THREE.Group();root.add(mounts);
 const supportMat=material.clone();supportMat.color.set(0x738995);
 const s=Math.sin(Math.PI/12),c=Math.cos(Math.PI/12),base=data.right+2;
 const transform=new THREE.Matrix4().set(0,0,1,base, s,c,0,41.97, c,-s,0,199.59-398.5, 0,0,0,1);
 const plateGeo=new THREE.ExtrudeGeometry(shapeFrom(data.support),{depth:4,bevelEnabled:false});plateGeo.applyMatrix4(transform);
 const plate=new THREE.Mesh(plateGeo,supportMat);mounts.add(plate);
 for(const at of [-223,223]) {
  const eg=new THREE.ExtrudeGeometry(shapeFrom(data.ear),{depth:4,bevelEnabled:false});
  eg.applyMatrix4(new THREE.Matrix4().set(1,0,0,base, 0,c,s,41.97+at*s, 0,-s,c,199.59-398.5+at*c, 0,0,0,1));
  mounts.add(new THREE.Mesh(eg,supportMat));
 }
 mounts.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry,35),new THREE.LineBasicMaterial({color:0x41515d,transparent:true,opacity:.45})));}});
 function update(value) {
  const a=stage(value);
  points.forEach((p,i)=>{const q=bender.deform(p,a.left,a.right,a.lip);array.set([q[0],q[2],q[1]-398.5],i*3);});
  g.attributes.position.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();
  outlinePoints.forEach((p,i)=>{const q=bender.deform(p,a.left,a.right,a.lip);outlineArray.set([q[0],q[2],q[1]-398.5],i*3);});
  outlineGeometry.attributes.position.needsUpdate=true;outlineGeometry.computeBoundingSphere();
  mounts.visible=a.support>0;mounts.position.x=60*(1-a.support);
  return a;
 }
 update(1);return {root,update,points,bender};
}
export function createInstallation(data) {
 const root=new THREE.Group(),lotok=createLongModel(data);lotok.update(1);
 // Chute orientation from the 105-degree side-profile relationship; placement
 // calibrated to the installation views and the assembly's 1199 belt elevation.
 lotok.root.rotation.x=Math.PI/12;lotok.root.position.y=955.5;root.add(lotok.root);
 const steel=new THREE.MeshStandardMaterial({color:0xb4c0c7,metalness:.3,roughness:.6});
 const plastic=new THREE.MeshStandardMaterial({color:0xe5e4da,roughness:.8});
 const beltMat=new THREE.MeshStandardMaterial({color:0x7e949d,roughness:.85});
 const binMat=new THREE.MeshStandardMaterial({color:0xbecac6,roughness:.9,transparent:false,opacity:1});
 const bigBox=new THREE.Group();bigBox.name='receiving-container';root.add(bigBox);
 const endX=1003,noseX=102,zc=-185,frameX=261;
 function add(geo,mat=steel){const m=new THREE.Mesh(geo,mat);(mat===binMat?bigBox:root).add(m);m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo,32),new THREE.LineBasicMaterial({color:0x566772,transparent:true,opacity:.35})));return m;}
 function box(w,h,d,x,y,z,mat=steel){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);return add(g,mat);}
 function rod(r,a,b,mat=steel){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av);const g=new THREE.CylinderGeometry(r,r,v.length(),20);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));g.translate(...av.add(bv).multiplyScalar(.5).toArray());return add(g,mat);}
 // 400-wide modular belt with an actual return around the 70-diameter end wheels.
 const path=new THREE.Shape();path.moveTo(endX,1199);path.lineTo(noseX,1199);path.absarc(noseX,1164,35,Math.PI/2,3*Math.PI/2,false);path.lineTo(endX,1129);path.lineTo(endX,1135);path.lineTo(noseX,1135);path.absarc(noseX,1164,29,3*Math.PI/2,Math.PI/2,true);path.lineTo(endX,1193);path.closePath();
 const bg=new THREE.ExtrudeGeometry(path,{depth:400,bevelEnabled:false,curveSegments:24});bg.translate(0,0,zc-200);add(bg,beltMat);
 for(let x=noseX+15;x<endX;x+=25)rod(.6,[x,1199.5,zc-200],[x,1199.5,zc+200],beltMat);
 rod(10,[noseX,1164,zc-215.5],[noseX,1164,zc+215.5]);
 for(const z of [zc-161.8,zc-131.6,zc,zc+131.6,zc+161.8])rod(33,[noseX,1164,z-4],[noseX,1164,z+4],plastic);
 // Welded round-bar frame: 459 overall width, 20-diameter longitudinal rods.
 for(const z of [zc-219.5,zc+219.5])for(const y of [1170,1075])rod(10,[frameX,y,z],[endX,y,z]);
 for(const x of [frameX+100,frameX+500]){
  box(4,74,405,x,1122.5,zc);
  for(const z of [zc-219.5,zc+219.5])box(4,95,18,x,1122.5,z);
 }
 // End bearing cheeks taken from the actual laser-cut DXF for this conveyor.
 for(const z of [zc-224,zc+224]){
  const geo=new THREE.ExtrudeGeometry(shapeFrom(data.endHead),{depth:4,bevelEnabled:false});geo.translate(0,0,z-2);add(geo);
 }
 // One support frame is present in the installation crop: 996-long legs,
 // 60 x 30 section, 463 outside width, adjustable feet.
 const legX=626;
 for(const z of [zc-216.5,zc+216.5]){
  box(60,996,30,legX,568,z);
  rod(8,[legX,12,z],[legX,120,z]);box(100,5,70,legX,2.5,z);
  box(100,4,60,legX,1070,z);
 }
 for(const y of [210,820])box(30,30,403,legX,y,zc);
 // End guides from the post-modification drawing: both 585 long, 15 thick,
 // heights 185 and 134. Profile contours are extracted from that sheet.
 for(const [name,z,height]of [['right',zc-207.5,185],['left',zc+207.5,134]]){
  const geo=new THREE.ExtrudeGeometry(shapeFrom(data.conveyorProfiles[name]),{depth:15,bevelEnabled:false});geo.translate(-142,1269-height,z-7.5);add(geo,plastic);
  box(endX-443,70,15,(443+endX)/2,1234,z,plastic);
 }
 // Central guide and visible guide supports; small hardware is omitted.
 box(endX-142,70,20,(142+endX)/2,1234,zc);
 for(const x of [365,765]){
  for(const z of [zc-232,zc+232]){box(24,176,3,x,1150,z);box(80,54,4,x,1242,z);}
 }
 // Drip tray under the terminal section, clipped with the displayed segment.
 box(endX-226,2,451,(226+endX)/2,981,zc);
 for(const z of [zc-225,zc+225])box(endX-226,29,2,(226+endX)/2,995.5,z);
 // Receiving container: 1000-wide / 800-high envelope visible in the source.
 // Depth is not dimensioned in that view, so its representation stays schematic.
 box(1000,12,1000,-80,6,560,binMat);
 for(const x of [-580,420])box(12,800,1000,x,400,560,binMat);
 for(const z of [60,1060])box(1000,800,12,-80,400,z,binMat);
 return {root,lotok,bigBox};
}
const host=document.getElementById('long-model');
if(host) {
 const canvas=host.querySelector('canvas'),slider=document.getElementById('long-progress'),status=document.getElementById('long-status');
 let renderer;
 try { renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true}); }
 catch(e){status.textContent='3D недоступно. Схемы доступны в соседних вкладках.';throw e;}
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=THREE.ACESFilmicToneMapping;
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xe9eef2);
 scene.environment=new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(),.04).texture;
 const camera=new THREE.PerspectiveCamera(37,1,1,5000);camera.position.set(-800,680,1000);
 const controls=new OrbitControls(camera,canvas);controls.target.set(-40,70,0);controls.enableDamping=true;controls.minDistance=400;controls.maxDistance=2200;
 scene.add(new THREE.HemisphereLight(0xffffff,0x8b9ba8,1.5));
 for(const [x,y,z,p]of [[-500,900,500,2],[800,200,-700,1],[-400,-600,300,1]]){const l=new THREE.DirectionalLight(0xffffff,p);l.position.set(x,y,z);scene.add(l);}
 let model=null,playing=false,last=0;
 const error=message=>{status.textContent=message;};
 fetch('long-skliz-geometry.json?v=20261109rounded').then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(data=>{model=createLongModel(data);scene.add(model.root);setValue(100);}).catch(e=>{console.error(e);error('Не удалось загрузить модель. Схемы доступны в соседних вкладках.');});
 function setValue(n){slider.value=n;if(!model)return;const t=n/100,a=model.update(t);status.textContent=t===0?'Листовая заготовка':t<.3?'Формирование первого борта':t<.6?'Формирование второго борта':t<.82?'Отгиб кромки':t<1?'Установка опорной конструкции':'Лоток с опорной конструкцией';}
 slider.addEventListener('input',()=>{playing=false;document.getElementById('long-play').textContent='▶ Показать гибку';setValue(+slider.value);});
 document.getElementById('long-play').addEventListener('click',()=>{playing=!playing;if(playing&&+slider.value>=100)setValue(0);document.getElementById('long-play').textContent=playing?'Пауза':'▶ Показать гибку';});
 document.getElementById('long-flat').addEventListener('click',()=>{playing=false;setValue(0);camera.position.set(-600,1000,900);controls.target.set(-60,40,0);});
 document.getElementById('long-assembled').addEventListener('click',()=>{playing=false;setValue(100);camera.position.set(-800,680,1000);controls.target.set(-40,70,0);});
 document.getElementById('long-support').addEventListener('click',()=>{playing=false;setValue(100);camera.position.set(850,380,-850);controls.target.set(50,100,-180);});
 let inView=true;new IntersectionObserver(([e])=>inView=e.isIntersecting).observe(host);
 renderer.setAnimationLoop(now=>{
  const dt=Math.min((now-last)/1000,.1);last=now;if(!inView||document.hidden)return;
  if(playing&&model){const n=Math.min(100,+slider.value+dt*10);setValue(n);if(n===100){playing=false;document.getElementById('long-play').textContent='▶ Повторить гибку';}}
  const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
  if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  controls.update();renderer.render(scene,camera);
 });
}

const installationHost=document.getElementById('installation-model');
if(installationHost){
 const canvas=installationHost.querySelector('canvas'),label=document.getElementById('installation-status');
 const toggleBox=document.getElementById('installation-toggle-box');let installation=null;
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xe9eef2);
 const camera=new THREE.PerspectiveCamera(37,1,1,8000),controls=new OrbitControls(camera,canvas);
 controls.enableDamping=true;controls.minDistance=700;controls.maxDistance=4000;
 function reset(){camera.position.set(-1600,1900,2300);controls.target.set(240,690,110);controls.update();}reset();
 scene.add(new THREE.HemisphereLight(0xffffff,0x788995,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-500,1500,700);scene.add(light);
 fetch('long-skliz-geometry.json?v=20261109rounded').then(r=>r.json()).then(data=>{installation=createInstallation(data);scene.add(installation.root);toggleBox.disabled=false;label.textContent='Вращайте модель мышью или пальцем. Участок конвейера и приёмная тара показаны условно.';}).catch(e=>{console.error(e);label.textContent='Не удалось загрузить сцену. Откройте вкладку «Установка · 2D».';});
 toggleBox.addEventListener('click',()=>{
  if(!installation)return;
  installation.bigBox.visible=!installation.bigBox.visible;
  toggleBox.textContent=installation.bigBox.visible?'Скрыть приёмную тару':'Показать приёмную тару';
  toggleBox.setAttribute('aria-pressed',String(!installation.bigBox.visible));
 });
 document.getElementById('installation-reset').addEventListener('click',reset);
 let visible=false;new IntersectionObserver(([e])=>visible=e.isIntersecting).observe(installationHost);
 renderer.setAnimationLoop(()=>{if(!visible||document.hidden)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}controls.update();renderer.render(scene,camera);});
}
