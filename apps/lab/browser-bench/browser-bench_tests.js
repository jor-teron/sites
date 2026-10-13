// browser-bench_tests.js: each test is async (ctx) => result object.
// ctx.progress(0..1, text), ctx.stage (div to show visual tests).

const raf = () => new Promise((r) => requestAnimationFrame(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Measure average fps over `ms` while calling draw() each frame.
async function measureFps(ms, draw) {
  await raf(); let frames = 0; const t0 = performance.now(); let t = t0;
  while (t - t0 < ms) { draw && draw(t); await raf(); frames++; t = performance.now(); }
  return frames * 1000 / (t - t0);
}

// Display refresh rate (to know the fps ceiling).
export async function refreshRate() { return Math.round(await measureFps(500)); }

/* 1) CPU: fixed maths workload, best of 3 runs. */
export async function cpu(ctx) {
  function work() {
    let x = 0; const a = new Float64Array(4096);
    for (let i = 0; i < 4096; i++) a[i] = Math.sin(i);
    for (let k = 0; k < 600; k++) for (let i = 0; i < 4096; i++) { x += Math.sqrt(a[i] * a[i] + k) * Math.cos(x * 1e-9); a[i] = (a[i] * 1.0001) % 7; }
    const o = []; for (let i = 0; i < 20000; i++) o.push({ i, s: 'k' + (i % 97) });
    o.sort((p, q) => (p.s < q.s ? -1 : p.s > q.s ? 1 : p.i - q.i));
    return x + o.length;
  }
  let best = Infinity;
  for (let r = 0; r < 3; r++) {
    ctx.progress(r / 3, `run ${r + 1}/3`); await sleep(20);
    const t = performance.now(); work(); best = Math.min(best, performance.now() - t);
  }
  const score = Math.round(100000 / best); // ~1000 on a fast desktop
  return { ms: +best.toFixed(1), score, text: `${best.toFixed(1)} ms per workload (score ${score})` };
}

/* 2) 2D canvas: ramp sprites until fps < 30. */
export async function canvas2d(ctx) {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; ctx.stage.replaceChildren(cv);
  const g = cv.getContext('2d');
  const sp = document.createElement('canvas'); sp.width = sp.height = 32;
  const sg = sp.getContext('2d'); const gr = sg.createRadialGradient(16, 12, 2, 16, 16, 16);
  gr.addColorStop(0, '#ffe08a'); gr.addColorStop(1, '#c0392b'); sg.fillStyle = gr; sg.beginPath(); sg.arc(16, 16, 15, 0, 7); sg.fill();
  const S = []; const add = (n) => { for (let i = 0; i < n; i++) S.push({ x: Math.random() * 608, y: Math.random() * 328, vx: Math.random() * 4 - 2, vy: Math.random() * 4 - 2 }); };
  const draw = () => {
    g.fillStyle = '#123'; g.fillRect(0, 0, 640, 360);
    for (const s of S) { s.x += s.vx; s.y += s.vy; if (s.x < 0 || s.x > 608) s.vx *= -1; if (s.y < 0 || s.y > 328) s.vy *= -1; g.drawImage(sp, s.x, s.y); }
    g.fillStyle = '#fff'; g.font = '16px sans-serif'; g.fillText(S.length + ' sprites', 8, 20);
  };
  let n = 250, best = 0, lastFps = 0, retried = false; const MAX = 200000; const t0 = performance.now();
  add(n);
  while (S.length <= MAX && performance.now() - t0 < 20000) {
    const fps = await measureFps(450, draw); lastFps = fps;
    ctx.progress(Math.min(1, Math.log2(S.length / 250) / Math.log2(MAX / 250)), `${S.length} sprites @ ${fps.toFixed(0)} fps`);
    if (fps < 30) { if (retried) break; retried = true; continue; }
    retried = false; best = S.length; add(Math.ceil(S.length * 0.5));
  }
  return { maxSpritesAt30fps: best, lastFps: +lastFps.toFixed(1), text: `${best.toLocaleString()} sprites while holding 30 fps` };
}

/* 3) WebGL triangle ramp with Three.js. */
export async function webgl(ctx) {
  const THREE = await import('three');
  const cv = document.createElement('canvas'); ctx.stage.replaceChildren(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false }); r.setPixelRatio(1); r.setSize(640, 360, false);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1220);
  const cam = new THREE.PerspectiveCamera(60, 640 / 360, 0.1, 200); cam.position.set(0, 6, 22); cam.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.5); dl.position.set(5, 10, 7); scene.add(dl);
  const geo = new THREE.SphereGeometry(0.5, 64, 40); // 64*40*2 - 2*64 ≈ 4992 tris
  const triPer = geo.index.count / 3;
  const MAXI = 4000; const mat = new THREE.MeshStandardMaterial({ color: 0x3fb8c8, roughness: 0.4, metalness: 0.3 });
  const mesh = new THREE.InstancedMesh(geo, mat, MAXI); const m4 = new THREE.Matrix4();
  for (let i = 0; i < MAXI; i++) { m4.setPosition((Math.random() - .5) * 30, (Math.random() - .5) * 14, (Math.random() - .5) * 20); mesh.setMatrixAt(i, m4); }
  mesh.count = 2; scene.add(mesh); r.render(scene, cam); // warm-up compiles shaders
  // Read one pixel per frame so the GPU must really finish (some browsers queue frames and report fake fps).
  const gl = r.getContext(); const px = new Uint8Array(4);
  let best = 0, lastFps = 0, retried = false; const t0 = performance.now();
  try {
    while (performance.now() - t0 < 25000) {
      const fps = await measureFps(500, (t) => { mesh.rotation.y = t * 0.0003; r.render(scene, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }); lastFps = fps;
      const tris = mesh.count * triPer;
      ctx.progress(Math.min(1, Math.log2(mesh.count / 2) / Math.log2(MAXI / 2)), `${(tris / 1e6).toFixed(2)}M tris @ ${fps.toFixed(0)} fps`);
      if (fps < 30) { if (retried) break; retried = true; continue; } // re-measure once to skip hiccups
      retried = false; best = tris; if (mesh.count >= MAXI) break;
      mesh.count = Math.min(MAXI, Math.ceil(mesh.count * 1.5));
    }
  } finally { geo.dispose(); mat.dispose(); r.dispose(); r.forceContextLoss?.(); }
  const capped = best >= MAXI * triPer;
  return { maxTrianglesAt30fps: Math.round(best), capped, lastFps: +lastFps.toFixed(1), resolution: '640×360',
    text: `${(best / 1e6).toFixed(2)}M triangles at 30 fps${capped ? ' (test cap reached)' : ''} (640×360)` };
}

