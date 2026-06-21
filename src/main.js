import * as THREE from 'three';
import { profile, stations } from './cvData.js';

// ════════════════════════════════════════════════════════════════════════
//  CV PLANET — drive a rover over a globe and read your CV off the signs.
//
//  Model: the rover stays parked at the top of the globe; driving rotates
//  the whole PLANET underneath it (stations + scenery are children of the
//  planet, so they scroll into view). Click-to-travel slerps the planet's
//  orientation until the chosen station sits upright in front of the camera.
//
//  Tunables live in CONFIG. Everything content-related lives in cvData.js.
// ════════════════════════════════════════════════════════════════════════

const CONFIG = {
  radius: 32,
  driveSpeed: 0.5,     // radians/sec the planet rolls when driving
  turnSpeed: 1.9,      // radians/sec the rover yaws when steering
  travelSpeed: 2.2,    // slerp rate when auto-travelling
  paper: '#e9f1dd',    // warm grassy sky
  ocean: '#57a83f',    // vibrant grass
  land: '#d49758',     // sandstone platforms
  ink: '#3a352e',
};

const DEG = Math.PI / 180;
const R = CONFIG.radius;

// ── Renderer / scene / camera ──────────────────────────────────────────
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.paper);
scene.fog = new THREE.Fog(CONFIG.paper, R * 2.4, R * 5);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 600);
// orbit-camera state — drag the scene to rotate around the rover
const camTarget = new THREE.Vector3(0, R + 7, 0);
const camDist = 39.3;
const DEF_AZ = 0, DEF_EL = 0.26;
let camAz = DEF_AZ;   // azimuth  (drag horizontally)
let camEl = DEF_EL;   // elevation (drag vertically)
function updateCamera() {
  const ce = Math.cos(camEl), se = Math.sin(camEl);
  camera.position.set(
    camTarget.x + camDist * Math.sin(camAz) * ce,
    camTarget.y + camDist * se,
    camTarget.z + camDist * Math.cos(camAz) * ce
  );
  camera.lookAt(camTarget);
}
updateCamera();

