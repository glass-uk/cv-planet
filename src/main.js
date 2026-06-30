import * as THREE from 'three';
import { profile, stations } from './cvData.js';
import { createTerrain } from './terrain.js';
import { createRover } from './rover.js';
import { createParticles } from './particles.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createAtmosphere } from './atmosphere.js';
import { createInput } from './input.js';
import { createUI } from './ui.js';
import { drawSignTexture } from './signs.js';

// ════════════════════════════════════════════════════════════════════════
//  CV PLANET — drive a rover over a globe and read your CV off the signs.
//
//  The rover stays parked at the top of the globe; driving rotates the
//  whole planet underneath it. Click-to-travel slerps the planet's
//  orientation until the chosen station sits upright in front of the camera.
//
//  This file owns the renderer, scene, camera, planet group, and the tick
//  loop that wires everything together. Each module owns its own state.
// ════════════════════════════════════════════════════════════════════════

const CONFIG = {
  radius: 32,
  driveSpeed: 0.5,     // radians/sec the planet rolls when driving
  turnSpeed: 1.9,      // radians/sec the rover yaws when steering
  travelSpeed: 2.2,    // slerp rate when auto-travelling
  ocean: '#57a83f',    // vibrant grass — the globe surface
};

const R = CONFIG.radius;

// ── Renderer / scene / camera ─────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 600);

// ── Camera: orbit around the rover (drag horizontally to rotate, vertically to tilt) ──
const camTarget = new THREE.Vector3(0, R + 7, 0);
const camDist = 39.3;
const DEF_AZ = 0;
const DEF_EL = 0.26;
let camAz = DEF_AZ;
let camEl = DEF_EL;
function updateCamera() {
  const ce = Math.cos(camEl);
  const se = Math.sin(camEl);
  camera.position.set(
    camTarget.x + camDist * Math.sin(camAz) * ce,
    camTarget.y + camDist * se,
    camTarget.z + camDist * Math.cos(camAz) * ce,
  );
  camera.lookAt(camTarget);
}
updateCamera();

// ── The planet: everything that "moves" is a child of this group ──────────
const planet = new THREE.Group();
scene.add(planet);

const terrain = createTerrain(stations, R);

// ── Globe mesh, displaced by the terrain heightfield ──────────────────────
const globeGeo = new THREE.IcosahedronGeometry(R, 24);
const globe = new THREE.Mesh(
  globeGeo,
  new THREE.MeshStandardMaterial({ color: CONFIG.ocean, roughness: 0.95, metalness: 0, flatShading: true }),
);
globe.receiveShadow = true;
globe.castShadow = true;
planet.add(globe);
(() => {
  const pos = globeGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const r = terrain.elevate(v);
    pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  pos.needsUpdate = true;
  globeGeo.computeVertexNormals();
})();

// ── Modules ───────────────────────────────────────────────────────────────
const rover = createRover(scene, R);
const particles = createParticles(scene, { wheels: rover.wheels });
const audio = createAudio({ muted: localStorage.getItem('cvMuted') === '1' });

// The world builds biomes/water/scenery/road/signs and owns the scenery
// registries (spinners, lamps, animals, etc.) that the atmosphere animates.
let ui; // declared up-front so updateProps can call ui.addScore via the closure
const world = createWorld({
  scene, planet, R, renderer, profile, stations, terrain, particles, audio,
  onScore: () => ui.addScore(),
});

const atmosphere = createAtmosphere(scene, planet, R);

ui = createUI({
  profile,
  stations,
  audio,
  onTravelRequested: (i) => travelTo(i),
});

const input = createInput({
  domElement: renderer.domElement,
  camera,
  signMeshes: world.signMeshes,
  onCameraDrag: (dx, dy) => {
    camAz -= dx * 0.005;
    camEl = Math.max(0.06, Math.min(1.35, camEl - dy * 0.005));
  },
  onCancelTravel: cancelTravel,
  onTravelRequested: (i) => travelTo(i),
  onTogglePhoto: () => ui.togglePhoto(),
});

// ── Drive + travel state ──────────────────────────────────────────────────
let heading = 0;            // rover yaw (radians)
let activeStation = -1;
let traveling = false;
const targetQuat = new THREE.Quaternion();

function cancelTravel() { traveling = false; }

