import { Engine, PRESETS } from './engine.js';
import { Visuals } from './visuals.js';
import { DrumMachine } from './drums.js';

const engine = new Engine();
const canvas = document.getElementById('stage');
const visuals = new Visuals(canvas, engine);
const drums = new DrumMachine(engine);
visuals.drums = drums;
const startEl = document.getElementById('start');
const presetsEl = document.getElementById('presets');
const modeBtn = document.getElementById('mode');
const hintEl = document.getElementById('hint');
const beatBtn = document.getElementById('beat');
const tempoBtn = document.getElementById('tempo');

// ---- gespeicherte Einstellungen (nur Komfort, darf fehlen) ----
const store = {
  get(k) {
    try {
      return localStorage.getItem('klang.' + k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('klang.' + k, v);
    } catch {}
  },
};

// ---- Klangfarben-Knöpfe ----
for (const [id, p] of Object.entries(PRESETS)) {
  const b = document.createElement('button');
  b.textContent = p.name;
  b.dataset.id = id;
  b.addEventListener('click', () => selectPreset(id));
  presetsEl.appendChild(b);
}

function selectPreset(id) {
  engine.setPreset(id);
  visuals.presetChanged();
  document.body.dataset.preset = id;
  presetsEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === id));
  hintEl.textContent = PRESETS[id].hint;
  store.set('preset', id);
  // Beat gibt es (vorerst) nur bei Robotik
  const hasBeat = id === 'robotik';
  beatBtn.hidden = tempoBtn.hidden = !hasBeat;
  if (!hasBeat) setBeat(false);
}

// ---- Beat (Robotik) ----
function setBeat(on) {
  if (on) drums.start();
  else drums.stop();
  beatBtn.setAttribute('aria-pressed', drums.running);
  beatBtn.textContent = drums.running ? 'Beat ■' : 'Beat ▶';
}
beatBtn.addEventListener('click', () => setBeat(!drums.running));

const TEMPI = [100, 116, 132];
function setTempo(bpm) {
  drums.bpm = bpm;
  tempoBtn.textContent = bpm + ' BPM';
  store.set('bpm', bpm);
}
tempoBtn.addEventListener('click', () => setTempo(TEMPI[(TEMPI.indexOf(drums.bpm) + 1) % TEMPI.length]));
setTempo(TEMPI.includes(+store.get('bpm')) ? +store.get('bpm') : 116);

// ---- Frei / Tonleiter ----
function setQuantize(q) {
  engine.quantize = q;
  modeBtn.textContent = q ? 'Tonleiter' : 'Frei';
  modeBtn.setAttribute('aria-pressed', q);
  store.set('quantize', q ? '1' : '0');
}
modeBtn.addEventListener('click', () => setQuantize(!engine.quantize));

selectPreset(PRESETS[store.get('preset')] ? store.get('preset') : 'robotik');
setQuantize(store.get('quantize') !== '0');

// ---- Start (Audio darf erst nach einer Berührung starten) ----
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIOS) document.getElementById('ios').hidden = false;

startEl.addEventListener('click', async () => {
  try {
    await engine.start();
    startEl.hidden = true;
  } catch (e) {
    startEl.querySelector('p').textContent = 'Audio konnte nicht gestartet werden: ' + e.message;
  }
});

// ---- Multitouch-Spielfläche ----
const norm = (e) => [e.clientX / innerWidth, 1 - e.clientY / innerHeight];

canvas.addEventListener('pointerdown', (e) => {
  if (!engine.ctx) return;
  if (engine.ctx.state !== 'running') engine.ctx.resume();
  canvas.setPointerCapture(e.pointerId);
  const [x, y] = norm(e);
  engine.noteOn(e.pointerId, x, y);
  visuals.down(e.pointerId, e.clientX, e.clientY);
});

canvas.addEventListener('pointermove', (e) => {
  if (!engine.voices.has(e.pointerId)) return;
  const [x, y] = norm(e);
  engine.noteMove(e.pointerId, x, y);
  visuals.move(e.pointerId, e.clientX, e.clientY);
});

const end = (e) => {
  engine.noteOff(e.pointerId);
  visuals.up(e.pointerId);
};
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);
canvas.addEventListener('lostpointercapture', end);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Wenn die App in den Hintergrund geht: alle Töne beenden, damit nichts hängen bleibt
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    engine.releaseAll();
    visuals.touches.clear();
    setBeat(false); // im Hintergrund drosselt der Browser die Zeitsteuerung
  }
});

// ---- Offline-Fähigkeit (PWA) ----
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Zugriff für Fehlersuche in der Browser-Konsole
window.klang = { engine, visuals, drums };
