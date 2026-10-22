/*
  File: media.js
  Project: devbench
  Role: Media tests (light). JPEG encode/decode on a 3 MP canvas, and WebCodecs
  video encode then decode of 60 frames at 1280x720 (video is an extra test in Settings).
  Exposes window.DevbenchMedia.jpeg(onProgress) and .video(onProgress).
*/

/* 3 MP test image, 2000 x 1500, average of 3. Video 720p, 60 frames. */
const DEVBENCH_JPEG_W = 2000;
const DEVBENCH_JPEG_H = 1500;
const DEVBENCH_JPEG_RUNS = 3;
const DEVBENCH_VID_W = 1280;
const DEVBENCH_VID_H = 720;
const DEVBENCH_VID_FRAMES = 60;

/* Draw a busy synthetic pattern so JPEG has real detail to compress. */
function devbenchMediaPattern(ctx, w, h, t) {
  var g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "hsl(" + (t * 3 % 360) + ",70%,40%)");
  g.addColorStop(1, "hsl(" + ((t * 3 + 180) % 360) + ",70%,60%)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (var i = 0; i < 200; i++) {
    ctx.fillStyle = "hsl(" + ((i * 37 + t * 5) % 360) + ",80%,50%)";
    ctx.fillRect((i * 97 + t * 11) % w, (i * 53) % h, w / 20, h / 30);
  }
  ctx.fillStyle = "#fff";
  ctx.font = Math.round(h / 10) + "px sans-serif";
  ctx.fillText("devbench " + t, w / 10, h / 2);
}

/* JPEG encode via toBlob and decode via createImageBitmap. */
async function devbenchJpegRun(onProgress) {
  var c = document.createElement("canvas");
  c.width = DEVBENCH_JPEG_W; c.height = DEVBENCH_JPEG_H;
  devbenchMediaPattern(c.getContext("2d"), c.width, c.height, 1);
  var enc = 0, dec = 0, blob = null;
  for (var i = 0; i < DEVBENCH_JPEG_RUNS; i++) {
    var t0 = performance.now();
    blob = await new Promise(function (r) { c.toBlob(r, "image/jpeg", 0.9); });
    var t1 = performance.now();
    var bmp = await createImageBitmap(blob);
    var t2 = performance.now();
    if (bmp.close) { bmp.close(); }
    enc += t1 - t0; dec += t2 - t1;
    onProgress((i + 1) / DEVBENCH_JPEG_RUNS);
  }
  var mp = (DEVBENCH_JPEG_W * DEVBENCH_JPEG_H) / 1e6;
  enc /= DEVBENCH_JPEG_RUNS; dec /= DEVBENCH_JPEG_RUNS;
  return { encMs: enc, decMs: dec, encMPs: mp / (enc / 1000), decMPs: mp / (dec / 1000), sizeKB: blob.size / 1024 };
}

/* Encoder configs to try, in order. AVC uses Annex B so chunks carry their own SPS/PPS. */
var DEVBENCH_VID_CODECS = ["avc1.42E028", "vp8", "vp09.00.10.08"];

/* Encoder config for one codec string. */
function devbenchEncCfg(codec) {
  var cfg = { codec: codec, width: DEVBENCH_VID_W, height: DEVBENCH_VID_H, bitrate: 4e6, framerate: 30, hardwareAcceleration: "no-preference" };
  if (codec.indexOf("avc1") === 0) { cfg.avc = { format: "annexb" }; }
  return cfg;
}

