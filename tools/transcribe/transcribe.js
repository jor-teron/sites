/*=============================================================================
  transcribe.js — mic, Live Transcribe socket, blocks, CONFIG
  Load after hindi.js, assamese.js, romanizer.js, translation.js
=============================================================================*/

/*----------------------------------------------------------------------------
  CONFIG — change these to taste.
----------------------------------------------------------------------------*/
const CONFIG = {
  /* Gemini API key. Leave empty and type it in the field, or paste here. */
  API_KEY: "",

  /* Live transcription model id */
  MODEL: "gemini-3.5-transcribe-live",

  /* WebSocket path (key is appended at connect time) */
  WS_URL: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",

  /* Raw PCM the Live Transcribe API expects */
  SAMPLE_RATE: 16000,
  PCM_MIME: "audio/pcm;rate=16000",

  /* New colored block every N milliseconds of capture */
  SEGMENT_MS: 4000,

  /* ScriptProcessor buffer size (power of 2) */
  PROCESSOR_BUFFER: 4096,

  /* Optional BCP-47 hints. Empty = Auto. Filled by the Language dropdown. */
  LANGUAGE_CODES: [],

  /* Dropdown value → codes. auto = detect. */
  LANGUAGE_OPTIONS: {
    auto: [],
    as: ["as"],
    hi: ["hi"],
    bn: ["bn"],
    ne: ["ne"]
  },

  /* Smart cleanup if the API supports it; ignored if not */
  TRANSCRIBE_MODE: "smart",

  /* Show a Latin line (transliteration, not translation) */
  ENABLE_ROMANIZER: true,

  /* simple = readable English-ish. iast = ā ī ś */
  ROMANIZER_STYLE: "simple",

  /* Second Live pipe: speech → English meaning */
  ENABLE_TRANSLATION: true,
  TRANSLATE_MODEL: "gemini-3.5-live-translate-preview",
  TRANSLATE_TARGET: "en",

  /* Persist API key in localStorage */
  SAVE_KEY_LOCALLY: true,
  STORAGE_KEY: "gemini_transcribe_api_key",

  /* Rotating card colors */
  BLOCK_COLORS: [
    "#7aa2ff",
    "#3dd68c",
    "#ffd166",
    "#ff8fab",
    "#c3a6ff",
    "#80e0d0",
    "#ffb347",
    "#9ad0f5"
  ]
};

/*----------------------------------------------------------------------------
  Runtime state
----------------------------------------------------------------------------*/
/* WebSocket to Gemini Live Transcribe */
let ws = null;
/* getUserMedia MediaStream */
let mediaStream = null;
/* Web Audio graph */
let audioContext = null;
let processorNode = null;
let sourceNode = null;
/* 4-second segment timer id */
let segmentTimer = null;
/* Which color index is next */
let colorIndex = 0;
/* Live (uncommitted) text for the current 4s window */
let liveText = "";
/* Live English translation for the current 4s window */
let liveEn = "";
/* Already-committed original / EN — used to drop model repeats */
let committedText = "";
let committedEn = "";
/* DOM node of the live block at the top */
let liveBlockEl = null;
/* Last frozen card — late ENG attaches here so it stays with that Original */
let lastFrozenBlock = null;
/* True while capturing */
let running = false;

/*----------------------------------------------------------------------------
  setStatus
  Update the status line. kind = "" | "ok" | "err"
----------------------------------------------------------------------------*/
function setStatus(msg, kind) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = kind || "";
}

/*----------------------------------------------------------------------------
  getApiKey
  Prefer the input field, then CONFIG.API_KEY, then localStorage.
----------------------------------------------------------------------------*/
function getApiKey() {
  const typed = document.getElementById("apiKey").value.trim();
  if (typed) return typed;
  if (CONFIG.API_KEY) return CONFIG.API_KEY;
  if (CONFIG.SAVE_KEY_LOCALLY) {
    return localStorage.getItem(CONFIG.STORAGE_KEY) || "";
  }
  return "";
}

/*----------------------------------------------------------------------------
  persistApiKey
  Store key locally if allowed.
----------------------------------------------------------------------------*/
function persistApiKey(key) {
  if (!CONFIG.SAVE_KEY_LOCALLY || !key) return;
  localStorage.setItem(CONFIG.STORAGE_KEY, key);
}

