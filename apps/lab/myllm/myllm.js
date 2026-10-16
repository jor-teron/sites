/* myllm.js - tiny character-level language model (makemore-style MLP) in pure JS.
 * Pipeline: text -> tokens (chars) -> embeddings (concatenated, order kept)
 *   -> tanh hidden layer -> logits -> softmax -> cross-entropy loss
 *   -> backpropagation -> Adam update. No libraries, no build step. */

const DEFAULT_TEXT = `Assam is a state in Northeast India along the Brahmaputra and Barak valleys. It covers 78438 square kilometres. Population is about 31 million. Capital is Dispur. Largest city is Guwahati. Official languages are Assamese and Bodo. Known for Assam tea and Assam silk. Home to one-horned Indian rhinoceros in Kaziranga National Park. Guwahati is the largest city in Northeast India and gateway to the region. Situated on the south bank of the Brahmaputra. Known as the City of Temples with Kamakhya Temple. Ancient name Pragjyotishpura. Dispur is the capital of Assam located within Guwahati. LGB International Airport serves the city. The Brahmaputra river flows north of Guwahati. Many temples like Kamakhya, Umananda, Navagraha are in Guwahati.`;

/* ---------- Engine (no DOM, testable in Node) ---------- */

function randn() { // standard normal (Box-Muller)
  let u = 0; while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

function buildVocab(text) {
  const chars = [...new Set(text)].sort();
  const stoi = {}; chars.forEach((c, i) => stoi[c] = i);
  return { chars, stoi, size: chars.length };
}

// Pick embed/hidden sizes so total params is close to the target.
function makeConfig(targetParams, vocab, context) {
  const V = vocab, C = context;
  const E = Math.max(4, Math.min(32, Math.round(Math.sqrt(targetParams) / 12)));
  let H = Math.round((targetParams - V * E - V) / (C * E + 1 + V));
  H = Math.max(8, Math.min(1024, H));
  return { V, C, E, H };
}

function countParams(c) { return c.V * c.E + c.C * c.E * c.H + c.H + c.H * c.V + c.V; }

class TinyLM {
  constructor(cfg) {
    this.cfg = cfg;
    const { V, C, E, H } = cfg, D = C * E;
    const mk = (n, s) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = randn() * s; return a; };
    this.p = {
      emb: mk(V * E, 1.0),
      W1: mk(D * H, (5 / 3) / Math.sqrt(D) * 0.5), // Kaiming-ish for tanh, scaled down
      b1: new Float32Array(H),
      W2: mk(H * V, 0.01),                         // small output -> initial loss ~ ln(V)
      b2: new Float32Array(V),
    };
    this.g = {}; this.m = {}; this.v = {};
    for (const k in this.p) {
      const n = this.p[k].length;
      this.g[k] = new Float32Array(n); this.m[k] = new Float32Array(n); this.v[k] = new Float32Array(n);
    }
    this.t = 0; this.steps = 0;
  }

  // Forward one example; ctx = array of C token ids. Returns {x, h, probs}.
  forward(ctx, temperature = 1) {
    const { V, C, E, H } = this.cfg, D = C * E, p = this.p;
    const x = new Float32Array(D);
    for (let j = 0; j < C; j++) x.set(p.emb.subarray(ctx[j] * E, ctx[j] * E + E), j * E);
    const h = new Float32Array(H);
    for (let k = 0; k < H; k++) h[k] = p.b1[k];
    for (let d = 0; d < D; d++) { const xd = x[d]; if (xd === 0) continue; const row = d * H; for (let k = 0; k < H; k++) h[k] += xd * p.W1[row + k]; }
    for (let k = 0; k < H; k++) h[k] = Math.tanh(h[k]);
    const logits = new Float32Array(V);
    for (let v = 0; v < V; v++) logits[v] = p.b2[v];
    for (let k = 0; k < H; k++) { const hk = h[k], row = k * V; for (let v = 0; v < V; v++) logits[v] += hk * p.W2[row + v]; }
    let mx = -Infinity; for (let v = 0; v < V; v++) { logits[v] /= temperature; if (logits[v] > mx) mx = logits[v]; }
    let s = 0; for (let v = 0; v < V; v++) { logits[v] = Math.exp(logits[v] - mx); s += logits[v]; }
    for (let v = 0; v < V; v++) logits[v] /= s;
    return { x, h, probs: logits };
  }

  // One minibatch step: forward, loss, backprop, Adam update. Returns mean loss.
  trainStep(data, batch, lr) {
    const { V, C, E, H } = this.cfg, D = C * E, p = this.p, g = this.g;
    for (const k in g) g[k].fill(0);
    let loss = 0;
    const ctx = new Array(C), dh = new Float32Array(H), dx = new Float32Array(D);
    for (let b = 0; b < batch; b++) {
      const i = C + Math.floor(Math.random() * (data.length - C));
      for (let j = 0; j < C; j++) ctx[j] = data[i - C + j];
      const target = data[i];
      const { x, h, probs } = this.forward(ctx);
      loss += -Math.log(probs[target] + 1e-9);
      // dLoss/dlogits = probs - onehot(target)
      probs[target] -= 1;
      for (let v = 0; v < V; v++) { probs[v] /= batch; g.b2[v] += probs[v]; }
      dh.fill(0);
      for (let k = 0; k < H; k++) {
        const hk = h[k], row = k * V; let acc = 0;
        for (let v = 0; v < V; v++) { g.W2[row + v] += hk * probs[v]; acc += p.W2[row + v] * probs[v]; }
        dh[k] = acc * (1 - hk * hk); // through tanh
        g.b1[k] += dh[k];
      }
      for (let d = 0; d < D; d++) {
        const xd = x[d], row = d * H; let acc = 0;
        for (let k = 0; k < H; k++) { g.W1[row + k] += xd * dh[k]; acc += p.W1[row + k] * dh[k]; }
        dx[d] = acc;
      }
      for (let j = 0; j < C; j++) { const off = ctx[j] * E; for (let e = 0; e < E; e++) g.emb[off + e] += dx[j * E + e]; }
    }
    // Adam
    this.t++;
    const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
    for (const k in p) {
      const P = p[k], G = g[k], M = this.m[k], S = this.v[k];
      for (let i = 0; i < P.length; i++) {
        M[i] = b1 * M[i] + (1 - b1) * G[i];
        S[i] = b2 * S[i] + (1 - b2) * G[i] * G[i];
        P[i] -= lr * (M[i] / c1) / (Math.sqrt(S[i] / c2) + 1e-8);
      }
    }
    this.steps++;
    return loss / batch;
  }

  // Average loss over the whole text (or a sample of it).
  evalLoss(data, maxN = 2000) {
    const C = this.cfg.C; let loss = 0, n = 0;
    const stride = Math.max(1, Math.floor((data.length - C) / maxN));
    for (let i = C; i < data.length; i += stride) {
      const { probs } = this.forward(Array.from(data.subarray(i - C, i)));
      loss += -Math.log(probs[data[i]] + 1e-9); n++;
    }
    return loss / n;
  }

  generate(vocab, prompt, n, temperature) {
    const C = this.cfg.C;
    const pad = vocab.stoi[' '] !== undefined ? vocab.stoi[' '] : 0;
    const ids = [...prompt].filter(c => c in vocab.stoi).map(c => vocab.stoi[c]);
    let ctx = new Array(C).fill(pad).concat(ids).slice(-C);
    let out = '';
    for (let s = 0; s < n; s++) {
      const { probs } = this.forward(ctx, temperature);
      let r = Math.random(), next = probs.length - 1;
      for (let v = 0; v < probs.length; v++) { r -= probs[v]; if (r <= 0) { next = v; break; } }
      out += vocab.chars[next];
      ctx = ctx.slice(1); ctx.push(next);
    }
    return out;
  }
}

