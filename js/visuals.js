// Visualisierung: jede Klangfarbe hat ihren eigenen Look.
// Gezeichnet wird auf ein Vollbild-Canvas, gespeist aus den Fingerpositionen und dem Audio-Analyser.


const rand = (a, b) => a + Math.random() * (b - a);
const MAX_PARTICLES = 350;

export class Visuals {
  constructor(canvas, engine) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.engine = engine;
    this.touches = new Map(); // id -> {x, y, hue, born, lastRipple}
    this.particles = [];
    this.ripples = [];
    this.flash = 0;
    this.time = 0;
    this.wave = new Float32Array(2048);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.c.width = Math.round(this.w * dpr);
    this.c.height = Math.round(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.vignette = null;
    this.clearAll = true;
  }

  // ---- Ereignisse aus app.js (Koordinaten in Pixeln) ----

  down(id, px, py) {
    this.touches.set(id, { id, x: px, y: py, hue: rand(0, 360), born: this.time, lastRipple: this.time });
    this.flash = 1;
    const theme = THEMES[this.engine.presetId];
    theme.onDown?.(this, px, py);
  }

  move(id, px, py) {
    const t = this.touches.get(id);
    if (t) {
      t.x = px;
      t.y = py;
    }
  }

  up(id) {
    this.touches.delete(id);
  }

  presetChanged() {
    this.particles.length = 0;
    this.ripples.length = 0;
    this.clearAll = true;
  }

  // ---- Hilfen für Themes ----

  level() {
    const a = this.engine.analyser;
    if (!a) return 0;
    a.getFloatTimeDomainData(this.wave);
    let s = 0;
    for (let i = 0; i < this.wave.length; i++) s += this.wave[i] * this.wave[i];
    return Math.min(Math.sqrt(s / this.wave.length) * 4, 1);
  }

  emit(p) {
    if (this.particles.length < MAX_PARTICLES) this.particles.push(p);
  }

  stepParticles(dt, gravity = 0, drag = 1) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.vx *= drag;
      p.vy = p.vy * drag + gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) ps.splice(i, 1);
    }
  }

  noteLabel(t) {
    return this.engine.labelFor(t.id, t.x / this.w);
  }

  /**
   * Spaltenraster: eine oder zwei Zonen (Geteilt-Modus). Akkordtöne hell, Durchgangstöne gedimmt,
   * der gehaltene Akkord ist hinterlegt.
   */
  guides(color, labelColor, font) {
    const zones = this.engine.layout();
    this.labelStyle = zones ? { zones, labelColor, font } : null; // Beschriftung folgt in frame(), über allem
    if (!zones) return;
    const g = this.g;
    g.save();
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.font = font;
    g.textAlign = 'center';
    for (const z of zones) {
      const top = this.h * (1 - z.y1);
      const bottom = this.h * (1 - z.y0);
      const n = z.labels.length;
      const cw = this.w / n;
      if (z.active != null) {
        g.fillStyle = color;
        g.fillRect(z.active * cw, top, cw, bottom - top);
      }
      for (let i = 1; i < n; i++) {
        g.beginPath();
        g.moveTo(i * cw, top);
        g.lineTo(i * cw, bottom);
        g.stroke();
      }

      if (z.y1 < 1) {
        // Trennlinie zwischen den Zonen
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, top);
        g.lineTo(this.w, top);
        g.stroke();
        g.lineWidth = 1;
      }
    }
    g.restore();
  }

  /** Spaltenbeschriftung, zuletzt gezeichnet, damit Wellenformen sie nicht verdecken */
  drawLabels() {
    const st = this.labelStyle;
    if (!st) return;
    const g = this.g;
    g.save();
    g.textAlign = 'center';
    for (const z of st.zones) {
      const bottom = this.h * (1 - z.y0);
      const n = z.labels.length;
      const cw = this.w / n;
      if (z.y0 > 0) {
        // Beschriftung mitten im Bild: dunkler Streifen, damit sie lesbar bleibt
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(0, bottom - 38, this.w, 30);
      }
      for (let i = 0; i < n; i++) {
        const weak = z.strong && !z.strong[i];
        g.globalAlpha = weak ? 0.45 : 1;
        g.font = z.strong && !weak ? 'bold ' + st.font : st.font;
        g.fillStyle = st.labelColor;
        g.fillText(z.labels[i], i * cw + cw / 2, bottom - 18);
      }
    }
    g.restore();
  }

  frame(now) {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.time += dt;
    const lvl = this.level();
    const theme = THEMES[this.engine.presetId];
    this.labelStyle = null;
    theme.draw(this, dt, lvl);
    this.drawLabels();
    if (this.engine.mode === 'chord' || this.engine.mode === 'split') drawChord(this);
    this.clearAll = false;
    this.flash = Math.max(0, this.flash - dt * 4);
    requestAnimationFrame((t) => this.frame(t));
  }
}

