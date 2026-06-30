import * as THREE from 'three';

// Builds the vehicle you drive — parked at the top of the globe while the planet
// rotates underneath. Three bodies are built up front (car, plane, rocket) and
// only the active one is shown; setVehicle() flips between them. Each body owns
// its own per-frame animation (wheels, propeller, thruster, night lights) and
// reports the points dust should kick up from. The host handles everything
// shared: riding the terrain, yawing to face the heading, and the ground blob.

const FWD = -1;  // local axis the nose points along; -Z is into the scene
const WR = 0.8;  // car wheel radius

// ── Car: a chunky voxel 4x4 ─────────────────────────────────────────────────
function buildCar() {
  const group = new THREE.Group();

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
  group.add(chassis);
  const skid = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 3.4), dark);
  skid.position.y = 0.66;
  group.add(skid);

  // FRONT (-Z): sloped nose, bull-bar, headlights
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.3), paint2);
  nose.position.set(0, 0.92, FWD * 1.95);
  nose.rotation.x = FWD * 0.32;
  nose.castShadow = true;
  group.add(nose);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.18, 0.2), dark);
  bar.position.set(0, 0.74, FWD * 2.5);
  group.add(bar);
  [-0.8, 0.8].forEach((x) => {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.18, 16), headMat);
    h.rotation.x = Math.PI / 2;
    h.position.set(x, 0.95, FWD * 2.45);
    group.add(h);
  });

  // cabin toward the front; windshield faces forward
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.85, 1.7), cream);
  cabin.position.set(0, 1.78, FWD * 0.1);
  cabin.castShadow = true;
  group.add(cabin);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.72, 0.12), glass);
  windshield.position.set(0, 1.86, FWD * 0.95);
  windshield.rotation.x = FWD * -0.32;
  group.add(windshield);
  const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.66, 0.1), glass);
  rearWin.position.set(0, 1.86, -FWD * 0.85);
  group.add(rearWin);

  // roof + a forward-pointing arrow so heading is unmistakable from above
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 1.45), dark);
  roof.position.set(0, 2.24, FWD * 0.1);
  roof.castShadow = true;
  group.add(roof);
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 1.05, 3),
    new THREE.MeshStandardMaterial({ color: '#fbf7ee', roughness: 0.6 }),
  );
  arrow.rotation.x = FWD * Math.PI / 2;
  arrow.rotation.z = Math.PI;
  arrow.position.set(0, 2.31, FWD * 0.1);
  group.add(arrow);

  // BACK (+Z, toward camera): cargo bed, taillights, flag
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 1.5), paint2);
  bed.position.set(0, 1.2, -FWD * 1.4);
  bed.castShadow = true;
  group.add(bed);
  const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 1.15), dark);
  bedFloor.position.set(0, 1.46, -FWD * 1.4);
  group.add(bedFloor);
  [-0.78, 0.78].forEach((x) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.12), tailMat);
    t.position.set(x, 0.98, -FWD * 2.0);
    group.add(t);
  });

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 6), dark);
  mast.position.set(-0.95, 1.7, -FWD * 1.65);
  group.add(mast);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.52),
    new THREE.MeshStandardMaterial({ color: '#f4a18f', side: THREE.DoubleSide, roughness: 0.7 }),
  );
  flag.position.set(-0.5, 2.28, -FWD * 1.65);
  group.add(flag);

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
    group.add(w);
    wheels.push(w);
  });

  // headlights (glow at night, off during the day)
  const headlights = [];
  [-0.8, 0.8].forEach((x) => {
    const sl = new THREE.SpotLight(0xfff2c0, 0, 70, 0.5, 0.6, 1.0);
    sl.position.set(x, 0.95, FWD * 2.45);
    sl.target.position.set(x * 0.4, -3.5, FWD * 16);
    group.add(sl);
    group.add(sl.target);
    headlights.push(sl);
  });

  function animate({ elapsed, night, spin }) {
    for (const w of wheels) w.rotation.x = spin;
    flag.rotation.z = Math.sin(elapsed * 6) * 0.18;
    for (const h of headlights) h.intensity = night * 3.2;
    headMat.emissiveIntensity = 0.4 + night * 1.4;
    tailMat.emissiveIntensity = 0.4 + night * 1.1;
  }

  return {
    group,
    animate,
    rearEmit: [wheels[2], wheels[3]],   // trailing wheels when driving forward
    frontEmit: [wheels[0], wheels[1]],
    hover: 0,
    bodyY: 0.05,
    blobOpacity: 0.12,
    fly: false,
  };
}