function travelTo(i) {
  if (i < 0 || i >= stations.length) return;
  activeStation = i;
  targetQuat.copy(stations[i]._targetQuat);
  traveling = true;
  // normalize heading so the slerp back to forward takes the short way
  heading = ((heading + Math.PI) % (Math.PI * 2)) - Math.PI;
  ui.setActiveStation(i);
}

// ── Resize ────────────────────────────────────────────────────────────────
addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Main loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const _axis = new THREE.Vector3();
let engineSpeed = 0; // low-pass-filtered throttle 0..1, drives engine pitch

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const { keys } = input;

  if (traveling) {
    planet.quaternion.slerp(targetQuat, 1 - Math.exp(-CONFIG.travelSpeed * dt));
    heading += -heading * (1 - Math.exp(-6 * dt));
    camAz += (DEF_AZ - camAz) * (1 - Math.exp(-4 * dt));
    camEl += (DEF_EL - camEl) * (1 - Math.exp(-4 * dt));
    if (planet.quaternion.angleTo(targetQuat) < 0.002) {
      planet.quaternion.copy(targetQuat);
      traveling = false;
    }
  } else {
    if (keys.left) heading += CONFIG.turnSpeed * dt;
    if (keys.right) heading -= CONFIG.turnSpeed * dt;

    let move = 0;
    if (keys.up) move += 1;
    if (keys.down) move -= 1;
    if (move !== 0) {
      _axis.set(Math.cos(heading), 0, -Math.sin(heading));
      const bf = keys.boost ? 1.9 : 1;
      planet.rotateOnWorldAxis(_axis, CONFIG.driveSpeed * dt * move * bf);
      rover.applyDrive(move, bf, dt);
      // driving away from a station de-selects it
      if (activeStation >= 0 && planet.quaternion.angleTo(stations[activeStation]._targetQuat) > 0.18) {
        activeStation = -1;
        ui.clearActiveStation();
      }
    }
  }

  const driving = !traveling && (keys.up || keys.down);
  const boosting = driving && keys.boost;
  world.updateProps(dt, driving);

  // engine + dust use the previous frame's groundY (rover.update sets the new one below)
  const groundY = rover.getGroundY();
  engineSpeed += ((driving ? 1 : 0) - engineSpeed) * Math.min(1, 8 * dt);
  audio.engine(engineSpeed * (boosting ? 1.4 : 1));
  if (driving) {
    const ddir = keys.up ? 1 : -1;
    if (Math.random() < 0.85) particles.spawnDust(ddir, heading, groundY);
    if (Math.random() < 0.5) particles.spawnDust(ddir, heading, groundY);
    if (boosting) {
      particles.spawnDust(ddir, heading, groundY);
      if (Math.random() < 0.7) particles.spawnDust(ddir, heading, groundY);
    }
  }
  particles.update(dt, groundY);

  const light01 = atmosphere.update(dt, clock.elapsedTime, world.registries);

  // boost FOV kick
  const targetFov = boosting ? 47 : 40;
  if (Math.abs(camera.fov - targetFov) > 0.04) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 6 * dt);
    camera.updateProjectionMatrix();
  }

  ui.drawCompass({
    camAz, planetQuat: planet.quaternion, heading, stationDirs: terrain.STATION_DIRS,
  });

  rover.update(dt, clock.elapsedTime, {
    heading,
    planet,
    terrainHeight: terrain.terrainHeight,
    driving,
    light01,
  });

  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ── Boot ──────────────────────────────────────────────────────────────────
function start() {
  const loader = document.getElementById('loader');
  loader.classList.add('hide');
  setTimeout(() => loader.remove(), 700);

  document.querySelector('.start-name').textContent = profile.name || '';
  document.querySelector('.start-role').textContent = profile.role || '';
  const startEl = document.getElementById('start');
  document.getElementById('startBtn').addEventListener('click', () => {
    audio.init();
    startEl.classList.add('hide');
    setTimeout(() => startEl.remove(), 700);
  });

  clock.start();
  tick();
}

// Wait for the font so sign textures render with the right typeface (but cap
// the wait so a stalled font never blocks the page).
if (document.fonts && document.fonts.ready) {
  Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(() => {
    world.signMeshes.forEach((m) => {
      const s = stations[m.userData.stationIndex];
      m.material.map.dispose();
      m.material.map = drawSignTexture(s, profile, renderer);
      m.material.needsUpdate = true;
    });
    start();
  });
} else {
  start();
}
