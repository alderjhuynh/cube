import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const dom = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(5.2, 4.2, 6.4);

scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4050, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(5, 8, 6);
scene.add(key);
const fill = new THREE.DirectionalLight(0xaabbff, 0.6);
fill.position.set(-6, -3, -5);
scene.add(fill);

// the cube itself
const COLORS = {
  '0,1': 0xffffff, '0,-1': 0xffd500,
  '1,1': 0xb71234, '1,-1': 0xff5800, 
};
const FACE_COLORS = [
  { n: [1, 0, 0],  c: 0xb71234 },
  { n: [-1, 0, 0], c: 0xff5800 },
  { n: [0, 1, 0],  c: 0xffffff },
  { n: [0, -1, 0], c: 0xffd500 },
  { n: [0, 0, 1],  c: 0x009b48 },
  { n: [0, 0, -1], c: 0x0046ad },
];

const bodyGeo = new RoundedBoxGeometry(0.96, 0.96, 0.96, 4, 0.09);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.55, metalness: 0.1 });

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 6);
}
const stickerGeo = roundedRect(0.8, 0.8, 0.14);
const stickerMats = {};
for (const f of FACE_COLORS) {
  stickerMats[f.c] = new THREE.MeshStandardMaterial({
    color: f.c, roughness: 0.35, metalness: 0.0, side: THREE.DoubleSide
  });
}

const cubies = [];
const cubeRoot = new THREE.Group();
scene.add(cubeRoot);

for (let x = -1; x <= 1; x++)
for (let y = -1; y <= 1; y++)
for (let z = -1; z <= 1; z++) {
  const cubie = new THREE.Group();
  cubie.position.set(x, y, z);
  cubie.add(new THREE.Mesh(bodyGeo, bodyMat));
  const pos = [x, y, z];
  for (const f of FACE_COLORS) {
    const axis = f.n.findIndex(v => v !== 0);
    if (pos[axis] !== f.n[axis]) continue;
    const st = new THREE.Mesh(stickerGeo, stickerMats[f.c]);
    const n = new THREE.Vector3(...f.n);
    st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    st.position.copy(n).multiplyScalar(0.482);
    cubie.add(st);
  }
  cubeRoot.add(cubie);
  cubies.push(cubie);
}

// controls
let controls;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

let drag = null;
let anim = null;
const pivot = new THREE.Group();
scene.add(pivot);

Object.assign(window, { cubies, pivot, AXES });
Object.defineProperties(window, {
  anim: { get: () => anim, set: (v) => (anim = v), configurable: true },
  drag: { get: () => drag, set: (v) => (drag = v), configurable: true },
});

function toPixels(v) {
  const p = v.clone().project(camera);
  return new THREE.Vector2((p.x + 1) / 2 * window.innerWidth, (1 - p.y) / 2 * window.innerHeight);
}

dom.addEventListener('pointerdown', (e) => {
  if (anim || drag) return;
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(cubies, true);
  if (!hits.length) return;

  let obj = hits[0].object;
  while (obj.parent && obj.parent !== cubeRoot) obj = obj.parent;
  const cubie = obj;
  const point = hits[0].point.clone();

  // face normal from point relative to cubie center
  const rel = point.clone().sub(cubie.position);
  const ax = Math.abs(rel.x) > Math.abs(rel.y) && Math.abs(rel.x) > Math.abs(rel.z) ? 0
           : Math.abs(rel.y) > Math.abs(rel.z) ? 1 : 2;
  const normal = AXES[ax].clone().multiplyScalar(Math.sign(rel.getComponent(ax)) || 1);

  controls.enabled = false;
  e.stopImmediatePropagation();
  dom.setPointerCapture(e.pointerId);
  drag = { cubie, point, normal, ax, start: new THREE.Vector2(e.clientX, e.clientY), decided: false, pointerId: e.pointerId };
}, true);

