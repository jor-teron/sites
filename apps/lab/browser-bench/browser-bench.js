// browser-bench.js: UI, Run All, scoring, verdicts, downloads.
import { deviceInfo, features } from './browser-bench_info.js';
import * as T from './browser-bench_tests.js';

const $ = (id) => document.getElementById(id);
const TESTS = [
  { id: 'cpu', name: 'CPU', desc: 'Fixed maths + sort workload', fn: T.cpu },
  { id: 'canvas2d', name: '2D canvas', desc: 'Max moving sprites at 30 fps', fn: T.canvas2d },
  { id: 'webgl', name: '3D WebGL (Three.js)', desc: 'Max triangles at 30 fps', fn: T.webgl },
  { id: 'gpuMemory', name: 'GPU textures', desc: 'Largest texture + texture memory', fn: T.gpuMemory },
  { id: 'storage', name: 'Storage', desc: 'localStorage / IndexedDB speed, quota', fn: T.storage },
  { id: 'network', name: 'Network', desc: 'Latency + download speed (same site)', fn: T.network },
  { id: 'audio', name: 'Audio', desc: 'Audio start time + latency', fn: T.audio },
];
const state = { version: 1, app: 'browser-bench', date: null, device: null, features: null, refreshRate: null, tests: {}, tapSound: null, score: null, verdicts: null };
let busy = false;

function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]); }

function renderDevice() {
  const d = state.device; const rows = [
    ['Browser', d.browser], ['Platform', d.platform + (d.mobile ? ' (mobile)' : '')], ['Screen', d.screen], ['Viewport', d.viewport],
    ['Pixel ratio', d.devicePixelRatio], ['CPU cores', d.cpuCores ?? 'not reported'], ['Memory', d.deviceMemoryGB ? d.deviceMemoryGB + ' GB (approx.)' : 'not reported'],
    ['GPU', d.gpuRenderer ?? 'unknown'], ['GPU vendor', d.gpuVendor ?? 'unknown'], ['Max texture', d.maxTextureSize ? d.maxTextureSize + ' px' : '?'],
    ['Refresh rate', state.refreshRate ? '~' + state.refreshRate + ' Hz' : '…'], ['User agent', d.userAgent]];
  $('device').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
}
const FEAT_LABELS = { webgl1: 'WebGL 1', webgl2: 'WebGL 2', webgpu: 'WebGPU', webxrAR: 'WebXR AR', webxrVR: 'WebXR VR', deviceOrientation: 'Device orientation', gyroscopeSensor: 'Gyroscope sensor API', camera: 'Camera', webAudio: 'Web Audio', textureS3TC: 'Texture S3TC/DXT', textureETC: 'Texture ETC2', textureETC1: 'Texture ETC1', textureASTC: 'Texture ASTC', textureBPTC: 'Texture BPTC', offscreenCanvas: 'OffscreenCanvas', wasm: 'WebAssembly', wasmSIMD: 'WASM SIMD', webWorkers: 'Web Workers', sharedArrayBuffer: 'SharedArrayBuffer', indexedDB: 'IndexedDB', gamepad: 'Gamepad', pointerLock: 'Pointer lock', fullscreen: 'Fullscreen', vibration: 'Vibration', wakeLock: 'Screen wake lock' };
function renderFeatures() {
  $('features').innerHTML = Object.entries(state.features).map(([k, v]) => `<li><span class="${v ? 'ok' : 'no'}">${v ? '✔' : '✘'}</span> ${esc(FEAT_LABELS[k] || k)}</li>`).join('');
}
function renderTests() {
  $('tests').innerHTML = TESTS.map((t) => `<div class="test" id="t-${t.id}"><div><div class="name">${t.name}</div><div class="muted">${t.desc}</div></div>
    <button data-run="${t.id}">Run</button><div class="bar"><div></div></div><div class="out muted">Not run</div></div>`).join('');
  $('tests').addEventListener('click', (e) => { const id = e.target.dataset?.run; if (id) runOne(id).then(finish); });
}

