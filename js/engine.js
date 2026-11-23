// Klangmaschine: vier synthetische Klangfarben, gesteuert über Position (x = Tonhöhe, y = Klangfarbe).
// Alles wird live mit der Web Audio API erzeugt, es gibt keine Samples.

import { DEGREES, degreeIndex, complexityFor, voiceChord, melodyGrid, chordTones } from './harmony.js';

// ---------- Tonhöhe ----------

const ROOT = 110; // A2
const OCTAVES = 2;
const SCALE = [0, 3, 5, 7, 10]; // Moll-Pentatonik: klingt in jeder Kombination harmonisch
const NAMES = ['A', 'A#', 'H', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];

export const SCALE_STEPS = (() => {
  const s = [];
  for (let o = 0; o < OCTAVES; o++) for (const d of SCALE) s.push(o * 12 + d);
  s.push(OCTAVES * 12);
  return s;
})();

export function noteName(semis) {
  const r = Math.round(semis);
  return NAMES[((r % 12) + 12) % 12] + (2 + Math.floor((r + 9) / 12));
}

/** x: 0..1 → Halbtöne über dem Grundton. Im Tonleiter-Modus in gleich breite Spalten aufgeteilt. */
export function xToSemis(x, quantize) {
  x = Math.min(Math.max(x, 0), 0.9999);
  if (quantize) return SCALE_STEPS[Math.floor(x * SCALE_STEPS.length)];
  return x * OCTAVES * 12;
}

const semisToFreq = (s) => ROOT * 2 ** (s / 12);
const expMap = (y, lo, hi) => lo * (hi / lo) ** Math.min(Math.max(y, 0), 1);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Hilfen ----------

function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

function reverb(ctx, seconds, decay, wet) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, seconds, decay);
  const w = ctx.createGain();
  w.gain.value = wet;
  input.connect(output);
  input.connect(conv).connect(w).connect(output);
  return { input, output };
}

function shaperCurve(fn, n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}

function lfo(ctx, freq, depth, target, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
  return o;
}

function osc(ctx, type, freq, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  return o;
}

function noiseSource(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  return s;
}

/**
 * Baut eine Stimme aus Oszillatoren, deren Frequenz gemeinsam gesteuert wird.
 * oscs: [{node, ratio}], amp: Hüllkurven-Gain, setY: (y, zeit) => void
 */
function voice(ctx, { oscs, amp, peak, attack, release, setY, extra = [] }) {
  const t = ctx.currentTime;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + attack);
  oscs.forEach(({ node }) => node.start(t));
  const all = [...oscs.map((o) => o.node), ...extra];
  return {
    move(freq, y, glide) {
      const now = ctx.currentTime;
      oscs.forEach(({ node, ratio }) => node.frequency.setTargetAtTime(freq * ratio, now, glide));
      setY(y, now);
    },
    release() {
      const now = ctx.currentTime;
      amp.gain.cancelScheduledValues(now);
      amp.gain.setValueAtTime(amp.gain.value, now);
      amp.gain.setTargetAtTime(0, now, release / 4);
      all.forEach((n) => n.stop(now + release + 0.1));
    },
  };
}

// ---------- Klangfarben ----------

// Vokal-Formanten (ungefähre Lehrbuchwerte) für den Roboter-Sprechklang
const VOWELS = [
  [325, 700, 2700], // u
  [450, 800, 2830], // o
  [800, 1150, 2900], // a
  [400, 1700, 2600], // e
  [270, 2300, 3000], // i
];

function vowelAt(y) {
  const p = Math.min(Math.max(y, 0), 0.999) * (VOWELS.length - 1);
  const i = Math.floor(p);
  return VOWELS[i].map((f, k) => lerp(f, VOWELS[i + 1][k], p - i));
}