/*----------------------------------------------------------------------------
  nextColor
  Return the next block background color and advance the palette.
----------------------------------------------------------------------------*/
function nextColor() {
  const color = CONFIG.BLOCK_COLORS[colorIndex % CONFIG.BLOCK_COLORS.length];
  colorIndex += 1;
  return color;
}

/*----------------------------------------------------------------------------
  formatTime
  Short clock stamp for a block header.
----------------------------------------------------------------------------*/
function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/*----------------------------------------------------------------------------
  ensureLiveBlock
  Create or reuse the top live card for the current 4s window.
----------------------------------------------------------------------------*/
function ensureLiveBlock() {
  const host = document.getElementById("blocks");
  if (liveBlockEl && liveBlockEl.parentNode === host) return liveBlockEl;

  liveBlockEl = document.createElement("div");
  liveBlockEl.className = "block live";
  liveBlockEl.style.background = nextColor();
  liveBlockEl.innerHTML =
    '<div class="meta">LIVE · ' + formatTime(new Date()) + "</div>" +
    '<div class="line en"></div>' +
    '<div class="line rom"></div>' +
    '<div class="line txt"></div>';
  host.insertBefore(liveBlockEl, host.firstChild);
  return liveBlockEl;
}

/*----------------------------------------------------------------------------
  renderLiveText
  Paint current window text into the live card.
----------------------------------------------------------------------------*/
function renderLiveText() {
  if (!liveText && !liveEn) return;
  const el = ensureLiveBlock();
  el.dataset.original = liveText || "";
  const txt = el.querySelector(".txt");
  txt.textContent = liveText ? ("(Original) " + liveText) : "";
  paintRoman(el, liveText);
  paintEn(el, liveEn);
}

/*----------------------------------------------------------------------------
  commitLiveBlock
  Freeze the current 4s window as a finished block.
----------------------------------------------------------------------------*/
function commitLiveBlock() {
  const text = (liveText || "").trim();
  if (liveBlockEl) {
    liveBlockEl.classList.remove("live");
    liveBlockEl.dataset.original = liveText || "";
    const meta = liveBlockEl.querySelector(".meta");
    if (meta && (text || liveEn)) {
      meta.textContent = formatTime(new Date());
    }
    if (!text && !(liveEn || "").trim()) {
      liveBlockEl.remove();
      lastFrozenBlock = lastFrozenBlock;
    } else {
      if (liveEn) liveBlockEl.dataset.en = liveEn;
      paintEn(liveBlockEl, liveBlockEl.dataset.en || liveEn);
      paintRoman(liveBlockEl, liveText);
      lastFrozenBlock = liveBlockEl;
    }
  }
  if (text) {
    committedText = (committedText ? committedText + " " : "") + text;
  }
  if ((liveEn || "").trim()) {
    committedEn = (committedEn ? committedEn + " " : "") + liveEn.trim();
  }
  liveBlockEl = null;
  liveText = "";
  liveEn = "";
}

/*----------------------------------------------------------------------------
  mergePiece
  Grow or append incremental model strings.
----------------------------------------------------------------------------*/
function mergePiece(current, incoming) {
  const next = String(incoming || "");
  if (!next) return current || "";
  let livePart = current || "";
  if (!livePart) {
    livePart = next;
  } else if (next.startsWith(livePart) || livePart.startsWith(next)) {
    livePart = next.length >= livePart.length ? next : livePart;
  } else if (livePart.endsWith(next) || next.indexOf(livePart) !== -1) {
    livePart = next.length >= livePart.length ? next : livePart;
  } else {
    livePart = (livePart + " " + next).replace(/\s+/g, " ").trim();
  }
  return livePart;
}

/*----------------------------------------------------------------------------
  stripCommitted
  If the model resends old words plus new ones, keep only the new tail.
----------------------------------------------------------------------------*/
function stripCommitted(incoming, committed, currentLive) {
  let next = String(incoming || "").trim();
  if (!next) return "";
  const known = ((committed || "") + (currentLive ? " " + currentLive : "")).replace(/\s+/g, " ").trim();
  if (committed && next.startsWith(committed)) {
    next = next.slice(committed.length).trim();
  }
  if (currentLive && next.startsWith(currentLive)) {
    return next;
  }
  if (known && next.startsWith(known)) {
    next = next.slice(known.length).trim();
    return ((currentLive || "") + (next ? " " + next : "")).trim();
  }
  if (currentLive && currentLive.indexOf(next) !== -1) {
    return currentLive;
  }
  return next;
}

