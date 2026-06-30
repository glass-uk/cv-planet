import * as THREE from 'three';

export const DEG = Math.PI / 180;

// Unit direction on the sphere for a lat/lon in degrees.
export function dirFromLatLon(lat, lon) {
  const la = lat * DEG;
  const lo = lon * DEG;
  return new THREE.Vector3(
    Math.cos(la) * Math.cos(lo),
    Math.sin(la),
    Math.cos(la) * Math.sin(lo),
  ).normalize();
}

// Walks N evenly-distributed unit directions on the sphere using the Fibonacci
// (golden-angle) spiral. Used by every "scatter things across the planet" pass
// — biome scenery, grass tufts, clouds — so density tweaks live in one place.
export function forEachSphereSeed(N, callback) {
  for (let i = 0; i < N; i++) {
    const y = 1 - (i + 0.5) / N * 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * 2.39996;
    callback(new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r), i);
  }
}

// Orthonormal surface frame at a unit direction n: makeBasis(tangent, n, face).
// Used for orienting anything that sits on the globe (signs, scenery, road tiles).
export function surfaceFrame(n) {
  const ref = Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const t = new THREE.Vector3().crossVectors(ref, n).normalize();
  const f = new THREE.Vector3().crossVectors(t, n).normalize();
  return new THREE.Matrix4().makeBasis(t, n, f);
}

// Builds the terrain height field (rolling hills via summed sines, flattened
// under each landmark so signs sit clean). Returns helpers that close over the
// generated noise so the same field is used everywhere.
export function createTerrain(stations, R) {
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
  const ampNorm = HILL_AMP / HILLS.reduce((s, h) => s + h.amp, 0);
  const STATION_DIRS = stations.map((st) => dirFromLatLon(st.lat, st.lon));

  function terrainHeight(n) {
    let h = 0;
    for (const w of HILLS) h += w.amp * Math.sin(w.freq * n.dot(w.axis) * 3 + w.phase);
    h *= ampNorm;
    // flatten near each landmark (smoothstep over a small cap)
    let flat = 1;
    for (const d of STATION_DIRS) {
      const a = d.angleTo(n);
      if (a < 0.26) {
        const t = a / 0.26;
        flat = Math.min(flat, t * t * (3 - 2 * t));
      }
    }
    return h * flat;
  }

  function elevate(n) {
    return R + terrainHeight(n);
  }

  // Lowest terrain height under a footprint disc: lets wide flat-based
  // buildings sit on their low corner and tuck into slopes on the high side.
  function groundHeight(n, footAng) {
    let m = terrainHeight(n);
    const f = surfaceFrame(n);
    const ex = new THREE.Vector3().setFromMatrixColumn(f, 0);
    const ez = new THREE.Vector3().setFromMatrixColumn(f, 2);
    const d = new THREE.Vector3();
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      d.copy(n).addScaledVector(ex, Math.cos(ang) * footAng).addScaledVector(ez, Math.sin(ang) * footAng).normalize();
      m = Math.min(m, terrainHeight(d));
    }
    return R + m;
  }

  return { STATION_DIRS, terrainHeight, elevate, groundHeight };
}
