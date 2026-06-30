import * as THREE from 'three';

// All user input: keyboard, on-screen d-pad, pointer drag (camera rotation),
// and click-to-travel (raycasting against the sign meshes). Exposes a single
// `keys` dictionary the main loop reads; emits callbacks for things only the
// main loop knows how to do (cancel travel, request travel, toggle photo).

const KEY_MAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

const isShift = (code) => code === 'ShiftLeft' || code === 'ShiftRight';

export function createInput({
  domElement, camera, signMeshes,
  onCameraDrag, onCancelTravel, onTravelRequested, onTogglePhoto,
}) {
  const keys = { up: false, down: false, left: false, right: false, boost: false };

  function clearKeys() {
    Object.keys(keys).forEach((k) => { keys[k] = false; });
  }

  // ── Keyboard ────────────────────────────────────────────────────────────
  addEventListener('keydown', (e) => {
    const k = KEY_MAP[e.code];
    if (k) {
      keys[k] = true;
      onCancelTravel();
      e.preventDefault();
    } else if (isShift(e.code)) {
      keys.boost = true;
    } else if (e.code === 'KeyP') {
      onTogglePhoto();
    }
  });
  addEventListener('keyup', (e) => {
    const k = KEY_MAP[e.code];
    if (k) keys[k] = false;
    else if (isShift(e.code)) keys.boost = false;
  });

  // ── On-screen d-pad (mobile / touchscreens) ─────────────────────────────
  document.querySelectorAll('#pad button').forEach((btn) => {
    const d = btn.dataset.dir;
    const on = (e) => { e.preventDefault(); keys[d] = true; onCancelTravel(); };
    const off = (e) => { e.preventDefault(); keys[d] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  });

  // Safety: never let a key get stuck (tab switch, lost pointerup, etc.)
  addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearKeys();
  });

  // ── Pointer drag (rotates camera) + click-to-travel (raycasts signs) ────
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;
  let dragging = false;

  domElement.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
    lastX = e.clientX;
    lastY = e.clientY;
    dragging = true;
  });
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    onCameraDrag(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  });
  addEventListener('pointerup', () => { dragging = false; });

  domElement.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // it was a drag, not a click
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(signMeshes, false)[0];
    if (hit) onTravelRequested(hit.object.userData.stationIndex);
  });

  return { keys };
}
