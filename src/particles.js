import * as THREE from 'three';
import { rpick, SAND } from './voxel.js';

// Particle pool: reuses PCOUNT meshes in a ring buffer so the world only ever
// pays for them once. Used for the rover's dust trail and the debris bursts
// thrown when scenery is knocked over.

const PCOUNT = 140;

export function createParticles(scene) {
  const pGeo = new THREE.BoxGeometry(1, 1, 1);
  const pPool = [];
  for (let i = 0; i < PCOUNT; i++) {
    const m = new THREE.Mesh(pGeo, new THREE.MeshStandardMaterial({ color: '#cdbfa0', roughness: 1, flatShading: true }));
    m.visible = false;
    m.castShadow = false;
    scene.add(m);
    pPool.push({ m, life: 0, max: 1, baseSize: 1, vel: new THREE.Vector3() });
  }
  let pNext = 0;

  function spawnParticle(pos, vel, color, size, life) {
    const p = pPool[pNext];
    pNext = (pNext + 1) % PCOUNT;
    p.m.visible = true;
    p.m.position.copy(pos);
    p.m.scale.setScalar(size);
    p.m.material.color.set(color);
    p.m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    p.vel.copy(vel);
    p.life = life;
    p.max = life;
    p.baseSize = size;
  }

  function spawnDebris(pos) {
    const n = 6 + (Math.random() * 5 | 0);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 11, 6 + Math.random() * 9, (Math.random() - 0.5) * 11);
      spawnParticle(pos, v, rpick(SAND), 0.5 + Math.random() * 0.5, 0.8 + Math.random() * 0.5);
    }
  }

  // origin: world position to emit from (a vehicle's trailing emitter point).
  // dir: 1 = driving forward, -1 = reversing.
  function spawnDust(origin, dir, heading, groundY) {
    const bx = Math.sin(heading) * dir;
    const bz = Math.cos(heading) * dir;
    const sp = 7 + Math.random() * 6;
    const v = new THREE.Vector3(
      bx * sp + (Math.random() - 0.5) * 2,
      1.0 + Math.random() * 1.6,
      bz * sp + (Math.random() - 0.5) * 2,
    );
    spawnParticle(new THREE.Vector3(origin.x, groundY + 0.18, origin.z), v, '#d8cdb4', 0.28 + Math.random() * 0.22, 0.85 + Math.random() * 0.35);
  }

  function update(dt, groundY) {
    for (const p of pPool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.m.visible = false;
        continue;
      }
      p.vel.y -= 24 * dt;
      p.m.position.addScaledVector(p.vel, dt);
      if (p.m.position.y < groundY + 0.15) {
        p.m.position.y = groundY + 0.15;
        p.vel.set(p.vel.x * 0.4, 0, p.vel.z * 0.4);
      }
      p.m.rotation.x += dt * 5;
      p.m.rotation.z += dt * 4;
      p.m.scale.setScalar(p.baseSize * (0.35 + 0.65 * (p.life / p.max)));
    }
  }

  return { spawnDust, spawnDebris, update };
}
