/* SCCapture: getDisplayMedia + optional mic, mixed with WebAudio when both audio sources exist. */
window.SCCapture = (() => {
  const supported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);
  function pickMime() {
    const c = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (const m of c) if (MediaRecorder.isTypeSupported(m)) return m;
    return '';
  }
  async function start(o) {
    const h = o.quality === 'native' ? undefined : { ideal: +o.quality };
    const v = { frameRate: { ideal: +o.fps } }; if (h) v.height = h;
    const disp = await navigator.mediaDevices.getDisplayMedia({ video: v, audio: !!o.sys });
    let mic = null, ctx = null;
    if (o.mic) { try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } }); } catch (e) { o.onWarn && o.onWarn('Mic not available'); } }
    const tracks = [...disp.getVideoTracks()], da = disp.getAudioTracks(), ma = mic ? mic.getAudioTracks() : [];
    if (da.length && ma.length) {
      ctx = new AudioContext(); const dst = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(new MediaStream(da)).connect(dst);
      ctx.createMediaStreamSource(new MediaStream(ma)).connect(dst);
      tracks.push(...dst.stream.getAudioTracks());
    } else tracks.push(...da, ...ma);
    const mime = pickMime(), rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime } : {});
    const chunks = []; let bytes = 0;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) { chunks.push(e.data); bytes += e.data.size; o.onSize && o.onSize(bytes); } };
    const cleanup = () => { [disp, mic].forEach((s) => s && s.getTracks().forEach((t) => t.stop())); if (ctx) ctx.close(); };
    rec.onstop = () => { cleanup(); const type = (rec.mimeType || mime || 'video/webm').split(';')[0]; o.onDone(new Blob(chunks, { type }), type.indexOf('mp4') >= 0 ? 'mp4' : 'webm'); };
    disp.getVideoTracks()[0].addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop(); });
    return { disp, rec, cleanup, begin() { rec.start(1000); }, pause() { rec.pause(); }, resume() { rec.resume(); }, stop() { if (rec.state !== 'inactive') rec.stop(); } };
  }
  return { supported, start, pickMime };
})();
