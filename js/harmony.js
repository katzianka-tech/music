// Akkordfolgen in A-Moll. Die Fingertöne rasten auf die Töne des aktuellen Akkords ein.
// Tonhöhen als Halbtonabstand zum Grundton A (0 = A, 3 = C, 7 = E, 10 = G ...).

export const CHORDS = {
  Am7: [0, 3, 7, 10], // A C E G
  Dm7: [5, 8, 0, 3], // D F A C
  Em7: [7, 10, 2, 5], // E G H D
  Fmaj7: [8, 0, 3, 7], // F A C E
  Cmaj7: [3, 7, 10, 2], // C E G H
  G7: [10, 2, 5, 8], // G H D F
};

// Gängige Folgen in Moll (Stufen in Klammern)
export const PROGRESSIONS = [
  ['Am7', 'Fmaj7', 'Cmaj7', 'G7'], // i – VI – III – VII
  ['Am7', 'G7', 'Fmaj7', 'Em7'], // i – VII – VI – v (absteigend)
  ['Am7', 'Dm7', 'Fmaj7', 'Em7'], // i – iv – VI – v
  ['Fmaj7', 'G7', 'Am7', 'Am7'], // VI – VII – i – i
];

const GRID_SIZE = 9;
const BARS_PER_PROGRESSION = 16;

/** Die ersten 9 Akkordtöne ab A2 aufwärts: das Spaltenraster für die Fingertöne */
export function chordGrid(name) {
  const pcs = CHORDS[name];
  const grid = [];
  for (let s = 0; grid.length < GRID_SIZE; s++) if (pcs.includes(s % 12)) grid.push(s);
  return grid;
}

export class Harmony {
  constructor() {
    this.prog = PROGRESSIONS[0];
  }

  /** Akkord für Takt n (ab 1). Alle 16 Takte wird eine andere Folge gewählt. */
  chordForBar(n) {
    const i = n - 1;
    if (i > 0 && i % BARS_PER_PROGRESSION === 0) {
      const others = PROGRESSIONS.filter((p) => p !== this.prog);
      this.prog = others[Math.floor(Math.random() * others.length)];
    }
    return { now: this.prog[i % 4], next: (i + 1) % BARS_PER_PROGRESSION === 0 ? null : this.prog[(i + 1) % 4] };
  }

  reset() {
    this.prog = PROGRESSIONS[0];
  }
}
