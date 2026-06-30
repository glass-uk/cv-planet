// All the HTML overlay: identity text, the landmark list, the now-viewing pill,
// mute button, photo button, score readout, and the canvas compass.
// Returns handles the main loop and world use to push state into the UI.

// The vehicles you can drive. `id` is what rover.setVehicle() expects.
const VEHICLES = [
  { id: 'car', icon: '🚙', label: 'Rover' },
  { id: 'plane', icon: '✈️', label: 'Plane' },
  { id: 'rocket', icon: '🚀', label: 'Rocket' },
];

// Weather toggle cycles through these in order; `id` is what setWeather() wants.
const WEATHERS = [
  { id: 'clear', icon: '☀️', label: 'Clear' },
  { id: 'rain', icon: '🌧️', label: 'Rain' },
  { id: 'snow', icon: '❄️', label: 'Snow' },
];

export function createUI({
  profile, stations, audio, onTravelRequested, onVehicleChange, onWeatherChange, onTourToggle,
}) {
  // ── Identity (top-left) ─────────────────────────────────────────────────
  document.querySelector('#identity .name').textContent = profile.name || '';
  document.querySelector('#identity .role').textContent = profile.role || '';
  document.querySelector('#identity .tagline').textContent = profile.tagline || '';

  // ── Landmark list (top-right) + now-viewing pill (bottom) ───────────────
  const listEl = document.getElementById('landmarks');
  const viewingEl = document.getElementById('viewing');
  let activeStation = -1;

  // Guided-tour CTA, sitting at the top of the landmark list
  const tourBtn = document.createElement('button');
  tourBtn.className = 'lm tour';
  tourBtn.addEventListener('click', () => onTourToggle());
  listEl.appendChild(tourBtn);

  function setTourActive(on) {
    tourBtn.classList.toggle('active', on);
    tourBtn.innerHTML = on
      ? '<span class="ic">■</span>Stop tour'
      : '<span class="ic">▶</span>Take the tour';
  }
  setTourActive(false);

  const lmButtons = stations.map((s, i) => {
    const b = document.createElement('button');
    b.className = 'lm';
    b.innerHTML = `<span class="dot" style="background:${s.color}"></span>${s.title}`;
    b.addEventListener('click', () => onTravelRequested(i));
    listEl.appendChild(b);
    return b;
  });

  function setActiveStation(i) {
    activeStation = i;
    lmButtons.forEach((b, idx) => b.classList.toggle('active', idx === i));
    if (i >= 0) {
      const s = stations[i];
      viewingEl.querySelector('.dot').style.background = s.color;
      viewingEl.querySelector('.vt').textContent = s.title;
      viewingEl.classList.add('show');
    }
  }

  function clearActiveStation() {
    if (activeStation < 0) return;
    activeStation = -1;
    lmButtons.forEach((b) => b.classList.remove('active'));
    viewingEl.classList.remove('show');
  }

  // ── Mute toggle ─────────────────────────────────────────────────────────
  let muted = localStorage.getItem('cvMuted') === '1';
  audio.setMuted(muted);
  const muteBtn = document.getElementById('mute');
  function syncMute() {
    muteBtn.classList.toggle('muted', muted);
    muteBtn.querySelector('.mt').textContent = muted ? 'Sound off' : 'Sound on';
    audio.setMuted(muted);
  }
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem('cvMuted', muted ? '1' : '0');
    audio.resume();
    syncMute();
  });
  syncMute();

  // ── Photo mode (hides the HUD) ──────────────────────────────────────────
  let photo = false;
  const photoBtn = document.getElementById('photo');
  function togglePhoto() {
    photo = !photo;
    document.body.classList.toggle('photo', photo);
    photoBtn.querySelector('.pt').textContent = photo ? 'Exit' : 'Photo';
  }
  photoBtn.addEventListener('click', togglePhoto);

  // ── Bowling score ───────────────────────────────────────────────────────
  let flattened = 0;
  const scoreEl = document.getElementById('score');
  function addScore() {
    flattened += 1;
    scoreEl.querySelector('.num').textContent = flattened;
    scoreEl.classList.add('show');
  }

  // ── Vehicle picker ──────────────────────────────────────────────────────
  // Remembers your pick across reloads and syncs the rover on load.
  const vehListEl = document.getElementById('vehicles');
  const saved = localStorage.getItem('cvVehicle');
  let vehicle = VEHICLES.some((v) => v.id === saved) ? saved : VEHICLES[0].id;

  const vehButtons = VEHICLES.map((v) => {
    const b = document.createElement('button');
    b.className = 'veh';
    b.innerHTML = `<span class="vi">${v.icon}</span>${v.label}`;
    b.addEventListener('click', () => selectVehicle(v.id));
    vehListEl.appendChild(b);
    return b;
  });

  function selectVehicle(id) {
    vehicle = id;
    localStorage.setItem('cvVehicle', id);
    vehButtons.forEach((b, idx) => b.classList.toggle('active', VEHICLES[idx].id === id));
    onVehicleChange(id);
  }

  function cycleVehicle() {
    const i = VEHICLES.findIndex((v) => v.id === vehicle);
    selectVehicle(VEHICLES[(i + 1) % VEHICLES.length].id);
  }

  selectVehicle(vehicle); // reflect the saved pick in the rover + the buttons

  // ── Weather toggle (clear → rain → snow) ────────────────────────────────
  const weatherBtn = document.getElementById('weather');
  const savedW = WEATHERS.findIndex((w) => w.id === localStorage.getItem('cvWeather'));
  let weatherIdx = savedW < 0 ? 0 : savedW;

  function applyWeather() {
    const w = WEATHERS[weatherIdx];
    weatherBtn.innerHTML = `<span class="wi">${w.icon}</span>${w.label}`;
    weatherBtn.classList.toggle('active', w.id !== 'clear');
    localStorage.setItem('cvWeather', w.id);
    onWeatherChange(w.id);
  }
  weatherBtn.addEventListener('click', () => {
    weatherIdx = (weatherIdx + 1) % WEATHERS.length;
    applyWeather();
  });
  applyWeather();

  // ── Compass / minimap ───────────────────────────────────────────────────
  const compassEl = document.getElementById('compass');
  const cctx = compassEl.getContext('2d');
  // ctx: { camAz, planetQuat, heading, stationDirs }
  function drawCompass({
    camAz, planetQuat, heading, stationDirs,
  }) {
    const cx = 120;
    const cy = 120;
    const rr = 92;
    cctx.clearRect(0, 0, 240, 240);
    cctx.beginPath();
    cctx.arc(cx, cy, rr, 0, Math.PI * 2);
    cctx.fillStyle = 'rgba(253,251,247,0.55)';
    cctx.fill();
    cctx.lineWidth = 3;
    cctx.strokeStyle = 'rgba(58,53,46,0.18)';
    cctx.stroke();
    const cA = Math.cos(camAz);
    const sA = Math.sin(camAz);
    stationDirs.forEach((n, i) => {
      const p = n.clone().applyQuaternion(planetQuat);
      const horiz = Math.hypot(p.x, p.z);          // 0 when the landmark is at the top
      const atTop = horiz < 0.09 && p.y > 0;
      let px = cx;
      let py = cy;
      if (!atTop) {
        const rf = p.y >= 0 ? horiz : 1;            // behind the planet → pin to the rim
        const rad = rr * Math.min(1, 0.2 + rf * 0.85);
        const ang = Math.atan2(p.x * cA - p.z * sA, -p.x * sA - p.z * cA);
        px = cx + Math.sin(ang) * rad;
        py = cy - Math.cos(ang) * rad;
      }
      cctx.beginPath();
      cctx.arc(px, py, atTop ? 10 : 8, 0, Math.PI * 2);
      cctx.fillStyle = stations[i].color;
      cctx.fill();
      cctx.lineWidth = 2;
      cctx.strokeStyle = 'rgba(255,255,255,0.9)';
      cctx.stroke();
    });
    // rover heading arrow
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    const ra = Math.atan2(fx * cA - fz * sA, -fx * sA - fz * cA);
    cctx.save();
    cctx.translate(cx, cy);
    cctx.rotate(ra);
    cctx.beginPath();
    cctx.moveTo(0, -15);
    cctx.lineTo(10, 12);
    cctx.lineTo(0, 5);
    cctx.lineTo(-10, 12);
    cctx.closePath();
    cctx.fillStyle = '#ef6f4e';
    cctx.fill();
    cctx.restore();
  }

  return {
    setActiveStation, clearActiveStation,
    togglePhoto, addScore, drawCompass, cycleVehicle, setTourActive,
  };
}
