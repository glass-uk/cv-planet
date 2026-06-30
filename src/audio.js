// Small WebAudio synth: low engine hum that responds to throttle, ambient wind,
// and a one-shot crash. The audio graph is created lazily on init() so the page
// doesn't trigger an unwanted AudioContext until the user gestures.

export function createAudio({ muted: initialMuted = false } = {}) {
  let muted = initialMuted;
  let audio = null;

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

    const engGain = ctx.createGain();
    engGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 82;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(engGain);
    engGain.connect(master);
    o1.start();
    o2.start();

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

    audio = { ctx, master, engGain, lp, o1, o2, nb };
  }

  function engine(speed01) {
    if (!audio) return;
    audio.engGain.gain.value += (speed01 * 0.18 - audio.engGain.gain.value) * 0.12;
    const f = 55 + speed01 * 70;
    audio.o1.frequency.value += (f - audio.o1.frequency.value) * 0.1;
    audio.o2.frequency.value += (f * 1.5 - audio.o2.frequency.value) * 0.1;
    audio.lp.frequency.value = 380 + speed01 * 600;
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

  return { init, engine, crash, setMuted, resume };
}