// ── Lighting (soft, minimal) ───────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0xffffff, 0x9fbf7a, 0.7));
const sun = new THREE.DirectionalLight(0xffedc4, 1.4);
sun.position.set(18, 40, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 220;
const sc = sun.shadow.camera;
sc.left = -65; sc.right = 65; sc.top = 65; sc.bottom = -65;
sun.shadow.bias = -0.0004;
scene.add(sun);

// ── The planet (everything that "moves" is a child of this group) ───────
const planet = new THREE.Group();
scene.add(planet);

const globeGeo = new THREE.IcosahedronGeometry(R, 24);
const globe = new THREE.Mesh(
  globeGeo,
  new THREE.MeshStandardMaterial({ color: CONFIG.ocean, roughness: 0.95, metalness: 0, flatShading: true })
);
globe.receiveShadow = true;
globe.castShadow = true;
planet.add(globe);

// helper: lat/lon (deg) → unit direction on the sphere
function dirFromLatLon(lat, lon) {
  const la = lat * DEG, lo = lon * DEG;
  return new THREE.Vector3(
    Math.cos(la) * Math.cos(lo),
    Math.sin(la),
    Math.cos(la) * Math.sin(lo)
  ).normalize();
}

// helper: orthonormal surface frame at a direction n → Matrix4 makeBasis(t,n,f)
function surfaceFrame(n) {
  const ref = Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const t = new THREE.Vector3().crossVectors(ref, n).normalize(); // tangent (right)
  const f = new THREE.Vector3().crossVectors(t, n).normalize();   // tangent (face)
  const m = new THREE.Matrix4().makeBasis(t, n, f);
  return m;
}

// ── Terrain: rolling hills via smooth noise, flattened around the landmarks ──
const HILL_AMP = 3.6;
const HILLS = [];
for (let i = 0; i < 7; i++) {
  HILLS.push({
    axis: new THREE.Vector3().randomDirection(),
    freq: 0.9 + Math.random() * 2.1,
    phase: Math.random() * Math.PI * 2,
    amp: 0.5 + Math.random() * 0.9,
  });
}
const _ampNorm = HILL_AMP / HILLS.reduce((s, h) => s + h.amp, 0);
// keep terrain flat where the CV billboards stand so they sit clean
const STATION_FLAT = stations.map((st) => dirFromLatLon(st.lat, st.lon));
function terrainHeight(n) {
  let h = 0;
  for (const w of HILLS) h += w.amp * Math.sin(w.freq * n.dot(w.axis) * 3 + w.phase);
  h *= _ampNorm;
  // flatten near each landmark (smoothstep over a small cap)
  let flat = 1;
  for (const d of STATION_FLAT) {
    const a = d.angleTo(n);
    if (a < 0.26) { const t = a / 0.26; flat = Math.min(flat, t * t * (3 - 2 * t)); }
  }
  return h * flat;
}
function elevate(n) { return R + terrainHeight(n); }
// lowest surface height under a footprint disc, so wide flat-based buildings
// sit grounded on their low side and tuck into the slope on the high side
function groundHeight(n, footAng) {
  let m = terrainHeight(n);
  const f = surfaceFrame(n);
  const ex = new THREE.Vector3().setFromMatrixColumn(f, 0);
  const ez = new THREE.Vector3().setFromMatrixColumn(f, 2);
  const _d = new THREE.Vector3();
  for (let a = 0; a < 8; a++) {
    const ang = a / 8 * Math.PI * 2;
    _d.copy(n).addScaledVector(ex, Math.cos(ang) * footAng).addScaledVector(ez, Math.sin(ang) * footAng).normalize();
    m = Math.min(m, terrainHeight(_d));
  }
  return R + m;
}

// displace the globe mesh into hills (positions only — flatShading derives normals)
(() => {
  const pos = globeGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const r = elevate(v);
    pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  pos.needsUpdate = true;
  globeGeo.computeVertexNormals();
})();


// ── Voxel scenery scattered over the globe (trees, pines, rocks, temples) ──
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const _matCache = {};
function vmat(color) {
  if (!_matCache[color]) {
    _matCache[color] = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
    _matCache[color].userData.vox = true; // tag so groups of these can be baked into one mesh
  }
  return _matCache[color];
}

// ── Geometry baking: merge many unit-box meshes into ONE mesh (vertex colors) ──
// Keeps draw calls/shadow casters in the hundreds instead of thousands.
const BAKED_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
const staticTiles = [];                 // ground/road/river tiles, merged after the world is built
const _bv = new THREE.Vector3();
function mergeBoxMeshes(meshes, parent, cast) {
  if (!meshes.length) return null;
  const pos = [], col = [];
  const c = new THREE.Color();
  for (const m of meshes) {
    m.updateMatrix();
    const geo = m.geometry, p = geo.attributes.position, index = geo.index;
    c.copy(m.material.color);
    const count = index ? index.count : p.count;
    for (let i = 0; i < count; i++) {
      const vi = index ? index.array[i] : i;
      _bv.fromBufferAttribute(p, vi).applyMatrix4(m.matrix);
      pos.push(_bv.x, _bv.y, _bv.z);
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, BAKED_MAT);
  mesh.castShadow = cast; mesh.receiveShadow = true;
  for (const m of meshes) if (m.parent) m.parent.remove(m);
  parent.add(mesh);
  return mesh;
}
// merge a group's voxel boxes (direct children) into one mesh; leaves animated/special meshes
function bakeStatic(g, cast) {
  const boxes = g.children.filter((ch) => ch.isMesh && ch.material && ch.material.userData && ch.material.userData.vox);
  if (boxes.length >= 2) mergeBoxMeshes(boxes, g, cast);
}
let VCAST = true; // toggle off for decorative filler so the shadow pass stays cheap
function vbox(parent, w, h, d, x, y, z, color) {
  const m = new THREE.Mesh(UNIT, vmat(color));
  m.scale.set(w, h, d); m.position.set(x, y, z);
  m.castShadow = VCAST; m.receiveShadow = true;
  parent.add(m); return m;
}

const GREENS = ['#2f7d2c', '#3f8f37', '#52a23f', '#6cb74a'];
const SAND = ['#d49758', '#c07f3f', '#aa6c30'];
const STONE = ['#d8d2c2', '#c7c0ae'];
const rpick = (a) => a[(Math.random() * a.length) | 0];

function makeTree(g, s) {
  const green = rpick(GREENS);
  vbox(g, 0.45 * s, 1.0 * s, 0.45 * s, 0, 0.5 * s, 0, '#6f4f2f');
  vbox(g, 1.6 * s, 1.3 * s, 1.6 * s, 0, 1.5 * s, 0, green);
  if (Math.random() < 0.6) vbox(g, 1.05 * s, 1.0 * s, 1.05 * s, 0, 2.5 * s, 0, green);
}
function makePine(g, s) {
  const green = rpick(GREENS);
  vbox(g, 0.4 * s, 0.8 * s, 0.4 * s, 0, 0.4 * s, 0, '#6f4f2f');
  vbox(g, 1.6 * s, 0.9 * s, 1.6 * s, 0, 1.15 * s, 0, green);
  vbox(g, 1.15 * s, 0.8 * s, 1.15 * s, 0, 1.95 * s, 0, green);
  vbox(g, 0.65 * s, 0.7 * s, 0.65 * s, 0, 2.65 * s, 0, green);
}
function makeRock(g, s) {
  vbox(g, 1.1 * s, 0.7 * s, 1.0 * s, 0, 0.35 * s, 0, '#b7b0a2');
  vbox(g, 0.7 * s, 0.6 * s, 0.7 * s, 0.5 * s, 0.4 * s, 0.3 * s, '#c7c0b2');
}
function makeTemple(g, s) {
  // tapering stepped pyramid temple
  const tiers = 5 + ((Math.random() * 2) | 0);
  let y = 0, w = (2.6 + Math.random() * 0.8) * s;
  for (let k = 0; k < tiers; k++) {
    const h = 0.7 * s;
    vbox(g, w, h, w, 0, y + h / 2, 0, SAND[k % 2]);
    if (k === 0) vbox(g, 0.6 * s, 0.7 * s, 0.2 * s, 0, 0.35 * s, w / 2, '#5a432c'); // doorway
    y += h; w *= 0.78;
  }
  vbox(g, 0.45 * s, 0.9 * s, 0.45 * s, 0, y + 0.45 * s, 0, '#b9763a'); // finial
}
function makeGopuram(g, s) {
  // tall narrow temple tower (gopuram)
  let y = 0; const w = 2.1 * s;
  vbox(g, w + 0.7, 0.5 * s, w + 0.7, 0, 0.25 * s, 0, SAND[2]); y = 0.5 * s; // plinth
  for (let k = 0; k < 8; k++) {
    const h = 0.6 * s, ww = w * (1 - k * 0.085);
    vbox(g, ww, h, ww, 0, y + h / 2, 0, SAND[k % 2]); y += h;
  }
  vbox(g, 0.4 * s, 0.9 * s, 0.4 * s, 0, y + 0.45 * s, 0, '#b9763a'); // finial
}
function makeWall(g, s) {
  // rampart with corner towers, like the reference fort walls
  const c = SAND[1];
  vbox(g, 4.2 * s, 1.3 * s, 0.7 * s, 0, 0.65 * s, 0, c);
  for (let k = -2; k <= 2; k++) vbox(g, 0.45 * s, 0.4 * s, 0.7 * s, k * 0.95 * s, 1.5 * s, 0, c);
  vbox(g, 1.0 * s, 2.1 * s, 1.0 * s, -2.0 * s, 1.05 * s, 0, SAND[2]);
  vbox(g, 1.0 * s, 2.1 * s, 1.0 * s, 2.0 * s, 1.05 * s, 0, SAND[2]);
}
function makeHouse(g, s) {
  const wall = Math.random() < 0.45 ? rpick(STONE) : SAND[0];
  const w = (1.6 + Math.random() * 1.2) * s, d = (1.6 + Math.random() * 1.2) * s, h = (1.2 + Math.random() * 1.1) * s;
  vbox(g, w, h, d, 0, h / 2, 0, wall);
  vbox(g, w + 0.3, 0.25 * s, d + 0.3, 0, h + 0.1 * s, 0, rpick(SAND)); // roof slab
  vbox(g, 0.5 * s, 0.7 * s, 0.12 * s, 0, 0.35 * s, d / 2, '#5a432c'); // door
}
function makeRuin(g, s) {
  const c = rpick(SAND);
  for (let k = 0; k < 4; k++) vbox(g, 0.45 * s, (0.8 + Math.random() * 1.4) * s, 0.45 * s, (-1.2 + k * 0.8) * s, 0.5 * s, 0, c);
  vbox(g, 3.0 * s, 0.4 * s, 0.5 * s, 0, 0.2 * s, 0, c); // low wall base
}

// ── New building makers ─────────────────────────────────────────────────────
const ROOF = ['#8a4f3b', '#7a4332', '#9b5b44'];
const spinners = [];   // {mesh, axis, speed} animated each frame
const lamps = [];      // emissive bits that glow brighter at night

function makePagoda(g, s) {
  let y = 0;
  const tiers = 3 + ((Math.random() * 2) | 0);
  const roofC = rpick(ROOF);
  for (let k = 0; k < tiers; k++) {
    const w = (2.4 - k * 0.45) * s;
    vbox(g, w, 0.9 * s, w, 0, y + 0.45 * s, 0, '#c9402f'); // body
    y += 0.9 * s;
    vbox(g, (w + 1.1) * 1.0, 0.22 * s, (w + 1.1) * 1.0, 0, y + 0.1 * s, 0, roofC); // wide eave
    vbox(g, (w + 0.5), 0.18 * s, (w + 0.5), 0, y + 0.3 * s, 0, roofC);
    y += 0.45 * s;
  }
  vbox(g, 0.3 * s, 0.8 * s, 0.3 * s, 0, y + 0.4 * s, 0, '#e0c34a'); // finial
}
function makeWindmill(g, s) {
  vbox(g, 1.8 * s, 0.6 * s, 1.8 * s, 0, 0.3 * s, 0, rpick(STONE)); // base
  vbox(g, 1.4 * s, 3.4 * s, 1.4 * s, 0, 2.0 * s, 0, '#e7ddc8');    // tower
  vbox(g, 1.5 * s, 0.5 * s, 1.5 * s, 0, 3.9 * s, 0, rpick(ROOF));  // cap
  const hub = new THREE.Group();
  hub.position.set(0, 3.6 * s, 0.85 * s);
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(UNIT, vmat('#f3ede0'));
    blade.scale.set(0.3 * s, 2.6 * s, 0.12 * s);
    blade.position.y = 1.3 * s;
    const arm = new THREE.Group(); arm.add(blade);
    arm.rotation.z = b * Math.PI / 2;
    hub.add(arm);
  }
  g.add(hub);
  spinners.push({ mesh: hub, axis: 'z', speed: 1.2 + Math.random() });
}
function makeWatermill(g, s) {
  vbox(g, 2.4 * s, 1.8 * s, 2.0 * s, 0, 0.9 * s, 0, rpick(STONE));   // mill house
  vbox(g, 2.7 * s, 0.4 * s, 2.3 * s, 0, 1.9 * s, 0, rpick(ROOF));    // roof
  const wheel = new THREE.Group();
  wheel.position.set(1.5 * s, 0.9 * s, 0);
  for (let b = 0; b < 8; b++) {
    const pad = new THREE.Mesh(UNIT, vmat('#7a5733'));
    pad.scale.set(0.18 * s, 1.4 * s, 0.5 * s);
    pad.position.y = 0;
    const arm = new THREE.Group(); arm.add(pad);
    pad.position.y = 0.7 * s;
    arm.rotation.x = b * Math.PI / 4;
    wheel.add(arm);
  }
  g.add(wheel);
  spinners.push({ mesh: wheel, axis: 'x', speed: 0.9 });
}
function makeMarket(g, s) {
  const stripes = [['#d8534a', '#f3ede0'], ['#3d7dca', '#f3ede0'], ['#2fa37c', '#f3ede0']];
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Group();
    st.position.set((i - 1) * 2.4 * s, 0, (Math.random() - 0.5) * s);
    const col = stripes[i % stripes.length];
    vbox(st, 1.7 * s, 0.6 * s, 1.3 * s, 0, 0.3 * s, 0, '#a87a4c'); // counter
    [-0.7, 0.7].forEach((x) => vbox(st, 0.12 * s, 1.4 * s, 0.12 * s, x * s, 0.7 * s, 0.5 * s, '#6f4f2f'));
    [-0.7, 0.7].forEach((x) => vbox(st, 0.12 * s, 1.4 * s, 0.12 * s, x * s, 0.7 * s, -0.5 * s, '#6f4f2f'));
    for (let k = -1; k <= 1; k++) vbox(st, 0.55 * s, 0.16 * s, 1.5 * s, k * 0.55 * s, 1.45 * s, 0, col[(k + 1) % 2]); // awning stripes
    g.add(st);
  }
  vbox(g, 0.7 * s, 0.7 * s, 0.7 * s, 3.3 * s, 0.35 * s, 0, '#9b6b3a'); // crate
  vbox(g, 0.5 * s, 0.6 * s, 0.5 * s, -3.2 * s, 0.3 * s, 0.4 * s, '#7a5733'); // barrel-ish
}
function makeWell(g, s) {
  vbox(g, 1.5 * s, 0.8 * s, 1.5 * s, 0, 0.4 * s, 0, rpick(STONE)); // ring
  vbox(g, 1.0 * s, 0.3 * s, 1.0 * s, 0, 0.85 * s, 0, '#3a78a8');   // water
  [-0.6, 0.6].forEach((x) => vbox(g, 0.14 * s, 1.7 * s, 0.14 * s, x * s, 1.2 * s, 0, '#6f4f2f'));
  vbox(g, 1.7 * s, 0.3 * s, 0.9 * s, 0, 2.1 * s, 0, rpick(ROOF)); // little roof
  vbox(g, 0.4 * s, 0.4 * s, 0.4 * s, 0, 1.5 * s, 0, '#7a5733');   // bucket
}
function makeFountain(g, s) {
  vbox(g, 3.0 * s, 0.5 * s, 3.0 * s, 0, 0.25 * s, 0, rpick(STONE)); // basin
  vbox(g, 2.4 * s, 0.3 * s, 2.4 * s, 0, 0.55 * s, 0, '#4a90c2');    // water
  vbox(g, 0.9 * s, 1.1 * s, 0.9 * s, 0, 1.0 * s, 0, rpick(STONE));  // pillar
  vbox(g, 1.5 * s, 0.25 * s, 1.5 * s, 0, 1.6 * s, 0, '#4a90c2');    // upper bowl
}
function makeStatue(g, s) {
  vbox(g, 1.6 * s, 1.0 * s, 1.6 * s, 0, 0.5 * s, 0, rpick(STONE)); // pedestal
  vbox(g, 0.8 * s, 1.6 * s, 0.6 * s, 0, 1.8 * s, 0, '#bcae97');    // torso
  vbox(g, 0.5 * s, 0.5 * s, 0.5 * s, 0, 2.85 * s, 0, '#bcae97');   // head
  vbox(g, 0.25 * s, 1.1 * s, 0.25 * s, 0.55 * s, 2.0 * s, 0, '#bcae97'); // raised arm
}
function makeObelisk(g, s) {
  vbox(g, 1.4 * s, 0.4 * s, 1.4 * s, 0, 0.2 * s, 0, SAND[2]); // base
  let y = 0.4 * s, w = 1.0 * s;
  for (let k = 0; k < 5; k++) { vbox(g, w, 1.0 * s, w, 0, y + 0.5 * s, 0, SAND[k % 2]); y += 1.0 * s; w *= 0.85; }
  vbox(g, w * 1.1, 0.7 * s, w * 1.1, 0, y + 0.35 * s, 0, '#b9763a'); // cap
}
function makeGate(g, s) {
  [-1.3, 1.3].forEach((x) => vbox(g, 0.8 * s, 3.0 * s, 0.8 * s, x * s, 1.5 * s, 0, rpick(SAND)));
  vbox(g, 3.6 * s, 0.8 * s, 0.9 * s, 0, 3.2 * s, 0, rpick(SAND)); // lintel
  [-1.3, 1.3].forEach((x) => vbox(g, 1.0 * s, 0.6 * s, 1.0 * s, x * s, 3.5 * s, 0, SAND[2])); // tower tops
}
function makeMosque(g, s) {
  vbox(g, 3.0 * s, 1.8 * s, 3.0 * s, 0, 0.9 * s, 0, rpick(STONE)); // hall
  // stepped dome
  let y = 1.8 * s, w = 2.2 * s;
  for (let k = 0; k < 4; k++) { vbox(g, w, 0.5 * s, w, 0, y + 0.25 * s, 0, '#cfd6da'); y += 0.5 * s; w *= 0.7; }
  vbox(g, 0.3 * s, 0.7 * s, 0.3 * s, 0, y + 0.35 * s, 0, '#e0c34a'); // crescent post
  [[-1.7, -1.7], [1.7, 1.7]].forEach(([x, z]) => { // minarets
    vbox(g, 0.5 * s, 3.4 * s, 0.5 * s, x * s, 1.7 * s, z * s, '#e7ddc8');
    vbox(g, 0.6 * s, 0.5 * s, 0.6 * s, x * s, 3.6 * s, z * s, '#cfd6da');
  });
}
function makeLighthouse(g, s) {
  let y = 0, w = 1.6 * s;
  for (let k = 0; k < 5; k++) {
    vbox(g, w, 1.0 * s, w, 0, y + 0.5 * s, 0, k % 2 ? '#d8534a' : '#f3ede0');
    y += 1.0 * s; w *= 0.9;
  }
  vbox(g, w + 0.5, 0.3 * s, w + 0.5, 0, y + 0.15 * s, 0, '#3a352e'); // gallery
  const lamp = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: '#fff3c0', emissive: '#ffdf80', emissiveIntensity: 0.8, roughness: 0.4 }));
  lamp.scale.set(w * 0.9, 0.7 * s, w * 0.9); lamp.position.y = y + 0.55 * s; g.add(lamp);
  lamps.push(lamp);
  vbox(g, w * 0.6, 0.5 * s, w * 0.6, 0, y + 1.1 * s, 0, '#3a352e'); // cap
}
function makeCompound(g, s) {
  // courtyard wall enclosing a couple of small houses
  const c = rpick(SAND);
  [[0, 2.6], [0, -2.6], [2.6, 0], [-2.6, 0]].forEach(([x, z]) => vbox(g, x === 0 ? 5.4 * s : 0.5 * s, 1.2 * s, z === 0 ? 5.4 * s : 0.5 * s, x * s, 0.6 * s, z * s, c));
  vbox(g, 1.4 * s, 1.2 * s, 1.4 * s, -1.0 * s, 0.6 * s, 0.8 * s, rpick(STONE));
  vbox(g, 1.6 * s, 0.25 * s, 1.6 * s, -1.0 * s, 1.3 * s, 0.8 * s, rpick(ROOF));
  vbox(g, 1.2 * s, 1.0 * s, 1.2 * s, 1.1 * s, 0.5 * s, -0.9 * s, rpick(STONE));
  vbox(g, 1.4 * s, 0.25 * s, 1.4 * s, 1.1 * s, 1.1 * s, -0.9 * s, rpick(ROOF));
}

