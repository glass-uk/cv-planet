import * as THREE from 'three';
import { UNIT } from './voxel.js';
import { surfaceFrame, forEachSphereSeed } from './terrain.js';

// Sky, sun, hemisphere light, clouds, a ringed moon, circling birds, stars,
// and a day/night cycle. Also drives the per-frame animation of the scenery
// registries (windmills, animals, chimney smoke, flags, jumping fish, lamps),
// since those tick on the same elapsed-time clock as everything here.

const SKY_DAY = new THREE.Color('#e9f1dd');
const SKY_NIGHT = new THREE.Color('#121a30');
const HEMI_GROUND = new THREE.Color('#9fbf7a');
const HEMI_GROUND_N = new THREE.Color('#2a3550');
const DAY_SPEED = 0.045; // radians/sec of the sun's arc

// Weather voices. The rover is always at the top of the globe, so a fixed box
// of falling points around it covers the whole view. Rain falls fast and
// straight; snow drifts slow with a sideways sway. `tint` greys the sky while
// it's coming down.
const WEATHER = {
  rain: { count: 520, fall: 62, sway: 0,   size: 0.4,  color: '#9fc4e0', opacity: 0.6, tint: new THREE.Color('#8b94a1') },
  snow: { count: 300, fall: 7,  sway: 2.2, size: 0.95, color: '#ffffff', opacity: 0.9, tint: new THREE.Color('#d2d8de') },
};

