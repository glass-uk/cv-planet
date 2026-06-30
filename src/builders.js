import * as THREE from 'three';
import {
  UNIT, vbox, vmat, rpick, GREENS, SAND, STONE, ROOF,
} from './voxel.js';

// Factory that returns all the scenery builders. The registries it receives
// (spinners, lamps, smokers, wavers) are arrays the main loop walks each frame
// to animate the windmills/watermills/lighthouses/chimneys/flags those builders
// emit. Builders just push into them.
export function createBuilders({ spinners, lamps, smokers, wavers }) {
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

  // tapering stepped pyramid temple
  function makeTemple(g, s) {
    const tiers = 5 + ((Math.random() * 2) | 0);
    let y = 0;
    let w = (2.6 + Math.random() * 0.8) * s;
    for (let k = 0; k < tiers; k++) {
      const h = 0.7 * s;
      vbox(g, w, h, w, 0, y + h / 2, 0, SAND[k % 2]);
      if (k === 0) vbox(g, 0.6 * s, 0.7 * s, 0.2 * s, 0, 0.35 * s, w / 2, '#5a432c'); // doorway
      y += h;
      w *= 0.78;
    }
    vbox(g, 0.45 * s, 0.9 * s, 0.45 * s, 0, y + 0.45 * s, 0, '#b9763a'); // finial
  }

  // tall narrow temple tower
  function makeGopuram(g, s) {
    const w = 2.1 * s;
    vbox(g, w + 0.7, 0.5 * s, w + 0.7, 0, 0.25 * s, 0, SAND[2]); // plinth
    let y = 0.5 * s;
    for (let k = 0; k < 8; k++) {
      const h = 0.6 * s;
      const ww = w * (1 - k * 0.085);
      vbox(g, ww, h, ww, 0, y + h / 2, 0, SAND[k % 2]);
      y += h;
    }
    vbox(g, 0.4 * s, 0.9 * s, 0.4 * s, 0, y + 0.45 * s, 0, '#b9763a'); // finial
  }

  // rampart with corner towers
  function makeWall(g, s) {
    const c = SAND[1];
    vbox(g, 4.2 * s, 1.3 * s, 0.7 * s, 0, 0.65 * s, 0, c);
    for (let k = -2; k <= 2; k++) vbox(g, 0.45 * s, 0.4 * s, 0.7 * s, k * 0.95 * s, 1.5 * s, 0, c);
    vbox(g, 1.0 * s, 2.1 * s, 1.0 * s, -2.0 * s, 1.05 * s, 0, SAND[2]);
    vbox(g, 1.0 * s, 2.1 * s, 1.0 * s, 2.0 * s, 1.05 * s, 0, SAND[2]);
  }

  function makeHouse(g, s) {
    const wall = Math.random() < 0.45 ? rpick(STONE) : SAND[0];
    const w = (1.6 + Math.random() * 1.2) * s;
    const d = (1.6 + Math.random() * 1.2) * s;
    const h = (1.2 + Math.random() * 1.1) * s;
    vbox(g, w, h, d, 0, h / 2, 0, wall);
    vbox(g, w + 0.3, 0.25 * s, d + 0.3, 0, h + 0.1 * s, 0, rpick(SAND)); // roof slab
    vbox(g, 0.5 * s, 0.7 * s, 0.12 * s, 0, 0.35 * s, d / 2, '#5a432c'); // door
  }

  function makeRuin(g, s) {
    const c = rpick(SAND);
    for (let k = 0; k < 4; k++) vbox(g, 0.45 * s, (0.8 + Math.random() * 1.4) * s, 0.45 * s, (-1.2 + k * 0.8) * s, 0.5 * s, 0, c);
    vbox(g, 3.0 * s, 0.4 * s, 0.5 * s, 0, 0.2 * s, 0, c); // low wall base
  }

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
      const arm = new THREE.Group();
      arm.add(blade);
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
      pad.position.y = 0.7 * s;
      const arm = new THREE.Group();
      arm.add(pad);
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
    let y = 0.4 * s;
    let w = 1.0 * s;
    for (let k = 0; k < 5; k++) {
      vbox(g, w, 1.0 * s, w, 0, y + 0.5 * s, 0, SAND[k % 2]);
      y += 1.0 * s;
      w *= 0.85;
    }
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
    let y = 1.8 * s;
    let w = 2.2 * s;
    for (let k = 0; k < 4; k++) {
      vbox(g, w, 0.5 * s, w, 0, y + 0.25 * s, 0, '#cfd6da');
      y += 0.5 * s;
      w *= 0.7;
    }
    vbox(g, 0.3 * s, 0.7 * s, 0.3 * s, 0, y + 0.35 * s, 0, '#e0c34a'); // crescent post
    [[-1.7, -1.7], [1.7, 1.7]].forEach(([x, z]) => { // minarets
      vbox(g, 0.5 * s, 3.4 * s, 0.5 * s, x * s, 1.7 * s, z * s, '#e7ddc8');
      vbox(g, 0.6 * s, 0.5 * s, 0.6 * s, x * s, 3.6 * s, z * s, '#cfd6da');
    });
  }

  function makeLighthouse(g, s) {
    let y = 0;
    let w = 1.6 * s;
    for (let k = 0; k < 5; k++) {
      vbox(g, w, 1.0 * s, w, 0, y + 0.5 * s, 0, k % 2 ? '#d8534a' : '#f3ede0');
      y += 1.0 * s;
      w *= 0.9;
    }
    vbox(g, w + 0.5, 0.3 * s, w + 0.5, 0, y + 0.15 * s, 0, '#3a352e'); // gallery
    const lamp = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: '#fff3c0', emissive: '#ffdf80', emissiveIntensity: 0.8, roughness: 0.4 }));
    lamp.scale.set(w * 0.9, 0.7 * s, w * 0.9);
    lamp.position.y = y + 0.55 * s;
    g.add(lamp);
    lamps.push(lamp);
    vbox(g, w * 0.6, 0.5 * s, w * 0.6, 0, y + 1.1 * s, 0, '#3a352e'); // cap
  }

  // courtyard wall enclosing a couple of small houses
  function makeCompound(g, s) {
    const c = rpick(SAND);
    [[0, 2.6], [0, -2.6], [2.6, 0], [-2.6, 0]].forEach(([x, z]) => vbox(g, x === 0 ? 5.4 * s : 0.5 * s, 1.2 * s, z === 0 ? 5.4 * s : 0.5 * s, x * s, 0.6 * s, z * s, c));
    vbox(g, 1.4 * s, 1.2 * s, 1.4 * s, -1.0 * s, 0.6 * s, 0.8 * s, rpick(STONE));
    vbox(g, 1.6 * s, 0.25 * s, 1.6 * s, -1.0 * s, 1.3 * s, 0.8 * s, rpick(ROOF));
    vbox(g, 1.2 * s, 1.0 * s, 1.2 * s, 1.1 * s, 0.5 * s, -0.9 * s, rpick(STONE));
    vbox(g, 1.4 * s, 0.25 * s, 1.4 * s, 1.1 * s, 1.1 * s, -0.9 * s, rpick(ROOF));
  }

  function makeCactus(g, s) {
    vbox(g, 0.55 * s, 2.2 * s, 0.55 * s, 0, 1.1 * s, 0, '#4f8a55');
    vbox(g, 0.9 * s, 0.4 * s, 0.35 * s, 0.5 * s, 1.4 * s, 0, '#57965d');
    vbox(g, 0.35 * s, 0.9 * s, 0.35 * s, 0.7 * s, 1.9 * s, 0, '#4f8a55');
    if (Math.random() < 0.5) {
      vbox(g, 0.9 * s, 0.4 * s, 0.35 * s, -0.5 * s, 1.0 * s, 0, '#57965d');
      vbox(g, 0.35 * s, 0.8 * s, 0.35 * s, -0.7 * s, 1.4 * s, 0, '#4f8a55');
    }
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
    const w = (1.6 + Math.random()) * s;
    const d = (1.6 + Math.random()) * s;
    const h = (1.2 + Math.random()) * s;
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
      const x = (Math.random() - 0.5) * 1.4 * s;
      const z = (Math.random() - 0.5) * 1.4 * s;
      vbox(g, 0.1 * s, 0.6 * s, 0.1 * s, x, 0.3 * s, z, '#4f8a55');
      vbox(g, 0.28 * s, 0.28 * s, 0.28 * s, x, 0.66 * s, z, rpick(cols));
    }
  }

  function makeGrass(g, s) {
    const c = rpick(['#5aa544', '#6cb74a', '#4f9a3c']);
    const n = 3 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 1.2 * s;
      const z = (Math.random() - 0.5) * 1.2 * s;
      vbox(g, 0.12 * s, (0.5 + Math.random() * 0.5) * s, 0.12 * s, x, 0.3 * s, z, c);
    }
  }

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

  function addFlag(parent, localY, color) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), vmat('#5a4636'));
    mast.position.set(0, localY + 0.8, 0);
    parent.add(mast);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.66), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }));
    fl.position.set(0.55, localY + 1.3, 0);
    parent.add(fl);
    wavers.push({ mesh: fl, ph: Math.random() * 6 });
  }

  function addChimney(parent, x, topY, z) {
    vbox(parent, 0.4, 0.9, 0.4, x, topY + 0.35, z, '#7a5733');
    const sm = new THREE.Group();
    sm.position.set(x, topY + 0.8, z);
    const puffs = [];
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(UNIT, new THREE.MeshStandardMaterial({ color: '#cdc8bd', transparent: true, opacity: 0.5, roughness: 1 }));
      sm.add(p);
      puffs.push(p);
    }
    parent.add(sm);
    smokers.push({ puffs, ph: Math.random() * 1 });
  }

  return {
    makeTree, makePine, makeRock, makeTemple, makeGopuram, makeWall, makeHouse, makeRuin,
    makePagoda, makeWindmill, makeWatermill, makeMarket, makeWell, makeFountain, makeStatue,
    makeObelisk, makeGate, makeMosque, makeLighthouse, makeCompound,
    makeCactus, makePalm, makeIcePine, makeAutumnTree, makeSnowHouse, makeBush, makeFlowers, makeGrass,
    makeSheep, makeDeer,
    addFlag, addChimney,
  };
}