// ── Biome-specific scenery ──────────────────────────────────────────────────
function makeCactus(g, s) {
  vbox(g, 0.55 * s, 2.2 * s, 0.55 * s, 0, 1.1 * s, 0, '#4f8a55');
  vbox(g, 0.9 * s, 0.4 * s, 0.35 * s, 0.5 * s, 1.4 * s, 0, '#57965d');
  vbox(g, 0.35 * s, 0.9 * s, 0.35 * s, 0.7 * s, 1.9 * s, 0, '#4f8a55');
  if (Math.random() < 0.5) { vbox(g, 0.9 * s, 0.4 * s, 0.35 * s, -0.5 * s, 1.0 * s, 0, '#57965d'); vbox(g, 0.35 * s, 0.8 * s, 0.35 * s, -0.7 * s, 1.4 * s, 0, '#4f8a55'); }
}
function makePalm(g, s) {
  for (let k = 0; k < 4; k++) vbox(g, 0.35 * s, 0.6 * s, 0.35 * s, Math.sin(k) * 0.12 * s, 0.3 * s + k * 0.55 * s, Math.cos(k) * 0.12 * s, '#8a6a42');
  const top = 2.5 * s;
  [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]].forEach(([x, z]) => vbox(g, 1.4 * s, 0.25 * s, 0.5 * s, x * 0.5 * s, top, z * 0.5 * s, '#5f9e54'));
  vbox(g, 0.4 * s, 0.4 * s, 0.4 * s, 0, top + 0.1 * s, 0, '#7a5733'); // coconuts
}
function makeIcePine(g, s) {
  vbox(g, 0.4 * s, 0.8 * s, 0.4 * s, 0, 0.4 * s, 0, '#6f4f2f');
  vbox(g, 1.6 * s, 0.9 * s, 1.6 * s, 0, 1.15 * s, 0, '#7fae9c');
  vbox(g, 1.15 * s, 0.8 * s, 1.15 * s, 0, 1.95 * s, 0, '#8fbcaa');
  vbox(g, 0.65 * s, 0.7 * s, 0.65 * s, 0, 2.65 * s, 0, '#eef3f6'); // snow cap
}
function makeAutumnTree(g, s) {
  const c = rpick(['#d98a2b', '#c66a2c', '#e0a93b', '#bf5a2a']);
  vbox(g, 0.45 * s, 1.0 * s, 0.45 * s, 0, 0.5 * s, 0, '#6f4f2f');
  vbox(g, 1.6 * s, 1.3 * s, 1.6 * s, 0, 1.5 * s, 0, c);
  if (Math.random() < 0.6) vbox(g, 1.05 * s, 1.0 * s, 1.05 * s, 0, 2.5 * s, 0, c);
}
function makeSnowHouse(g, s) {
  const w = (1.6 + Math.random()) * s, d = (1.6 + Math.random()) * s, h = (1.2 + Math.random()) * s;
  vbox(g, w, h, d, 0, h / 2, 0, rpick(STONE));
  vbox(g, w + 0.3, 0.3 * s, d + 0.3, 0, h + 0.12 * s, 0, '#eef3f6'); // snowy roof
  vbox(g, 0.5 * s, 0.7 * s, 0.12 * s, 0, 0.35 * s, d / 2, '#5a432c');
}
function makeBush(g, s) {
  const c = rpick(GREENS);
  vbox(g, 1.2 * s, 0.8 * s, 1.2 * s, 0, 0.4 * s, 0, c);
  vbox(g, 0.8 * s, 0.7 * s, 0.8 * s, 0.4 * s, 0.55 * s, 0.2 * s, c);
  if (Math.random() < 0.5) vbox(g, 0.7 * s, 0.6 * s, 0.7 * s, -0.4 * s, 0.45 * s, -0.2 * s, c);
}
function makeFlowers(g, s) {
  const cols = ['#e5547f', '#e0a93b', '#9b6bd1', '#f0f0f0', '#d8534a'];
  const n = 3 + (Math.random() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * 1.4 * s, z = (Math.random() - 0.5) * 1.4 * s;
    vbox(g, 0.1 * s, 0.6 * s, 0.1 * s, x, 0.3 * s, z, '#4f8a55');
    vbox(g, 0.28 * s, 0.28 * s, 0.28 * s, x, 0.66 * s, z, rpick(cols));
  }
}
function makeGrass(g, s) {
  const c = rpick(['#5aa544', '#6cb74a', '#4f9a3c']);
  const n = 3 + (Math.random() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * 1.2 * s, z = (Math.random() - 0.5) * 1.2 * s;
    vbox(g, 0.12 * s, (0.5 + Math.random() * 0.5) * s, 0.12 * s, x, 0.3 * s, z, c);
  }
}

const STATION_DIRS = stations.map((st) => dirFromLatLon(st.lat, st.lon));
const props = [];                          // every knock-overable scenery group
const animals = [];                        // grazing/hopping critters
const smokers = [];                        // chimneys puffing smoke
const wavers = [];                         // flags that wave
const fishes = [];                         // jumping fish in lakes
const WATER = [];                          // {dir, ang} no-build zones over water
function nearWater(n) { for (const w of WATER) if (w.dir.angleTo(n) < w.ang) return true; return false; }
const PLACED = [];                         // {dir, pad} footprints, to keep a gap between things
function tooClose(n, pad) { for (const p of PLACED) if (n.angleTo(p.dir) < pad + p.pad) return true; return false; }
const YUP = new THREE.Vector3(0, 1, 0);

// ── Animals ─────────────────────────────────────────────────────────────────
function makeSheep(g, s) {
  vbox(g, 1.5 * s, 1.0 * s, 1.0 * s, 0, 0.9 * s, 0, '#f3ede0'); // woolly body
  vbox(g, 0.55 * s, 0.55 * s, 0.5 * s, 0.85 * s, 0.95 * s, 0, '#3a352e'); // head
  [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]].forEach(([x, z]) => vbox(g, 0.2 * s, 0.5 * s, 0.2 * s, x * s, 0.25 * s, z * s, '#3a352e'));
}
function makeDeer(g, s) {
  vbox(g, 1.4 * s, 0.8 * s, 0.8 * s, 0, 1.0 * s, 0, '#b5793f'); // body
  vbox(g, 0.5 * s, 0.9 * s, 0.45 * s, 0.8 * s, 1.4 * s, 0, '#a86c34'); // neck/head
  vbox(g, 0.12 * s, 0.6 * s, 0.12 * s, 0.7 * s, 2.1 * s, 0.18 * s, '#6f4f2f'); // antler
  vbox(g, 0.12 * s, 0.6 * s, 0.12 * s, 0.7 * s, 2.1 * s, -0.18 * s, '#6f4f2f');
  [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].forEach(([x, z]) => vbox(g, 0.16 * s, 0.7 * s, 0.16 * s, x * s, 0.35 * s, z * s, '#7a5733'));
}

// ── Decorative pieces that attach to buildings ──────────────────────────────
function addFlag(parent, localY, color) {
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), vmat('#5a4636'));
  mast.position.set(0, localY + 0.8, 0); parent.add(mast);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.66), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }));
  fl.position.set(0.55, localY + 1.3, 0); parent.add(fl);
  wavers.push({ mesh: fl, ph: Math.random() * 6 });
}
function addChimney(parent, x, topY, z) {
  vbox(parent, 0.4, 0.9, 0.4, x, topY + 0.35, z, '#7a5733');
  const sm = new THREE.Group();
  sm.position.set(x, topY + 0.8, z);
  const puffs = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: '#cdc8bd', transparent: true, opacity: 0.5, roughness: 1 }));
    sm.add(p); puffs.push(p);
  }
  parent.add(sm);
  smokers.push({ puffs, ph: Math.random() * 1 });
}

// ── Biome regions ────────────────────────────────────────────────────────────
const BIOMES = [
  { dir: dirFromLatLon(-2, 105), rad: 0.62, type: 'desert' },
  { dir: dirFromLatLon(22, 168), rad: 0.42, type: 'desert' },
  { dir: dirFromLatLon(90, 0), rad: 0.5, type: 'snow' },
  { dir: dirFromLatLon(-90, 0), rad: 0.5, type: 'snow' },
  { dir: dirFromLatLon(8, 248), rad: 0.55, type: 'autumn' },
];
function biomeAt(n) {
  for (const b of BIOMES) if (b.dir.angleTo(n) < b.rad) return b.type;
  return 'grass';
}

// scatter flat tinted ground tiles to paint a biome patch
const groundTileGeo = new THREE.BoxGeometry(3.4, 0.16, 3.4);
function paintGround(center, rad, colors) {
  const count = Math.round(rad * rad * 80);
  for (let i = 0; i < count; i++) {
    const n = new THREE.Vector3().randomDirection();
    // bias toward the cap around center
    n.lerp(center, 0.8 + Math.random() * 0.18).normalize();
    if (center.angleTo(n) > rad) continue;
    const tile = new THREE.Mesh(groundTileGeo, vmat(rpick(colors)));
    tile.position.copy(n.clone().multiplyScalar(elevate(n) + 0.04));
    tile.quaternion.setFromRotationMatrix(surfaceFrame(n));
    tile.rotateY(((Math.random() * 4) | 0) * Math.PI / 2);
    tile.receiveShadow = true;
    planet.add(tile);
    staticTiles.push(tile);
  }
}