export function createAtmosphere(scene, planet, R) {
  // sky background + fog
  scene.background = new THREE.Color().copy(SKY_DAY);
  scene.fog = new THREE.Fog(SKY_DAY.getHex(), R * 2.4, R * 5);

  // hemisphere fill light
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9fbf7a, 0.7);
  scene.add(hemi);

  // sun (the only shadow caster)
  const sun = new THREE.DirectionalLight(0xffedc4, 1.4);
  sun.position.set(18, 40, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 220;
  const sc = sun.shadow.camera;
  sc.left = -65;
  sc.right = 65;
  sc.top = 65;
  sc.bottom = -65;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // clouds ride with the planet so they drift overhead as you drive
  const cloudGroup = new THREE.Group();
  planet.add(cloudGroup);
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
  forEachSphereSeed(40, (n) => {
    const c = makeCloud();
    c.position.copy(n.multiplyScalar(R + 22 + Math.random() * 16));
    c.quaternion.setFromRotationMatrix(surfaceFrame(c.position.clone().normalize()));
    c.rotateY(Math.random() * Math.PI);
    cloudGroup.add(c);
  });

  // ringed moon, fixed high in the sky
  const moon = new THREE.Group();
  const moonBall = new THREE.Mesh(
    new THREE.IcosahedronGeometry(8, 1),
    new THREE.MeshStandardMaterial({ color: '#e7d9c8', roughness: 1, flatShading: true, emissive: '#3a3326', emissiveIntensity: 0.4, fog: false }),
  );
  moon.add(moonBall);
  const moonRing = new THREE.Mesh(
    new THREE.TorusGeometry(13, 1.6, 3, 48),
    new THREE.MeshStandardMaterial({ color: '#cdb89a', roughness: 1, flatShading: true, fog: false, side: THREE.DoubleSide }),
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
    lw.position.x = -0.75;
    rw.position.x = 0.75;
    b.add(lw, rw);
    b.userData = {
      lw, rw,
      rad: R + 22 + Math.random() * 14,
      h: 10 + Math.random() * 22,
      sp: 0.18 + Math.random() * 0.16,
      ph: Math.random() * Math.PI * 2,
      flap: Math.random() * Math.PI * 2,
    };
    scene.add(b);
    birds.push(b);
  }

  // stars (revealed at night via opacity tween)
  const starGeo = new THREE.BufferGeometry();
  const starN = 700;
  const starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(240 + Math.random() * 60);
    starPos[i * 3] = v.x;
    starPos[i * 3 + 1] = Math.abs(v.y) * 0.7 + 20;
    starPos[i * 3 + 2] = v.z;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ── Weather (rain / snow) ─────────────────────────────────────────────────
  // One point cloud in a box around the rover; setDrawRange + material swaps
  // pick the active voice, so we only pay for one buffer.
  const WHALF = new THREE.Vector3(46, 30, 46);   // half-extents of the box
  const WCEN = new THREE.Vector3(0, R + 12, 0);  // centred above the rover
  const WMAX = 520;
  const wPos = new Float32Array(WMAX * 3);
  const seedDrop = (i) => {
    wPos[i * 3] = WCEN.x + (Math.random() * 2 - 1) * WHALF.x;
    wPos[i * 3 + 1] = WCEN.y + (Math.random() * 2 - 1) * WHALF.y;
    wPos[i * 3 + 2] = WCEN.z + (Math.random() * 2 - 1) * WHALF.z;
  };
  for (let i = 0; i < WMAX; i++) seedDrop(i);
  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
  const wMat = new THREE.PointsMaterial({ size: 0.8, transparent: true, opacity: 0.8, fog: false, depthWrite: false });
  const weatherPoints = new THREE.Points(wGeo, wMat);
  weatherPoints.frustumCulled = false;
  weatherPoints.visible = false;
  scene.add(weatherPoints);
  let weather = null; // null = clear, else a WEATHER entry

  function setWeather(type) {
    weather = WEATHER[type] || null;
    weatherPoints.visible = !!weather;
    if (weather) {
      wGeo.setDrawRange(0, weather.count);
      wMat.size = weather.size;
      wMat.color.set(weather.color);
      wMat.opacity = weather.opacity;
    }
  }

  function updateWeather(dt, elapsed) {
    if (!weather) return;
    const bottom = WCEN.y - WHALF.y;
    const h = WHALF.y * 2;
    for (let i = 0; i < weather.count; i++) {
      const yi = i * 3 + 1;
      wPos[yi] -= weather.fall * dt;
      if (weather.sway) {
        wPos[i * 3] += Math.sin(elapsed * 1.5 + i) * weather.sway * dt;
        wPos[i * 3 + 2] += Math.cos(elapsed * 1.3 + i) * weather.sway * dt;
      }
      if (wPos[yi] < bottom) {            // recycle to the top with fresh x/z
        wPos[yi] += h;
        wPos[i * 3] = WCEN.x + (Math.random() * 2 - 1) * WHALF.x;
        wPos[i * 3 + 2] = WCEN.z + (Math.random() * 2 - 1) * WHALF.z;
      }
    }
    wGeo.attributes.position.needsUpdate = true;
  }

  // ── Day/night state ──────────────────────────────────────────────────────
  let light01 = 1; // 1 = full day, 0 = full night
  const _sky = new THREE.Color();

  function updateDayNight(elapsed, dt, registries) {
    const a = elapsed * DAY_SPEED + 0.6;
    sun.position.set(Math.cos(a) * 140, Math.sin(a) * 140, 45);
    const target = THREE.MathUtils.clamp(Math.sin(a) * 1.5 + 0.35, 0, 1);
    light01 += (target - light01) * Math.min(1, 3 * dt);
    sun.intensity = 0.15 + light01 * 1.3;
    hemi.intensity = 0.18 + light01 * 0.55;
    hemi.groundColor.copy(HEMI_GROUND_N).lerp(HEMI_GROUND, light01);
    _sky.copy(SKY_NIGHT).lerp(SKY_DAY, light01);
    if (weather) _sky.lerp(weather.tint, 0.4); // grey the sky while it comes down
    scene.background.copy(_sky);
    scene.fog.color.copy(_sky);
    starMat.opacity = (1 - light01) * 0.9;
    const night = 1 - light01;
    moonBall.material.emissiveIntensity = 0.2 + night * 0.7;
    cloudMat.opacity = 0.35 + light01 * 0.57;
    for (const l of registries.lamps) l.material.emissiveIntensity = 0.4 + night * 1.6;
  }

  function animateScenery(elapsed, dt, registries) {
    cloudGroup.rotation.y += dt * 0.004; // gentle extra drift on top of riding with the planet
    for (const b of birds) {
      const u = b.userData;
      const ang = elapsed * u.sp + u.ph;
      b.position.set(Math.cos(ang) * u.rad, u.h, Math.sin(ang) * u.rad);
      b.rotation.y = -ang + Math.PI / 2;
      const f = Math.sin(elapsed * 9 + u.flap) * 0.6;
      u.lw.rotation.z = f;
      u.rw.rotation.z = -f;
    }
    for (const sp of registries.spinners) sp.mesh.rotation[sp.axis] += dt * sp.speed;
    // grazing animals: bob their heads, occasional hop
    for (const a of registries.animals) {
      const u = a.userData;
      u.hopT += dt;
      a.children.forEach((c, ci) => {
        if (ci === 1) c.rotation.x = Math.sin(elapsed * 2 + u.graze) * 0.25;
      });
      let hop = 0;
      if (u.hopT > u.hop) {
        const k = (u.hopT - u.hop);
        if (k < 0.4) {
          hop = Math.sin(k / 0.4 * Math.PI) * 0.6;
        } else {
          u.hopT = 0;
          u.hop = 3 + Math.random() * 4;
          a.rotateY((Math.random() - 0.5) * 1.2);
        }
      }
      a.position.copy(a.userData._n || (a.userData._n = a.position.clone()));
      a.position.addScaledVector(a.position.clone().normalize(), hop);
    }
    // chimney smoke: puffs rise and fade on a loop
    for (const sm of registries.smokers) {
      sm.puffs.forEach((p, pi) => {
        const t = ((elapsed * 0.6 + sm.ph + pi * 0.25) % 1);
        p.position.y = t * 2.4;
        p.position.x = Math.sin(t * 4 + pi) * 0.3;
        const sc2 = 0.3 + t * 0.7;
        p.scale.setScalar(sc2);
        p.material.opacity = (1 - t) * 0.55;
      });
    }
    for (const w of registries.wavers) w.mesh.rotation.y = Math.sin(elapsed * 4 + w.ph) * 0.35;
    // fish jump in lakes
    for (const fi of registries.fishes) {
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

  // Per-frame entry point. Returns the current 0..1 day/night value so the
  // rover can tint its emissives without re-deriving the cycle.
  function update(dt, elapsed, registries) {
    updateDayNight(elapsed, dt, registries);
    animateScenery(elapsed, dt, registries);
    updateWeather(dt, elapsed);
    return light01;
  }

  return { update, setWeather };
}
