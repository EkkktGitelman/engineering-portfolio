// viewer.js — просмотрщик одной модели GLB с выносками на three.js.
// Используется на главной (в блоке истории) и в полноэкранном режиме.
// API: createViewer({ container, model, nodeMap, callouts, cardsRoot, snap, fixups, rotateY })
//   → { select(id|null), setHot(id|null), unmatchedTags(), resize(), render(), dispose(), scene, camera }
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const CSS = `
.v3d{position:relative;overflow:hidden;background:#eaedf0}
.v3d canvas.v3d-c{display:block;width:100%;height:100%;position:absolute;inset:0;touch-action:none}
.v3d .v3d-labels{position:absolute;top:0;left:0;pointer-events:none;z-index:2}
.v3d .v3d-leaders{position:absolute;top:0;left:0;pointer-events:none;z-index:1}
.v3d .v3d-leaders path{fill:none;stroke:#2a3441;stroke-width:1.4;stroke-linecap:round;transition:opacity .25s}
.v3d .v3d-leaders path.hot{stroke:#d97706;stroke-width:2.2}
.callout{position:relative;width:0;height:0;font:12.5px/1.25 -apple-system,Inter,Segoe UI,Roboto,sans-serif;white-space:nowrap;transition:opacity .25s}
.callout .num{position:absolute;left:-13px;top:-13px;width:26px;height:26px;border-radius:50%;background:#d97706;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 0 0 2px #fff,0 2px 6px rgba(28,36,48,.25);transition:transform .15s}
.callout .txt{position:absolute;top:-12px;left:19px;background:#fff;border-radius:7px;padding:4px 10px;color:#1c2430;box-shadow:0 1px 2px rgba(28,36,48,.12),0 4px 12px rgba(28,36,48,.10);transition:color .15s,box-shadow .15s}
.callout.left .txt{left:auto;right:19px}
.callout .num,.callout .txt{pointer-events:auto;cursor:pointer}
.callout.is-hot .num{transform:scale(1.18)}
.callout.is-hot .txt{color:#d97706;box-shadow:0 0 0 1.5px #d97706,0 4px 12px rgba(217,119,6,.25)}
.callout.is-selected .num{background:#1c2430}
.v3d-dot{width:9px;height:9px;border-radius:50%;background:#d97706;border:2px solid #fff;box-shadow:0 1px 3px rgba(28,36,48,.3);transition:transform .15s}
.v3d-dot.hot{transform:scale(1.4)}
html.snap .callout,html.snap .v3d-dot,html.snap .v3d-leaders path{transition:none}
.v3d.narrow .callout .txt{display:none}
.v3d.narrow .callout.is-hot .txt,.v3d.narrow .callout.is-selected .txt{display:block;white-space:normal;width:max-content;max-width:min(60vw,260px)}
`;
function injectCss() {
  if (document.getElementById('v3d-css')) return;
  const s = document.createElement('style'); s.id = 'v3d-css'; s.textContent = CSS; document.head.appendChild(s);
}

// Есть ли WebGL (на старых и урезанных устройствах его может не быть).
export function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

// Совмещаем ось приводного вала с центрами звёздочек после экспорта модели.
export function fixDriveShaft(model) {
  const shaft = model.getObjectByName('component_0187'); if (!shaft) return;
  const zs = new THREE.Box3(); model.traverse(o => { if (/^component_(0184|0185|0186|0192)$/.test(o.name)) zs.expandByObject(o); });
  if (zs.isEmpty()) return;
  const cs = new THREE.Box3().setFromObject(shaft).getCenter(new THREE.Vector3()), cz = zs.getCenter(new THREE.Vector3());
  const wp = shaft.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, cz.y - cs.y, cz.z - cs.z));
  shaft.position.copy(shaft.parent.worldToLocal(wp)); shaft.updateMatrixWorld(true);
}

