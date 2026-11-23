// Generativer Drumcomputer für "Robotik": ein 16-Schritt-Muster, das sich laufend leicht verändert.
// Klangerzeugung rein synthetisch, angelehnt an klassische analoge Drumcomputer.

const STEPS = 16;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

// ---------- Klänge ----------

function envGain(ctx, t, peak, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  return g;
}

let noiseBuf = null;
function noise(ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function tone(ctx, out, t, type, f0, f1, sweep, peak, decay) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
  o.connect(envGain(ctx, t, peak, decay)).connect(out);
  o.start(t);
  o.stop(t + decay + 0.02);
}

// Metallische Hi-Hat: sechs Rechteck-Oszillatoren mit unharmonischen Frequenzen (TR-808-Prinzip)
const HAT_FREQS = [205.3, 304.4, 369.6, 522.7, 540, 800];
function hat(ctx, out, t, decay, peak) {
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 10000;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const g = envGain(ctx, t, peak, decay);
  bp.connect(hp).connect(g).connect(out);
  for (const f of HAT_FREQS) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.connect(bp);
    o.start(t);
    o.stop(t + decay + 0.02);
  }
}

export const VOICES = {
  kick: (ctx, out, t, v) => tone(ctx, out, t, 'sine', 160, 48, 0.09, 1.0 * v, 0.35),
  snare(ctx, out, t, v) {
    const n = noise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2500;
    bp.Q.value = 0.9;
    n.connect(bp).connect(envGain(ctx, t, 0.7 * v, 0.12)).connect(out);
    n.start(t);
    n.stop(t + 0.14);
    tone(ctx, out, t, 'triangle', 240, 180, 0.05, 0.45 * v, 0.07);
  },
  hat: (ctx, out, t, v) => hat(ctx, out, t, 0.045, 0.22 * v),
  open: (ctx, out, t, v) => hat(ctx, out, t, 0.22, 0.16 * v),
  clave: (ctx, out, t, v) => tone(ctx, out, t, 'sine', 2500, 2500, 0, 0.35 * v, 0.035),
  zap: (ctx, out, t, v) => tone(ctx, out, t, 'sine', 1400, 90, 0.14, 0.4 * v, 0.16),
  tom: (ctx, out, t, v) => tone(ctx, out, t, 'sine', 190, 110, 0.2, 0.7 * v, 0.3),
};

// ---------- Muster-Erzeugung ----------

// Wahrscheinlichkeit pro Schritt bei voller Dichte. Fixe Schläge (1) bilden das Gerüst.
const PROB = {
  kick: [1, 0, 0, 0.1, 0.2, 0, 0.35, 0, 1, 0, 0.3, 0, 0.25, 0, 0.4, 0.1],
  snare: [0, 0, 0, 0, 1, 0, 0, 0.1, 0, 0, 0, 0, 1, 0, 0.15, 0.2],
  hat: [0.95, 0.5, 0.95, 0.5, 0.95, 0.5, 0.95, 0.5, 0.95, 0.5, 0.95, 0.5, 0.95, 0.5, 0.95, 0.6],
  open: [0, 0, 0.3, 0, 0, 0, 0.3, 0, 0, 0, 0.3, 0, 0, 0, 0.4, 0],
  clave: [0, 0, 0.45, 0, 0, 0.3, 0, 0.3, 0, 0, 0.45, 0, 0, 0.35, 0, 0.3],
  zap: [0, 0, 0, 0.3, 0, 0, 0, 0.25, 0, 0, 0, 0.3, 0, 0, 0.2, 0],
};
const ANCHORS = { kick: [0, 8], snare: [4, 12], hat: [0, 4, 8, 12] };
const MUTATE = 0.18; // Anteil der Schritte, die pro Takt neu ausgewürfelt werden

function roll(inst, step, density) {
  if (ANCHORS[inst]?.includes(step)) return true;
  const p = PROB[inst][step];
  // Gerüst-Instrumente reagieren schwächer auf die Dichte als die Verzierungen
  const scale = inst === 'kick' || inst === 'hat' ? 0.5 + density * 0.5 : density;
  return Math.random() < p * scale;
}