// ── Water: lakes (with fish) and rivers (with a bridge) ─────────────────────
function addLake(center, rad) {
  WATER.push({ dir: center.clone(), ang: rad / R + 0.07 }); // reserve a no-build zone
  const seg = 28;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.92, 0.4, seg),
    new THREE.MeshStandardMaterial({ color: '#4a90c2', roughness: 0.4, flatShading: true }));
  water.position.copy(center.clone().multiplyScalar(elevate(center) - 0.25));
  water.quaternion.setFromRotationMatrix(surfaceFrame(center));
  water.receiveShadow = true; planet.add(water);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.5, 5, seg),
    new THREE.MeshStandardMaterial({ color: '#caa46f', roughness: 1, flatShading: true }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.2;
  const rimG = new THREE.Group(); rimG.position.copy(center.clone().multiplyScalar(elevate(center)));
  rimG.quaternion.setFromRotationMatrix(surfaceFrame(center)); rimG.add(rim); planet.add(rimG);
  // fish
  for (let f = 0; f < 2; f++) {
    const fish = new THREE.Group();
    vbox(fish, 0.7, 0.4, 0.25, 0, 0, 0, rpick(['#e08a4a', '#d8534a', '#7fae9c']));
    vbox(fish, 0.3, 0.45, 0.12, -0.45, 0, 0, '#c2703a');
    fish.visible = false;
    rimG.add(fish);
    fishes.push({ mesh: fish, rad: rad * 0.5, ph: Math.random() * 6, ang: Math.random() * 6 });
  }
}
function addRiver(a, b) {
  const steps = Math.max(4, Math.round(a.angleTo(b) / 0.045));
  for (let k = 0; k <= steps; k++) {
    const n = new THREE.Vector3().copy(a).lerp(b, k / steps).normalize();
    WATER.push({ dir: n.clone(), ang: 0.09 }); // reserve the river course
    const tile = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 2.6),
      new THREE.MeshStandardMaterial({ color: '#4a90c2', roughness: 0.4, flatShading: true }));
    tile.position.copy(n.clone().multiplyScalar(elevate(n) - 0.12));
    tile.quaternion.setFromRotationMatrix(surfaceFrame(n));
    tile.receiveShadow = true; planet.add(tile); staticTiles.push(tile);
  }
  // bridge at the midpoint
  const mid = new THREE.Vector3().copy(a).lerp(b, 0.5).normalize();
  const bg = new THREE.Group();
  bg.position.copy(mid.clone().multiplyScalar(elevate(mid)));
  bg.quaternion.setFromRotationMatrix(surfaceFrame(mid));
  bg.rotateY(Math.random() * Math.PI);
  vbox(bg, 4.4, 0.4, 2.2, 0, 1.1, 0, '#a87a4c');           // deck
  [-1.0, 1.0].forEach((z) => vbox(bg, 4.4, 0.5, 0.25, 0, 1.6, z, '#8a6038')); // rails
  [-1.7, 1.7].forEach((x) => vbox(bg, 0.5, 1.1, 2.2, x, 0.55, 0, '#9b6b3a')); // supports
  planet.add(bg);
}

// ── Build the whole world (biomes, water, scenery, animals) ─────────────────
function buildWorld() {
  // biome ground paint
  for (const b of BIOMES) {
    if (b.type === 'desert') paintGround(b.dir, b.rad, ['#e3c188', '#d8b271', '#ddb978']);
    else if (b.type === 'snow') paintGround(b.dir, b.rad, ['#eef3f6', '#e2eaef', '#dfe7ee']);
    else if (b.type === 'autumn') paintGround(b.dir, b.rad, ['#c98f3f', '#b87a36', '#6cb74a']);
  }
  // lakes
  [dirFromLatLon(-24, 24), dirFromLatLon(38, 300), dirFromLatLon(-12, 196)].forEach((d) => {
    if (STATION_DIRS.some((s) => s.angleTo(d) < 0.25)) return;
    addLake(d, 4 + Math.random() * 2);
  });
  // rivers + bridges
  addRiver(dirFromLatLon(-40, 40), dirFromLatLon(10, 36));
  addRiver(dirFromLatLon(50, 280), dirFromLatLon(28, 308));

  // scenery, biome-aware
  const N = 360;
  for (let i = 0; i < N; i++) {
    const y = 1 - (i + 0.5) / N * 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * 2.39996;
    const n = new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r).normalize();
    if (STATION_DIRS.some((d) => d.angleTo(n) < 0.17)) continue;
    if (nearWater(n)) continue;

    const g = new THREE.Group();
    g.position.copy(n.clone().multiplyScalar(elevate(n)));
    g.quaternion.setFromRotationMatrix(surfaceFrame(n));
    g.rotateY(((Math.random() * 4) | 0) * Math.PI / 2);

    const biome = biomeAt(n);
    const s = 0.72 + Math.random() * 0.5;
    let isBuilding = false;
    const roll = Math.random();

    if (biome === 'desert') {
      if (roll < 0.34) makeCactus(g, s);
      else if (roll < 0.5) makePalm(g, s);
      else if (roll < 0.62) { makeObelisk(g, s); isBuilding = true; }
      else if (roll < 0.74) { makeRuin(g, s); isBuilding = true; }
      else if (roll < 0.84) makeRock(g, s);
      else if (roll < 0.92) { makeMarket(g, s); isBuilding = true; }
      else { makeMosque(g, s); isBuilding = true; }
    } else if (biome === 'snow') {
      if (roll < 0.6) makeIcePine(g, s);
      else if (roll < 0.78) makeRock(g, s);
      else { makeSnowHouse(g, s); isBuilding = true; }
    } else if (biome === 'autumn') {
      if (roll < 0.55) makeAutumnTree(g, s);
      else if (roll < 0.72) { makeHouse(g, s); isBuilding = true; addChimney(g, 0.6, 1.7 * s, -0.4); }
      else if (roll < 0.84) { makeWell(g, s); isBuilding = true; }
      else if (roll < 0.93) { makeStatue(g, s); isBuilding = true; }
      else makeRock(g, s);
    } else { // grass — the full city
      if (roll < 0.12) { makeGopuram(g, s); isBuilding = true; if (Math.random() < 0.3) addFlag(g, 6.0 * s, rpick(['#d8534a', '#3d7dca', '#e0a93b'])); }
      else if (roll < 0.26) { makeTemple(g, s); isBuilding = true; }
      else if (roll < 0.33) { makePagoda(g, s); isBuilding = true; }
      else if (roll < 0.40) { makeHouse(g, s); isBuilding = true; if (Math.random() < 0.4) addChimney(g, 0.6, 1.7 * s, -0.4); }
      else if (roll < 0.45) { makeCompound(g, s); isBuilding = true; }
      else if (roll < 0.49) { makeWindmill(g, s); isBuilding = true; }
      else if (roll < 0.52) { makeWatermill(g, s); isBuilding = true; }
      else if (roll < 0.56) { makeMarket(g, s); isBuilding = true; }
      else if (roll < 0.60) { makeWell(g, s); isBuilding = true; }
      else if (roll < 0.63) { makeFountain(g, s); isBuilding = true; }
      else if (roll < 0.66) { makeStatue(g, s); isBuilding = true; }
      else if (roll < 0.69) { makeGate(g, s); isBuilding = true; }
      else if (roll < 0.72) { makeMosque(g, s); isBuilding = true; }
      else if (roll < 0.745) { makeLighthouse(g, s); isBuilding = true; }
      else if (roll < 0.78) { makeWall(g, s); isBuilding = true; }
      else if (roll < 0.82) { makeRuin(g, s); isBuilding = true; }
      else if (roll < 0.86) makeRock(g, s);
      else if (roll < 0.93) makePine(g, s);
      else makeTree(g, s);
    }

    g.userData.ko = 'up';
    g.userData.isBuilding = isBuilding;
    if (isBuilding) g.position.copy(n.clone().multiplyScalar(groundHeight(n, 0.05 * s))); // sit flat-based buildings on their low corner
    const pad = isBuilding ? 0.12 : 0.055;
    if (tooClose(n, pad)) continue;        // keep a gap from neighbours
    PLACED.push({ dir: n, pad });
    bakeStatic(g, VCAST);
    props.push(g);
    planet.add(g);
  }

  // decorative mounds (knockable, don't score) for terrain relief
  for (let i = 0; i < 14; i++) {
    const n = new THREE.Vector3().randomDirection();
    if (STATION_DIRS.some((d) => d.angleTo(n) < 0.2)) continue;
    if (nearWater(n)) continue;
    if (tooClose(n, 0.18)) continue;
    PLACED.push({ dir: n, pad: 0.18 });
    const g = new THREE.Group();
    const s = 1.4 + Math.random() * 1.6;
    g.position.copy(n.clone().multiplyScalar(groundHeight(n, 0.05 * s)));
    g.quaternion.setFromRotationMatrix(surfaceFrame(n));
    const col = biomeAt(n) === 'snow' ? '#e2eaef' : biomeAt(n) === 'desert' ? '#d8b271' : rpick(GREENS);
    vbox(g, 4.5 * s, 1.0 * s, 4.5 * s, 0, 0.5 * s, 0, col);
    vbox(g, 3.0 * s, 0.9 * s, 3.0 * s, 0, 1.3 * s, 0, col);
    vbox(g, 1.6 * s, 0.8 * s, 1.6 * s, 0, 2.0 * s, 0, col);
    g.userData.ko = 'up'; g.userData.isBuilding = false;
    bakeStatic(g, true);
    props.push(g); planet.add(g);
  }

  // grazing animals
  for (let i = 0; i < 26; i++) {
    const n = new THREE.Vector3().randomDirection();
    if (STATION_DIRS.some((d) => d.angleTo(n) < 0.18)) continue;
    if (nearWater(n)) continue;
    if (tooClose(n, 0.05)) continue;
    PLACED.push({ dir: n, pad: 0.05 });
    const biome = biomeAt(n);
    const g = new THREE.Group();
    g.position.copy(n.clone().multiplyScalar(elevate(n)));
    g.quaternion.setFromRotationMatrix(surfaceFrame(n));
    g.rotateY(Math.random() * Math.PI * 2);
    const s = 0.7 + Math.random() * 0.3;
    if (biome === 'snow' || Math.random() < 0.5) makeSheep(g, s); else makeDeer(g, s);
    g.userData = { graze: Math.random() * 6, hop: Math.random() * 5 + 2, hopT: 0 };
    animals.push(g); planet.add(g);
  }
}
buildWorld();

