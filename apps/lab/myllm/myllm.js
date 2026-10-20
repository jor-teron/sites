/* myllm.js - tiny character-level language model (makemore-style MLP) in pure JS.
 * Pipeline: text -> tokens (code points) -> embeddings (concatenated, order kept)
 *   -> tanh hidden layer -> logits -> softmax -> cross-entropy loss
 *   -> backpropagation -> Adam update. No libraries, no build step.
 * The page loads its training text from twitter_chat.txt. Run checks with:
 *   node myllm.test.js
 */

/* ---------- Engine (no DOM, testable in Node) ---------- */

function randn() {
  // Standard normal via Box-Muller. Reject 0 so log stays finite.
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// String iteration yields Unicode code points (one emoji = one token).
// Do not count UTF-16 code units; a surrogate pair is a single vocab entry.
function vocabSize(text) {
  return new Set(text).size;
}

function buildVocab(text) {
  const chars = [...new Set(text)].sort();
  const stoi = {};
  for (let i = 0; i < chars.length; i++) {
    stoi[chars[i]] = i;
  }
  return { chars, stoi, size: chars.length };
}

function encodeText(text, vocab) {
  let n = 0;
  for (const _ch of text) n++;
  const data = new Int32Array(n);
  let i = 0;
  for (const ch of text) {
    data[i++] = vocab.stoi[ch];
  }
  return data;
}

function countUnknown(vocab, prompt) {
  let n = 0;
  for (const ch of prompt) {
    if (!(ch in vocab.stoi)) n++;
  }
  return n;
}

// Blank or non-numeric values use fallback, then the result is clamped to [min, max].
function clampNumber(value, min, max, fallback, integer) {
  let n;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    n = trimmed === '' ? NaN : Number(trimmed);
  } else {
    n = Number(value);
  }
  if (!Number.isFinite(n)) n = fallback;
  if (integer) n = Math.round(n);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// Pick embed/hidden sizes so total params is close to the target.
// `vocab` must be the code-point vocab size from buildVocab / vocabSize.
function makeConfig(targetParams, vocab, context) {
  const V = vocab;
  const C = context;
  const E = Math.max(4, Math.min(32, Math.round(Math.sqrt(targetParams) / 12)));
  let H = Math.round((targetParams - V * E - V) / (C * E + 1 + V));
  H = Math.max(8, Math.min(1024, H));
  return { V, C, E, H };
}

function countParams(c) {
  return c.V * c.E + c.C * c.E * c.H + c.H + c.H * c.V + c.V;
}

class TinyLM {
  constructor(cfg) {
    this.cfg = cfg;
    const { V, C, E, H } = cfg;
    const D = C * E;
    const mk = (n, s) => {
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) a[i] = randn() * s;
      return a;
    };
    this.p = {
      emb: mk(V * E, 1.0),
      W1: mk(D * H, (5 / 3) / Math.sqrt(D) * 0.5), // Kaiming-ish for tanh, scaled down
      b1: new Float32Array(H),
      W2: mk(H * V, 0.01),                         // small output -> initial loss ~ ln(V)
      b2: new Float32Array(V),
    };
    this.g = {};
    this.m = {};
    this.v = {};
    for (const k in this.p) {
      const n = this.p[k].length;
      this.g[k] = new Float32Array(n);
      this.m[k] = new Float32Array(n);
      this.v[k] = new Float32Array(n);
    }
    this.t = 0;
    this.steps = 0;
  }

  // Forward one example; ctx = array of C token ids. Returns {x, h, probs}.
  forward(ctx, temperature = 1) {
    const { V, C, E, H } = this.cfg;
    const D = C * E;
    const p = this.p;
    const x = new Float32Array(D);
    for (let j = 0; j < C; j++) {
      x.set(p.emb.subarray(ctx[j] * E, ctx[j] * E + E), j * E);
    }
    const h = new Float32Array(H);
    for (let k = 0; k < H; k++) h[k] = p.b1[k];
    for (let d = 0; d < D; d++) {
      const xd = x[d];
      if (xd === 0) continue;
      const row = d * H;
      for (let k = 0; k < H; k++) h[k] += xd * p.W1[row + k];
    }
    for (let k = 0; k < H; k++) h[k] = Math.tanh(h[k]);
    const logits = new Float32Array(V);
    for (let v = 0; v < V; v++) logits[v] = p.b2[v];
    for (let k = 0; k < H; k++) {
      const hk = h[k];
      const row = k * V;
      for (let v = 0; v < V; v++) logits[v] += hk * p.W2[row + v];
    }
    let mx = -Infinity;
    for (let v = 0; v < V; v++) {
      logits[v] /= temperature;
      if (logits[v] > mx) mx = logits[v];
    }
    let s = 0;
    for (let v = 0; v < V; v++) {
      logits[v] = Math.exp(logits[v] - mx);
      s += logits[v];
    }
    for (let v = 0; v < V; v++) logits[v] /= s;
    return { x, h, probs: logits };
  }

  // One minibatch step: forward, loss, backprop, Adam update. Returns mean loss.
  trainStep(data, batch, lr) {
    const { V, C, E, H } = this.cfg;
    const D = C * E;
    const p = this.p;
    const g = this.g;
    for (const k in g) g[k].fill(0);
    let loss = 0;
    const ctx = new Array(C);
    const dh = new Float32Array(H);
    const dx = new Float32Array(D);
    for (let b = 0; b < batch; b++) {
      const i = C + Math.floor(Math.random() * (data.length - C));
      for (let j = 0; j < C; j++) ctx[j] = data[i - C + j];
      const target = data[i];
      const { x, h, probs } = this.forward(ctx);
      loss += -Math.log(probs[target] + 1e-9);
      // dLoss/dlogits = probs - onehot(target)
      probs[target] -= 1;
      for (let v = 0; v < V; v++) {
        probs[v] /= batch;
        g.b2[v] += probs[v];
      }
      dh.fill(0);
      for (let k = 0; k < H; k++) {
        const hk = h[k];
        const row = k * V;
        let acc = 0;
        for (let v = 0; v < V; v++) {
          g.W2[row + v] += hk * probs[v];
          acc += p.W2[row + v] * probs[v];
        }
        dh[k] = acc * (1 - hk * hk); // through tanh
        g.b1[k] += dh[k];
      }
      for (let d = 0; d < D; d++) {
        const xd = x[d];
        const row = d * H;
        let acc = 0;
        for (let k = 0; k < H; k++) {
          g.W1[row + k] += xd * dh[k];
          acc += p.W1[row + k] * dh[k];
        }
        dx[d] = acc;
      }
      for (let j = 0; j < C; j++) {
        const off = ctx[j] * E;
        for (let e = 0; e < E; e++) g.emb[off + e] += dx[j * E + e];
      }
    }
    // Adam
    this.t++;
    const b1 = 0.9;
    const b2 = 0.999;
    const c1 = 1 - Math.pow(b1, this.t);
    const c2 = 1 - Math.pow(b2, this.t);
    for (const k in p) {
      const P = p[k];
      const G = g[k];
      const M = this.m[k];
      const S = this.v[k];
      for (let i = 0; i < P.length; i++) {
        M[i] = b1 * M[i] + (1 - b1) * G[i];
        S[i] = b2 * S[i] + (1 - b2) * G[i] * G[i];
        P[i] -= lr * (M[i] / c1) / (Math.sqrt(S[i] / c2) + 1e-8);
      }
    }
    this.steps++;
    return loss / batch;
  }

  _nllAt(data, i) {
    const C = this.cfg.C;
    const ctx = new Array(C);
    for (let j = 0; j < C; j++) ctx[j] = data[i - C + j];
    const { probs } = this.forward(ctx);
    return -Math.log(probs[data[i]] + 1e-9);
  }

  // Average loss over the whole text (or a sample of it).
  evalLoss(data, maxN = 2000) {
    const C = this.cfg.C;
    let loss = 0;
    let n = 0;
    const stride = Math.max(1, Math.floor((data.length - C) / maxN));
    for (let i = C; i < data.length; i += stride) {
      loss += this._nllAt(data, i);
      n++;
    }
    return loss / n;
  }

  // Same sample as evalLoss, but yields about every 16ms so the UI can paint.
  // Resolves to null when shouldContinue() becomes false.
  evalLossAsync(data, maxN = 2000, shouldContinue = () => true) {
    const C = this.cfg.C;
    const stride = Math.max(1, Math.floor((data.length - C) / maxN));
    let i = C;
    let loss = 0;
    let n = 0;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const slice = () => {
      if (!shouldContinue()) return null;
      const t0 = now();
      while (i < data.length && now() - t0 < 16) {
        loss += this._nllAt(data, i);
        n++;
        i += stride;
      }
      if (i < data.length) {
        return new Promise((resolve) => setTimeout(() => resolve(slice()), 0));
      }
      return n ? loss / n : NaN;
    };
    return Promise.resolve().then(slice);
  }

  // Stateful sampler. Unknown prompt code points are counted, not inserted.
  startGeneration(vocab, prompt, n, temperature) {
    const C = this.cfg.C;
    const pad = vocab.stoi[' '] !== undefined ? vocab.stoi[' '] : 0;
    const ids = [];
    let unknown = 0;
    for (const ch of prompt) {
      if (ch in vocab.stoi) ids.push(vocab.stoi[ch]);
      else unknown++;
    }
    let ctx = new Array(C).fill(pad).concat(ids).slice(-C);
    let produced = 0;
    const total = n;
    const model = this;
    return {
      unknown,
      get done() {
        return produced >= total;
      },
      take(limit) {
        const end = Math.min(total, produced + limit);
        let text = '';
        for (; produced < end; produced++) {
          const { probs } = model.forward(ctx, temperature);
          let r = Math.random();
          let next = probs.length - 1;
          for (let v = 0; v < probs.length; v++) {
            r -= probs[v];
            if (r <= 0) {
              next = v;
              break;
            }
          }
          text += vocab.chars[next];
          ctx = ctx.slice(1);
          ctx.push(next);
        }
        return { text, done: produced >= total };
      },
    };
  }

  generate(vocab, prompt, n, temperature) {
    const run = this.startGeneration(vocab, prompt, n, temperature);
    let text = '';
    while (!run.done) text += run.take(256).text;
    return text;
  }
}