async function runOne(id) {
  if (busy) return; busy = true; setButtons(false);
  const t = TESTS.find((x) => x.id === id); const el = $('t-' + id); const bar = el.querySelector('.bar>div'); const out = el.querySelector('.out');
  out.className = 'out muted'; out.textContent = 'Running…'; bar.style.width = '0';
  const ctx = { stage: $('stage'), progress: (p, txt) => { bar.style.width = Math.round(p * 100) + '%'; if (txt) out.textContent = 'Running… ' + txt; } };
  try {
    const r = await t.fn(ctx); state.tests[id] = r; out.className = 'out'; out.textContent = r.text;
  } catch (e) {
    console.error(e); state.tests[id] = { error: String(e?.message || e) }; out.className = 'out no'; out.textContent = 'Error: ' + state.tests[id].error;
  }
  bar.style.width = '100%'; $('stage').replaceChildren(); busy = false; setButtons(true);
}
function setButtons(on) { document.querySelectorAll('button[data-run], #run-all').forEach((b) => (b.disabled = !on)); }

async function runAll() {
  const ab = $('all-bar');
  for (let i = 0; i < TESTS.length; i++) {
    $('status').textContent = `Running ${TESTS[i].name} (${i + 1}/${TESTS.length})…`; ab.style.width = (i / TESTS.length * 100) + '%';
    await runOne(TESTS[i].id);
  }
  ab.style.width = '100%'; $('status').textContent = 'All tests done.'; finish();
}

// Score each part 0–100 against a "good gaming PC" reference, then weight.
const clamp = (x) => Math.max(0, Math.min(100, x));
function computeScore() {
  const t = state.tests; const parts = {};
  if (t.cpu?.score) parts.cpu = clamp(t.cpu.score / 10);
  if (t.canvas2d?.maxSpritesAt30fps != null) parts.canvas2d = clamp(100 * Math.log10(1 + t.canvas2d.maxSpritesAt30fps) / Math.log10(20001));
  if (t.webgl?.maxTrianglesAt30fps != null) parts.webgl = clamp(100 * Math.log10(1 + t.webgl.maxTrianglesAt30fps / 1000) / Math.log10(10001));
  if (t.gpuMemory?.textureMemoryMB != null) parts.gpuMemory = clamp(t.gpuMemory.textureMemoryMB / t.gpuMemory.capMB * 70 + (t.gpuMemory.maxTextureUploadOk >= 8192 ? 30 : t.gpuMemory.maxTextureUploadOk >= 4096 ? 20 : 10));
  if (t.storage?.idbWriteMBps != null) parts.storage = clamp(t.storage.idbWriteMBps / 2);
  if (t.network?.latencyMs != null) parts.network = clamp((100 - t.network.latencyMs / 3) * 0.5 + Math.min(50, t.network.downloadMbps / 2));
  if (t.audio?.state) parts.audio = t.audio.state === 'running' ? clamp(100 - (t.audio.baseLatencyMs || 0) - (t.audio.outputLatencyMs || 0)) : 50;
  const W = { cpu: 2, canvas2d: 2, webgl: 3, gpuMemory: 1, storage: 0.5, network: 0.5, audio: 0.5 };
  let s = 0, w = 0; for (const k in parts) { s += parts[k] * W[k]; w += W[k]; }
  for (const k in parts) parts[k] = Math.round(parts[k]);
  return w ? { overall: Math.round(s / w), parts } : null;
}