export const PRESETS = {
  robotik: {
    name: 'Robotik',
    hint: 'unten "u", oben "i"',
    bus(ctx, out) {
      // kurzes, trockenes Slapback-Echo
      const input = ctx.createGain();
      const d = ctx.createDelay(1);
      d.delayTime.value = 0.16;
      const fb = ctx.createGain();
      fb.gain.value = 0.18;
      const wet = ctx.createGain();
      wet.gain.value = 0.18;
      input.connect(out);
      input.connect(d).connect(wet).connect(out);
      d.connect(fb).connect(d);
      return { input, dispose() {} };
    },
    voice(ctx, bus, freq, y, level = 1) {
      const saw = osc(ctx, 'sawtooth', freq);
      const sq = osc(ctx, 'square', freq / 2);
      const src = ctx.createGain();
      src.gain.value = 0.5;
      saw.connect(src);
      sq.connect(src);
      const amp = ctx.createGain();
      const forms = vowelAt(y).map((f, i) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = 9;
        const g = ctx.createGain();
        g.gain.value = [3.2, 2.2, 1.2][i];
        src.connect(bp).connect(g).connect(amp);
        return bp;
      });
      amp.connect(bus.input);
      return voice(ctx, {
        oscs: [{ node: saw, ratio: 1 }, { node: sq, ratio: 0.5 }],
        amp,
        peak: 0.55 * level,
        attack: 0.008,
        release: 0.12,
        setY(y, t) {
          vowelAt(y).forEach((f, i) => forms[i].frequency.setTargetAtTime(f, t, 0.03));
        },
      });
    },
  },

  psychedelik: {
    name: 'Psychedelik',
    hint: 'unten weich, oben hell',
    bus(ctx, out) {
      const input = ctx.createGain();
      // Phaser: vier Allpass-Filter, deren Frequenz langsam wandert
      const phaserOut = ctx.createGain();
      let node = input;
      const lfos = [];
      for (let i = 0; i < 4; i++) {
        const ap = ctx.createBiquadFilter();
        ap.type = 'allpass';
        ap.frequency.value = 700;
        ap.Q.value = 0.7;
        lfos.push(lfo(ctx, 0.25, 550, ap.frequency));
        node.connect(ap);
        node = ap;
      }
      node.connect(phaserOut);
      input.connect(phaserOut);
      // Chorus: leicht modulierte Verzögerung
      const ch = ctx.createDelay(0.05);
      ch.delayTime.value = 0.018;
      lfos.push(lfo(ctx, 0.7, 0.004, ch.delayTime));
      const chorusOut = ctx.createGain();
      chorusOut.gain.value = 0.7;
      phaserOut.connect(chorusOut);
      phaserOut.connect(ch).connect(chorusOut);
      const rv = reverb(ctx, 3.5, 2.5, 0.6);
      chorusOut.connect(rv.input);
      rv.output.connect(out);
      return { input, dispose: () => lfos.forEach((o) => o.stop()) };
    },
    voice(ctx, bus, freq, y, level = 1) {
      const oscs = [
        { node: osc(ctx, 'sawtooth', freq, -9), ratio: 1 },
        { node: osc(ctx, 'sawtooth', freq, 0), ratio: 1 },
        { node: osc(ctx, 'sawtooth', freq, 9), ratio: 1 },
        { node: osc(ctx, 'sine', freq / 2), ratio: 0.5 },
      ];
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 3;
      lp.frequency.value = expMap(y, 250, 7000);
      const amp = ctx.createGain();
      oscs.forEach(({ node }) => node.connect(lp));
      lp.connect(amp).connect(bus.input);
      return voice(ctx, {
        oscs,
        amp,
        peak: 0.12 * level,
        attack: 0.25,
        release: 1.4,
        setY: (y, t) => lp.frequency.setTargetAtTime(expMap(y, 250, 7000), t, 0.05),
      });
    },
  },

  industrial: {
    name: 'Industrial',
    chordStyle: 'power', // volle Akkorde werden mit starker Verzerrung zu Brei
    hint: 'unten dumpf, oben kreischend',
    bus(ctx, out) {
      const input = ctx.createGain();
      input.gain.value = 3;
      const sh = ctx.createWaveShaper();
      sh.curve = shaperCurve((x) => Math.tanh(x * 6) * 0.9 + Math.sin(x * 9) * 0.1);
      sh.oversample = '4x';
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 5500;
      const body = ctx.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = 120;
      body.gain.value = 6;
      const level = ctx.createGain();
      level.gain.value = 0.35;
      const rv = reverb(ctx, 1.2, 4, 0.18);
      input.connect(sh).connect(body).connect(tone).connect(level).connect(rv.input);
      rv.output.connect(out);
      return { input, dispose() {} };
    },
    voice(ctx, bus, freq, y, level = 1) {
      // Grundton, Quinte und Unteroktave: wie ein verzerrter Power-Chord
      const oscs = [
        { node: osc(ctx, 'sawtooth', freq, -6), ratio: 1 },
        { node: osc(ctx, 'sawtooth', freq * 1.5, 6), ratio: 1.5 },
        { node: osc(ctx, 'square', freq / 2), ratio: 0.5 },
      ];
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 5;
      lp.frequency.value = expMap(y, 200, 5000);
      const amp = ctx.createGain();
      oscs.forEach(({ node }) => node.connect(lp));
      lp.connect(amp).connect(bus.input);
      return voice(ctx, {
        oscs,
        amp,
        peak: 0.3 * level,
        attack: 0.004,
        release: 0.25,
        setY: (y, t) => lp.frequency.setTargetAtTime(expMap(y, 200, 5000), t, 0.03),
      });
    },
  },

  lofi: {
    name: 'Lo-Fi Dub',
    hint: 'unten dumpf, oben klar',
    delayTime: 0.375,
    bus(ctx, out) {
      const input = ctx.createGain();
      // grobe Auflösung wie ein alter Sampler
      const crush = ctx.createWaveShaper();
      crush.curve = shaperCurve((x) => Math.round(x * 12) / 12);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3800;
      input.connect(crush).connect(lp).connect(out);
      // Dub-Echo: lange Rückkopplung, jedes Echo dumpfer
      const d = ctx.createDelay(2);
      d.delayTime.value = PRESETS.lofi.delayTime;
      const fb = ctx.createGain();
      fb.gain.value = 0.55;
      const fbHp = ctx.createBiquadFilter();
      fbHp.type = 'highpass';
      fbHp.frequency.value = 350;
      const fbLp = ctx.createBiquadFilter();
      fbLp.type = 'lowpass';
      fbLp.frequency.value = 2200;
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      lp.connect(d);
      d.connect(fbHp).connect(fbLp).connect(fb).connect(d);
      d.connect(wet).connect(out);
      // Bandrauschen, nur hörbar solange gespielt wird
      const hiss = noiseSource(ctx);
      const hissHp = ctx.createBiquadFilter();
      hissHp.type = 'highpass';
      hissHp.frequency.value = 4000;
      const hissGain = ctx.createGain();
      hissGain.gain.value = 0;
      hiss.connect(hissHp).connect(hissGain).connect(out);
      hiss.start();
      return {
        input,
        activity(n) {
          hissGain.gain.setTargetAtTime(n > 0 ? 0.025 : 0, ctx.currentTime, 0.4);
        },
        dispose: () => hiss.stop(),
      };
    },
    voice(ctx, bus, freq, y, level = 1) {
      const tri = osc(ctx, 'triangle', freq);
      const sq = osc(ctx, 'square', freq * 2);
      const sqG = ctx.createGain();
      sqG.gain.value = 0.12;
      // "Wow and Flutter": leichtes Leiern wie bei einem alten Band
      const wow = [lfo(ctx, 0.6, 14, tri.detune), lfo(ctx, 0.6, 14, sq.detune), lfo(ctx, 6.5, 4, tri.detune)];
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 1;
      lp.frequency.value = expMap(y, 350, 4500);
      const amp = ctx.createGain();
      tri.connect(lp);
      sq.connect(sqG).connect(lp);
      lp.connect(amp).connect(bus.input);
      return voice(ctx, {
        oscs: [{ node: tri, ratio: 1 }, { node: sq, ratio: 2 }],
        amp,
        peak: 0.3 * level,
        attack: 0.015,
        release: 0.5,
        setY: (y, t) => lp.frequency.setTargetAtTime(expMap(y, 350, 4500), t, 0.05),
        extra: wow,
      });
    },
  },
};

