import * as THREE from 'three';
import {
  vbox, vmat, mergeBoxMeshes, bakeStatic, setVCast,
  rpick, GREENS, SAND,
} from './voxel.js';
import { createBuilders } from './builders.js';
import { surfaceFrame, dirFromLatLon, forEachSphereSeed } from './terrain.js';
import { drawSignTexture } from './signs.js';

// Owns everything that lives on the planet: biomes, water, scenery, the road,
// the CV signs, and the knock-over collision system. Internally creates the
// scenery registries (spinners, lamps, smokers, wavers, etc.) so they're built
// and consumed in one place — atmosphere reads them via the returned handle.

const BIOMES_DEF = [
  { lat: -2,  lon: 105, rad: 0.62, type: 'desert' },
  { lat: 22,  lon: 168, rad: 0.42, type: 'desert' },
  { lat: 90,  lon: 0,   rad: 0.5,  type: 'snow' },
  { lat: -90, lon: 0,   rad: 0.5,  type: 'snow' },
  { lat: 8,   lon: 248, rad: 0.55, type: 'autumn' },
];

const BIOME_COLORS = {
  desert: ['#e3c188', '#d8b271', '#ddb978'],
  snow:   ['#eef3f6', '#e2eaef', '#dfe7ee'],
  autumn: ['#c98f3f', '#b87a36', '#6cb74a'],
};