export class DrumMachine {
  constructor(engine) {
    this.engine = engine;
    this.bpm = 116;
    this.running = false;
    this.density = 0.5;
    this.pattern = {};
    for (const inst of Object.keys(PROB)) this.pattern[inst] = Array.from({ length: STEPS }, (_, s) => roll(inst, s, this.density));
    this.hits = []; // geplante Schläge für die Visualisierung: {time, step, inst}
  }

  get stepDur() {
    return 60 / this.bpm / 4;
  }

  start() {
    const ctx = this.engine.ctx;
    if (!ctx || this.running) return;
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    this.out.connect(this.engine.master);
    this.running = true;
    this.step = 0;
    this.bar = 0;
    this.breakdown = 0;
    this.nextTime = ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    const out = this.out;
    const ctx = this.engine.ctx;
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    setTimeout(() => out.disconnect(), 500);
    this.hits.length = 0;
  }

  // Vorausplanung: Schläge werden ~120 ms im Voraus exakt auf der Audio-Uhr gesetzt
  schedule() {
    const ctx = this.engine.ctx;
    while (this.nextTime < ctx.currentTime + 0.12) {
      if (this.step === 0) this.newBar();
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step = (this.step + 1) % STEPS;
    }
    const old = ctx.currentTime - 1;
    while (this.hits.length && this.hits[0].time < old) this.hits.shift();
  }

  newBar() {
    this.bar++;
    // Dichte wandert langsam (alle 4 Takte)
    if (this.bar % 4 === 0) this.density = Math.min(1, Math.max(0.15, this.density + rand(-0.25, 0.25)));
    // Ein Teil der Schritte wird neu gewürfelt: das Muster entwickelt sich, bleibt aber wiedererkennbar
    for (const inst of Object.keys(PROB))
      for (let s = 0; s < STEPS; s++) if (Math.random() < MUTATE) this.pattern[inst][s] = roll(inst, s, this.density);
    // Gelegentlich ein Breakdown über 2 Takte
    if (this.breakdown > 0) this.breakdown--;
    else if (this.bar % 8 === 1 && this.bar > 1 && Math.random() < 0.15) this.breakdown = 2;
    this.fill = this.bar % 8 === 0;
  }

  playStep(step, t) {
    const ctx = this.engine.ctx;
    const accent = step % 4 === 0 ? 1 : 0.75;
    const play = (inst, v = accent) => {
      VOICES[inst](ctx, this.out, t, v);
      this.hits.push({ time: t, step, inst });
    };
    if (this.breakdown > 0) {
      if (this.pattern.hat[step]) play('hat');
      if (this.pattern.zap[step]) play('zap', 0.6);
      this.hits.push({ time: t, step, inst: 'tick' });
      return;
    }
    // Fill im letzten Viertel jedes 8. Takts: Snare/Tom in Sechzehnteln, lauter werdend
    if (this.fill && step >= 12) {
      play(step % 2 ? 'tom' : 'snare', 0.55 + (step - 12) * 0.15);
      if (step === 12) play('kick');
      return;
    }
    for (const inst of Object.keys(PROB)) {
      if (!this.pattern[inst][step]) continue;
      if (inst === 'hat' && this.pattern.open[step]) continue; // offene Hat ersetzt die geschlossene
      play(inst, inst === 'hat' && step % 2 ? accent * 0.6 : accent);
    }
    this.hits.push({ time: t, step, inst: 'tick' });
  }

  /** Aktueller Schritt und Zeit seit der letzten Kick, für die Visualisierung */
  state() {
    const now = this.engine.ctx?.currentTime ?? 0;
    let step = -1;
    let kickAge = Infinity;
    const active = new Set();
    for (const h of this.hits) {
      if (h.time > now) break;
      if (h.inst === 'tick') step = h.step;
      if (h.inst === 'kick') kickAge = now - h.time;
    }
    for (const h of this.hits) if (h.time <= now && h.step === step) active.add(h.inst);
    return { step, kickAge, active, pattern: this.pattern, breakdown: this.breakdown > 0 };
  }
}