function computeVerdicts() {
  const t = state.tests, f = state.features, v = [];
  const tris = t.webgl?.maxTrianglesAt30fps, cpu = t.cpu?.score;
  // Browser FPS: WebGL2, ~150–300k tris per frame (level + enemies + gun) at 30 fps.
  if (!f.webgl1) v.push(['Browser FPS', 'no', 'No WebGL — cannot run.']);
  else if (tris == null) v.push(['Browser FPS', 'warn', 'Run the 3D WebGL test.']);
  else if (tris >= 1e6) v.push(['Browser FPS', 'ok', 'Runs well at 30 fps, room for higher detail.']);
  else if (tris >= 3e5) v.push(['Browser FPS', 'ok', 'Runs well at 30 fps.']);
  else if (tris >= 1e5) v.push(['Browser FPS', 'warn', 'Playable at 30 fps on low settings / fewer enemies.']);
  else v.push(['Browser FPS', 'no', 'Likely below 30 fps.']);
  // AoE RTS: Phaser 2D, many sprites + CPU for villager logic.
  const sp = t.canvas2d?.maxSpritesAt30fps;
  if (sp == null) v.push(['AoE RTS', 'warn', 'Run the 2D canvas test.']);
  else if (sp >= 3000 && (cpu ?? 999) >= 150) v.push(['AoE RTS', 'ok', 'Runs smoothly, even on big maps.']);
  else if (sp >= 800) v.push(['AoE RTS', 'warn', 'Playable; big maps with many villagers may slow down.']);
  else v.push(['AoE RTS', 'no', 'Likely to stutter.']);
  // AR game: full AR needs WebXR immersive-ar; otherwise camera + tilt mode.
  if (f.webxrAR) v.push(['AR game', tris != null && tris < 1e5 ? 'warn' : 'ok', 'Full AR supported (Pet, Zombie, Ghost).' + (tris != null && tris < 1e5 ? ' GPU is weak — keep waves small.' : '')]);
  else if (f.camera && f.deviceOrientation) v.push(['AR game', 'warn', 'No real AR: camera + tilt mode only (Zombie, Ghost). Pet is AR only.']);
  else v.push(['AR game', 'no', 'No AR and no camera/tilt support.']);
  return v.map(([game, level, note]) => ({ game, level, note }));
}

const LEVEL = { ok: 'Good', warn: 'OK', no: 'Poor' };
function finish() {
  state.date = new Date().toISOString(); state.score = computeScore(); state.verdicts = computeVerdicts();
  $('score').textContent = state.score ? state.score.overall + ' / 100' : '–';
  $('verdicts').innerHTML = state.verdicts.map((x) => `<li><b>${x.game}:</b> <span class="${x.level}">${LEVEL[x.level]}</span> — ${esc(x.note)}</li>`).join('');
  $('dl-json').disabled = $('dl-txt').disabled = false;
}

function toText() {
  const L = [`Browser Bench — ${state.date}`, `Overall score: ${state.score?.overall ?? '-'} / 100`, ''];
  L.push('VERDICTS'); (state.verdicts || []).forEach((v) => L.push(`  ${v.game}: ${LEVEL[v.level]} — ${v.note}`)); L.push('');
  L.push('DEVICE'); for (const [k, v] of Object.entries(state.device)) L.push(`  ${k}: ${v}`); L.push(`  refreshRateHz: ${state.refreshRate}`); L.push('');
  L.push('FEATURES'); for (const [k, v] of Object.entries(state.features)) L.push(`  ${FEAT_LABELS[k] || k}: ${v ? 'yes' : 'no'}`); L.push('');
  L.push('TESTS'); for (const t of TESTS) { const r = state.tests[t.id]; L.push(`  ${t.name}: ${r ? (r.error ? 'ERROR ' + r.error : r.text) : 'not run'}`); }
  if (state.tapSound) L.push(`  Tap-to-sound: handler ${state.tapSound.handlerMs} ms, est. total ${state.tapSound.estimatedTotalMs} ms`);
  if (state.score) { L.push(''); L.push('SCORE PARTS'); for (const [k, v] of Object.entries(state.score.parts)) L.push(`  ${k}: ${v}`); }
  return L.join('\n') + '\n';
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

async function init() {
  state.device = deviceInfo(); renderDevice(); renderTests();
  state.features = await features(); renderFeatures();
  state.refreshRate = await T.refreshRate(); renderDevice();
  $('run-all').onclick = () => { if (!busy) runAll(); };
  $('dl-json').onclick = () => download(`browser-bench-${stamp()}.json`, JSON.stringify(state, null, 2), 'application/json');
  $('dl-txt').onclick = () => download(`browser-bench-${stamp()}.txt`, toText(), 'text/plain');
  $('tap-sound').onclick = async (e) => {
    const r = await T.tapSound(e); if (!r) { $('tap-out').textContent = 'No Web Audio'; return; }
    state.tapSound = r; $('tap-out').textContent = `handler ${r.handlerMs} ms · est. tap-to-sound ${r.estimatedTotalMs} ms`;
  };
  window.__bench = state; // for automated tests
}
init();