// ---------- Engine ----------

const MAX_VOICES = 6;
export const MODES = ['scale', 'chord', 'split', 'free'];
const SPLIT = 0.5; // Geteilt: unterhalb Akkorde, oberhalb Melodie (y von unten gemessen)

/** Ein Finger, der Akkorde spielt: mehrere Stimmen, die gemeinsam gesteuert werden */
class ChordVoice {
  constructor(engine, x, y) {
    this.engine = engine;
    this.x = x;
    this.y = y;
    this.isChord = true;
    this.n = complexityFor(y);
    this.degree = degreeIndex(x);
    const prev = engine.lastChord && performance.now() - engine.lastChord.time < 4000 ? engine.lastChord.notes : null;
    const ch = voiceChord(DEGREES[this.degree], this.n, prev, engine.chordStyle());
    this.name = ch.name;
    this.notes = ch.notes;
    const level = 0.9 / Math.sqrt(ch.notes.length);
    const preset = PRESETS[engine.presetId];
    // Jede Stimme startet beim nächstgelegenen Ton des vorigen Akkords und gleitet kurz zum Ziel
    this.voices = ch.notes.map((s) => {
      const from = prev ? prev.reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a)) : s;
      const v = preset.voice(engine.ctx, engine.bus, semisToFreq(from), y, level);
      if (from !== s) v.move(semisToFreq(s), y, 0.035);
      return v;
    });
    engine.rememberChord(this);
    engine.retuneMelody();
  }

  update(x, y) {
    this.x = x;
    this.y = y;
    const d = degreeIndex(x);
    if (d !== this.degree) {
      // Finger in eine andere Spalte geschoben: neuer Akkord mit gleicher Stimmenzahl, weich geführt
      this.degree = d;
      const ch = voiceChord(DEGREES[d], this.n, this.notes, this.engine.chordStyle());
      this.name = ch.name;
      this.notes = ch.notes;
      this.engine.rememberChord(this);
      this.engine.retuneMelody();
    }
    this.voices.forEach((v, i) => v.move(semisToFreq(this.notes[i]), y, 0.035));
  }

  release() {
    this.voices.forEach((v) => v.release());
  }
}