// Сталь из SolidWorks без окружения выходит чёрной: единый материал для металла, остальное приглушить.
function tuneMaterials(model) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x9ea7b0, metalness: 0.75, roughness: 0.42 }), cache = new Map();
  model.traverse(o => { if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    if (o.material.metalness > 0.5) { o.material = steel; return; }
    if (!cache.has(o.material)) { const m = o.material.clone(); m.roughness = Math.max(m.roughness, 0.55); m.metalness = Math.min(m.metalness, 0.2); m.color.multiplyScalar(0.93); cache.set(o.material, m); }
    o.material = cache.get(o.material); });
}
const edgeMat = new THREE.LineBasicMaterial({ color: 0x2a3441, transparent: true, opacity: 0.45 });
// рёбра считаются один раз на геометрию: после дедупликации мешей экземпляры делят одну EdgesGeometry
function addEdges(root, angle = 30) {
  const cache = new Map();
  root.traverse(o => { if (!o.isMesh) return;
    if (!cache.has(o.geometry)) cache.set(o.geometry, new THREE.EdgesGeometry(o.geometry, angle));
    const e = new THREE.LineSegments(cache.get(o.geometry), edgeMat); e.userData.edge = true; e.renderOrder = 1; o.add(e); });
}

// nodeMap: { tag: ['^Вал_приводной', 'обкатная'] } — первое совпадение по имени верхнего узла сборки побеждает.
function tagNodes(model, nodeMap) {
  const rules = Object.entries(nodeMap).map(([tag, pats]) => [tag, (pats || []).map(p => new RegExp(p))]);
  const found = new Set();
  function visit(node, inherited=null) {
    const hit=rules.find(([,res])=>res.some(re=>re.test(node.name)));
    const tag=hit?hit[0]:inherited;
    if(tag)found.add(tag);
    node.userData.tag=tag;
    for(const child of node.children)visit(child,tag);
  }
  visit(model);
  return Object.keys(nodeMap).filter(t => !found.has(t));
}