/* 4) GPU textures: largest uploadable texture + how many 2048² RGBA textures fit (capped 512 MB). */
export async function gpuMemory(ctx) {
  const cv = document.createElement('canvas'); const gl = cv.getContext('webgl2') || cv.getContext('webgl');
  if (!gl) return { text: 'No WebGL', maxTextureOk: 0 };
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE); let okSize = 0;
  for (let s = 1024; s <= Math.min(max, 16384); s *= 2) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, s, s, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const err = gl.getError(); gl.deleteTexture(t); if (err) break; okSize = s;
    ctx.progress(0.3 * Math.log2(s / 512) / Math.log2(16384 / 512), `${s}² ok`); await sleep(0);
  }
  const texs = []; const per = 2048 * 2048 * 4; const cap = 32; // 32 × 16 MB = 512 MB, enough for our games and safe for phones
  let mb = 0;
  const fb = gl.createFramebuffer();
  try {
    for (let i = 0; i < cap; i++) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2048, 2048, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(i / cap, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); // touch it so memory is really used
      const err = gl.getError(); texs.push(t);
      if (err || gl.isContextLost()) break;
      mb = (i + 1) * per / 1048576;
      if (i % 8 === 7) { gl.finish(); ctx.progress(0.3 + 0.7 * i / cap, `${mb} MB allocated`); await sleep(0); }
    }
  } finally { texs.forEach((t) => gl.deleteTexture(t)); gl.deleteFramebuffer(fb); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
  return { maxTextureSize: max, maxTextureUploadOk: okSize, textureMemoryMB: mb, capMB: cap * per / 1048576,
    text: `Max texture ${okSize}² (limit ${max}); ${mb} MB of textures allocated${mb >= cap * 16 ? ' (test cap)' : ''}` };
}