dom.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const cur = new THREE.Vector2(e.clientX, e.clientY);
  const delta = cur.clone().sub(drag.start);

  if (!drag.decided) {
    if (delta.length() < 8) return;
    // choose tangent axis whose screen direction best matches the drag
    const p0 = toPixels(drag.point);
    let best = null;
    for (let i = 0; i < 3; i++) {
      if (i === drag.ax) continue;
      const p1 = toPixels(drag.point.clone().add(AXES[i]));
      const s = p1.clone().sub(p0);
      const len = s.length();
      const d = delta.dot(s) / (len || 1);
      if (!best || Math.abs(d) > Math.abs(best.d)) best = { i, s, len, d };
    }
    const sign = Math.sign(best.d) || 1;
    const m = AXES[best.i].clone().multiplyScalar(sign);        // direction the face moves
    const rotAxis = new THREE.Vector3().crossVectors(drag.normal, m).normalize();
    const axIdx = [rotAxis.x, rotAxis.y, rotAxis.z].findIndex(v => Math.abs(v) > 0.5);
    const layer = Math.round(drag.cubie.position.getComponent(axIdx));
    const slice = cubies.filter(c => Math.round(c.position.getComponent(axIdx)) === layer);

    // radius of hit point around the rotation axis
    const radial = drag.point.clone().sub(rotAxis.clone().multiplyScalar(drag.point.dot(rotAxis)));
    drag.rotAxis = rotAxis;
    drag.slice = slice;
    drag.sdir = best.s.clone().multiplyScalar(sign / (best.len || 1)); // unit screen dir of m
    drag.pxPerRad = best.len * Math.max(radial.length(), 0.5);
    drag.angle = 0;
    drag.decided = true;

    pivot.quaternion.identity();
    slice.forEach(c => pivot.attach(c));
  }

  drag.angle = delta.dot(drag.sdir) / drag.pxPerRad;
  pivot.quaternion.setFromAxisAngle(drag.rotAxis, drag.angle);
});

function endDrag(e) {
  if (!drag) return;
  try { dom.releasePointerCapture(drag.pointerId); } catch (_) {}
  const d = drag;
  drag = null;
  controls.enabled = true;
  if (!d.decided) return;

  const q = d.angle / (Math.PI / 2);
  let steps = 0;
  if (Math.abs(q) > 0.2) steps = Math.sign(q) * Math.max(1, Math.round(Math.abs(q)));
  anim = {
    from: d.angle,
    to: steps * Math.PI / 2,
    axis: d.rotAxis,
    slice: d.slice,
    t0: performance.now(),
    dur: 80 + Math.abs(steps * Math.PI / 2 - d.angle) * 140
  };
}
dom.addEventListener('pointerup', endDrag);
dom.addEventListener('pointercancel', endDrag);

function finishAnim(a) {
  pivot.quaternion.setFromAxisAngle(a.axis, a.to);
  pivot.updateMatrixWorld(true);
  a.slice.forEach(c => {
    cubeRoot.attach(c);
    c.position.set(Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z));
    // snap orientation to a clean 990 degree multiple
    const m = new THREE.Matrix4().makeRotationFromQuaternion(c.quaternion);
    const e = m.elements;
    for (let i = 0; i < 16; i++) e[i] = Math.abs(e[i]) < 1e-4 ? 0 : Math.round(e[i]);
    c.quaternion.setFromRotationMatrix(m);
    c.updateMatrix();
  });
  pivot.quaternion.identity();
}

// trackball controls
controls = new TrackballControls(camera, dom);
controls.rotateSpeed = 3.0;
controls.zoomSpeed = 1.0;
controls.noPan = true;
controls.staticMoving = false;
controls.dynamicDampingFactor = 0.12;
controls.minDistance = 5;
controls.maxDistance = 16;

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r") {
    shuffle()
  }
});


window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  controls.handleResize();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  if (anim) {
    const t = Math.min((performance.now() - anim.t0) / anim.dur, 1);
    const k = 1 - Math.pow(1 - t, 3);
    pivot.quaternion.setFromAxisAngle(anim.axis, anim.from + (anim.to - anim.from) * k);
    if (t >= 1) { const a = anim; anim = null; finishAnim(a); nextShuffleMove(); }
  }
  controls.update();
  renderer.render(scene, camera);
});