// ── Fill the gaps with clusters of vegetation (clumped, never inside buildings) ──
function fillClusters() {
  VCAST = false;                            // filler doesn't cast shadows (keeps the frame cheap)
  const seeds = 26;
  for (let i = 0; i < seeds; i++) {
    const c = new THREE.Vector3().randomDirection();
    if (STATION_DIRS.some((d) => d.angleTo(c) < 0.2)) continue;
    if (nearWater(c)) continue;
    const biome = biomeAt(c);
    const count = 3 + (Math.random() * 4 | 0);
    for (let k = 0; k < count; k++) {
      // jitter around the seed to form a clump
      const n = c.clone().addScaledVector(new THREE.Vector3().randomDirection(), Math.random() * 0.11).normalize();
      if (nearWater(n)) continue;
      if (tooClose(n, 0.035)) continue;       // clears buildings, allows tight clumps
      PLACED.push({ dir: n, pad: 0.035 });
      const g = new THREE.Group();
      g.position.copy(n.clone().multiplyScalar(elevate(n)));
      g.quaternion.setFromRotationMatrix(surfaceFrame(n));
      g.rotateY(Math.random() * Math.PI * 2);
      const s = 0.5 + Math.random() * 0.5;
      const roll = Math.random();
      if (biome === 'desert') {
        if (roll < 0.5) makeCactus(g, s * 0.85); else makeRock(g, s * 0.7);
      } else if (biome === 'snow') {
        if (roll < 0.62) makeIcePine(g, s * 0.85); else makeRock(g, s * 0.7);
      } else if (biome === 'autumn') {
        if (roll < 0.6) makeAutumnTree(g, s); else makeBush(g, s);
      } else {
        if (roll < 0.4) makeTree(g, s); else if (roll < 0.66) makePine(g, s); else makeBush(g, s);
      }
      g.userData.ko = 'up'; g.userData.isBuilding = false; props.push(g);
      bakeStatic(g, false);
      planet.add(g);
    }
  }
  VCAST = true;
}
fillClusters();

// ── Road: a paved path linking the landmarks in a loop ──────────────────────
function addRoad() {
  const tileGeo = new THREE.BoxGeometry(2.5, 0.18, 2.9);
  const tileMat = new THREE.MeshStandardMaterial({ color: '#c9a877', roughness: 1, flatShading: true });
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#b48a55', roughness: 1, flatShading: true });
  const dirs = stations.map((st) => dirFromLatLon(st.lat, st.lon));
  for (let s = 0; s < dirs.length; s++) {
    const a = dirs[s], b = dirs[(s + 1) % dirs.length];
    const ang = a.angleTo(b);
    const steps = Math.max(2, Math.round(ang / 0.05));
    for (let k = 0; k <= steps; k++) {
      // slerp along the great-circle arc between the two landmarks
      const t = k / steps;
      const n = new THREE.Vector3().copy(a).lerp(b, t).normalize();
      const tile = new THREE.Mesh(tileGeo, k % 5 === 0 ? edgeMat : tileMat);
      tile.position.copy(n.clone().multiplyScalar(elevate(n) + 0.05));
      tile.quaternion.setFromRotationMatrix(surfaceFrame(n));
      tile.rotateY(Math.random() * 0.3 - 0.15);
      tile.receiveShadow = true;
      planet.add(tile);
      staticTiles.push(tile);
    }
  }
}
addRoad();
mergeBoxMeshes(staticTiles, planet, false);   // collapse all flat tiles into one mesh

// ── Signs: a canvas-texture CV card on a post, planted at each station ──
function drawSignTexture(station) {
  const W = 720, H = 900;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');

  // flat paper panel (no rounded corners — it's a blocky voxel sign)
  c.fillStyle = '#faf5e9';
  c.fillRect(0, 0, W, H);
  // chunky inner keyline
  c.strokeStyle = 'rgba(58,53,46,0.18)';
  c.lineWidth = 8;
  c.strokeRect(22, 22, W - 44, H - 44);

  // solid header block in the station color
  c.fillStyle = station.color;
  c.fillRect(22, 22, W - 44, 172);
  // pixel-row accent strip just under the header
  for (let x = 22; x < W - 22; x += 36) {
    c.fillStyle = (((x / 36) | 0) % 2) ? station.color : 'rgba(58,53,46,0.12)';
    c.fillRect(x, 196, 30, 12);
  }

  c.fillStyle = '#fff7ea';
  c.textBaseline = 'middle';
  c.font = '700 44px "Space Grotesk", sans-serif';
  if ('letterSpacing' in c) c.letterSpacing = '5px';
  c.fillText(station.title.toUpperCase(), 56, 92);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
  c.font = '500 22px "Space Grotesk", sans-serif';
  c.globalAlpha = 0.88;
  c.fillText('CV · ' + (profile.name || ''), 58, 146);
  c.globalAlpha = 1;

  // items with square (voxel) bullets — auto-fit so nothing overflows the panel
  const topY = 250, bottomPad = 40, avail = H - topY - bottomPad;
  const items = station.items || [];

  // measure required height at base sizes, then derive a scale that fits
  function layout(headPx, subPx, gap, measureOnly) {
    let y = topY + headPx * 0.5;
    for (const it of items) {
      c.font = `600 ${headPx}px "Space Grotesk", sans-serif`;
      const hl = measureLines(c, it.head || '', W - 140);
      if (!measureOnly) {
        c.fillStyle = station.color;
        c.fillRect(54, y - headPx * 0.27, headPx * 0.5, headPx * 0.5);
        c.fillStyle = '#3a352e';
        wrapText(c, it.head || '', 92, y, W - 140, headPx * 1.18);
      }
      y += hl * headPx * 1.18 + 4;
      if (it.sub) {
        c.font = `500 ${subPx}px "Space Grotesk", sans-serif`;
        const sl = measureLines(c, it.sub, W - 140);
        if (!measureOnly) { c.fillStyle = '#8a8073'; wrapText(c, it.sub, 92, y, W - 140, subPx * 1.3); }
        y += sl * subPx * 1.3;
      }
      y += gap;
    }
    return y - (topY + headPx * 0.5);
  }

  const baseHead = 34, baseSub = 24, baseGap = 46;
  const needed = layout(baseHead, baseSub, baseGap, true);
  const fit = Math.min(1, avail / needed);
  layout(baseHead * fit, baseSub * fit, baseGap * fit, false);

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function wrapText(c, text, x, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (c.measureText(test).width > maxW && line) { c.fillText(line, x, yy); line = w; yy += lh; }
    else line = test;
  }
  c.fillText(line, x, yy);
}
function measureLines(c, text, maxW) {
  const words = String(text).split(' ');
  let line = '', n = 1;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (c.measureText(test).width > maxW && line) { n++; line = w; } else line = test;
  }
  return n;
}

const signMeshes = []; // for raycasting

stations.forEach((station, i) => {
  const n = dirFromLatLon(station.lat, station.lon);
  const frame = surfaceFrame(n);
  const group = new THREE.Group();
  group.position.copy(n.clone().multiplyScalar(elevate(n)));
  group.quaternion.setFromRotationMatrix(frame); // local +Y = out of surface, +Z = facing
  planet.add(group);

  // ── voxel platform: stepped sandstone base topped with a station-color mat ──
  vbox(group, 7.6, 0.6, 7.6, 0, 0.3, 0, SAND[1]);
  vbox(group, 6.0, 0.5, 6.0, 0, 0.85, 0, SAND[0]);
  vbox(group, 4.6, 0.22, 4.6, 0, 1.2, 0, station.color); // accent mat
  const platTop = 1.1;

  // two-faced billboard board (sits low so it's grounded on the platform)
  const panelW = 8, panelH = 10;
  const boardDepth = 0.5;
  const panelY = 6.7;

  // ── two square posts flanking the board (in its plane, so neither face is blocked) ──
  const postH = 11.5;
  const postX = panelW / 2 + 0.6;
  [-postX, postX].forEach((x) => vbox(group, 0.6, postH, 0.6, x, platTop + postH / 2, 0, '#8a6a42'));
  // beam across the top connecting the posts
  vbox(group, 2 * postX + 0.6, 0.7, 0.8, 0, platTop + postH - 0.25, 0, '#7a5733');

  // chunky wood frame around the board + corner accent cubes
  const fr = 0.5, frD = boardDepth + 0.35;
  vbox(group, panelW + 2 * fr, fr, frD, 0, panelY + panelH / 2 + fr / 2, 0, '#a8895c'); // top
  vbox(group, panelW + 2 * fr, fr, frD, 0, panelY - panelH / 2 - fr / 2, 0, '#a8895c'); // bottom
  vbox(group, fr, panelH, frD, -(panelW / 2 + fr / 2), panelY, 0, '#a8895c');           // left
  vbox(group, fr, panelH, frD, (panelW / 2 + fr / 2), panelY, 0, '#a8895c');            // right
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) =>
    vbox(group, fr + 0.2, fr + 0.2, frD + 0.06, sx * (panelW / 2 + fr / 2), panelY + sy * (panelH / 2 + fr / 2), 0, station.color));

  // solid board panel behind the readable faces
  vbox(group, panelW + 0.2, panelH + 0.2, boardDepth, 0, panelY, 0, '#faf5e9');

  // a readable CV face on each side; rotating the back 180° keeps its text un-mirrored
  [[0, boardDepth / 2 + 0.02], [Math.PI, -(boardDepth / 2 + 0.02)]].forEach(([rotY, z]) => {
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(panelW, panelH),
      new THREE.MeshBasicMaterial({ map: drawSignTexture(station), side: THREE.FrontSide, toneMapped: false })
    );
    face.position.set(0, panelY, z);
    face.rotation.y = rotY;
    face.userData.stationIndex = i;
    group.add(face);
    signMeshes.push(face);
  });

  // remember the planet orientation that brings this station upright & facing us.
  // sign world-normal = planetQ * frameZ; we want planetQ * frame = Identity → planetQ = frame⁻¹
  const q = new THREE.Quaternion().setFromRotationMatrix(frame).invert();
  station._targetQuat = q;
});

// ── The rover (parked at the top of the globe) ──────────────────────────
const rover = new THREE.Group();
rover.position.set(0, R, 0);
scene.add(rover);

const roverBody = new THREE.Group();
roverBody.position.y = 0.05; // wheels rest on the surface (re-applied each frame in tick)
rover.add(roverBody);

// FWD = the local axis the rover drives toward. -Z is "into the scene" (away
// from the camera), so the NOSE points there and we mostly see the tail.
// All local Y is measured from the ground contact (wheel bottoms at y = 0).
const FWD = -1;
const WR = 0.8; // wheel radius