/* Encode 120 canvas frames with cfg. Returns { chunks, decoderConfig, encFps }. */
async function devbenchEncode(cfg, onProgress) {
  var c = document.createElement("canvas");
  c.width = DEVBENCH_VID_W; c.height = DEVBENCH_VID_H;
  var ctx = c.getContext("2d");
  var chunks = [], decoderConfig = null, encErr = null;
  var encoder = new VideoEncoder({
    output: function (chunk, meta) {
      if (meta && meta.decoderConfig && !decoderConfig) { decoderConfig = meta.decoderConfig; }
      chunks.push(chunk);
    },
    error: function (e) { encErr = e; }
  });
  encoder.configure(cfg);
  var t0 = performance.now();
  for (var i = 0; i < DEVBENCH_VID_FRAMES && !encErr; i++) {
    devbenchMediaPattern(ctx, c.width, c.height, i);
    var frame = new VideoFrame(c, { timestamp: i * 33333 });
    encoder.encode(frame, { keyFrame: i % 60 === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 4) { await new Promise(function (r) { setTimeout(r, 0); }); }
    onProgress(0.5 * (i + 1) / DEVBENCH_VID_FRAMES);
  }
  try { await encoder.flush(); } catch (err) { encErr = encErr || err; }
  var encSec = (performance.now() - t0) / 1000;
  try { encoder.close(); } catch (err) { /* already closed */ }
  if (encErr || !chunks.length) { throw encErr || new Error("no frames encoded"); }
  return { chunks: chunks, decoderConfig: decoderConfig, encFps: DEVBENCH_VID_FRAMES / encSec };
}

/*
  Decoder config for the encoded stream.
  Annex B streams carry SPS/PPS in-band, so any avcC "description" a hardware
  encoder returned is dropped; a mismatch there was the decode error on phones.
*/
function devbenchDecCfg(cfg, decoderConfig) {
  var d = { codec: (decoderConfig && decoderConfig.codec) || cfg.codec, codedWidth: DEVBENCH_VID_W, codedHeight: DEVBENCH_VID_H };
  if (decoderConfig && decoderConfig.description && !cfg.avc) { d.description = decoderConfig.description; }
  return d;
}

/* Decode chunks. Returns fps, or throws when the decoder rejects the stream. */
async function devbenchDecode(dcfg, chunks, onProgress) {
  var s = await VideoDecoder.isConfigSupported(dcfg);
  if (!s.supported) { throw new Error("decoder does not support " + dcfg.codec); }
  var decoded = 0, decErr = null;
  var decoder = new VideoDecoder({
    output: function (f) { decoded++; f.close(); onProgress(0.5 + 0.5 * decoded / chunks.length); },
    error: function (e) { decErr = e; }
  });
  decoder.configure(dcfg);
  var t1 = performance.now();
  for (var i = 0; i < chunks.length && !decErr; i++) { decoder.decode(chunks[i]); }
  try { await decoder.flush(); } catch (err) { decErr = decErr || err; }
  var decSec = (performance.now() - t1) / 1000;
  try { decoder.close(); } catch (err) { /* already closed */ }
  if (decErr || !decoded) { throw decErr || new Error("no frames decoded"); }
  return decoded / decSec;
}

/*
  Video test. Tries each codec: encode, then decode the same chunks.
  Never throws: a codec that fails moves on to the next one, and if decoding
  fails everywhere the encode result is still returned with decFps null.
*/
async function devbenchVideoRun(onProgress) {
  if (!("VideoEncoder" in window) || !("VideoDecoder" in window)) {
    return { supported: false };
  }
  var encOnly = null;
  for (var i = 0; i < DEVBENCH_VID_CODECS.length; i++) {
    var cfg = devbenchEncCfg(DEVBENCH_VID_CODECS[i]);
    try {
      var s = await VideoEncoder.isConfigSupported(cfg);
      if (!s.supported) { continue; }
      var enc = await devbenchEncode(cfg, onProgress);
      try {
        var decFps = await devbenchDecode(devbenchDecCfg(cfg, enc.decoderConfig), enc.chunks, onProgress);
        return { supported: true, codec: cfg.codec, hw: cfg.hardwareAcceleration, encFps: enc.encFps, decFps: decFps };
      } catch (decErr) {
        if (!encOnly) { encOnly = { supported: true, codec: cfg.codec, hw: cfg.hardwareAcceleration, encFps: enc.encFps, decFps: null, decNote: String(decErr && decErr.message || decErr) }; }
      }
    } catch (err) { /* encode failed for this codec; try next */ }
  }
  return encOnly || { supported: false };
}

window.DevbenchMedia = { jpeg: devbenchJpegRun, video: devbenchVideoRun };