/*----------------------------------------------------------------------------
  appendTranscript
  Merge incoming transcribe text into the current 4s window.
----------------------------------------------------------------------------*/
function appendTranscript(incoming) {
  if (!incoming) return;
  const sliced = stripCommitted(incoming, committedText, liveText);
  if (!sliced) return;
  liveText = mergePiece(liveText, sliced);
  renderLiveText();
}

/*----------------------------------------------------------------------------
  targetEnBlock
  Pair ENG with the Original card it belongs to.
  Late translate text goes on the last frozen card until that card has ENG
  and a new Original line has started.
----------------------------------------------------------------------------*/
function targetEnBlock() {
  const frozen = lastFrozenBlock && lastFrozenBlock.parentNode ? lastFrozenBlock : null;
  const frozenEn = frozen ? (frozen.dataset.en || "") : "";
  if (frozen && !frozenEn) return frozen;
  if (liveBlockEl && liveText) return liveBlockEl;
  if (frozen) return frozen;
  return ensureLiveBlock();
}

/*----------------------------------------------------------------------------
  appendTranslation
  Merge English onto the paired card, not a random new 4s window.
----------------------------------------------------------------------------*/
function appendTranslation(incoming) {
  if (!incoming) return;
  const el = targetEnBlock();
  const current = (el.dataset.en || (el === liveBlockEl ? liveEn : "") || "").trim();
  const sliced = stripCommitted(incoming, "", current);
  if (!sliced) return;
  const merged = mergePiece(current, sliced);
  el.dataset.en = merged;
  paintEn(el, merged);
  if (el === liveBlockEl) liveEn = merged;
}

/*----------------------------------------------------------------------------
  floatTo16BitPCM
  Convert Float32 samples in [-1, 1] to little-endian Int16 bytes.
----------------------------------------------------------------------------*/
function floatTo16BitPCM(float32) {
  const out = new ArrayBuffer(float32.length * 2);
  const view = new DataView(out);
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

/*----------------------------------------------------------------------------
  downsampleBuffer
  Resample Float32 from inputRate to CONFIG.SAMPLE_RATE.
----------------------------------------------------------------------------*/
function downsampleBuffer(buffer, inputRate, outRate) {
  if (outRate === inputRate) return buffer;
  const ratio = inputRate / outRate;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

/*----------------------------------------------------------------------------
  arrayBufferToBase64
  Encode PCM bytes for the Live API audio blob.
----------------------------------------------------------------------------*/
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/*----------------------------------------------------------------------------
  sendPcmChunk
  Send the same PCM to transcribe and translate sockets.
----------------------------------------------------------------------------*/
function sendPcmChunk(pcmBuffer) {
  const msg = JSON.stringify({
    realtimeInput: {
      audio: {
        data: arrayBufferToBase64(pcmBuffer),
        mimeType: CONFIG.PCM_MIME
      }
    }
  });
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
  if (wsTranslate && wsTranslate.readyState === WebSocket.OPEN) wsTranslate.send(msg);
}

/*----------------------------------------------------------------------------
  sendSetup
  First message after WS open: transcribe model config.
----------------------------------------------------------------------------*/
function sendSetup() {
  const setup = {
    setup: {
      model: "models/" + CONFIG.MODEL,
      generationConfig: {
        responseModalities: ["TEXT"]
      },
      inputAudioTranscription: {
        languageCodes: CONFIG.LANGUAGE_CODES
      }
    }
  };
  if (CONFIG.TRANSCRIBE_MODE) {
    setup.setup.inputAudioTranscription.mode = CONFIG.TRANSCRIBE_MODE;
  }
  ws.send(JSON.stringify(setup));
}

/*----------------------------------------------------------------------------
  handleServerMessage
  Parse Live Transcribe JSON.
----------------------------------------------------------------------------*/
function handleServerMessage(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return;
  }

  if (data.setupComplete) {
    setStatus("Connected · listening", "ok");
    return;
  }

  const content = data.serverContent || data.server_content;
  if (!content) {
    if (data.error) {
      const msg = data.error.message || JSON.stringify(data.error);
      setStatus("API error: " + msg, "err");
    }
    return;
  }

  const interim =
    (content.interimInputTranscription && content.interimInputTranscription.text) ||
    (content.interim_input_transcription && content.interim_input_transcription.text);
  const final =
    (content.inputTranscription && content.inputTranscription.text) ||
    (content.input_transcription && content.input_transcription.text);

  if (interim) appendTranscript(interim);
  if (final) appendTranscript(final);
}

/*----------------------------------------------------------------------------
  startSegmentTimer
  Commit a block every SEGMENT_MS.
----------------------------------------------------------------------------*/
function startSegmentTimer() {
  stopSegmentTimer();
  segmentTimer = setInterval(function () {
    if (!running) return;
    commitLiveBlock();
  }, CONFIG.SEGMENT_MS);
}

/*----------------------------------------------------------------------------
  stopSegmentTimer
  Clear the 4s ticker.
----------------------------------------------------------------------------*/
function stopSegmentTimer() {
  if (segmentTimer) {
    clearInterval(segmentTimer);
    segmentTimer = null;
  }
}

/*----------------------------------------------------------------------------
  startMic
  Request mic and stream downsampled PCM.
----------------------------------------------------------------------------*/
async function startMic() {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1
    },
    video: false
  });

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processorNode = audioContext.createScriptProcessor(CONFIG.PROCESSOR_BUFFER, 1, 1);

  processorNode.onaudioprocess = function (ev) {
    if (!running) return;
    const input = ev.inputBuffer.getChannelData(0);
    const down = downsampleBuffer(input, audioContext.sampleRate, CONFIG.SAMPLE_RATE);
    const pcm = floatTo16BitPCM(down);
    sendPcmChunk(pcm);
  };

  sourceNode.connect(processorNode);
  processorNode.connect(audioContext.destination);
}

