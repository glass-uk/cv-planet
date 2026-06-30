import * as THREE from 'three';

// Builds the rover — a voxel-ish 4x4 parked at the top of the globe. Driving
// rotates the planet under it, so the rover itself only needs to ride the
// terrain (bob over hills, pitch on climbs, bank on cross-slopes), yaw to face
// its heading, and respond to the day/night cycle by lighting its headlights.

const FWD = -1;  // local axis the nose points along; -Z is into the scene
const WR = 0.8;  // wheel radius

export function createRover(scene, R) {
  const rover = new THREE.Group();
  rover.position.set(0, R, 0);
  scene.add(rover);

  const roverBody = new THREE.Group();
  roverBody.position.y = 0.05;
  rover.add(roverBody);

  // shared materials so meshes share state (e.g. emissive sweep at night)
  const paint = new THREE.MeshStandardMaterial({ color: '#ef6f4e', roughness: 0.6, metalness: 0.05 });
  const paint2 = new THREE.MeshStandardMaterial({ color: '#d65a3c', roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: '#6b6577', roughness: 0.7 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: '#5b5566', roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: '#d4ecf2', roughness: 0.2, metalness: 0.1 });
  const cream = new THREE.MeshStandardMaterial({ color: '#fdf7f0', roughness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#fff3cf', emissive: '#ffe7a8', emissiveIntensity: 0.85, roughness: 0.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#f47a7a', emissive: '#e85d5d', emissiveIntensity: 0.7, roughness: 0.4 });

  // belly / chassis (sits low between the wheels)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 4.0), paint);
  chassis.position.y = 1.05;
  chassis.castShadow = true;
  roverBody.add(chassis);
  const skid = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 3.4), dark);
  skid.position.y = 0.66;
  roverBody.add(skid);

  // FRONT (-Z): sloped nose, bull-bar, headlights
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.3), paint2);
  nose.position.set(0, 0.92, FWD * 1.95);
  nose.rotation.x = FWD * 0.32;
  nose.castShadow = true;
  roverBody.add(nose);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.18, 0.2), dark);
  bar.position.set(0, 0.74, FWD * 2.5);
  roverBody.add(bar);
  [-0.8, 0.8].forEach((x) => {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.18, 16), headMat);
    h.rotation.x = Math.PI / 2;
    h.position.set(x, 0.95, FWD * 2.45);
    roverBody.add(h);
  });

  // cabin toward the front; windshield faces forward
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.85, 1.7), cream);
  cabin.position.set(0, 1.78, FWD * 0.1);
  cabin.castShadow = true;
  roverBody.add(cabin);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.72, 0.12), glass);
  windshield.position.set(0, 1.86, FWD * 0.95);
  windshield.rotation.x = FWD * -0.32;
  roverBody.add(windshield);
  const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.66, 0.1), glass);
  rearWin.position.set(0, 1.86, -FWD * 0.85);
  roverBody.add(rearWin);

  // roof + a forward-pointing arrow so heading is unmistakable from above
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 1.45), dark);
  roof.position.set(0, 2.24, FWD * 0.1);
  roof.castShadow = true;
  roverBody.add(roof);
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 1.05, 3),
    new THREE.MeshStandardMaterial({ color: '#fbf7ee', roughness: 0.6 }),
  );
  arrow.rotation.x = FWD * Math.PI / 2;
  arrow.rotation.z = Math.PI;
  arrow.position.set(0, 2.31, FWD * 0.1);
  roverBody.add(arrow);

  // BACK (+Z, toward camera): cargo bed, taillights, flag
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 1.5), paint2);
  bed.position.set(0, 1.2, -FWD * 1.4);
  bed.castShadow = true;
  roverBody.add(bed);
  const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 1.15), dark);
  bedFloor.position.set(0, 1.46, -FWD * 1.4);
  roverBody.add(bedFloor);
  [-0.78, 0.78].forEach((x) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.12), tailMat);
    t.position.set(x, 0.98, -FWD * 2.0);
    roverBody.add(t);
  });

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 6), dark);
  mast.position.set(-0.95, 1.7, -FWD * 1.65);
  roverBody.add(mast);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.52),
    new THREE.MeshStandardMaterial({ color: '#f4a18f', side: THREE.DoubleSide, roughness: 0.7 }),
  );
  flag.position.set(-0.5, 2.28, -FWD * 1.65);
  roverBody.add(flag);

  // wheels — centers at y = WR so the bottoms touch the ground
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(WR, WR, 0.6, 20);
  const hubGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.62, 8);
  [[-1.42, FWD * 1.4], [1.42, FWD * 1.4], [-1.42, -FWD * 1.4], [1.42, -FWD * 1.4]].forEach(([x, z]) => {
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    tyre.rotation.z = Math.PI / 2;
    tyre.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, cream);
    hub.rotation.z = Math.PI / 2;
    w.add(tyre, hub);
    w.position.set(x, WR, z);
    roverBody.add(w);
    wheels.push(w);
  });

  // soft contact shadow blob under the rover
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = R + 0.06;
  scene.add(blob);

  // headlights (glow at night, off during the day)
  const headlights = [];
  [-0.8, 0.8].forEach((x) => {
    const sl = new THREE.SpotLight(0xfff2c0, 0, 70, 0.5, 0.6, 1.0);
    sl.position.set(x, 0.95, FWD * 2.45);
    sl.target.position.set(x * 0.4, -3.5, FWD * 16);
    roverBody.add(sl);
    roverBody.add(sl.target);
    headlights.push(sl);
  });

  // ── Per-frame state ──────────────────────────────────────────────────────
  let wheelSpin = 0;
  let groundY = R;
  let pitch = 0;
  let roll = 0;

  const _invPQ = new THREE.Quaternion();
  const _localUp = new THREE.Vector3();
  const _fwdW = new THREE.Vector3();
  const _rgtW = new THREE.Vector3();
  const _th = new THREE.Vector3();
  const clampPM = (v, m) => Math.max(-m, Math.min(m, v));

  // Called from the drive code: accumulates wheel rotation based on signed
  // throttle (move ∈ {-1, 0, 1}) and a boost multiplier.
  function applyDrive(move, boost, dt) {
    wheelSpin -= dt * move * 6 * boost;
  }

  // Per-frame visual update.
  // ctx: { heading, planet, terrainHeight, driving, light01 }
  function update(dt, elapsed, ctx) {
    const {
      heading, planet, terrainHeight, driving, light01,
    } = ctx;

    rover.rotation.y = heading;
    _invPQ.copy(planet.quaternion).invert();
    _localUp.set(0, 1, 0).applyQuaternion(_invPQ);
    groundY = R + terrainHeight(_localUp);
    rover.position.y = groundY;
    blob.position.y = groundY + 0.06;

    // sample the slope under the rover along its facing & side directions
    const eps = 0.06;
    const span = 2 * eps * R;
    _fwdW.set(-Math.sin(heading), 0, -Math.cos(heading)).applyQuaternion(_invPQ);
    _rgtW.set(Math.cos(heading), 0, -Math.sin(heading)).applyQuaternion(_invPQ);
    const hF = terrainHeight(_th.copy(_localUp).addScaledVector(_fwdW, eps).normalize());
    const hB = terrainHeight(_th.copy(_localUp).addScaledVector(_fwdW, -eps).normalize());
    const hR = terrainHeight(_th.copy(_localUp).addScaledVector(_rgtW, eps).normalize());
    const hL = terrainHeight(_th.copy(_localUp).addScaledVector(_rgtW, -eps).normalize());
    const pitchT = clampPM(Math.atan2(hF - hB, span), 0.42);
    const rollT = clampPM(Math.atan2(hR - hL, span), 0.42);
    pitch += (pitchT - pitch) * Math.min(1, 7 * dt);
    roll += (rollT - roll) * Math.min(1, 7 * dt);
    roverBody.rotation.x = pitch;
    roverBody.rotation.z = roll;
    roverBody.position.y = 0.05 + Math.sin(elapsed * 2) * 0.05 * (driving ? 1 : 0.3);
    for (const w of wheels) w.rotation.x = wheelSpin;
    flag.rotation.z = Math.sin(elapsed * 6) * 0.18;

    // night response
    const night = 1 - light01;
    for (const h of headlights) h.intensity = night * 3.2;
    headMat.emissiveIntensity = 0.4 + night * 1.4;
    tailMat.emissiveIntensity = 0.4 + night * 1.1;
  }

  function getGroundY() {
    return groundY;
  }

  return {
    rover, wheels, applyDrive, update, getGroundY,
  };
}