/* 5) Storage: localStorage + IndexedDB write/read speed, quota. */
export async function storage(ctx) {
  const out = {}; const payload = 'x'.repeat(1024); // 1 KB
  try {
    ctx.progress(0.05, 'localStorage');
    let t = performance.now(); for (let i = 0; i < 500; i++) localStorage.setItem('bb_' + i, payload); out.lsWriteMs = +(performance.now() - t).toFixed(1);
    t = performance.now(); let n = 0; for (let i = 0; i < 500; i++) n += localStorage.getItem('bb_' + i).length; out.lsReadMs = +(performance.now() - t).toFixed(1);
    for (let i = 0; i < 500; i++) localStorage.removeItem('bb_' + i);
  } catch (e) { out.lsError = String(e); }
  try {
    ctx.progress(0.35, 'IndexedDB');
    const db = await new Promise((res, rej) => { const q = indexedDB.open('browser-bench', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    const blob = new Uint8Array(1024 * 1024); // 1 MB records
    const tx = (mode, fn) => new Promise((res, rej) => { const x = db.transaction('s', mode); fn(x.objectStore('s')); x.oncomplete = res; x.onerror = () => rej(x.error); });
    let t = performance.now(); await tx('readwrite', (s) => { for (let i = 0; i < 20; i++) s.put(blob, i); }); const w = performance.now() - t;
    ctx.progress(0.65, 'IndexedDB read');
    t = performance.now(); await tx('readonly', (s) => { for (let i = 0; i < 20; i++) s.get(i); }); const r = performance.now() - t;
    await tx('readwrite', (s) => s.clear()); db.close(); indexedDB.deleteDatabase('browser-bench');
    out.idbWriteMBps = +(20 / (w / 1000)).toFixed(1); out.idbReadMBps = +(20 / (r / 1000)).toFixed(1);
  } catch (e) { out.idbError = String(e); }
  try { const e = await navigator.storage?.estimate(); if (e) { out.quotaMB = Math.round(e.quota / 1048576); out.usageMB = +(e.usage / 1048576).toFixed(1); } } catch { /* no */ }
  out.text = `localStorage 500×1KB: write ${out.lsWriteMs ?? '?'} ms, read ${out.lsReadMs ?? '?'} ms · IndexedDB 20 MB: write ${out.idbWriteMBps ?? '?'} MB/s, read ${out.idbReadMBps ?? '?'} MB/s · quota ${out.quotaMB ?? '?'} MB`;
  return out;
}

/* 6) Network: same-origin latency + download speed (cache-busted). */
const LATENCY_URL = 'index.html';
const DOWNLOAD_URL = '../island-demo/models/female/body_1k.glb'; // ~930 KB repo asset
export async function network(ctx) {
  const bust = (u) => u + (u.includes('?') ? '&' : '?') + 'cb=' + Date.now() + Math.random();
  const lat = [];
  for (let i = 0; i < 6; i++) {
    ctx.progress(i / 10, `ping ${i + 1}/6`);
    const t = performance.now(); const r = await fetch(bust(LATENCY_URL), { cache: 'no-store' }); await r.arrayBuffer(); lat.push(performance.now() - t);
  }
  lat.sort((a, b) => a - b); const latency = lat[Math.floor(lat.length / 2)];
  let bytes = 0, ms = 0;
  for (let i = 0; i < 2; i++) {
    ctx.progress(0.6 + i * 0.2, `download ${i + 1}/2`);
    const t = performance.now(); const r = await fetch(bust(DOWNLOAD_URL), { cache: 'no-store' });
    if (!r.ok) throw new Error('download HTTP ' + r.status);
    bytes += (await r.arrayBuffer()).byteLength; ms += performance.now() - t;
  }
  const mbps = bytes * 8 / 1e6 / (ms / 1000);
  const conn = navigator.connection ? { effectiveType: navigator.connection.effectiveType, downlinkMbps: navigator.connection.downlink, rttMs: navigator.connection.rtt } : null;
  return { latencyMs: +latency.toFixed(1), downloadMbps: +mbps.toFixed(1), bytes, file: DOWNLOAD_URL, connection: conn,
    text: `latency ${latency.toFixed(0)} ms (median) · download ${mbps.toFixed(1)} Mbit/s (${(bytes / 1048576).toFixed(1)} MB)` };
}

/* 7) Audio: context start time + reported latencies. Tap test is separate (needs a real tap). */
let sharedAudio = null;
export function audioCtx() { const A = window.AudioContext || window.webkitAudioContext; if (!sharedAudio && A) sharedAudio = new A(); return sharedAudio; }
export async function audio(ctx) {
  const A = window.AudioContext || window.webkitAudioContext; if (!A) return { text: 'No Web Audio' };
  ctx.progress(0.2, 'starting AudioContext');
  const t = performance.now(); const ac = audioCtx();
  if (ac.state !== 'running') { await Promise.race([ac.resume(), sleep(1500)]); }
  const startMs = performance.now() - t;
  const out = { state: ac.state, sampleRate: ac.sampleRate, startMs: +startMs.toFixed(1),
    baseLatencyMs: ac.baseLatency != null ? +(ac.baseLatency * 1000).toFixed(1) : null,
    outputLatencyMs: ac.outputLatency != null ? +(ac.outputLatency * 1000).toFixed(1) : null };
  out.text = `state ${out.state}${out.state !== 'running' ? ' (needs a tap)' : ''} · start ${out.startMs} ms · base ${out.baseLatencyMs ?? '?'} ms · output ${out.outputLatencyMs ?? '?'} ms · ${out.sampleRate} Hz`;
  return out;
}

// Tap-to-sound: time from the input event to the sound being scheduled, plus the context's output latency.
export async function tapSound(ev) {
  const ac = audioCtx(); if (!ac) return null;
  if (ac.state !== 'running') await ac.resume();
  const o = ac.createOscillator(); const gn = ac.createGain(); gn.gain.value = 0.15; o.frequency.value = 880;
  o.connect(gn).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.08);
  const handler = performance.now() - ev.timeStamp;
  const lat = ((ac.baseLatency || 0) + (ac.outputLatency || 0)) * 1000;
  return { handlerMs: +handler.toFixed(1), estimatedTotalMs: +(handler + lat).toFixed(1) };
}
