import * as THREE from 'three';

// One unit cube reused everywhere — every vbox just scales/positions an instance.
export const UNIT = new THREE.BoxGeometry(1, 1, 1);

// Material cache: one MeshStandardMaterial per voxel color.
// Tagged with userData.vox so bakeStatic knows it can merge them into a single mesh.
const _matCache = {};
export function vmat(color) {
  if (!_matCache[color]) {
    _matCache[color] = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
    _matCache[color].userData.vox = true;
  }
  return _matCache[color];
}

// Shared material for merged geometry — colors travel as vertex colors instead.
export const BAKED_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });

let vcast = true; // global toggle: filler scenery turns this off so its meshes skip the shadow pass
export function setVCast(v) { vcast = v; }

export function vbox(parent, w, h, d, x, y, z, color) {
  const m = new THREE.Mesh(UNIT, vmat(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = vcast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Merge an array of voxel meshes into one BufferGeometry with vertex colors.
// Keeps draw calls and shadow casters in the hundreds instead of thousands.
const _bv = new THREE.Vector3();
export function mergeBoxMeshes(meshes, parent, cast) {
  if (!meshes.length) return null;
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  for (const m of meshes) {
    m.updateMatrix();
    const geo = m.geometry;
    const p = geo.attributes.position;
    const { index } = geo;
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
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  for (const m of meshes) if (m.parent) m.parent.remove(m);
  parent.add(mesh);
  return mesh;
}

// Merge a group's voxel-tagged direct children into one mesh.
// Leaves animated/special meshes (rotating windmill blades etc.) untouched.
export function bakeStatic(g, cast) {
  const boxes = g.children.filter((ch) => ch.isMesh && ch.material && ch.material.userData && ch.material.userData.vox);
  if (boxes.length >= 2) mergeBoxMeshes(boxes, g, cast);
}

// Shared palettes used by builders and particle effects.
export const GREENS = ['#2f7d2c', '#3f8f37', '#52a23f', '#6cb74a'];
export const SAND = ['#d49758', '#c07f3f', '#aa6c30'];
export const STONE = ['#d8d2c2', '#c7c0ae'];
export const ROOF = ['#8a4f3b', '#7a4332', '#9b5b44'];

export const rpick = (a) => a[(Math.random() * a.length) | 0];