// ---------- Themes ----------

function wavePath(v, { yMid, amp, step = 4, shape = (s) => s, stepped = false }) {
  const g = v.g;
  const n = v.wave.length;
  g.beginPath();
  let prevY = null;
  for (let i = 0; i < n; i += step) {
    const x = (i / n) * v.w;
    const y = yMid + shape(v.wave[i]) * amp;
    if (i === 0) g.moveTo(x, y);
    else if (stepped) {
      g.lineTo(x, prevY);
      g.lineTo(x, y);
    } else g.lineTo(x, y);
    prevY = y;
  }
}

// Name des zuletzt gespielten Akkords: leuchtet beim Anschlag auf und verblasst nach dem Loslassen
const CHORD_STYLE = {
  robotik: { font: 'bold 44px ui-monospace, monospace', glow: '#7ff0ff' },
  psychedelik: { font: '600 44px system-ui, sans-serif', glow: '#ff8cf5' },
  industrial: { font: '52px Impact, system-ui, sans-serif', glow: '#ff3b1f' },
  lofi: { font: 'italic bold 44px Georgia, serif', glow: '#ffb055' },
};

function drawChord(v) {
  const e = v.engine;
  const c = e.lastChord;
  if (!c) return;
  const held = e.voices.size > 0;
  const age = (performance.now() - c.time) / 1000;
  const alpha = held ? 1 : Math.max(0, 1 - (age - 0.5) / 1.5);
  if (alpha <= 0) return;
  const glow = Math.exp(-age * 4);
  const st = CHORD_STYLE[e.presetId];
  const g = v.g;
  g.save();
  g.textAlign = 'center';
  g.font = st.font;
  g.shadowColor = st.glow;
  g.shadowBlur = 8 + glow * 30;
  g.fillStyle = `rgba(255,255,255,${alpha * (0.8 + glow * 0.2)})`;
  g.fillText(c.name, v.w / 2, 150);
  g.restore();
}

// Lauflicht-Leiste des Drumcomputers: 16 Schritte, Kick rot, Snare weiss, Rest cyan
function drawSteps(v, beat) {
  const g = v.g;
  const n = beat.pattern.kick.length;
  const pad = 12;
  const cw = (v.w - pad * 2) / n;
  const y = v.h - 64;
  for (let s = 0; s < n; s++) {
    const x = pad + s * cw;
    const cur = s === beat.step;
    g.strokeStyle = cur ? '#ffffff' : s % 4 === 0 ? 'rgba(127,240,255,0.55)' : 'rgba(127,240,255,0.25)';
    g.lineWidth = cur ? 2 : 1;
    g.strokeRect(x + 2, y, cw - 4, 22);
    if (beat.breakdown) {
      if (beat.pattern.hat[s]) {
        g.fillStyle = 'rgba(127,240,255,0.5)';
        g.fillRect(x + 4, y + 15, cw - 8, 4);
      }
    } else {
      if (beat.pattern.kick[s]) {
        g.fillStyle = cur ? '#ff3b6b' : 'rgba(255,59,107,0.6)';
        g.fillRect(x + 4, y + 3, cw - 8, 5);
      }
      if (beat.pattern.snare[s]) {
        g.fillStyle = cur ? '#ffffff' : 'rgba(255,255,255,0.55)';
        g.fillRect(x + 4, y + 9, cw - 8, 5);
      }
      if (beat.pattern.hat[s] || beat.pattern.clave[s] || beat.pattern.zap[s]) {
        g.fillStyle = cur ? '#7ff0ff' : 'rgba(127,240,255,0.45)';
        g.fillRect(x + 4, y + 15, cw - 8, 4);
      }
    }
    if (cur) {
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + 2, y, cw - 4, 22);
    }
  }
}