function lrAt(step, total, base = 0.01) { // cosine decay to 10%
  return base * (0.1 + 0.9 * 0.5 * (1 + Math.cos(Math.PI * Math.min(1, step / total))));
}

if (typeof module !== 'undefined') module.exports = { TinyLM, buildVocab, makeConfig, countParams, lrAt, DEFAULT_TEXT };

/* ---------- UI ---------- */

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  let model = null, vocab = null, data = null, running = false, losses = [];

  $('trainingText').value = DEFAULT_TEXT;

  function currentCfg() {
    const text = $('trainingText').value;
    const V = Math.max(2, new Set(text).size);
    return makeConfig(+$('paramInput').value || 10000, V, +$('contextInput').value || 6);
  }
  function updateSize() {
    const c = currentCfg(), n = countParams(c);
    $('statParams').textContent = n.toLocaleString();
    $('sizeInput').value = (n * 4 / 1024).toFixed(1) + ' KB';
    $('statShape').textContent = `vocab ${c.V} · ctx ${c.C} · embed ${c.E} · hidden ${c.H}`;
  }
  ['paramInput', 'contextInput', 'trainingText'].forEach(id => $(id).addEventListener('input', updateSize));
  updateSize();

  $('tempInput').addEventListener('input', () => $('tempVal').textContent = (+$('tempInput').value).toFixed(2));

  function drawChart() {
    const cv = $('lossChart'), ctx = cv.getContext('2d');
    const w = cv.width = cv.clientWidth * devicePixelRatio, h = cv.height = cv.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    if (losses.length < 2) return;
    const max = Math.max(...losses), min = Math.min(...losses, 0);
    ctx.strokeStyle = '#7c9cff'; ctx.lineWidth = 2 * devicePixelRatio; ctx.beginPath();
    losses.forEach((l, i) => { const x = i / (losses.length - 1) * w, y = h - (l - min) / (max - min || 1) * (h - 10) - 5; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = '#8b93a7'; ctx.font = `${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(max.toFixed(2), 4, 14 * devicePixelRatio); ctx.fillText(min.toFixed(2), 4, h - 4);
  }

  $('trainBtn').addEventListener('click', () => {
    const text = $('trainingText').value;
    const c = currentCfg();
    if (text.length < c.C + 10) { $('trainStatus').textContent = 'Training text is too short.'; return; }
    vocab = buildVocab(text);
    c.V = vocab.size;
    data = Int32Array.from([...text].map(ch => vocab.stoi[ch]));
    model = new TinyLM(c); losses = [];
    const total = Math.max(100, +$('stepsInput').value || 3000), batch = 32;
    running = true; $('trainBtn').disabled = true; $('stopBtn').disabled = false; $('generateBtn').disabled = true;
    let ema = null;
    const chunk = () => {
      if (!running) return finish('Stopped');
      const t0 = performance.now();
      while (model.steps < total && performance.now() - t0 < 30) {
        const l = model.trainStep(data, batch, lrAt(model.steps, total));
        ema = ema === null ? l : 0.98 * ema + 0.02 * l;
        if (model.steps % 20 === 0) losses.push(ema);
      }
      $('statSteps').textContent = `${model.steps} / ${total}`;
      $('statLoss').textContent = ema.toFixed(3);
      $('progressBar').style.width = (model.steps / total * 100) + '%';
      $('trainStatus').textContent = `Training… step ${model.steps}, lr ${lrAt(model.steps, total).toFixed(4)}`;
      drawChart();
      if (model.steps < total) requestAnimationFrame(chunk); else finish('Done');
    };
    const finish = why => {
      running = false; $('trainBtn').disabled = false; $('stopBtn').disabled = true; $('generateBtn').disabled = false;
      const full = model.evalLoss(data);
      $('statLoss').textContent = full.toFixed(3);
      $('trainStatus').textContent = `${why}. Loss on full text: ${full.toFixed(3)} (random guessing = ${Math.log(vocab.size).toFixed(2)}).`;
    };
    requestAnimationFrame(chunk);
  });

  $('stopBtn').addEventListener('click', () => { running = false; });

  $('generateBtn').addEventListener('click', () => {
    if (!model) { $('output').textContent = 'Train the model first.'; return; }
    const prompt = $('promptInput').value;
    $('output').textContent = prompt + model.generate(vocab, prompt, +$('lenInput').value || 300, +$('tempInput').value);
  });
}