export function createWorld({
  scene, planet, R, renderer, profile, stations, terrain, particles, audio, onScore,
}) {
  const { STATION_DIRS, terrainHeight, elevate, groundHeight } = terrain;

  // Scenery registries (filled during construction, read by atmosphere)
  const spinners = [];
  const lamps = [];
  const smokers = [];
  const wavers = [];
  const fishes = [];
  const animals = [];

  // Knockover + collision bookkeeping
  const props = [];                      // every knock-overable scenery group
  const WATER = [];                      // {dir, ang} no-build zones over water
  const PLACED = [];                     // {dir, pad} footprints, to keep a gap between things
  const staticTiles = [];                // ground/road/river tiles, merged after the build
  const YUP = new THREE.Vector3(0, 1, 0);
  function nearWater(n) { for (const w of WATER) if (w.dir.angleTo(n) < w.ang) return true; return false; }
  function tooClose(n, pad) { for (const p of PLACED) if (n.angleTo(p.dir) < pad + p.pad) return true; return false; }

  const builders = createBuilders({ spinners, lamps, smokers, wavers });
  const BIOMES = BIOMES_DEF.map((b) => ({ dir: dirFromLatLon(b.lat, b.lon), rad: b.rad, type: b.type }));
  function biomeAt(n) {
    for (const b of BIOMES) if (b.dir.angleTo(n) < b.rad) return b.type;
    return 'grass';
  }

  // ── Ground paint: tinted tiles to mark a biome patch ────────────────────
  const groundTileGeo = new THREE.BoxGeometry(3.4, 0.16, 3.4);
  function paintGround(center, rad, colors) {
    const count = Math.round(rad * rad * 80);
    for (let i = 0; i < count; i++) {
      const n = new THREE.Vector3().randomDirection();
      n.lerp(center, 0.8 + Math.random() * 0.18).normalize(); // bias toward the cap
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

  // ── Water: lakes (with fish) and rivers (with a bridge) ─────────────────
  function addLake(center, rad) {
    WATER.push({ dir: center.clone(), ang: rad / R + 0.07 });
    const seg = 28;
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(rad, rad * 0.92, 0.4, seg),
      new THREE.MeshStandardMaterial({ color: '#4a90c2', roughness: 0.4, flatShading: true }),
    );
    water.position.copy(center.clone().multiplyScalar(elevate(center) - 0.25));
    water.quaternion.setFromRotationMatrix(surfaceFrame(center));
    water.receiveShadow = true;
    planet.add(water);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(rad, 0.5, 5, seg),
      new THREE.MeshStandardMaterial({ color: '#caa46f', roughness: 1, flatShading: true }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.2;
    const rimG = new THREE.Group();
    rimG.position.copy(center.clone().multiplyScalar(elevate(center)));
    rimG.quaternion.setFromRotationMatrix(surfaceFrame(center));
    rimG.add(rim);
    planet.add(rimG);
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
      WATER.push({ dir: n.clone(), ang: 0.09 });
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.2, 2.6),
        new THREE.MeshStandardMaterial({ color: '#4a90c2', roughness: 0.4, flatShading: true }),
      );
      tile.position.copy(n.clone().multiplyScalar(elevate(n) - 0.12));
      tile.quaternion.setFromRotationMatrix(surfaceFrame(n));
      tile.receiveShadow = true;
      planet.add(tile);
      staticTiles.push(tile);
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

  // ── Scenery placement (biome-aware) ─────────────────────────────────────
  function placeScenery() {
    const {
      makeCactus, makePalm, makeObelisk, makeRuin, makeRock, makeMarket, makeMosque,
      makeIcePine, makeSnowHouse,
      makeAutumnTree, makeHouse, makeWell, makeStatue,
      makeGopuram, makeTemple, makePagoda, makeCompound, makeWindmill, makeWatermill,
      makeFountain, makeGate, makeLighthouse, makeWall, makePine, makeTree,
      addFlag, addChimney,
    } = builders;

    forEachSphereSeed(360, (n) => {
      if (STATION_DIRS.some((d) => d.angleTo(n) < 0.17)) return;
      if (nearWater(n)) return;

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
      } else {
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
      if (tooClose(n, pad)) return;
      PLACED.push({ dir: n, pad });
      bakeStatic(g, true);
      props.push(g);
      planet.add(g);
    });
  }

  // Decorative mounds for terrain relief — knockable, don't score
  function placeMounds() {
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
      g.userData.ko = 'up';
      g.userData.isBuilding = false;
      bakeStatic(g, true);
      props.push(g);
      planet.add(g);
    }
  }

  function placeAnimals() {
    const { makeSheep, makeDeer } = builders;
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
      animals.push(g);
      planet.add(g);
    }
  }

  // Fills the gaps with clusters of vegetation (clumped, never inside buildings)
  function fillClusters() {
    const {
      makeCactus, makeRock, makeIcePine, makeAutumnTree, makeBush, makeTree, makePine,
    } = builders;

    setVCast(false); // filler doesn't cast shadows (keeps the frame cheap)
    const seeds = 26;
    for (let i = 0; i < seeds; i++) {
      const c = new THREE.Vector3().randomDirection();
      if (STATION_DIRS.some((d) => d.angleTo(c) < 0.2)) continue;
      if (nearWater(c)) continue;
      const biome = biomeAt(c);
      const count = 3 + (Math.random() * 4 | 0);
      for (let k = 0; k < count; k++) {
        const n = c.clone().addScaledVector(new THREE.Vector3().randomDirection(), Math.random() * 0.11).normalize();
        if (nearWater(n)) continue;
        if (tooClose(n, 0.035)) continue;
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
        } else if (roll < 0.4) {
          makeTree(g, s);
        } else if (roll < 0.66) {
          makePine(g, s);
        } else {
          makeBush(g, s);
        }
        g.userData.ko = 'up';
        g.userData.isBuilding = false;
        props.push(g);
        bakeStatic(g, false);
        planet.add(g);
      }
    }
    setVCast(true);
  }

  // ── Grass tufts: dense ground cover on the green biome ─────────────────
  function scatterGrass() {
    const { makeGrass } = builders;
    forEachSphereSeed(280, (n) => {
      // small jitter so the spiral pattern isn't visible
      n.addScaledVector(new THREE.Vector3().randomDirection(), Math.random() * 0.04).normalize();
      if (biomeAt(n) !== 'grass') return;
      if (STATION_DIRS.some((d) => d.angleTo(n) < 0.17)) return;
      if (nearWater(n)) return;
      if (tooClose(n, 0.022)) return; // skip footprints of buildings, allow tight clumps elsewhere
      PLACED.push({ dir: n, pad: 0.022 });
      const g = new THREE.Group();
      g.position.copy(n.clone().multiplyScalar(elevate(n)));
      g.quaternion.setFromRotationMatrix(surfaceFrame(n));
      g.rotateY(Math.random() * Math.PI * 2);
      const s = 0.6 + Math.random() * 0.4;
      makeGrass(g, s);
      bakeStatic(g, false); // bakeStatic always merges (makeGrass emits ≥3 blades), so castShadow=false on the merged mesh is enough
      planet.add(g);
    });
  }

  // ── Road: a paved path linking the landmarks in a loop ──────────────────
  // Runs before any scenery placement so the road tiles register footprints in
  // PLACED — that's how trees and grass keep off the path instead of poking
  // through it.
  const ROAD_PAD = 0.04;
  function addRoad() {
    const tileGeo = new THREE.BoxGeometry(2.5, 0.18, 2.9);
    const tileMat = new THREE.MeshStandardMaterial({ color: '#c9a877', roughness: 1, flatShading: true });
    const edgeMat = new THREE.MeshStandardMaterial({ color: '#b48a55', roughness: 1, flatShading: true });
    for (let s = 0; s < STATION_DIRS.length; s++) {
      const a = STATION_DIRS[s];
      const b = STATION_DIRS[(s + 1) % STATION_DIRS.length];
      const ang = a.angleTo(b);
      const steps = Math.max(2, Math.round(ang / 0.05));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const n = new THREE.Vector3().copy(a).lerp(b, t).normalize();
        const tile = new THREE.Mesh(tileGeo, k % 5 === 0 ? edgeMat : tileMat);
        tile.position.copy(n.clone().multiplyScalar(elevate(n) + 0.05));
        tile.quaternion.setFromRotationMatrix(surfaceFrame(n));
        tile.rotateY(Math.random() * 0.3 - 0.15);
        tile.receiveShadow = true;
        planet.add(tile);
        staticTiles.push(tile);
        PLACED.push({ dir: n, pad: ROAD_PAD });
      }
    }
  }

  // ── Signs: a canvas-texture CV card on a post, planted at each station ──
  const signMeshes = [];
  function placeSigns() {
    stations.forEach((station, i) => {
      const n = STATION_DIRS[i];
      const frame = surfaceFrame(n);
      const group = new THREE.Group();
      group.position.copy(n.clone().multiplyScalar(elevate(n)));
      group.quaternion.setFromRotationMatrix(frame);
      planet.add(group);

      // stepped sandstone platform topped with a station-color mat
      vbox(group, 7.6, 0.6, 7.6, 0, 0.3, 0, SAND[1]);
      vbox(group, 6.0, 0.5, 6.0, 0, 0.85, 0, SAND[0]);
      vbox(group, 4.6, 0.22, 4.6, 0, 1.2, 0, station.color);
      const platTop = 1.1;

      const panelW = 8;
      const panelH = 10;
      const boardDepth = 0.5;
      const panelY = 6.7;

      // two square posts flanking the board (in its plane, so neither face is blocked)
      const postH = 11.5;
      const postX = panelW / 2 + 0.6;
      [-postX, postX].forEach((x) => vbox(group, 0.6, postH, 0.6, x, platTop + postH / 2, 0, '#8a6a42'));
      vbox(group, 2 * postX + 0.6, 0.7, 0.8, 0, platTop + postH - 0.25, 0, '#7a5733');

      // chunky wood frame + corner accent cubes
      const fr = 0.5;
      const frD = boardDepth + 0.35;
      vbox(group, panelW + 2 * fr, fr, frD, 0, panelY + panelH / 2 + fr / 2, 0, '#a8895c'); // top
      vbox(group, panelW + 2 * fr, fr, frD, 0, panelY - panelH / 2 - fr / 2, 0, '#a8895c'); // bottom
      vbox(group, fr, panelH, frD, -(panelW / 2 + fr / 2), panelY, 0, '#a8895c');           // left
      vbox(group, fr, panelH, frD, (panelW / 2 + fr / 2), panelY, 0, '#a8895c');            // right
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) => vbox(
        group, fr + 0.2, fr + 0.2, frD + 0.06,
        sx * (panelW / 2 + fr / 2), panelY + sy * (panelH / 2 + fr / 2), 0, station.color,
      ));

      // solid board panel behind the readable faces
      vbox(group, panelW + 0.2, panelH + 0.2, boardDepth, 0, panelY, 0, '#faf5e9');

      // a readable CV face on each side; rotating the back 180° keeps text un-mirrored
      [[0, boardDepth / 2 + 0.02], [Math.PI, -(boardDepth / 2 + 0.02)]].forEach(([rotY, z]) => {
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(panelW, panelH),
          new THREE.MeshBasicMaterial({ map: drawSignTexture(station, profile, renderer), side: THREE.FrontSide, toneMapped: false }),
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
  }

  // ── Build everything ─────────────────────────────────────────────────────
  for (const b of BIOMES) paintGround(b.dir, b.rad, BIOME_COLORS[b.type]);
  [dirFromLatLon(-24, 24), dirFromLatLon(38, 300), dirFromLatLon(-12, 196)].forEach((d) => {
    if (STATION_DIRS.some((s) => s.angleTo(d) < 0.25)) return;
    addLake(d, 4 + Math.random() * 2);
  });
  addRiver(dirFromLatLon(-40, 40), dirFromLatLon(10, 36));
  addRiver(dirFromLatLon(50, 280), dirFromLatLon(28, 308));
  addRoad();      // before scenery so tile footprints land in PLACED
  placeScenery();
  placeMounds();
  placeAnimals();
  fillClusters();
  scatterGrass();
  mergeBoxMeshes(staticTiles, planet, false); // collapse all flat tiles into one mesh
  placeSigns();

  // ── Knock-over collisions: rover drives into props, props topple, then respawn ──
  const _p = new THREE.Vector3();
  const _wq = new THREE.Quaternion();
  function updateProps(dt, knocking) {
    for (const g of props) {
      const u = g.userData;
      if (u.ko === 'falling') {
        u.t += dt;
        const k = Math.min(1, u.t / u.dur);
        g.quaternion.slerpQuaternions(u.q0, u.q1, 1 - (1 - k) ** 3);
        if (k >= 1) { u.ko = 'down'; u.t = 0; }
        continue;
      }
      if (u.ko === 'down') {
        u.t += dt;
        if (u.t < u.respawn) continue;
        // wait until it's away from the rover before springing back up
        _p.copy(g.position).applyQuaternion(planet.quaternion);
        if (_p.y > R * 0.86 && Math.hypot(_p.x, _p.z) < 5) continue;
        u.ko = 'rising';
        u.t = 0;
        u.dur = 0.5;
        u.q0 = g.quaternion.clone();
        u.q1 = u.upright.clone();
        continue;
      }
      if (u.ko === 'rising') {
        u.t += dt;
        const k = Math.min(1, u.t / u.dur);
        const e = k < 1 ? 1 - (1 - k) ** 3 : 1;
        g.quaternion.slerpQuaternions(u.q0, u.q1, e);
        const pop = Math.sin(Math.min(k, 1) * Math.PI) * 0.5;
        g.scale.setScalar(1 + pop * 0.12);
        if (k >= 1) { u.ko = 'up'; g.scale.setScalar(1); g.quaternion.copy(u.upright); }
        continue;
      }
      if (!knocking) continue;
      _p.copy(g.position).applyQuaternion(planet.quaternion); // prop world position
      if (_p.y < R * 0.86) continue;                          // only near the rover at the top
      if (Math.hypot(_p.x, _p.z) > 3.2) continue;
      // topple it over, away from the rover
      _wq.copy(planet.quaternion).multiply(g.quaternion);
      const push = new THREE.Vector3(_p.x, 0, _p.z).normalize().applyQuaternion(_wq.invert());
      push.y = 0;
      if (push.lengthSq() < 1e-4) push.set(1, 0, 0);
      push.normalize();
      const axis = new THREE.Vector3().crossVectors(YUP, push).normalize();
      if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
      u.ko = 'falling';
      u.t = 0;
      u.dur = 0.45 + Math.random() * 0.25;
      u.respawn = 1.5 + Math.random() * 1.5;
      u.upright = g.quaternion.clone();
      u.q0 = g.quaternion.clone();
      if (u.isBuilding) onScore();
      u.q1 = g.quaternion.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2 * (0.92 + Math.random() * 0.16)),
      );
      particles.spawnDebris(_p.clone());
      audio.crash();
    }
  }

  return {
    signMeshes,
    updateProps,
    registries: {
      spinners, lamps, smokers, wavers, fishes, animals,
    },
  };
}
