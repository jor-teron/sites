/*
 * Sound Recorder — audio maths: live peak worklet, peaks from a file, silence / sound regions.
 * PPS peaks per second (50 = one value per 20 ms; 30 min = 90 000 floats, ~350 KB).
 */
const SRAudio = (() => {
  const PPS = 50;
  const WORKLET = `registerProcessor('sr-peaks', class extends AudioWorkletProcessor {
    constructor(o) { super(); this.bin = o.processorOptions.bin; this.n = 0; this.m = 0; this.out = []; }
    process(inp) {
      const ch = inp[0];
      if (ch && ch.length) {
        const len = ch[0].length;
        for (let i = 0; i < len; i++) {
          let v = 0;
          for (let c = 0; c < ch.length; c++) { const a = Math.abs(ch[c][i]); if (a > v) v = a; }
          if (v > this.m) this.m = v;
          if (++this.n >= this.bin) { this.out.push(this.m); this.n = 0; this.m = 0; if (this.out.length >= 5) { this.port.postMessage(this.out); this.out = []; } }
        }
      }
      return true;
    }
  });`;
  let wurl = null;
  const workletURL = () => wurl || (wurl = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })));
  const idle = () => new Promise((r) => setTimeout(r, 0));

  /* Decode a file (resampled to 8 kHz mono-ish to keep memory low for long audio), then build
     peaks in slices, yielding to the UI between slices. onProgress(0..1). -> { peaks, dur } */
  async function decodePeaks(blob, onProgress) {
    const buf = await blob.arrayBuffer();
    const rate = 8000, oc = new OfflineAudioContext(1, 1, rate);
    const ab = await oc.decodeAudioData(buf);
    const chans = []; for (let c = 0; c < ab.numberOfChannels; c++) chans.push(ab.getChannelData(c));
    const bin = ab.sampleRate / PPS, n = Math.ceil(ab.length / bin), peaks = new Float32Array(n);
    const SLICE = PPS * 60; /* one minute of peaks per slice */
    for (let p0 = 0; p0 < n; p0 += SLICE) {
      const p1 = Math.min(n, p0 + SLICE);
      for (let p = p0; p < p1; p++) {
        const a = Math.floor(p * bin), b = Math.min(ab.length, Math.floor((p + 1) * bin));
        let m = 0;
        for (const d of chans) for (let i = a; i < b; i++) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > m) m = v; }
        peaks[p] = m;
      }
      if (onProgress) onProgress(p1 / n);
      await idle();
    }
    return { peaks, dur: ab.duration };
  }

  /* Sound regions [{s,e}] in seconds. thrDb: level below which a bin is silent.
     Silent gaps shorter than minSil are bridged; sounds shorter than minSnd are dropped. */
  function regions(peaks, pps, thrDb, minSil = 1, minSnd = 0.15) {
    const thr = Math.pow(10, thrDb / 20), out = [];
    let s = -1;
    for (let i = 0; i <= peaks.length; i++) {
      const loud = i < peaks.length && peaks[i] >= thr;
      if (loud && s < 0) s = i;
      else if (!loud && s >= 0) { out.push({ s: s / pps, e: i / pps }); s = -1; }
    }
    const merged = [];
    for (const r of out) {
      const last = merged[merged.length - 1];
      if (last && r.s - last.e < minSil) last.e = r.e; else merged.push({ s: r.s, e: r.e });
    }
    return merged.filter((r) => r.e - r.s >= minSnd);
  }
  const db = (v) => (v > 0 ? 20 * Math.log10(v) : -120);
  return { PPS, workletURL, decodePeaks, regions, db };
})();