const paint   = new THREE.MeshStandardMaterial({ color: '#ef6f4e', roughness: 0.6, metalness: 0.05 });
const paint2  = new THREE.MeshStandardMaterial({ color: '#d65a3c', roughness: 0.6 }); // deeper accent
const dark    = new THREE.MeshStandardMaterial({ color: '#6b6577', roughness: 0.7 });
const tyreMat = new THREE.MeshStandardMaterial({ color: '#5b5566', roughness: 0.85 });
const glass   = new THREE.MeshStandardMaterial({ color: '#d4ecf2', roughness: 0.2, metalness: 0.1 });
const cream   = new THREE.MeshStandardMaterial({ color: '#fdf7f0', roughness: 0.7 });
const headMat = new THREE.MeshStandardMaterial({ color: '#fff3cf', emissive: '#ffe7a8', emissiveIntensity: 0.85, roughness: 0.4 });
const tailMat = new THREE.MeshStandardMaterial({ color: '#f47a7a', emissive: '#e85d5d', emissiveIntensity: 0.7, roughness: 0.4 });

// belly / chassis (sits low between the wheels)
const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 4.0), paint);
chassis.position.y = 1.05; chassis.castShadow = true; roverBody.add(chassis);

const skid = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 3.4), dark);
skid.position.y = 0.66; roverBody.add(skid);

// ── FRONT (-Z): sloped nose, bull-bar, headlights ──
const nose = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.3), paint2);
nose.position.set(0, 0.92, FWD * 1.95); nose.rotation.x = FWD * 0.32;
nose.castShadow = true; roverBody.add(nose);

const bar = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.18, 0.2), dark);
bar.position.set(0, 0.74, FWD * 2.5); roverBody.add(bar);

[-0.8, 0.8].forEach((x) => {
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.18, 16), headMat);
  h.rotation.x = Math.PI / 2;
  h.position.set(x, 0.95, FWD * 2.45);
  roverBody.add(h);
});

// cabin toward the front; windshield faces forward
const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.85, 1.7), cream);
cabin.position.set(0, 1.78, FWD * 0.1); cabin.castShadow = true; roverBody.add(cabin);

const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.72, 0.12), glass);
windshield.position.set(0, 1.86, FWD * 0.95); windshield.rotation.x = FWD * -0.32; roverBody.add(windshield);

const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.66, 0.1), glass);
rearWin.position.set(0, 1.86, -FWD * 0.85); roverBody.add(rearWin);

// roof + a forward-pointing arrow so heading is unmistakable
const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 1.45), dark);
roof.position.set(0, 2.24, FWD * 0.1); roof.castShadow = true; roverBody.add(roof);

const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.05, 3),
  new THREE.MeshStandardMaterial({ color: '#fbf7ee', roughness: 0.6 }));
arrow.rotation.x = FWD * Math.PI / 2;     // lay flat, tip toward the nose
arrow.rotation.z = Math.PI;                // flat face up
arrow.position.set(0, 2.31, FWD * 0.1); roverBody.add(arrow);

// ── BACK (+Z, toward camera): cargo bed, taillights, flag ──
const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 1.5), paint2);
bed.position.set(0, 1.2, -FWD * 1.4); bed.castShadow = true; roverBody.add(bed);
const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 1.15), dark);
bedFloor.position.set(0, 1.46, -FWD * 1.4); roverBody.add(bedFloor);

[-0.78, 0.78].forEach((x) => {
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.12), tailMat);
  t.position.set(x, 0.98, -FWD * 2.0);
  roverBody.add(t);
});

const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 6), dark);
mast.position.set(-0.95, 1.7, -FWD * 1.65); roverBody.add(mast);
const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.52),
  new THREE.MeshStandardMaterial({ color: '#f4a18f', side: THREE.DoubleSide, roughness: 0.7 }));
flag.position.set(-0.5, 2.28, -FWD * 1.65); roverBody.add(flag);

// wheels — centers at y = WR so the bottoms touch the ground (front pair toward the nose)
const wheels = [];
const wheelGeo = new THREE.CylinderGeometry(WR, WR, 0.6, 20);
const hubGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.62, 8);
[[-1.42, FWD * 1.4], [1.42, FWD * 1.4], [-1.42, -FWD * 1.4], [1.42, -FWD * 1.4]].forEach(([x, z]) => {
  const w = new THREE.Group();
  const tyre = new THREE.Mesh(wheelGeo, tyreMat); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true;
  const hub = new THREE.Mesh(hubGeo, cream); hub.rotation.z = Math.PI / 2;
  w.add(tyre, hub);
  w.position.set(x, WR, z);
  roverBody.add(w);
  wheels.push(w);
});

// soft contact shadow blob under rover
const blob = new THREE.Mesh(
  new THREE.CircleGeometry(2.6, 32),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 })
);
blob.rotation.x = -Math.PI / 2; blob.position.y = R + 0.06;
scene.add(blob);

// ── Rover headlights (glow at night) ──────────────────────────────────────
const headlights = [];
[-0.8, 0.8].forEach((x) => {
  const sl = new THREE.SpotLight(0xfff2c0, 0, 70, 0.5, 0.6, 1.0);
  sl.position.set(x, 0.95, FWD * 2.45);
  sl.target.position.set(x * 0.4, -3.5, FWD * 16);
  roverBody.add(sl); roverBody.add(sl.target);
  headlights.push(sl);
});

// ── Atmosphere: clouds, a ringed moon, and circling birds ──────────────────
const cloudGroup = new THREE.Group();
planet.add(cloudGroup); // ride with the world so they drift overhead as you drive
const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
function makeCloud() {
  const g = new THREE.Group();
  const puffs = 5 + (Math.random() * 4 | 0);
  for (let i = 0; i < puffs; i++) {
    const s = 1.4 + Math.random() * 1.8;
    const m = new THREE.Mesh(UNIT, cloudMat);
    m.scale.set(s * 1.7, s * 0.8, s * 1.4);
    m.position.set((i - puffs / 2) * 2.0 + Math.random(), Math.random() * 0.6, Math.random() * 2 - 1);
    g.add(m);
  }
  return g;
}
for (let i = 0; i < 40; i++) {
  const c = makeCloud();
  // distribute evenly over the whole sphere (golden spiral) so no side is empty
  const y = 1 - (i + 0.5) / 40 * 2;
  const r = Math.sqrt(1 - y * y);
  const phi = i * 2.39996;
  const n = new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r);
  c.position.copy(n.multiplyScalar(R + 22 + Math.random() * 16));
  c.quaternion.setFromRotationMatrix(surfaceFrame(c.position.clone().normalize()));
  c.rotateY(Math.random() * Math.PI);
  cloudGroup.add(c);
}

// ringed moon, fixed high in the sky
const moon = new THREE.Group();
const moonBall = new THREE.Mesh(
  new THREE.IcosahedronGeometry(8, 1),
  new THREE.MeshStandardMaterial({ color: '#e7d9c8', roughness: 1, flatShading: true, emissive: '#3a3326', emissiveIntensity: 0.4, fog: false })
);
moon.add(moonBall);
const moonRing = new THREE.Mesh(
  new THREE.TorusGeometry(13, 1.6, 3, 48),
  new THREE.MeshStandardMaterial({ color: '#cdb89a', roughness: 1, flatShading: true, fog: false, side: THREE.DoubleSide })
);
moonRing.rotation.set(Math.PI / 2.3, 0.3, 0);
moonRing.scale.set(1, 1, 0.18);
moon.add(moonRing);
moon.position.set(95, 120, -150);
scene.add(moon);

// circling birds (simple dark chevrons that flap)
const birds = [];
const birdMat = new THREE.MeshStandardMaterial({ color: '#4a463d', roughness: 1, flatShading: true });
for (let i = 0; i < 6; i++) {
  const b = new THREE.Group();
  const lw = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.5), birdMat);
  const rw = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.5), birdMat);
  lw.position.x = -0.75; rw.position.x = 0.75;
  b.add(lw, rw);
  b.userData = { lw, rw, rad: R + 22 + Math.random() * 14, h: 10 + Math.random() * 22, sp: 0.18 + Math.random() * 0.16, ph: Math.random() * Math.PI * 2, flap: Math.random() * Math.PI * 2 };
  scene.add(b);
  birds.push(b);
}

// stars (revealed at night)
const starGeo = new THREE.BufferGeometry();
const starN = 700, starPos = new Float32Array(starN * 3);
for (let i = 0; i < starN; i++) {
  const v = new THREE.Vector3().randomDirection().multiplyScalar(240 + Math.random() * 60);
  starPos[i * 3] = v.x; starPos[i * 3 + 1] = Math.abs(v.y) * 0.7 + 20; starPos[i * 3 + 2] = v.z;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, transparent: true, opacity: 0, fog: false, depthWrite: false });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// ── Day/night driving state ────────────────────────────────────────────────
const SKY_DAY = new THREE.Color('#e9f1dd');
const SKY_NIGHT = new THREE.Color('#121a30');
const HEMI_GROUND = new THREE.Color('#9fbf7a');
const HEMI_GROUND_N = new THREE.Color('#2a3550');
const hemi = scene.children.find((o) => o.isHemisphereLight);
const DAY_SPEED = 0.045;             // radians/sec of the sun's arc
let light01 = 1;                     // 1 = full day, 0 = night
const _sky = new THREE.Color();
function updateDayNight(elapsed, dt) {
  const a = elapsed * DAY_SPEED + 0.6;
  sun.position.set(Math.cos(a) * 140, Math.sin(a) * 140, 45);
  const target = THREE.MathUtils.clamp(Math.sin(a) * 1.5 + 0.35, 0, 1);
  light01 += (target - light01) * Math.min(1, 3 * dt);
  sun.intensity = 0.15 + light01 * 1.3;
  if (hemi) { hemi.intensity = 0.18 + light01 * 0.55; hemi.groundColor.copy(HEMI_GROUND_N).lerp(HEMI_GROUND, light01); }
  _sky.copy(SKY_NIGHT).lerp(SKY_DAY, light01);
  scene.background.copy(_sky);
  scene.fog.color.copy(_sky);
  starMat.opacity = (1 - light01) * 0.9;
  const night = 1 - light01;
  headlights.forEach((h) => (h.intensity = night * 3.2));
  headMat.emissiveIntensity = 0.4 + night * 1.4;
  tailMat.emissiveIntensity = 0.4 + night * 1.1;
  moonBall.material.emissiveIntensity = 0.2 + night * 0.7;
  cloudMat.opacity = 0.35 + light01 * 0.57;
  for (const l of lamps) l.material.emissiveIntensity = 0.4 + night * 1.6;
}
function updateAtmosphere(elapsed, dt) {
  cloudGroup.rotation.y += dt * 0.004; // gentle extra drift on top of riding with the planet
  for (const b of birds) {
    const u = b.userData;
    const ang = elapsed * u.sp + u.ph;
    b.position.set(Math.cos(ang) * u.rad, u.h, Math.sin(ang) * u.rad);
    b.rotation.y = -ang + Math.PI / 2;
    const f = Math.sin(elapsed * 9 + u.flap) * 0.6;
    u.lw.rotation.z = f; u.rw.rotation.z = -f;
  }
  // windmills / watermills
  for (const sp of spinners) sp.mesh.rotation[sp.axis] += dt * sp.speed;
  // grazing animals: bob their heads, occasional hop
  for (const a of animals) {
    const u = a.userData;
    u.hopT += dt;
    a.children.forEach((c, ci) => { if (ci === 1) c.rotation.x = Math.sin(elapsed * 2 + u.graze) * 0.25; });
    let hop = 0;
    if (u.hopT > u.hop) {
      const k = (u.hopT - u.hop);
      if (k < 0.4) hop = Math.sin(k / 0.4 * Math.PI) * 0.6;
      else { u.hopT = 0; u.hop = 3 + Math.random() * 4; a.rotateY((Math.random() - 0.5) * 1.2); }
    }
    a.position.copy(a.userData._n || (a.userData._n = a.position.clone()));
    a.position.addScaledVector(a.position.clone().normalize(), hop);
  }
  // chimney smoke: puffs rise and fade on a loop
  for (const sm of smokers) {
    sm.puffs.forEach((p, pi) => {
      const t = ((elapsed * 0.6 + sm.ph + pi * 0.25) % 1);
      p.position.y = t * 2.4;
      p.position.x = Math.sin(t * 4 + pi) * 0.3;
      const sc = 0.3 + t * 0.7;
      p.scale.setScalar(sc);
      p.material.opacity = (1 - t) * 0.55;
    });
  }
  // flags wave
  for (const w of wavers) w.mesh.rotation.y = Math.sin(elapsed * 4 + w.ph) * 0.35;
  // fish jump in lakes
  for (const fi of fishes) {
    const cycle = (elapsed * 0.4 + fi.ph) % 4;
    if (cycle < 0.7) {
      fi.mesh.visible = true;
      const k = cycle / 0.7;
      fi.mesh.position.set(Math.cos(fi.ang) * fi.rad, Math.sin(k * Math.PI) * 1.6 + 0.2, Math.sin(fi.ang) * fi.rad);
      fi.mesh.rotation.z = (k - 0.5) * 2.2;
    } else {
      fi.mesh.visible = false;
      if (cycle > 3.9) fi.ang = Math.random() * 6;
    }
  }
}