export class Engine {
  constructor() {
    this.ctx = null;
    this.presetId = 'robotik';
    this.mode = 'scale'; // 'scale' | 'chord' | 'split' | 'free'
    this.voices = new Map();
    this.bus = null;
    this.lastChord = null; // {name, notes, degree, time}: Grundlage für Stimmführung und Melodie
  }

  get quantize() {
    return this.mode !== 'free';
  }

  chordStyle() {
    return PRESETS[this.presetId].chordStyle || 'full';
  }

  rememberChord(cv) {
    this.lastChord = { name: cv.name, notes: cv.notes, degree: cv.degree, time: performance.now() };
  }

  /** Der gerade gehaltene Akkord (es gibt höchstens einen) */
  heldChord() {
    for (const v of this.voices.values()) if (v.isChord) return v;
    return null;
  }

  /** Stufe, nach der sich die Melodie richtet: gehaltener, sonst zuletzt gespielter Akkord, sonst Am */
  melodyDegree() {
    return this.heldChord()?.degree ?? this.lastChord?.degree ?? 0;
  }

  melodySemis(x) {
    const g = melodyGrid(this.melodyDegree());
    return g[Math.floor(Math.min(Math.max(x, 0), 0.9999) * g.length)];
  }

  /** Akkord gewechselt: gehaltene Melodietöne gleiten auf den Ton der neuen Tonleiter an gleicher Stelle */
  retuneMelody() {
    for (const v of this.voices.values()) {
      if (!v.isMelody) continue;
      v.semis = this.melodySemis(v.x);
      v.move(semisToFreq(v.semis), v.y, 0.035);
    }
  }

  /** Im Geteilt-Modus: y (0 unten .. 1 oben) in die Zone umrechnen */
  zoneY(y, zone) {
    if (this.mode !== 'split') return y;
    const ly = zone === 'chord' ? y / SPLIT : (y - SPLIT) / (1 - SPLIT);
    return Math.min(Math.max(ly, 0), 1);
  }

  /**
   * Spalten-Zonen für die Anzeige: [{y0, y1, labels, strong?, active?}] (y von unten, 0..1)
   * oder null im Frei-Modus.
   */
  layout() {
    const chordNames = DEGREES.map((d) => d.names[0]);
    const melody = () => {
      const d = this.melodyDegree();
      const ct = chordTones(d);
      const g = melodyGrid(d);
      return { labels: g.map((s) => noteName(s).replace(/\d/, '')), strong: g.map((s) => ct.includes(s % 12)) };
    };
    const held = this.heldChord();
    switch (this.mode) {
      case 'free':
        return null;
      case 'scale':
        return [{ y0: 0, y1: 1, labels: SCALE_STEPS.map((s) => noteName(s).replace(/\d/, '')) }];
      case 'chord':
        return [held ? { y0: 0, y1: 1, ...melody() } : { y0: 0, y1: 1, labels: chordNames }];
      case 'split':
        return [
          { y0: 0, y1: SPLIT, labels: chordNames, active: held?.degree },
          { y0: SPLIT, y1: 1, ...melody() },
        ];
    }
  }

