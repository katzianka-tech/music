// Akkord-Modus: jeder Fingertipp spielt einen Akkord.
// Links nach rechts: die 7 Stufen der A-Moll-Tonleiter. Unten nach oben: schlicht bis schillernd.
// Tonhöhen als Halbtöne über A2 (0 = A, 3 = C, 7 = E, 10 = G ...).

// Töne geordnet nach Wichtigkeit: Grundton, Terz, Quinte, Septime/Sexte, Zusatzton.
// Alle Töne gehören zur A-Moll-Tonleiter, einzige Ausnahme ist das Gis in E7 (harmonisches Moll),
// das den Zug zurück nach Am verstärkt.
export const DEGREES = [
  { names: ['Am', 'Am7', 'Am9'], tones: [0, 3, 7, 10, 2] }, // A C E G H
  { names: ['H°', 'Hø7', 'Hø11'], tones: [2, 5, 8, 0, 7] }, // H D F A E
  { names: ['C', 'Cmaj7', 'Cmaj9'], tones: [3, 7, 10, 2, 5] }, // C E G H D
  { names: ['Dm', 'Dm7', 'Dm9'], tones: [5, 8, 0, 3, 7] }, // D F A C E
  { names: ['E', 'E7', 'E7♭13'], tones: [7, 11, 2, 5, 0] }, // E Gis H D C
  { names: ['F', 'Fmaj7', 'Fmaj7♯11'], tones: [8, 0, 3, 7, 2] }, // F A C E H
  { names: ['G', 'G6', 'G6/9'], tones: [10, 2, 5, 7, 0] }, // G H D E A
];

const UPPER_LO = 10; // tiefster Ton der Akkordstimmen (G3)
const UPPER_HI = 33; // höchster (F#5)
const CENTER = 19; // bevorzugte Mitte (E4)

export const degreeFor = (x) => DEGREES[Math.floor(Math.min(Math.max(x, 0), 0.9999) * DEGREES.length)];
export const degreeIndex = (x) => Math.floor(Math.min(Math.max(x, 0), 0.9999) * DEGREES.length);

/**
 * Melodietöne über einem Akkord: die ganze A-Moll-Tonleiter (7 Töne pro Oktave), 12 Spalten ab A3.
 * Über E7 wird G zu Gis (harmonisches Moll), sonst würde die Melodie mit dem Akkord reiben.
 * strong = Akkordton (Ruhepunkt), sonst Durchgangston (Spannung).
 */
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MELODY_COLUMNS = 12;
export function melodyGrid(degreeIdx) {
  const scale = degreeIdx === 4 ? MINOR.map((pc) => (pc === 10 ? 11 : pc)) : MINOR;
  const grid = [];
  for (let s = 12; grid.length < MELODY_COLUMNS; s++) if (scale.includes(s % 12)) grid.push(s);
  return grid;
}
export function chordTones(degreeIdx) {
  return DEGREES[degreeIdx].tones.slice(0, 4);
}

/** Wie viele Akkordtöne: unten 3 (Dreiklang), Mitte 4, oben 5 */
export const complexityFor = (y) => 3 + (y > 0.35) + (y > 0.7);

/**
 * Wählt die Lage eines Akkords so, dass sich jede Stimme gegenüber dem vorherigen Akkord
 * möglichst wenig bewegt (Stimmführung). Ohne Vorgänger: möglichst mittig.
 * style 'power': nur Grundton und Oktave (für verzerrte Klänge).
 */
export function voiceChord(degree, n, prev, style = 'full') {
  const name = degree.names[n - 3];
  const root = degree.tones[0];
  if (style === 'power') {
    const r = root < 5 ? root + 12 : root; // Grundton zwischen D3 und C#4
    return { name: degree.names[0].replace('m', '').replace('°', '') + '5', notes: [r, r + 12] };
  }
  const pcs = degree.tones.slice(0, n);
  const options = pcs.map((pc) => {
    const o = [];
    for (let s = UPPER_LO; s <= UPPER_HI; s++) if (((s % 12) + 12) % 12 === pc) o.push(s);
    return o;
  });
  const prevUpper = prev ? prev.slice(1) : null;
  let best = null;
  const walk = (i, chosen) => {
    if (i === options.length) {
      const sorted = [...chosen].sort((a, b) => a - b);
      if (sorted[sorted.length - 1] - sorted[0] > 13 + n * 2) return; // eng genug, damit es wie ein Akkord klingt (mehr Platz für mehr Töne)
      let cost = 0;
      for (let k = 1; k < sorted.length; k++) {
        const gap = sorted[k] - sorted[k - 1];
        if (gap === 1) cost += 14; // Halbton direkt nebeneinander klingt schief: fast nie
        else if (gap === 2) cost += sorted[k - 1] < 15 ? 5 : 1.5; // Ganzton-Reibung sparsam, in tiefer Lage (unter C4) klingt sie matschig
      }
      const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      cost += Math.abs(mean - CENTER) * (prevUpper ? 0.25 : 1);
      if (prevUpper) for (const s of sorted) cost += Math.min(...prevUpper.map((p) => Math.abs(p - s)));
      if (!best || cost < best.cost) best = { cost, notes: sorted };
      return;
    }
    for (const s of options[i]) if (!chosen.includes(s)) walk(i + 1, [...chosen, s]);
  };
  walk(0, []);
  // Bass: Grundton unter den Akkordstimmen
  let bass = root;
  while (bass > best.notes[0] - 3) bass -= 12;
  while (bass + 12 <= best.notes[0] - 3 && bass + 12 <= 9) bass += 12;
  return { name, notes: [bass, ...best.notes] };
}