// ── State ───────────────────────────────────────────────────────────────
let heading = 0;            // rover yaw (radians)
let activeStation = -1;
let traveling = false;
const targetQuat = new THREE.Quaternion();
const keys = { up: false, down: false, left: false, right: false, boost: false };

// ── Input: keyboard ──────────────────────────────────────────────────────
const keyMap = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};
addEventListener('keydown', (e) => {
  const k = keyMap[e.code];
  if (k) { keys[k] = true; cancelTravel(); e.preventDefault(); }
});
addEventListener('keyup', (e) => { const k = keyMap[e.code]; if (k) keys[k] = false; });

// boost (Shift) + photo mode (P)
addEventListener('keydown', (e) => {
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.boost = true;
  else if (e.code === 'KeyP') togglePhoto();
});
addEventListener('keyup', (e) => { if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.boost = false; });

// ── Input: touch pad ──────────────────────────────────────────────────────
document.querySelectorAll('#pad button').forEach((btn) => {
  const d = btn.dataset.dir;
  const on = (e) => { e.preventDefault(); keys[d] = true; cancelTravel(); };
  const off = (e) => { e.preventDefault(); keys[d] = false; };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointerleave', off);
  btn.addEventListener('pointercancel', off);
});

// safety: never let a key get stuck (tab switch, lost pointerup, etc.)
function clearKeys() { keys.up = keys.down = keys.left = keys.right = keys.boost = false; }
addEventListener('blur', clearKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });

function cancelTravel() { traveling = false; }

// ── Click-to-travel (raycast signs) ───────────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downX = 0, downY = 0, dragging = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downX = lastX = e.clientX; downY = lastY = e.clientY; dragging = true;
});
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  camAz -= (e.clientX - lastX) * 0.005;
  camEl = Math.max(0.06, Math.min(1.35, camEl - (e.clientY - lastY) * 0.005));
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // a drag, not a click
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(signMeshes, false)[0];
  if (hit) travelTo(hit.object.userData.stationIndex);
});

function travelTo(i) {
  if (i < 0 || i >= stations.length) return;
  activeStation = i;
  targetQuat.copy(stations[i]._targetQuat);
  traveling = true;
  // ease the rover back to facing forward
  heading = ((heading + Math.PI) % (Math.PI * 2)) - Math.PI;
  syncUI();
}

// ── Build landmark list UI ────────────────────────────────────────────────
const listEl = document.getElementById('landmarks');
const lmButtons = stations.map((s, i) => {
  const b = document.createElement('button');
  b.className = 'lm';
  b.innerHTML = `<span class="dot" style="background:${s.color}"></span>${s.title}`;
  b.addEventListener('click', () => travelTo(i));
  listEl.appendChild(b);
  return b;
});

const viewingEl = document.getElementById('viewing');
function syncUI() {
  lmButtons.forEach((b, i) => b.classList.toggle('active', i === activeStation));
  if (activeStation >= 0) {
    const s = stations[activeStation];
    viewingEl.querySelector('.dot').style.background = s.color;
    viewingEl.querySelector('.vt').textContent = s.title;
    viewingEl.classList.add('show');
  }
}

// identity text
document.querySelector('#identity .name').textContent = profile.name || '';
document.querySelector('#identity .role').textContent = profile.role || '';
document.querySelector('#identity .tagline').textContent = profile.tagline || '';

// ── Resize ────────────────────────────────────────────────────────────────
addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Particles: dust trail + debris bursts ──────────────────────────────────
const PCOUNT = 140;
const pGeo = new THREE.BoxGeometry(1, 1, 1);
const pPool = [];
for (let i = 0; i < PCOUNT; i++) {
  const m = new THREE.Mesh(pGeo, new THREE.MeshStandardMaterial({ color: '#cdbfa0', roughness: 1, flatShading: true }));
  m.visible = false; m.castShadow = false; scene.add(m);
  pPool.push({ m, life: 0, max: 1, baseSize: 1, vel: new THREE.Vector3() });
}
let pNext = 0;
const _wp = new THREE.Vector3();
function spawnParticle(pos, vel, color, size, life) {
  const p = pPool[pNext]; pNext = (pNext + 1) % PCOUNT;
  p.m.visible = true; p.m.position.copy(pos); p.m.scale.setScalar(size);
  p.m.material.color.set(color);
  p.m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  p.vel.copy(vel); p.life = life; p.max = life; p.baseSize = size;
}
function spawnDebris(pos) {
  const n = 6 + (Math.random() * 5 | 0);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 11, 6 + Math.random() * 9, (Math.random() - 0.5) * 11);
    spawnParticle(pos, v, SAND[(Math.random() * SAND.length) | 0], 0.5 + Math.random() * 0.5, 0.8 + Math.random() * 0.5);
  }
}
function spawnDust(dir) {
  dir = dir || 1; // 1 = driving forward, -1 = reversing
  // emit from the trailing wheels: rear when going forward, front when reversing
  const pool = dir > 0 ? [2, 3, 2, 3, 0, 1] : [0, 1, 0, 1, 2, 3];
  const idx = pool[(Math.random() * 6) | 0];
  wheels[idx].getWorldPosition(_wp);
  // dust streams opposite the travel direction (behind forward, ahead when reversing)
  const bx = Math.sin(heading) * dir, bz = Math.cos(heading) * dir;
  const sp = 7 + Math.random() * 6;
  const v = new THREE.Vector3(
    bx * sp + (Math.random() - 0.5) * 2,
    1.0 + Math.random() * 1.6,
    bz * sp + (Math.random() - 0.5) * 2
  );
  spawnParticle(new THREE.Vector3(_wp.x, roverGroundY + 0.18, _wp.z), v, '#d8cdb4', 0.28 + Math.random() * 0.22, 0.85 + Math.random() * 0.35);
}
function updateParticles(dt) {
  for (const p of pPool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.m.visible = false; continue; }
    p.vel.y -= 24 * dt;
    p.m.position.addScaledVector(p.vel, dt);
    if (p.m.position.y < roverGroundY + 0.15) { p.m.position.y = roverGroundY + 0.15; p.vel.set(p.vel.x * 0.4, 0, p.vel.z * 0.4); }
    p.m.rotation.x += dt * 5; p.m.rotation.z += dt * 4;
    p.m.scale.setScalar(p.baseSize * (0.35 + 0.65 * (p.life / p.max)));
  }
}

// ── Audio: engine hum, ambient wind, crash (unlocked on Start) ──────────────
let muted = localStorage.getItem('cvMuted') === '1';
let audio = null;
function initAudio() {
  if (audio) { audio.ctx.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
  const engGain = ctx.createGain(); engGain.gain.value = 0;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
  const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 82;
  o1.connect(lp); o2.connect(lp); lp.connect(engGain); engGain.connect(master);
  o1.start(); o2.start();
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const wind = ctx.createBufferSource(); wind.buffer = nb; wind.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 0.7;
  const windG = ctx.createGain(); windG.gain.value = 0.05;
  wind.connect(bp); bp.connect(windG); windG.connect(master); wind.start();
  audio = { ctx, master, engGain, lp, o1, o2, nb };
}
function engineAudio(speed01) {
  if (!audio) return;
  audio.engGain.gain.value += (speed01 * 0.18 - audio.engGain.gain.value) * 0.12;
  const f = 55 + speed01 * 70;
  audio.o1.frequency.value += (f - audio.o1.frequency.value) * 0.1;
  audio.o2.frequency.value += (f * 1.5 - audio.o2.frequency.value) * 0.1;
  audio.lp.frequency.value = 380 + speed01 * 600;
}
function crashAudio() {
  if (!audio) return;
  const ctx = audio.ctx, t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = audio.nb; src.loop = false;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
  src.connect(lp); lp.connect(g); g.connect(audio.master);
  src.start(t); src.stop(t + 0.35);
}

// ── Mute toggle ─────────────────────────────────────────────────────────────
const muteBtn = document.getElementById('mute');
function syncMute() {
  muteBtn.classList.toggle('muted', muted);
  muteBtn.querySelector('.mt').textContent = muted ? 'Sound off' : 'Sound on';
  if (audio) audio.master.gain.value = muted ? 0 : 0.5;
}
muteBtn.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('cvMuted', muted ? '1' : '0');
  if (audio) audio.ctx.resume();
  syncMute();
});
syncMute();

// ── Photo mode + bowling score ─────────────────────────────────────────────
let photo = false;
const photoBtn = document.getElementById('photo');
function togglePhoto() {
  photo = !photo;
  document.body.classList.toggle('photo', photo);
  photoBtn.querySelector('.pt').textContent = photo ? 'Exit' : 'Photo';
}
photoBtn.addEventListener('click', togglePhoto);

let flattened = 0;
const scoreEl = document.getElementById('score');
function addScore() {
  flattened++;
  scoreEl.querySelector('.num').textContent = flattened;
  scoreEl.classList.add('show');
}

