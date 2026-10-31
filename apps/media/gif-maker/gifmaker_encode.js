/* GIF Maker encode: GMEncode.open(opts) → { add(ImageData), finish() → Promise<Blob>, cancel(), mode }.
   Uses a Web Worker; falls back to the main thread when workers can't load (e.g. Chrome on file://). */
window.GMEncode = (function () {
  function mainThread(o) {
    const enc = GMCore.create(o);
    return { mode: 'main', add(img, delay) { enc.add(img.data, delay); return new Promise((r) => setTimeout(r, 0)); },
      finish() { return Promise.resolve(new Blob([enc.finish()], { type: 'image/gif' })); }, cancel() {} };
  }
  function viaWorker(o) {
    const w = new Worker('gifmaker_worker.js');
    let pending = [], doneR = null, failed = null;
    const fail = (msg) => { failed = new Error(msg); pending.forEach((p) => p.j(failed)); pending = []; if (doneR) doneR.j(failed); };
    w.onerror = (e) => { e.preventDefault && e.preventDefault(); fail(e.message || 'worker error'); };
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'frame') { const p = pending.shift(); p && p.r(); }
      else if (m.type === 'done') { doneR && doneR.r(new Blob([m.buf], { type: 'image/gif' })); w.terminate(); }
      else if (m.type === 'error') fail(m.msg);
    };
    w.postMessage(Object.assign({ type: 'start' }, o));
    return { mode: 'worker',
      add(img, delay) { if (failed) return Promise.reject(failed); const buf = img.data.buffer;
        return new Promise((r, j) => { pending.push({ r, j }); w.postMessage({ type: 'frame', buf, delay }, [buf]); }); },
      finish() { if (failed) return Promise.reject(failed); return new Promise((r, j) => { doneR = { r, j }; w.postMessage({ type: 'finish' }); }); },
      cancel() { w.terminate(); fail('cancelled'); },
    };
  }
  /* probe once: a worker that can't load on file:// errors asynchronously */
  let ok = null;
  function probe() {
    if (ok !== null) return Promise.resolve(ok);
    if (typeof Worker === 'undefined') return Promise.resolve(ok = false);
    return new Promise((res) => {
      let w; try { w = new Worker('gifmaker_worker.js'); } catch (_) { return res(ok = false); }
      const t = setTimeout(() => { w.terminate(); res(ok = false); }, 3000);
      w.onerror = (e) => { e.preventDefault && e.preventDefault(); clearTimeout(t); w.terminate(); res(ok = false); };
      w.onmessage = (e) => { clearTimeout(t); w.terminate(); res(ok = e.data && e.data.type === 'error'); }; /* finish w/o start → error reply = alive */
      w.postMessage({ type: 'finish' });
    });
  }
  return { async open(o) { return (await probe()) ? viaWorker(o) : mainThread(o); } };
})();
