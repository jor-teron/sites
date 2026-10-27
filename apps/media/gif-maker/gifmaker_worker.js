/* GIF Maker worker: messages start {w,h,colors,loop,delay} → frame {buf} … → finish → reply {type:'done', buf} */
importScripts('vendor/gifenc.js?v=GM1', 'gifmaker_core.js?v=GM1');
let enc = null;
onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'start') enc = GMCore.create(m);
    else if (m.type === 'frame') { enc.add(new Uint8ClampedArray(m.buf)); postMessage({ type: 'frame' }); }
    else if (m.type === 'finish') { const b = enc.finish(); postMessage({ type: 'done', buf: b.buffer }, [b.buffer]); enc = null; }
  } catch (err) { postMessage({ type: 'error', msg: String(err && err.message || err) }); }
};