  semisFor(x) {
    return xToSemis(x, this.quantize);
  }

  /** Text neben dem Finger: Akkordname oder Tonname */
  labelFor(id, x) {
    const v = this.voices.get(id);
    if (v?.isChord) return v.name;
    if (v?.isMelody) return noteName(v.semis);
    if (!v) return ''; // z. B. Akkord-Finger, dessen Akkord durch einen neuen ersetzt wurde
    return noteName(this.semisFor(x));
  }

  async start() {
    if (!this.ctx) {
      // iOS (Safari 17+): Ton auch bei aktivem Stummschalter erlauben, wo unterstützt
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch {}
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.6;
      const vol = ctx.createGain();
      vol.gain.value = 0.7;
      comp.connect(this.analyser).connect(vol).connect(ctx.destination);
      this.master = comp;
      this.bus = PRESETS[this.presetId].bus(ctx, this.master);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  setPreset(id) {
    if (!PRESETS[id] || id === this.presetId) return;
    this.presetId = id;
    this.lastChord = null;
    if (!this.ctx) return;
    this.releaseAll();
    const old = this.bus;
    this.bus = PRESETS[id].bus(this.ctx, this.master);
    // Nachhall des alten Klangs ausklingen lassen, dann aufräumen
    setTimeout(() => old.dispose(), 4000);
  }

  freqFor(x) {
    return semisToFreq(this.semisFor(x));
  }

  melodyVoice(x, y) {
    const semis = this.melodySemis(x);
    const v = PRESETS[this.presetId].voice(this.ctx, this.bus, semisToFreq(semis), y, 0.85);
    return Object.assign(v, { x, y, semis, isMelody: true, zone: 'melody' });
  }

  noteOn(id, x, y) {
    if (!this.ctx) return;
    let v;
    if (this.mode === 'split') {
      if (y < SPLIT) {
        // Neuer Akkord unten ersetzt den alten (wie Umgreifen am Klavier)
        for (const [hid, hv] of this.voices) if (hv.isChord) this.noteOff(hid);
        v = new ChordVoice(this, x, this.zoneY(y, 'chord'));
        v.zone = 'chord';
      } else {
        if (this.voices.size >= MAX_VOICES) return;
        v = this.melodyVoice(x, this.zoneY(y, 'melody'));
      }
    } else if (this.mode === 'chord') {
      if (!this.heldChord()) v = new ChordVoice(this, x, y);
      else {
        // Akkord wird gehalten: dieser Finger spielt Melodie
        if (this.voices.size >= MAX_VOICES) return;
        v = this.melodyVoice(x, y);
      }
    } else {
      if (this.voices.size >= MAX_VOICES) return;
      v = PRESETS[this.presetId].voice(this.ctx, this.bus, this.freqFor(x), y);
      v.x = x;
      v.y = y;
    }
    this.voices.set(id, v);
    this.bus.activity?.(this.voices.size);
  }

  noteMove(id, x, y) {
    const v = this.voices.get(id);
    if (!v) return;
    if (v.isChord) return v.update(x, this.zoneY(y, 'chord'));
    if (v.isMelody) {
      v.x = x;
      v.y = this.zoneY(y, 'melody');
      v.semis = this.melodySemis(x);
      return v.move(semisToFreq(v.semis), v.y, 0.02);
    }
    // Frei: Ton folgt dem Finger direkt. Tonleiter: kurzes Gleiten zum nächsten Ton.
    v.x = x;
    v.y = y;
    v.move(this.freqFor(x), y, this.quantize ? 0.02 : 0.008);
  }

  noteOff(id) {
    const v = this.voices.get(id);
    if (!v) return;
    v.release();
    this.voices.delete(id);
    this.bus.activity?.(this.voices.size);
  }

  releaseAll() {
    for (const id of [...this.voices.keys()]) this.noteOff(id);
  }
}