// ── Compass / minimap ───────────────────────────────────────────────────────
const compassEl = document.getElementById('compass');
const cctx = compassEl.getContext('2d');
function drawCompass() {
  const cx = 120, cy = 120, rr = 92;
  cctx.clearRect(0, 0, 240, 240);
  cctx.beginPath(); cctx.arc(cx, cy, rr, 0, Math.PI * 2);
  cctx.fillStyle = 'rgba(253,251,247,0.55)'; cctx.fill();
  cctx.lineWidth = 3; cctx.strokeStyle = 'rgba(58,53,46,0.18)'; cctx.stroke();
  const A = camAz, cA = Math.cos(A), sA = Math.sin(A);
  STATION_DIRS.forEach((n, i) => {
    const p = n.clone().applyQuaternion(planet.quaternion);
    const horiz = Math.hypot(p.x, p.z);          // 0 when the landmark is at the top
    const atTop = horiz < 0.09 && p.y > 0;
    let px = cx, py = cy;
    if (!atTop) {
      const rf = p.y >= 0 ? horiz : 1;            // behind the planet → pin to the rim
      const rad = rr * Math.min(1, 0.2 + rf * 0.85);
      const ang = Math.atan2(p.x * cA - p.z * sA, -p.x * sA - p.z * cA);
      px = cx + Math.sin(ang) * rad; py = cy - Math.cos(ang) * rad;
    }
    cctx.beginPath(); cctx.arc(px, py, atTop ? 10 : 8, 0, Math.PI * 2);
    cctx.fillStyle = stations[i].color; cctx.fill();
    cctx.lineWidth = 2; cctx.strokeStyle = 'rgba(255,255,255,0.9)'; cctx.stroke();
  });
  const fx = -Math.sin(heading), fz = -Math.cos(heading);
  const ra = Math.atan2(fx * cA - fz * sA, -fx * sA - fz * cA);
  cctx.save(); cctx.translate(cx, cy); cctx.rotate(ra);
  cctx.beginPath(); cctx.moveTo(0, -15); cctx.lineTo(10, 12); cctx.lineTo(0, 5); cctx.lineTo(-10, 12); cctx.closePath();
  cctx.fillStyle = '#ef6f4e'; cctx.fill();
  cctx.restore();
}

// ── Knock-over collisions (props get bowled over as you drive into them) ──
const _p = new THREE.Vector3();
const _wq = new THREE.Quaternion();
function updateProps(dt, knocking) {
  for (const g of props) {
    const u = g.userData;
    if (u.ko === 'falling') {
      u.t += dt;
      const k = Math.min(1, u.t / u.dur);
      g.quaternion.slerpQuaternions(u.q0, u.q1, 1 - Math.pow(1 - k, 3));
      if (k >= 1) { u.ko = 'down'; u.t = 0; }
      continue;
    }
    if (u.ko === 'down') {
      u.t += dt;
      if (u.t < u.respawn) continue;
      // wait until it's away from the rover before springing back up
      _p.copy(g.position).applyQuaternion(planet.quaternion);
      if (_p.y > R * 0.86 && Math.hypot(_p.x, _p.z) < 5) continue;
      u.ko = 'rising'; u.t = 0; u.dur = 0.5;
      u.q0 = g.quaternion.clone(); u.q1 = u.upright.clone();
      continue;
    }
    if (u.ko === 'rising') {
      u.t += dt;
      const k = Math.min(1, u.t / u.dur);
      // overshoot a touch for a springy pop
      const e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
      g.quaternion.slerpQuaternions(u.q0, u.q1, e);
      const pop = Math.sin(Math.min(k, 1) * Math.PI) * 0.5;
      g.scale.setScalar(1 + pop * 0.12);
      if (k >= 1) { u.ko = 'up'; g.scale.setScalar(1); g.quaternion.copy(u.upright); }
      continue;
    }
    if (!knocking) continue;
    _p.copy(g.position).applyQuaternion(planet.quaternion);   // prop world position
    if (_p.y < R * 0.86) continue;                            // only near the rover at the top
    if (Math.hypot(_p.x, _p.z) > 3.2) continue;
    // topple it over, away from the rover
    _wq.copy(planet.quaternion).multiply(g.quaternion);
    const push = new THREE.Vector3(_p.x, 0, _p.z).normalize().applyQuaternion(_wq.invert());
    push.y = 0;
    if (push.lengthSq() < 1e-4) push.set(1, 0, 0);
    push.normalize();
    const axis = new THREE.Vector3().crossVectors(YUP, push).normalize();
    if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
    u.ko = 'falling'; u.t = 0; u.dur = 0.45 + Math.random() * 0.25;
    u.respawn = 1.5 + Math.random() * 1.5;      // seconds flat before springing back
    u.upright = g.quaternion.clone();           // remember the standing orientation
    u.q0 = g.quaternion.clone();
    if (u.isBuilding) addScore();
    u.q1 = g.quaternion.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2 * (0.92 + Math.random() * 0.16))
    );
    spawnDebris(_p.clone());
    crashAudio();
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const _axis = new THREE.Vector3();
let wheelSpin = 0;
let engineSpeed = 0;
let roverGroundY = R, roverPitch = 0, roverRoll = 0;
const _invPQ = new THREE.Quaternion();
const _localUp = new THREE.Vector3();
const _fwdW = new THREE.Vector3();
const _rgtW = new THREE.Vector3();
const _th = new THREE.Vector3();
const clampPM = (v, m) => Math.max(-m, Math.min(m, v));

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (traveling) {
    planet.quaternion.slerp(targetQuat, 1 - Math.exp(-CONFIG.travelSpeed * dt));
    heading += (-heading) * (1 - Math.exp(-6 * dt));
    camAz += (DEF_AZ - camAz) * (1 - Math.exp(-4 * dt)); // ease camera back to the front
    camEl += (DEF_EL - camEl) * (1 - Math.exp(-4 * dt));
    if (planet.quaternion.angleTo(targetQuat) < 0.002) {
      planet.quaternion.copy(targetQuat);
      traveling = false;
    }
  } else {
    // steering
    if (keys.left) heading += CONFIG.turnSpeed * dt;
    if (keys.right) heading -= CONFIG.turnSpeed * dt;

    // driving: roll the planet about the horizontal axis perpendicular to heading
    let move = 0;
    if (keys.up) move += 1;
    if (keys.down) move -= 1;
    if (move !== 0) {
      _axis.set(Math.cos(heading), 0, -Math.sin(heading));
      const bf = keys.boost ? 1.9 : 1;
      planet.rotateOnWorldAxis(_axis, CONFIG.driveSpeed * dt * move * bf);
      wheelSpin -= dt * move * 6 * bf;
      // driving away from a station de-selects it
      if (activeStation >= 0 && planet.quaternion.angleTo(stations[activeStation]._targetQuat) > 0.18) {
        activeStation = -1;
        viewingEl.classList.remove('show');
        lmButtons.forEach((b) => b.classList.remove('active'));
      }
    }
  }

  const driving = !traveling && (keys.up || keys.down);
  const boosting = driving && keys.boost;
  updateProps(dt, driving);
  engineSpeed += ((driving ? 1 : 0) - engineSpeed) * Math.min(1, 8 * dt);
  engineAudio(engineSpeed * (boosting ? 1.4 : 1));
  if (driving) {
    const ddir = keys.up ? 1 : -1;
    if (Math.random() < 0.85) spawnDust(ddir); if (Math.random() < 0.5) spawnDust(ddir);
    if (boosting) { spawnDust(ddir); if (Math.random() < 0.7) spawnDust(ddir); }
  }
  updateParticles(dt);
  updateDayNight(clock.elapsedTime, dt);
  updateAtmosphere(clock.elapsedTime, dt);
  // boost FOV kick
  const targetFov = boosting ? 47 : 40;
  if (Math.abs(camera.fov - targetFov) > 0.04) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 6 * dt);
    camera.updateProjectionMatrix();
  }
  drawCompass();

  // rover visual: ride the terrain (bob over hills + tilt on slopes), yaw, wheels
  rover.rotation.y = heading;
  _invPQ.copy(planet.quaternion).invert();
  _localUp.set(0, 1, 0).applyQuaternion(_invPQ);
  roverGroundY = R + terrainHeight(_localUp);
  rover.position.y = roverGroundY;
  blob.position.y = roverGroundY + 0.06;
  // sample the slope under the rover along its facing & side directions
  const eps = 0.06, span = 2 * eps * R;
  _fwdW.set(-Math.sin(heading), 0, -Math.cos(heading)).applyQuaternion(_invPQ);
  _rgtW.set(Math.cos(heading), 0, -Math.sin(heading)).applyQuaternion(_invPQ);
  const hF = terrainHeight(_th.copy(_localUp).addScaledVector(_fwdW, eps).normalize());
  const hB = terrainHeight(_th.copy(_localUp).addScaledVector(_fwdW, -eps).normalize());
  const hR = terrainHeight(_th.copy(_localUp).addScaledVector(_rgtW, eps).normalize());
  const hL = terrainHeight(_th.copy(_localUp).addScaledVector(_rgtW, -eps).normalize());
  const pitchT = clampPM(Math.atan2(hF - hB, span), 0.42);
  const rollT = clampPM(Math.atan2(hR - hL, span), 0.42);
  roverPitch += (pitchT - roverPitch) * Math.min(1, 7 * dt);
  roverRoll += (rollT - roverRoll) * Math.min(1, 7 * dt);
  roverBody.rotation.x = roverPitch;   // nose up when climbing
  roverBody.rotation.z = roverRoll;    // bank into cross-slopes
  roverBody.position.y = 0.05 + Math.sin(clock.elapsedTime * 2) * 0.05 * ((keys.up || keys.down) ? 1 : 0.3);
  wheels.forEach((w) => (w.rotation.x = wheelSpin));
  flag.rotation.z = Math.sin(clock.elapsedTime * 6) * 0.18;

  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ── Boot ──────────────────────────────────────────────────────────────────
function start() {
  const loader = document.getElementById('loader');
  loader.classList.add('hide');
  setTimeout(() => loader.remove(), 700);

  // start screen
  document.querySelector('.start-name').textContent = profile.name || '';
  document.querySelector('.start-role').textContent = profile.role || '';
  const startEl = document.getElementById('start');
  const begin = () => {
    initAudio();
    startEl.classList.add('hide');
    setTimeout(() => startEl.remove(), 700);
  };
  document.getElementById('startBtn').addEventListener('click', begin);

  clock.start();
  tick();
}

// wait for the font so sign textures render with the right typeface
if (document.fonts && document.fonts.ready) {
  Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(() => {
    // redraw sign textures now the font is ready
    signMeshes.forEach((m) => {
      const s = stations[m.userData.stationIndex];
      m.material.map.dispose();
      m.material.map = drawSignTexture(s);
      m.material.needsUpdate = true;
    });
    start();
  });
} else {
  start();
}