export async function createViewer({ container, model, nodeMap = {}, callouts = [], cardsRoot = null, snap = false, fixups = [], rotateY = 0, clampLabels = false, fitModel = false }) {
  injectCss();
  container.classList.add('v3d');
  if (snap) document.documentElement.classList.add('snap');
  const canvas = document.createElement('canvas'); canvas.className = 'v3d-c'; container.appendChild(canvas);
  const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); leaders.setAttribute('class', 'v3d-leaders'); container.appendChild(leaders);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: snap });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf4f6f8);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const ISO = new THREE.Vector3(1, 0.82, 1).normalize();
  camera.position.copy(ISO).multiplyScalar(40);
  const labelRenderer = new CSS2DRenderer(); labelRenderer.domElement.className = 'v3d-labels'; container.appendChild(labelRenderer.domElement);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2 - 0.05; controls.enablePan = true; controls.zoomSpeed = 1.2;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f98a3, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6); sun.position.set(6, 12, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.01; sun.shadow.radius = 2; scene.add(sun);
  const rim = new THREE.DirectionalLight(0xdfe9f5, 0.7); rim.position.set(-8, 6, -6); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0xeaedf0, roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  scene.add(new THREE.GridHelper(40, 40, 0xc9d1d9, 0xdfe4e9));

  // ---- модель ----
  const root = new THREE.Group(); scene.add(root);
  const gltf = await new GLTFLoader().loadAsync(model);
  const m = gltf.scene; m.updateMatrixWorld(true);
  for (const fn of fixups) fn(m);
  tuneMaterials(m);
  const unmatched = tagNodes(m, nodeMap);
  if (unmatched.length) console.warn('viewer: теги без узлов в модели: '+unmatched.join(', '));
  addEdges(m, 30);
  const inner = new THREE.Group(); inner.rotation.y = rotateY; inner.add(m); root.add(inner);
  inner.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(inner); const size = bb.getSize(new THREE.Vector3()); const c = bb.getCenter(new THREE.Vector3());
  root.position.set(-c.x, -bb.min.y, -c.z); root.updateMatrixWorld(true);
  const look = new THREE.Vector3(0, size.y / 2, 0);
  let zoomW = Math.max(size.x, size.z) * 1.35;
  controls.target.copy(look);
  const initialCamera = camera.position.clone(), initialTarget = look.clone();
  let fitWidth=0,fitHeight=0;
  if(fitModel){
    controls.update();camera.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(root),right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),xs=[],ys=[];
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z);xs.push(p.dot(right));ys.push(p.dot(up));}
    fitWidth=Math.max(...xs)-Math.min(...xs);fitHeight=Math.max(...ys)-Math.min(...ys);
  }
  Object.assign(sun.shadow.camera, { left: -size.x, right: size.x, top: size.x, bottom: -size.x, near: 1, far: 60 }); sun.shadow.camera.updateProjectionMatrix();

  // ---- выноски ----
  const items = []; // { src, mesh, lc, label, dot, path, el, dotEl }
  const liOf = id => cardsRoot ? cardsRoot.querySelector(`[data-callout="${id}"]`) : null;
  const _v = new THREE.Vector3();
  // размер в мировых единицах: после квантования локальные боксы у всех мешей одинаковые, сравнивать их нельзя
  const meshSize = mm => { mm.geometry.computeBoundingBox(); return mm.geometry.boundingBox.getSize(_v).lengthSq() * mm.matrixWorld.getMaxScaleOnAxis() ** 2; };
  callouts.forEach((src, i) => {
    const meshes = []; m.traverse(o => { if (o.isMesh && o.userData.tag === src.tag) meshes.push(o); });
    if (!meshes.length) return;
    // Repeated parts need an explicit instance, otherwise moving another copy
    // of the same part can leave the leader attached to the wrong component.
    const mesh = meshes.find(o => o.name === src.anchorNode) || meshes.reduce((a, b) => meshSize(b) > meshSize(a) ? b : a);
    mesh.geometry.computeBoundingBox(); const lc = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
    const el = document.createElement('div'); el.className = 'callout' + (src.dx < 0 ? ' left' : ''); el.dataset.callout = src.id; el.dataset.tag = src.tag;
    const num = document.createElement('span'); num.className = 'num'; num.textContent = String(src.n ?? i + 1);
    num.tabIndex=0;num.setAttribute('role','button');num.setAttribute('aria-label',`${src.n ?? i+1} · ${src.label}`);num.setAttribute('aria-pressed','false');
    num.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();select(selected===src.id?null:src.id);}});
    const txt = document.createElement('span'); txt.className = 'txt'; txt.textContent = src.label; el.append(num, txt);
    el.addEventListener('pointerenter', () => setHot(src.id)); el.addEventListener('pointerleave', () => setHot(selected));
    el.addEventListener('pointerup', e => { e.stopPropagation(); select(selected === src.id ? null : src.id); });
    const label = new CSS2DObject(el);
    const dotEl = document.createElement('div'); dotEl.className = 'v3d-dot'; dotEl.dataset.anchorNode=mesh.name; const dot = new CSS2DObject(dotEl);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); leaders.appendChild(path);
    scene.add(label, dot);
    items.push({ src, mesh, lc, label, dot, path, el, dotEl });
  });
  if (cardsRoot) for (const it of items) { const li = liOf(it.src.id); if (!li) continue;
    if(!li.hasAttribute('tabindex')){li.tabIndex=0;li.setAttribute('role','button');li.addEventListener('keydown',e=>{if(e.target===li&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select(selected===it.src.id?null:it.src.id);}});}
    li.addEventListener('pointerenter', () => setHot(it.src.id)); li.addEventListener('pointerleave', () => setHot(selected));
    li.addEventListener('click', () => select(selected === it.src.id ? null : it.src.id)); }

  const _wp = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3();
  function updateCallouts() {
    scene.updateMatrixWorld(); camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    _r.setFromMatrixColumn(camera.matrix, 0); _u.setFromMatrixColumn(camera.matrix, 1);
    const W = canvas.clientWidth, H = canvas.clientHeight, placedNumbers=[];
    for (const it of items) {
      const S = it.src;
      if(Array.isArray(S.anchor) && S.anchor.length===3){_wp.fromArray(S.anchor);if(S.anchorSpace==='mesh')it.mesh.localToWorld(_wp);}
      else it.mesh.localToWorld(_wp.copy(it.lc)).addScaledVector(_r, S.ax || 0).addScaledVector(_u, S.ay || 0);
      it.dot.position.copy(_wp);
      it.label.position.copy(_wp).addScaledVector(_r, S.dx || 0).addScaledVector(_u, S.dy || 0);
      it.el.classList.toggle('left', (S.dx || 0) < 0);
      _p0.copy(_wp).project(camera); _p1.copy(it.label.position).project(camera);
      const x0 = (_p0.x + 1) / 2 * W, y0 = (1 - _p0.y) / 2 * H, x1 = (_p1.x + 1) / 2 * W, y1 = (1 - _p1.y) / 2 * H;
      let labelX=x1,labelY=y1;
      if(clampLabels){
        const text=it.el.querySelector('.txt'),tw=text.offsetWidth,th=Math.max(26,text.offsetHeight),left=(S.dx||0)<0;
        labelX=Math.max(left?tw+27:21,Math.min(W-(left?21:tw+27),x1));
        labelY=Math.max(22,Math.min(H-th-8,y1));
        // Keep compact number badges apart when responsive clamping brings them
        // together. Saved offsets and anchor coordinates remain untouched.
        if(!tw){
          for(const point of placedNumbers){
            if(Math.hypot(labelX-point.x,labelY-point.y)<34){
              const next=point.x+36;
              if(next<W-22)labelX=next;else labelY=Math.min(H-34,point.y+36);
            }
          }
          placedNumbers.push({x:labelX,y:labelY});
        }
        const scale=zoomW/(W*camera.zoom);
        it.label.position.addScaledVector(_r,(labelX-x1)*scale).addScaledVector(_u,(y1-labelY)*scale);
      }
      const elbow = (S.dx || 0) < 0 ? 14 : -14, xe = labelX + elbow;
      const ddx = xe - x0, ddy = labelY - y0, L = Math.hypot(ddx, ddy) || 1;
      const sx = x0 + ddx / L * 6, sy = y0 + ddy / L * 6;
      it.path.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} L${xe.toFixed(1)} ${labelY.toFixed(1)} H${(labelX + ((S.dx || 0) < 0 ? 13 : -13)).toFixed(1)}`);
    }
  }

  // ---- подсветка и выбор ----
  const hotMeshes = new Map(); let hot = null, selected = null;
  const tagOf = id => items.find(it => it.src.id === id)?.src.tag ?? null;
  function setHot(id) {
    if (id === hot) return; hot = id;
    for (const [mm, orig] of hotMeshes) { mm.material = orig; mm.renderOrder = mm.userData.ro ?? 0; } hotMeshes.clear();
    const tag = tagOf(id);
    if (tag) m.traverse(o => { if (o.isMesh && o.userData.tag === tag) {
      const h = o.material.clone(); h.color.set(0xff9f1c); h.emissive = new THREE.Color(0xff9f1c); h.emissiveIntensity = 0.9; h.metalness = 0.1; h.roughness = 0.6; h.transparent = true; h.opacity = 1; h.depthTest = false; h.depthWrite = false;
      hotMeshes.set(o, o.material); o.material = h; o.userData.ro = o.renderOrder; o.renderOrder = 20; } });
    for (const it of items) { const on = it.src.id === id; it.el.classList.toggle('is-hot', on); it.dotEl.classList.toggle('hot', on); it.path.classList.toggle('hot', on); }
    if (cardsRoot) cardsRoot.querySelectorAll('[data-callout]').forEach(li => li.classList.toggle('is-hot', li.dataset.callout === id));
    if (snap) render();
  }
  function select(id) {
    selected = id;
    for (const it of items) {it.el.classList.toggle('is-selected', it.src.id === id);it.el.querySelector('.num').setAttribute('aria-pressed',String(it.src.id===id));}
    if (cardsRoot) cardsRoot.querySelectorAll('[data-callout]').forEach(li => li.classList.toggle('is-selected', li.dataset.callout === id));
    setHot(id);
    container.dispatchEvent(new CustomEvent('v3d:select', { detail: { id } }));
    if (snap) render();
  }

  // клик по детали в сцене → выноска с её тегом
  const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2(); let downAt = null;
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObject(m, true).find(h => h.object.isMesh && h.object.userData.tag);
    return hit ? items.find(it => it.src.tag === hit.object.userData.tag)?.src.id ?? null : null;
  }
  canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => { if (!downAt) return; const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null; if (moved > 4) return; select(pick(e)); });

  // ---- размер и кадр ----
  function resize() {
    const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
    container.classList.toggle('narrow', w < 760);
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) { renderer.setSize(w, h, false); labelRenderer.setSize(w, h); leaders.setAttribute('width', w); leaders.setAttribute('height', h); }
    const asp = w / h; if(fitModel)zoomW=Math.max(fitWidth,fitHeight*asp)*1.13; camera.left = -zoomW / 2; camera.right = zoomW / 2; camera.top = zoomW / asp / 2; camera.bottom = -zoomW / asp / 2; camera.updateProjectionMatrix();
  }
  function render() { resize(); controls.update(); updateCallouts(); renderer.render(scene, camera); labelRenderer.render(scene, camera); }
  const ro = new ResizeObserver(() => { resize(); if (snap) render(); }); ro.observe(container);
  // цикл рендера крутится только пока блок виден и вкладка активна
  let visible = true, running = false;
  function setVisible(v) { visible = v; const on = v && !document.hidden; if (on !== running) { running = on; renderer.setAnimationLoop(on ? () => render() : null); } }
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => setVisible(es.some(e => e.isIntersecting))) : null;
  if (io) io.observe(container);
  const onVis = () => setVisible(visible); document.addEventListener('visibilitychange', onVis);
  if (!io) setVisible(true);
  render(); if (snap) setTimeout(render, 300);

  function dispose() { ro.disconnect(); io?.disconnect(); document.removeEventListener('visibilitychange', onVis); renderer.setAnimationLoop(null); controls.dispose(); renderer.dispose(); pmrem.dispose(); container.innerHTML = ''; container.classList.remove('v3d'); }
  return { select, setHot, unmatchedTags: () => unmatched.slice(), resize, render, dispose, scene, camera, container,
    items, metersPerPixel: () => zoomW / (canvas.clientWidth * camera.zoom),
    setControlsEnabled: enabled => { controls.enabled=enabled; },
    resetView: () => {camera.position.copy(initialCamera);camera.zoom=1;controls.target.copy(initialTarget);controls.update();render();},
    offsetAnchor: (id,x,y) => {const it=items.find(item=>item.src.id===id);if(!it||it.src.anchorLocked)return;updateCallouts();const point=it.dot.position.clone().addScaledVector(_r,x).addScaledVector(_u,y);if(it.src.anchorSpace==='mesh')it.mesh.worldToLocal(point);it.src.anchor=point.toArray();delete it.src.ax;delete it.src.ay;},
    focus: (id,zoom=4) => {const it=items.find(item=>item.src.id===id);if(!it)return;updateCallouts();const offset=camera.position.clone().sub(controls.target);controls.target.copy(it.dot.position);camera.position.copy(controls.target).add(offset);camera.zoom=zoom;select(id);render();},
    tags: () => { const t = new Set(); m.traverse(o => { if (o.isMesh && o.userData.tag) t.add(o.userData.tag); }); return [...t].sort(); },
    setVisible, get running() { return running; }, get visible() { return visible; }, get observed() { return !!io; },
    get selected() { return selected; } };
}
