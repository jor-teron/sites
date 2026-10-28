/* Tuner & Metronome TM1 — pitch maths, no DOM. TM.detect(samples, sampleRate) finds the main frequency of a sound with
   the YIN method (difference function + cumulative mean normalisation + parabolic interpolation); returns Hz or null
   when the sound is too quiet or has no clear pitch. TM.note(f) names it (letter, octave, sargam with Sa = C, cents off),
   TM.strings is standard guitar tuning EADGBE and TM.closestString(f) picks the string a note is nearest to. */
(() => {
  const TM = window.TM = window.TM || {};
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const SARGAM = ['Sa', 'komal Re', 'Re', 'komal Ga', 'Ga', 'Ma', 'tivra Ma', 'Pa', 'komal Dha', 'Dha', 'komal Ni', 'Ni'];
  TM.freqOf = midi => 440 * Math.pow(2, (midi - 69) / 12);
  TM.midiOf = f => 69 + 12 * Math.log2(f / 440);
  TM.note = f => {
    const m = TM.midiOf(f), n = Math.round(m);
    return { midi: n, name: NAMES[(n % 12 + 12) % 12], oct: Math.floor(n / 12) - 1, sargam: SARGAM[(n % 12 + 12) % 12], cents: Math.round((m - n) * 1000) / 10, target: TM.freqOf(n) };
  };
  TM.strings = [['E', 2, 40], ['A', 2, 45], ['D', 3, 50], ['G', 3, 55], ['B', 3, 59], ['E', 4, 64]].map(([n, o, midi], i) => ({ i, n: 6 - i, label: n + o, midi, f: TM.freqOf(midi) }));
  TM.closestString = f => {
    const m = TM.midiOf(f); let best = TM.strings[0];
    TM.strings.forEach(s => { if (Math.abs(m - s.midi) < Math.abs(m - best.midi)) best = s; });
    return { s: best, cents: Math.round((m - best.midi) * 1000) / 10 };
  };
  let d = new Float32Array(0);
  TM.detect = (buf, sr, minF = 60, maxF = 1400) => {
    const n = buf.length; let rms = 0;
    for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
    if (Math.sqrt(rms / n) < 0.01) return null;          // too quiet: nobody is playing
    const maxLag = Math.min(Math.floor(sr / minF), n >> 1), minLag = Math.max(2, Math.floor(sr / maxF)), W = n - maxLag;
    if (d.length < maxLag + 2) d = new Float32Array(maxLag + 2);
    d[0] = 1; let run = 0;
    for (let t = 1; t <= maxLag; t++) {
      let s = 0;
      for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + t]; s += x * x; }
      run += s; d[t] = run ? s * t / run : 1;            // cumulative mean normalised difference
    }
    let tau = -1;
    for (let t = minLag; t < maxLag; t++) if (d[t] < 0.12) { while (t + 1 < maxLag && d[t + 1] < d[t]) t++; tau = t; break; }
    if (tau < 0) { let b = minLag; for (let t = minLag; t < maxLag; t++) if (d[t] < d[b]) b = t; if (d[b] > 0.3) return null; tau = b; }
    const a = d[tau - 1], b = d[tau], c = d[tau + 1] ?? b, den = a - 2 * b + c;
    return sr / (tau + (den ? (a - c) / (2 * den) : 0));
  };
})();