// ── Plane: a stubby low-poly prop plane ─────────────────────────────────────
function buildPlane() {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: '#ef6f4e', roughness: 0.55, metalness: 0.05 });
  const wing = new THREE.MeshStandardMaterial({ color: '#fdf7f0', roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: '#6b6577', roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: '#d4ecf2', roughness: 0.2, metalness: 0.1 });
  const navMat = new THREE.MeshStandardMaterial({ color: '#fff3cf', emissive: '#ffd66a', emissiveIntensity: 0.5, roughness: 0.4 });

  const Y = 1.6; // body centre height above the gear contact point

  // fuselage
  const fus = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 5.2), body);
  fus.position.set(0, Y, 0);
  fus.castShadow = true;
  group.add(fus);
  // nose cone up front (-Z)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.4, 16), dark);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, Y, FWD * 3.1);
  group.add(nose);
  // tail boom + fin + stabiliser at the back (+Z)
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.6), body);
  tail.position.set(0, Y + 0.2, -FWD * 3.0);
  group.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 1.1), body);
  fin.position.set(0, Y + 1.1, -FWD * 3.1);
  fin.castShadow = true;
  group.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.18, 0.9), wing);
  stab.position.set(0, Y + 0.3, -FWD * 3.1);
  group.add(stab);

  // main wing (one wide thin slab) + cockpit
  const mainWing = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.3, 1.7), wing);
  mainWing.position.set(0, Y + 0.1, FWD * 0.2);
  mainWing.castShadow = true;
  group.add(mainWing);
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.6), glass);
  cockpit.position.set(0, Y + 0.95, FWD * 0.6);
  group.add(cockpit);

  // nav lights at the wingtips (glow at night)
  [-4.1, 4.1].forEach((x) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), navMat);
    l.position.set(x, Y + 0.1, FWD * 0.2);
    group.add(l);
  });

  // spinning propeller at the nose (spins around the nose axis, Z)
  const prop = new THREE.Group();
  prop.position.set(0, Y, FWD * 3.85);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8), dark);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  [0, Math.PI / 2].forEach((r) => {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.0, 0.12), dark);
    blade.rotation.z = r;
    prop.add(blade);
  });
  group.add(prop);

  // fixed landing gear so it reads as airborne rather than floating
  const gear = [];
  [[-1.7, FWD * 0.4], [1.7, FWD * 0.4]].forEach(([x, z]) => {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), dark);
    strut.position.set(x, Y - 0.7, z);
    group.add(strut);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12), dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, Y - 1.25, z);
    group.add(w);
    gear.push(w);
  });

  function animate({ driving, boosting, night }) {
    // prop idles, blurs faster under power
    const rate = driving ? (boosting ? 1.8 : 1.1) : 0.35;
    prop.rotation.z += rate;
    navMat.emissiveIntensity = 0.35 + night * 1.3;
  }

  return {
    group,
    animate,
    rearEmit: gear,
    frontEmit: gear,
    hover: 3.6,
    bodyY: 0,
    blobOpacity: 0.08,
    fly: true,
    bank: 0.55,        // rolls hard into turns
  };
}

// ── Rocket: a finned ship that flies nose-forward ───────────────────────────
function buildRocket() {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: '#fdf7f0', roughness: 0.5, metalness: 0.1 });
  const accent = new THREE.MeshStandardMaterial({ color: '#ef6f4e', roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#6b6577', roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: '#9fd8e6', roughness: 0.2, metalness: 0.1 });
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb24a', transparent: true, opacity: 0.9, toneMapped: false });

  const Y = 1.7; // fly height of the body centre within the group

  // fuselage lying along Z, nose pointing forward (-Z)
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 4.4, 18), shell);
  fus.rotation.x = Math.PI / 2;
  fus.position.set(0, Y, 0);
  fus.castShadow = true;
  group.add(fus);
  // nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.8, 18), accent);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, Y, FWD * 3.1);
  nose.castShadow = true;
  group.add(nose);
  // accent band
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.6, 18), accent);
  band.rotation.x = Math.PI / 2;
  band.position.set(0, Y, FWD * 0.8);
  group.add(band);
  // porthole window on top
  const port = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 14), glass);
  port.position.set(0, Y + 0.7, FWD * 0.8);
  group.add(port);
  const portRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 8, 16), dark);
  portRing.position.set(0, Y + 0.7, FWD * 0.8);
  group.add(portRing);

  // three tail fins radiating from the back (+Z). Each is a flat plate lying in
  // a plane through the body axis: long along Z, thin tangentially, sticking out
  // radially. rotation.z = a aligns the plate's radial axis with the spoke angle.
  const FIN_LEN = 1.1;       // how far the fin reaches out from the shell
  const FIN_R = 0.9 + FIN_LEN / 2;
  [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].forEach((a) => {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(FIN_LEN, 0.16, 1.7), accent);
    fin.castShadow = true;
    fin.position.set(Math.cos(a) * FIN_R, Y + Math.sin(a) * FIN_R, -FWD * 1.7);
    fin.rotation.z = a;
    group.add(fin);
  });

  // engine bell + flicker flame out the back
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.65, 0.7, 18), dark);
  bell.rotation.x = Math.PI / 2;
  bell.position.set(0, Y, -FWD * 2.3);
  group.add(bell);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.4, 14), flameMat);
  flame.rotation.x = Math.PI / 2;            // points out the back (+Z)
  flame.position.set(0, Y, -FWD * 3.6);
  group.add(flame);

  // emitter point at the nozzle for the exhaust trail
  const nozzle = new THREE.Object3D();
  nozzle.position.set(0, Y, -FWD * 2.7);
  group.add(nozzle);

  function animate({ elapsed, driving, boosting }) {
    const power = driving ? (boosting ? 1.4 : 1.0) : 0.45;
    const flick = 0.85 + Math.sin(elapsed * 40) * 0.12 + Math.random() * 0.08;
    flame.scale.set(power, power * flick, power);
    flameMat.opacity = 0.55 + power * 0.4;
  }

  return {
    group,
    animate,
    rearEmit: [nozzle],
    frontEmit: [nozzle],
    hover: 4.4,
    bodyY: 0,
    blobOpacity: 0.07,
    fly: true,
    bank: 0.22,        // a gentle lean into turns
  };
}