/*----------------------------------------------------------------------------
  stopMic
  Tear down audio graph and tracks.
----------------------------------------------------------------------------*/
function stopMic() {
  if (processorNode) {
    try { processorNode.disconnect(); } catch (e) {}
    processorNode.onaudioprocess = null;
    processorNode = null;
  }
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch (e) {}
    sourceNode = null;
  }
  if (audioContext) {
    audioContext.close().catch(function () {});
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(function (t) { t.stop(); });
    mediaStream = null;
  }
}

/*----------------------------------------------------------------------------
  connectWs
  Open Live Transcribe socket.
----------------------------------------------------------------------------*/
function connectWs(apiKey) {
  return new Promise(function (resolve, reject) {
    const url = CONFIG.WS_URL + "?key=" + encodeURIComponent(apiKey);
    ws = new WebSocket(url);

    ws.onopen = function () {
      sendSetup();
      resolve();
    };

    ws.onmessage = function (ev) {
      if (typeof ev.data === "string") {
        handleServerMessage(ev.data);
        return;
      }
      if (ev.data instanceof Blob) {
        ev.data.text().then(handleServerMessage).catch(function () {});
      }
    };

    ws.onerror = function () {
      setStatus("WebSocket error", "err");
      reject(new Error("WebSocket error"));
    };

    ws.onclose = function (ev) {
      if (running) {
        setStatus("Connection closed: " + (ev.reason || ev.code), "err");
        stopAll(false);
      }
    };
  });
}

/*----------------------------------------------------------------------------
  startAll
  Validate key, connect both pipes, start mic + 4s clock.
----------------------------------------------------------------------------*/
async function startAll() {
  const key = getApiKey();
  if (!key) {
    setStatus("Paste an API key first", "err");
    return;
  }
  persistApiKey(key);
  document.getElementById("apiKey").value = key;
  const langKey = document.getElementById("langSelect")
    ? document.getElementById("langSelect").value
    : "auto";
  CONFIG.LANGUAGE_CODES = CONFIG.LANGUAGE_OPTIONS[langKey] || [];
  committedText = "";
  committedEn = "";
  liveText = "";
  liveEn = "";

  document.getElementById("btnStart").disabled = true;
  setStatus("Connecting…");

  try {
    running = true;
    await connectWs(key);
    await connectTranslateWs(key);
    await startMic();
    startSegmentTimer();
    ensureLiveBlock();
    document.getElementById("btnStop").disabled = false;
    setStatus("Connected · listening", "ok");
  } catch (err) {
    running = false;
    document.getElementById("btnStart").disabled = false;
    document.getElementById("btnStop").disabled = true;
    setStatus(err.message || String(err), "err");
    stopMic();
    if (ws) {
      try { ws.close(); } catch (e) {}
      ws = null;
    }
    closeTranslateWs();
  }
}