const THEMES = {
  // Kraftwerk-artig: kühl, präzise, geometrisch
  robotik: {
    draw(v, dt, lvl) {
      const g = v.g;
      g.fillStyle = '#04060c';
      g.fillRect(0, 0, v.w, v.h);
      const beat = v.drums?.running ? v.drums.state() : null;
      const pulse = beat ? Math.exp(-beat.kickAge * 9) : 0;
      // Raster (pulsiert mit der Kick)
      g.strokeStyle = `rgba(80,220,255,${0.05 + lvl * 0.12 + pulse * 0.3})`;
      g.lineWidth = 1;
      const s = 32;
      g.beginPath();
      for (let x = (v.time * 20) % s; x < v.w; x += s) {
        g.moveTo(x, 0);
        g.lineTo(x, v.h);
      }
      for (let y = 0; y < v.h; y += s) {
        g.moveTo(0, y);
        g.lineTo(v.w, y);
      }
      g.stroke();
      v.guides('rgba(80,220,255,0.18)', 'rgba(170,240,255,0.9)', '12px ui-monospace, monospace');
      if (beat) drawSteps(v, beat);
      // digitale, gestufte Wellenform
      g.strokeStyle = '#7ff0ff';
      g.lineWidth = 2;
      wavePath(v, { yMid: v.h / 2, amp: v.h * 0.3, step: 16, stepped: true });
      g.stroke();
      // Finger: Fadenkreuz und rotierendes Quadrat
      for (const t of v.touches.values()) {
        g.strokeStyle = 'rgba(127,240,255,0.5)';
        g.beginPath();
        g.moveTo(0, t.y);
        g.lineTo(v.w, t.y);
        g.moveTo(t.x, 0);
        g.lineTo(t.x, v.h);
        g.stroke();
        const size = 26 + lvl * 50;
        g.save();
        g.translate(t.x, t.y);
        g.rotate(v.time * 1.5);
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        g.strokeRect(-size / 2, -size / 2, size, size);
        g.rotate(-v.time * 3);
        g.strokeStyle = '#ff3b6b';
        g.strokeRect(-size / 3, -size / 3, (size * 2) / 3, (size * 2) / 3);
        g.restore();
        g.fillStyle = '#ffffff';
        g.font = 'bold 14px ui-monospace, monospace';
        g.fillText(v.noteLabel(t), t.x + size, t.y - size / 2);
      }
    },
  },

  // Tame-Impala-artig: fliessend, farbig, Spuren, die langsam verschwimmen
  psychedelik: {
    draw(v, dt, lvl) {
      const g = v.g;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = v.clearAll ? '#12001f' : 'rgba(18,0,31,0.07)';
      g.fillRect(0, 0, v.w, v.h);
      v.guides('rgba(255,180,255,0.06)', 'rgba(255,200,255,0.35)', '13px system-ui, sans-serif');
      g.globalCompositeOperation = 'lighter';
      // kreisende Wellenform in der Mitte
      const cx = v.w / 2;
      const cy = v.h / 2;
      const r0 = Math.min(v.w, v.h) * 0.22;
      const n = v.wave.length;
      g.lineWidth = 3;
      g.strokeStyle = `hsla(${(v.time * 40) % 360},90%,60%,0.22)`;
      g.beginPath();
      for (let i = 0; i <= n; i += 8) {
        const a = (i / n) * Math.PI * 2 + v.time * 0.3;
        const r = r0 + v.wave[i % n] * r0 * 0.6;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
      // Farbblasen an den Fingern
      for (const t of v.touches.values()) {
        const hue = (t.hue + v.time * 60) % 360;
        const r = 50 + lvl * 90;
        const grad = g.createRadialGradient(t.x, t.y, 0, t.x, t.y, r);
        grad.addColorStop(0, `hsla(${hue},100%,60%,0.07)`);
        grad.addColorStop(1, `hsla(${(hue + 80) % 360},100%,50%,0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(t.x, t.y, r, 0, Math.PI * 2);
        g.fill();
        if (Math.random() < 0.6)
          v.emit({ x: t.x, y: t.y, vx: rand(-40, 40), vy: rand(-40, 40), life: rand(1.5, 3), hue, size: rand(3, 9) });
      }
      // Partikel wirbeln um die Mitte
      for (const p of v.particles) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        p.vx += -dy * 0.25 * dt;
        p.vy += dx * 0.25 * dt;
        g.fillStyle = `hsla(${(p.hue + p.life * 40) % 360},100%,60%,${Math.min(p.life, 1) * 0.12})`;
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      }
      v.stepParticles(dt, 0, 0.995);
      g.globalCompositeOperation = 'source-over';
    },
  },

  // Rammstein-artig: hart, rot-schwarz, Funken, Erschütterung
  industrial: {
    onDown(v, x, y) {
      for (let k = 0; k < 40; k++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(150, 650);
        v.emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 150, life: rand(0.4, 1.1) });
      }
    },
    draw(v, dt, lvl) {
      const g = v.g;
      g.save();
      const shake = lvl * 10;
      g.translate(rand(-shake, shake), rand(-shake, shake));
      g.fillStyle = `rgb(${10 + v.flash * 120},${6 + v.flash * 10},6)`;
      g.fillRect(-20, -20, v.w + 40, v.h + 40);
      // Störstreifen
      if (lvl > 0.05) {
        for (let k = 0; k < 4; k++) {
          g.fillStyle = `rgba(255,40,20,${rand(0.03, 0.12) * lvl * 3})`;
          g.fillRect(0, rand(0, v.h), v.w, rand(2, 14));
        }
      }
      v.guides('rgba(255,60,30,0.14)', 'rgba(255,120,90,0.55)', 'bold 13px Impact, system-ui, sans-serif');
      // brutale, übersteuerte Wellenform
      g.lineJoin = 'miter';
      g.strokeStyle = '#ff2a12';
      g.lineWidth = 6;
      wavePath(v, { yMid: v.h / 2, amp: v.h * 0.12, step: 6, shape: (s) => Math.tanh(s * 6) });
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.5;
      g.stroke();
      // Finger: weissglühender Kern mit Säule
      for (const t of v.touches.values()) {
        const grad = g.createLinearGradient(t.x, 0, t.x, v.h);
        grad.addColorStop(0, 'rgba(255,40,10,0)');
        grad.addColorStop(t.y / v.h, 'rgba(255,90,20,0.55)');
        grad.addColorStop(1, 'rgba(255,40,10,0)');
        g.fillStyle = grad;
        g.fillRect(t.x - 18 - lvl * 30, 0, 36 + lvl * 60, v.h);
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(t.x, t.y, 10 + lvl * 18, 0, Math.PI * 2);
        g.fill();
        if (Math.random() < 0.5 + lvl) {
          const a = rand(0, Math.PI * 2);
          v.emit({ x: t.x, y: t.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300 - 100, life: rand(0.3, 0.7) });
        }
      }
      // Funken
      g.lineWidth = 2;
      for (const p of v.particles) {
        g.strokeStyle = `rgba(255,${150 + p.life * 100},40,${Math.min(p.life * 2, 1)})`;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        g.stroke();
      }
      v.stepParticles(dt, 900, 0.99);
      g.restore();
    },
  },

  // Gorillaz-/Dub-artig: warm, körnig, VHS-Look, Echo-Ringe im Takt des Delays
  lofi: {
    draw(v, dt, lvl) {
      const g = v.g;
      g.fillStyle = v.clearAll ? '#1d1712' : 'rgba(29,23,18,0.22)';
      g.fillRect(0, 0, v.w, v.h);
      v.guides('rgba(240,200,140,0.1)', 'rgba(240,210,160,0.55)', 'italic 14px Georgia, serif');
      // Echo-Ringe: alle 375 ms ein neuer Ring pro Finger, passend zum Dub-Echo
      for (const t of v.touches.values()) {
        if (v.time - t.lastRipple >= 0.375) {
          t.lastRipple = v.time;
          v.ripples.push({ x: t.x, y: t.y, r: 10, life: 1 });
        }
      }
      for (let i = v.ripples.length - 1; i >= 0; i--) {
        const r = v.ripples[i];
        r.r += dt * 160;
        r.life -= dt * 0.45;
        if (r.life <= 0) {
          v.ripples.splice(i, 1);
          continue;
        }
        g.strokeStyle = `rgba(110,200,190,${r.life * 0.6})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        g.stroke();
      }
      // VHS-Wellenform mit Farbversatz
      const jitter = Math.sin(v.time * 1.3) * 4;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,80,70,0.55)';
      wavePath(v, { yMid: v.h * 0.5 + jitter + 3, amp: v.h * 0.2, step: 8 });
      g.stroke();
      g.strokeStyle = 'rgba(80,220,210,0.55)';
      wavePath(v, { yMid: v.h * 0.5 + jitter - 3, amp: v.h * 0.2, step: 8 });
      g.stroke();
      g.strokeStyle = '#f3e3c3';
      g.lineWidth = 2;
      wavePath(v, { yMid: v.h * 0.5 + jitter, amp: v.h * 0.2, step: 8 });
      g.stroke();
      // Finger: weiche Flecken
      for (const t of v.touches.values()) {
        g.fillStyle = 'rgba(255,170,80,0.85)';
        g.beginPath();
        g.arc(t.x, t.y, 16 + lvl * 26, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1d1712';
        g.font = 'italic bold 13px Georgia, serif';
        g.textAlign = 'center';
        g.fillText(v.noteLabel(t), t.x, t.y + 4);
        g.textAlign = 'start';
      }
      // Filmkorn
      for (let k = 0; k < 160; k++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,240,210,0.07)' : 'rgba(0,0,0,0.12)';
        g.fillRect(rand(0, v.w), rand(0, v.h), 2, 2);
      }
      // Vignette
      if (!v.vignette) {
        v.vignette = g.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.3, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
        v.vignette.addColorStop(0, 'rgba(0,0,0,0)');
        v.vignette.addColorStop(1, 'rgba(0,0,0,0.14)');
      }
      g.fillStyle = v.vignette;
      g.fillRect(0, 0, v.w, v.h);
    },
  },
};
