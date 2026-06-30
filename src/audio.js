// Small WebAudio synth: a throttle-driven engine voice, ambient wind, and a
// one-shot crash. The engine voice is profile-driven so each vehicle sounds
// different — a car rumble, a buzzy prop drone, a noisy rocket roar. The audio
// graph is created lazily on init() so the page doesn't trigger an unwanted
// AudioContext until the user gestures.

// Per-vehicle engine voices. base/ratio set the two oscillators' pitch, lp* the
// brightness sweep, oscMix/noiseMix the timbre balance, and lfo* a tremolo
// "chop" (used by the propeller). Keys match rover.setVehicle()'s names.
const ENGINE_PROFILES = {
  car:    { o1: 'sawtooth', o2: 'square',   base: 55, ratio: 1.5,  glide: 70,  lpBase: 380, lpSweep: 600,  oscMix: 0.18, noiseMix: 0.0,  noiseLP: 600,  lfoRate: 0,  lfoDepth: 0 },
  plane:  { o1: 'sawtooth', o2: 'sawtooth', base: 96, ratio: 2.01, glide: 120, lpBase: 700, lpSweep: 1300, oscMix: 0.14, noiseMix: 0.05, noiseLP: 2200, lfoRate: 16, lfoDepth: 0.5 },
  rocket: { o1: 'sine',     o2: 'triangle', base: 42, ratio: 1.33, glide: 30,  lpBase: 300, lpSweep: 350,  oscMix: 0.07, noiseMix: 0.24, noiseLP: 900,  lfoRate: 0,  lfoDepth: 0 },
};

export function createAudio({ muted: initialMuted = false } = {}) {
  let muted = initialMuted;
  let audio = null;
  let profile = ENGINE_PROFILES.car;

  function init() {
    if (audio) {
      audio.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    // engine voice: oscillators + a noise bed, summed at engGain (throttle
    // volume), then through tremGain (1.0 baseline, an LFO adds the prop chop).
    const engGain = ctx.createGain();
    engGain.gain.value = 0;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 1;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 82;
    const oscMix = ctx.createGain();
    oscMix.gain.value = 1;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(oscMix);
    oscMix.connect(engGain);
    o1.start();
    o2.start();

    // noise bed for the rocket roar / prop hiss, throttle-scaled via engGain
    const enb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const end = enb.getChannelData(0);
    for (let i = 0; i < end.length; i++) end[i] = Math.random() * 2 - 1;
    const engNoise = ctx.createBufferSource();
    engNoise.buffer = enb;
    engNoise.loop = true;
    const noiseLP = ctx.createBiquadFilter();
    noiseLP.type = 'lowpass';
    noiseLP.frequency.value = 600;
    const engNoiseGain = ctx.createGain();
    engNoiseGain.gain.value = 0;
    engNoise.connect(noiseLP);
    noiseLP.connect(engNoiseGain);
    engNoiseGain.connect(engGain);
    engNoise.start();

    engGain.connect(tremGain);
    tremGain.connect(master);

    // tremolo LFO — modulates tremGain on top of its 1.0 baseline
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.0001;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0;
    lfo.connect(lfoGain);
    lfoGain.connect(tremGain.gain);
    lfo.start();

    // ambient wind: 2s of white noise looped through a bandpass
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource();
    wind.buffer = nb;
    wind.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480;
    bp.Q.value = 0.7;
    const windG = ctx.createGain();
    windG.gain.value = 0.05;
    wind.connect(bp);
    bp.connect(windG);
    windG.connect(master);
    wind.start();

    audio = {
      ctx, master, engGain, lp, o1, o2, nb,
      noiseLP, engNoiseGain, lfo, lfoGain,
    };
    applyProfile();
  }

  // Push the active profile's static settings into the live nodes (oscillator
  // shapes, noise/LFO amounts). Per-frame pitch + filter live in engine().
  function applyProfile() {
    if (!audio) return;
    audio.o1.type = profile.o1;
    audio.o2.type = profile.o2;
    audio.noiseLP.frequency.value = profile.noiseLP;
    audio.lfo.frequency.value = profile.lfoRate || 0.0001;
    audio.lfoGain.gain.value = profile.lfoDepth;
  }

  function setEngineProfile(name) {
    profile = ENGINE_PROFILES[name] || ENGINE_PROFILES.car;
    applyProfile();
  }

  function engine(speed01) {
    if (!audio) return;
    const p = profile;
    audio.engGain.gain.value += (speed01 * p.oscMix - audio.engGain.gain.value) * 0.12;
    audio.engNoiseGain.gain.value += (speed01 * p.noiseMix - audio.engNoiseGain.gain.value) * 0.12;
    const f = p.base + speed01 * p.glide;
    audio.o1.frequency.value += (f - audio.o1.frequency.value) * 0.1;
    audio.o2.frequency.value += (f * p.ratio - audio.o2.frequency.value) * 0.1;
    audio.lp.frequency.value = p.lpBase + speed01 * p.lpSweep;
  }

  function crash() {
    if (!audio) return;
    const { ctx } = audio;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = audio.nb;
    src.loop = false;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    src.connect(lp);
    lp.connect(g);
    g.connect(audio.master);
    src.start(t);
    src.stop(t + 0.35);
  }

  function setMuted(v) {
    muted = v;
    if (audio) audio.master.gain.value = muted ? 0 : 0.5;
  }

  function resume() {
    if (audio) audio.ctx.resume();
  }

  return {
    init, engine, crash, setMuted, resume, setEngineProfile,
  };
}