/*----------------------------------------------------------------------------
  stopAll
  Stop capture, commit last block, close sockets.
----------------------------------------------------------------------------*/
function stopAll(closeSocket) {
  running = false;
  stopSegmentTimer();
  stopMic();
  commitLiveBlock();
  if (closeSocket !== false && ws) {
    try { ws.close(); } catch (e) {}
    ws = null;
  }
  if (closeSocket !== false) closeTranslateWs();
  document.getElementById("btnStart").disabled = false;
  document.getElementById("btnStop").disabled = true;
  if (document.getElementById("status").className !== "err") {
    setStatus("Stopped");
  }
}

/*----------------------------------------------------------------------------
  copyAll
  Copy blocks in display order: ENG, Roman, Original.
----------------------------------------------------------------------------*/
function copyAll() {
  const parts = [];
  document.querySelectorAll("#blocks .block").forEach(function (block) {
    const e = (block.querySelector(".en") && block.querySelector(".en").textContent || "").trim();
    const r = (block.querySelector(".rom") && block.querySelector(".rom").textContent || "").trim();
    const t = (block.querySelector(".txt") && block.querySelector(".txt").textContent || "").trim();
    const lines = [];
    if (e) lines.push(e);
    if (r) lines.push(r);
    if (t) lines.push(t);
    if (lines.length) parts.push(lines.join("\n"));
  });
  const blob = parts.join("\n\n");
  if (!blob) {
    setStatus("Nothing to copy");
    return;
  }
  navigator.clipboard.writeText(blob).then(function () {
    setStatus("Copied", "ok");
  }).catch(function () {
    setStatus("Copy failed", "err");
  });
}

/*----------------------------------------------------------------------------
  clearAll
  Remove cards and reset live window.
----------------------------------------------------------------------------*/
function clearAll() {
  document.getElementById("blocks").innerHTML = "";
  liveBlockEl = null;
  lastFrozenBlock = null;
  liveText = "";
  liveEn = "";
  committedText = "";
  committedEn = "";
  colorIndex = 0;
  setStatus("Cleared");
}

/*----------------------------------------------------------------------------
  boot
  Wire buttons and restore saved key.
----------------------------------------------------------------------------*/
function boot() {
  const keyInput = document.getElementById("apiKey");
  if (CONFIG.API_KEY) {
    keyInput.value = CONFIG.API_KEY;
  } else if (CONFIG.SAVE_KEY_LOCALLY) {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (saved) keyInput.value = saved;
  }

  document.getElementById("btnStart").addEventListener("click", startAll);
  document.getElementById("btnStop").addEventListener("click", function () {
    stopAll(true);
  });
  document.getElementById("btnCopy").addEventListener("click", copyAll);
  document.getElementById("btnClear").addEventListener("click", clearAll);

  function applyLanguageSelect() {
    const sel = document.getElementById("langSelect");
    const key = sel ? sel.value : "auto";
    CONFIG.LANGUAGE_CODES = CONFIG.LANGUAGE_OPTIONS[key] || [];
  }
  applyLanguageSelect();
  document.getElementById("langSelect").addEventListener("change", applyLanguageSelect);

  function syncRomanButton() {
    const btn = document.getElementById("btnRoman");
    btn.textContent = CONFIG.ENABLE_ROMANIZER ? "Romanizer: on" : "Romanizer: off";
  }
  syncRomanButton();
  document.getElementById("btnRoman").addEventListener("click", function () {
    CONFIG.ENABLE_ROMANIZER = !CONFIG.ENABLE_ROMANIZER;
    syncRomanButton();
    document.querySelectorAll("#blocks .block").forEach(function (block) {
      paintRoman(block, block.dataset.original || "");
    });
  });

  function syncTransButton() {
    const btn = document.getElementById("btnTrans");
    if (!btn) return;
    btn.textContent = CONFIG.ENABLE_TRANSLATION ? "Translate: on" : "Translate: off";
  }
  syncTransButton();
  document.getElementById("btnTrans").addEventListener("click", function () {
    CONFIG.ENABLE_TRANSLATION = !CONFIG.ENABLE_TRANSLATION;
    syncTransButton();
    if (!CONFIG.ENABLE_TRANSLATION) {
      document.querySelectorAll("#blocks .block .en").forEach(function (el) {
        el.textContent = "";
      });
    }
  });
}

boot();
