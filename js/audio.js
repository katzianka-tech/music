// Klangerzeugung: alle Instrumente werden synthetisch erzeugt (keine Samples).
// Jede Funktion bekommt (ctx, ziel, startzeit, ...) und funktioniert sowohl mit
// einem normalen AudioContext als auch mit einem OfflineAudioContext (WAV-Export).

const noiseCache = new WeakMap();

function noise(ctx) {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function env(ctx, t, peak, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  return g;
}

export const DRUMS = [
  {
    id: 'kick',
    name: 'Kick',
    play(ctx, out, t) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = env(ctx, t, 1, 0.45);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.5);
    },
  },
  {
    id: 'snare',
    name: 'Snare',
    play(ctx, out, t) {
      const n = noise(ctx);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;
      n.connect(hp).connect(env(ctx, t, 0.6, 0.18)).connect(out);
      n.start(t);
      n.stop(t + 0.2);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(190, t);
      o.connect(env(ctx, t, 0.5, 0.08)).connect(out);
      o.start(t);
      o.stop(t + 0.1);
    },
  },
  {
    id: 'clap',
    name: 'Clap',
    play(ctx, out, t) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500;
      bp.Q.value = 0.8;
      bp.connect(out);
      [0, 0.012, 0.024].forEach((dt, i) => {
        const n = noise(ctx);
        const decay = i === 2 ? 0.2 : 0.03;
        n.connect(env(ctx, t + dt, 0.7, decay)).connect(bp);
        n.start(t + dt);
        n.stop(t + dt + decay + 0.02);
      });
    },
  },
  {
    id: 'hat',
    name: 'Hi-Hat',
    play(ctx, out, t) {
      const n = noise(ctx);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      n.connect(hp).connect(env(ctx, t, 0.3, 0.05)).connect(out);
      n.start(t);
      n.stop(t + 0.07);
    },
  },
  {
    id: 'open',
    name: 'Open Hat',
    play(ctx, out, t) {
      const n = noise(ctx);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6500;
      n.connect(hp).connect(env(ctx, t, 0.25, 0.3)).connect(out);
      n.start(t);
      n.stop(t + 0.32);
    },
  },
];

// Moll-Pentatonik ab C3: klingt auch bei zufälligen Mustern stimmig.
// Reihenfolge von hoch nach tief, damit das Raster wie eine Klaviatur aussieht.
export const SYNTH_NOTES = [
  { name: 'C5', freq: 523.25 },
  { name: 'A#4', freq: 466.16 },
  { name: 'G4', freq: 392.0 },
  { name: 'F4', freq: 349.23 },
  { name: 'D#4', freq: 311.13 },
  { name: 'C4', freq: 261.63 },
  { name: 'A#3', freq: 233.08 },
  { name: 'G3', freq: 196.0 },
];

export function playSynth(ctx, out, t, freq, dur, { wave, cutoff }) {
  const o = ctx.createOscillator();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(cutoff * 3, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(cutoff, 60), t + dur * 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.005);
  g.gain.setValueAtTime(0.22, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f).connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function createMaster(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 4;
  const vol = ctx.createGain();
  vol.gain.value = 0.8;
  comp.connect(vol).connect(ctx.destination);
  return comp;
}
