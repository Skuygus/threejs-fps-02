// Every sound is synthesised with WebAudio: no audio files, no network. The context
// is created on the first user gesture; every call before that is a silent no-op,
// so the deterministic screenshot path never touches audio.
let ctx = null;
let master = null;
let noiseBuffer = null;

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
    const length = Math.floor(ctx.sampleRate * 0.5);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

function tone(freq, dur, type, gain, slideTo = 0) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

function noise(dur, filterFreq, gain, type = 'lowpass') {
  if (!ctx) return;
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(now);
  src.stop(now + dur + 0.02);
}

const SHOT_TONE = { pistol: [900, 0.09], smg: [1100, 0.07], rifle: [700, 0.11], shotgun: [420, 0.16], sniper: [500, 0.2] };

export const audio = {
  shot(kind) {
    const [freq, dur] = SHOT_TONE[kind] || SHOT_TONE.rifle;
    noise(dur, 3200, 0.5);
    tone(freq, dur, 'square', 0.16, freq * 0.3);
  },
  dryFire() { tone(1800, 0.03, 'square', 0.08); },
  reload() { tone(500, 0.05, 'square', 0.1); setTimeout(() => tone(700, 0.05, 'square', 0.1), 140); },
  hit(kill) {
    tone(kill ? 1400 : 1000, 0.06, 'sine', 0.18);
    if (kill) setTimeout(() => tone(1800, 0.08, 'sine', 0.18), 70);
  },
  hurt() { tone(160, 0.16, 'sawtooth', 0.22, 70); },
  explode() {
    noise(0.9, 500, 0.8);
    tone(90, 0.8, 'sine', 0.5, 30);
  },
  beep(final) { tone(final ? 1500 : 1000, 0.07, 'sine', 0.16); },
  plant() { tone(880, 0.1, 'sine', 0.15); setTimeout(() => tone(1320, 0.12, 'sine', 0.15), 120); },
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.2), i * 110)); },
  roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.18), i * 130)); },
  buy() { tone(1200, 0.05, 'square', 0.1); setTimeout(() => tone(1600, 0.05, 'square', 0.1), 60); },
  bounce() { tone(300, 0.04, 'square', 0.08, 150); },
  step() { noise(0.04, 900, 0.05); },
};