function lrAt(step, total, base = 0.01) {
  // Cosine decay to 10% of the base learning rate.
  return base * (0.1 + 0.9 * 0.5 * (1 + Math.cos(Math.PI * Math.min(1, step / total))));
}

if (typeof module !== 'undefined') {
  module.exports = {
    TinyLM,
    buildVocab,
    vocabSize,
    encodeText,
    countUnknown,
    clampNumber,
    makeConfig,
    countParams,
    lrAt,
  };
}

/* ---------- UI ---------- */

if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  let model = null;
  let vocab = null;
  let data = null;
  let running = false;
  let losses = [];
  let trainEpoch = 0;
  let genEpoch = 0;
  let sizeTimer = 0;
  let lastChartLabelAt = 0;
  let trainingTextEdited = false;

  // Matches the min/max on the number inputs in myllm.html.
  const FIELD_LIMITS = {
    paramInput: { min: 1000, max: 300000, fallback: 10000 },
    contextInput: { min: 2, max: 12, fallback: 6 },
    stepsInput: { min: 100, max: 50000, fallback: 3000 },
    lenInput: { min: 10, max: 2000, fallback: 300 },
  };

  function readField(id) {
    const lim = FIELD_LIMITS[id];
    return clampNumber($(id).value, lim.min, lim.max, lim.fallback, true);
  }

  function commitField(id) {
    const n = readField(id);
    $(id).value = String(n);
    return n;
  }

  function readTemperature() {
    return clampNumber($('tempInput').value, 0.1, 2, 0.8, false);
  }

  function updateSize() {
    const text = $('trainingText').value;
    const params = readField('paramInput');
    const context = readField('contextInput');
    const V = vocabSize(text);
    const c = makeConfig(params, Math.max(1, V), context);
    const sized = V > 0 ? c : { V: 0, C: c.C, E: c.E, H: c.H };
    const n = V > 0 ? countParams(c) : 0;
    $('statParams').textContent = n.toLocaleString();
    $('sizeInput').value = (n * 4 / 1024).toFixed(1) + ' KB';
    $('statShape').textContent = `vocab ${sized.V} · ctx ${sized.C} · embed ${c.E} · hidden ${c.H}`;
  }

  function scheduleUpdateSize() {
    clearTimeout(sizeTimer);
    // Counting code points over ~600 KB is a short scan; wait until typing pauses.
    sizeTimer = setTimeout(updateSize, 200);
  }

  function setChartLabel(text, force) {
    const cv = $('lossChart');
    const t = performance.now();
    if (!force && text === cv.getAttribute('aria-label')) return;
    if (!force && t - lastChartLabelAt < 1000) return;
    lastChartLabelAt = t;
    cv.setAttribute('aria-label', text);
  }

  function drawChart(forceLabel) {
    const cv = $('lossChart');
    const ctx = cv.getContext('2d');
    const w = cv.width = cv.clientWidth * devicePixelRatio;
    const h = cv.height = cv.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    if (losses.length < 2) {
      setChartLabel('Training loss chart, no curve yet', forceLabel);
      return;
    }
    let max = -Infinity;
    let min = 0;
    for (let i = 0; i < losses.length; i++) {
      if (losses[i] > max) max = losses[i];
      if (losses[i] < min) min = losses[i];
    }
    ctx.strokeStyle = '#7c9cff';
    ctx.lineWidth = 2 * devicePixelRatio;
    ctx.beginPath();
    for (let i = 0; i < losses.length; i++) {
      const x = i / (losses.length - 1) * w;
      const y = h - (losses[i] - min) / (max - min || 1) * (h - 10) - 5;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#8b93a7';
    ctx.font = `${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(max.toFixed(2), 4, 14 * devicePixelRatio);
    ctx.fillText(min.toFixed(2), 4, h - 4);
    const latest = losses[losses.length - 1];
    setChartLabel(
      `Training loss chart, smoothed loss ${latest.toFixed(3)}, range ${min.toFixed(2)} to ${max.toFixed(2)}`,
      forceLabel
    );
  }

  ['paramInput', 'contextInput', 'stepsInput', 'lenInput'].forEach((id) => {
    $(id).addEventListener('change', () => {
      commitField(id);
      scheduleUpdateSize();
    });
  });
  ['paramInput', 'contextInput', 'trainingText'].forEach((id) => {
    $(id).addEventListener('input', scheduleUpdateSize);
  });

  $('tempInput').addEventListener('input', () => {
    $('tempVal').textContent = readTemperature().toFixed(2);
  });

  function loadTrainingText() {
    const status = $('trainStatus');
    status.textContent = 'Loading twitter_chat.txt…';
    fetch('twitter_chat.txt')
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then((text) => {
        if (trainingTextEdited) {
          status.textContent = 'Using the text already in the box. Press Train when you are ready.';
          updateSize();
          return;
        }
        $('trainingText').value = text;
        status.textContent = 'Loaded twitter_chat.txt. Edit the text if you like, then press Train.';
        updateSize();
      })
      .catch(() => {
        if (!trainingTextEdited) $('trainingText').value = '';
        status.textContent = 'Could not load twitter_chat.txt. Paste training text, then press Train.';
        updateSize();
      });
  }

  $('trainBtn').addEventListener('click', () => {
    const myTrain = ++trainEpoch;
    genEpoch++;
    const text = $('trainingText').value;
    const params = commitField('paramInput');
    const context = commitField('contextInput');
    const total = commitField('stepsInput');
    const vocabBuilt = buildVocab(text);
    const encoded = encodeText(text, vocabBuilt);
    if (vocabBuilt.size < 1 || encoded.length < context + 10) {
      $('trainStatus').textContent = 'Training text is too short.';
      $('generateBtn').disabled = false;
      return;
    }
    // Size the hidden layer from the vocab that was just built, not a separate count.
    const cfg = makeConfig(params, vocabBuilt.size, context);
    vocab = vocabBuilt;
    data = encoded;
    model = new TinyLM(cfg);
    losses = [];
    const batch = 32;
    running = true;
    $('trainBtn').disabled = true;
    $('stopBtn').disabled = false;
    $('generateBtn').disabled = true;
    $('progressBar').style.width = '0%';
    $('statSteps').textContent = `0 / ${total}`;
    $('statLoss').textContent = '–';
    drawChart(true);
    updateSize();
    let ema = null;
    let closed = false;

    const finish = (why) => {
      if (closed) return;
      closed = true;
      running = false;
      $('trainBtn').disabled = false;
      $('stopBtn').disabled = true;
      $('generateBtn').disabled = false;
      $('trainStatus').textContent = `${why}. Computing loss on full text…`;
      model.evalLossAsync(data, 2000, () => trainEpoch === myTrain).then((full) => {
        if (full === null || trainEpoch !== myTrain) return;
        $('statLoss').textContent = full.toFixed(3);
        $('trainStatus').textContent =
          `${why}. Loss on full text: ${full.toFixed(3)} (random guessing = ${Math.log(vocab.size).toFixed(2)}).`;
        drawChart(true);
      });
    };

    const chunk = () => {
      if (trainEpoch !== myTrain) return;
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
      drawChart(false);
      if (model.steps < total) requestAnimationFrame(chunk);
      else finish('Done');
    };
    requestAnimationFrame(chunk);
  });

  $('stopBtn').addEventListener('click', () => {
    running = false;
  });

  $('trainingText').addEventListener('input', () => {
    trainingTextEdited = true;
  });

  $('generateBtn').addEventListener('click', () => {
    if (!model) {
      $('output').textContent = 'Train the model first.';
      $('genHint').textContent = '';
      return;
    }
    const myGen = ++genEpoch;
    const prompt = $('promptInput').value;
    const n = commitField('lenInput');
    const temperature = readTemperature();
    $('tempVal').textContent = temperature.toFixed(2);
    const run = model.startGeneration(vocab, prompt, n, temperature);
    $('genHint').textContent = run.unknown > 0 ? `ignored ${run.unknown} unknown chars` : '';
    $('output').textContent = prompt;
    $('generateBtn').disabled = true;

    const pump = () => {
      if (genEpoch !== myGen) return;
      const t0 = performance.now();
      let piece = '';
      while (!run.done && performance.now() - t0 < 16) {
        piece += run.take(8).text;
      }
      if (piece) $('output').textContent += piece;
      if (genEpoch !== myGen) return;
      if (!run.done) requestAnimationFrame(pump);
      else $('generateBtn').disabled = false;
    };
    requestAnimationFrame(pump);
  });

  updateSize();
  loadTrainingText();
}