const BUILDERS = { car: buildCar, plane: buildPlane, rocket: buildRocket };

export function createRover(scene, R) {
  const rover = new THREE.Group();
  rover.position.set(0, R, 0);
  scene.add(rover);

  const roverBody = new THREE.Group();
  roverBody.position.y = 0.05;
  rover.add(roverBody);

  // build every vehicle once, hide all but the active one
  const vehicles = {};
  for (const [name, build] of Object.entries(BUILDERS)) {
    const v = build();
    v.group.visible = false;
    roverBody.add(v.group);
    vehicles[name] = v;
  }
  let active = vehicles.car;
  active.group.visible = true;

  // soft contact shadow blob under the vehicle
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: active.blobOpacity }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = R + 0.06;
  scene.add(blob);

  function setVehicle(name) {
    const v = vehicles[name];
    if (!v || v === active) return;
    active.group.visible = false;
    active = v;
    active.group.visible = true;
    blob.material.opacity = active.blobOpacity;
  }

  // ── Per-frame state ──────────────────────────────────────────────────────
  let spin = 0;       // accumulated wheel rotation (car)
  let groundY = R;
  let pitch = 0;
  let roll = 0;
  let bankRoll = 0;   // smoothed banking for flying vehicles

  const _invPQ = new THREE.Quaternion();
  const _localUp = new THREE.Vector3();
  const _fwdW = new THREE.Vector3();
  const _rgtW = new THREE.Vector3();
  const _th = new THREE.Vector3();
  const _do = new THREE.Vector3();
  const clampPM = (v, m) => Math.max(-m, Math.min(m, v));

  // Called from the drive code: accumulates wheel rotation based on signed
  // throttle (move ∈ {-1, 0, 1}) and a boost multiplier.
  function applyDrive(move, boost, dt) {
    spin -= dt * move * 6 * boost;
  }

  // World position the dust trail should spawn from for the active vehicle.
  // dir: 1 = forward (trailing emitters), -1 = reverse (leading emitters).
  function dustOrigin(dir) {
    const arr = dir > 0 ? active.rearEmit : active.frontEmit;
    return arr[(Math.random() * arr.length) | 0].getWorldPosition(_do);
  }

  // Per-frame visual update.
  // ctx: { heading, planet, terrainHeight, driving, boosting, turn, light01 }
  function update(dt, elapsed, ctx) {
    const {
      heading, planet, terrainHeight, driving, boosting, turn, light01,
    } = ctx;

    rover.rotation.y = heading;
    _invPQ.copy(planet.quaternion).invert();
    _localUp.set(0, 1, 0).applyQuaternion(_invPQ);
    groundY = R + terrainHeight(_localUp);
    rover.position.y = groundY + active.hover;
    blob.position.y = groundY + 0.06;

    if (active.fly) {
      // airborne: bank into turns, with a gentle idle hover sway on top
      const bankTarget = (turn || 0) * active.bank;
      bankRoll += (bankTarget - bankRoll) * Math.min(1, 5 * dt);
      roverBody.rotation.x = Math.sin(elapsed * 1.3) * 0.04;
      roverBody.rotation.z = bankRoll + Math.sin(elapsed * 0.9) * 0.04;
      roverBody.position.y = active.bodyY + Math.sin(elapsed * 1.6) * 0.22;
    } else {
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
      roverBody.position.y = active.bodyY + Math.sin(elapsed * 2) * 0.05 * (driving ? 1 : 0.3);
    }

    active.animate({
      elapsed, driving, boosting, spin, night: 1 - light01,
    });
  }

  function getGroundY() {
    return groundY;
  }

  function isFlying() {
    return active.fly;
  }

  return {
    rover, applyDrive, update, getGroundY, setVehicle, dustOrigin, isFlying,
  };
}
