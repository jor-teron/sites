/*=============================================================================
  transcribe.js — mic, Live Transcribe socket, cards, CONFIG
  Load after hindi.js, assamese.js, bengali.js, romanizer.js, vocab.js,
  translation.js.

  Transcript flow (one Live Transcribe socket):
    interimInputTranscription = the whole current utterance, revised as the
      speaker talks → it REPLACES the live card's tail (onInterim)
    inputTranscription        = the final text of that utterance → it is
      COMMITTED to the live card (onFinal)
  A card closes after a final plus a pause (or at SEGMENT_MAX_MS); a closed
  card is translated by translation.js with one text request keyed by its
  card number, so its English always lands on that card.
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

  /* Wait this long for the server's setupComplete before Start fails.
     No audio is sent before setupComplete. */
  SETUP_TIMEOUT_MS: 8000,

  /* Card boundaries. A card closes when:
     - it has a final transcript, no interim is pending, the last text is
       PAUSE_MS old, and the card is at least SEGMENT_MIN_MS old; or
     - it is SEGMENT_MAX_MS old (hard split). If the speaker is still mid-
       utterance then, the words so far stay in this card and the rest of the
       utterance goes to the next card without repeating them (utterCarry). */
  SEGMENT_MIN_MS: 1500,
  SEGMENT_MAX_MS: 8000,
  PAUSE_MS: 1200,

  /* Fallback if the server never sends finals (only interims): an interim
     that has not changed for this long is treated as final. Only used until
     the first real final arrives. */
  IMPLICIT_FINAL_MS: 2000,

  /* The same final text again within this window is a resend → dropped */
  REPEAT_FINAL_MS: 2500,

  /* Stop: send audioStreamEnd and wait up to this long for the last final */
  STOP_FINAL_WAIT_MS: 1500,

  /* Housekeeping tick (card boundaries) */
  TICK_MS: 250,

  /* ScriptProcessor buffer size (power of 2) */
  PROCESSOR_BUFFER: 4096,

  /* Optional BCP-47 hints. Empty = Auto. Filled by the Language dropdown. */
  LANGUAGE_CODES: [],

  /* Dropdown value → codes. auto = detect. */
  LANGUAGE_OPTIONS: {
    auto: [],
    as: ["as-IN"],
    hi: ["hi-IN"],
    bn: ["bn-IN"],
    ne: ["ne-NP"]
  },

  /* inputAudioTranscription.mode: "SMART" (cleaned up) or "VERBATIM" */
  TRANSCRIBE_MODE: "SMART",

  /* Speech biasing terms (vocab.js); [] to send none */
  CUSTOM_VOCABULARY: (typeof VOCAB_TERMS !== "undefined") ? VOCAB_TERMS : [],

  /* Show a Latin line (transliteration, not translation) */
  ENABLE_ROMANIZER: true,

  /* simple = readable English-ish. iast = ā ī ś */
  ROMANIZER_STYLE: "simple",

  /* English line: one text request per closed card (translation.js) */
  ENABLE_TRANSLATION: true,
  /* Tried in order; a model that errors / is rate-limited (429) falls back */
  TRANSLATE_MODELS: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
  /* REST base; "<model>:generateContent?key=" is appended */
  CHAT_API_BASE: "https://generativelanguage.googleapis.com/v1beta/models/",
  TRANSLATE_TARGET: "en",
  /* Earlier cards sent along as context (not translated again) */
  TRANSLATE_CONTEXT_CARDS: 2,
  /* If a request went out less than this long ago, closed cards wait and
     go together in the next request (fewer requests per minute) */
  TRANSLATE_MIN_GAP_MS: 4000,
  /* Most cards in one request */
  TRANSLATE_MAX_BATCH: 6,
  /* Skip a model this long after it answered 429 */
  TRANSLATE_COOLDOWN_MS: 60000,
  /* Cards missing from a reply are asked again this many times */
  TRANSLATE_RETRIES: 1,

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
/* True once the server sent setupComplete on the current socket */
let sessionReady = false;
/* getUserMedia MediaStream */
let mediaStream = null;
/* Web Audio graph */
let audioContext = null;
let processorNode = null;
let sourceNode = null;
/* Housekeeping tick id */
let segmentTimer = null;
/* Which color index is next */
let colorIndex = 0;
/* DOM node of the live card at the top */
let liveBlockEl = null;
/* Running card number (data-seq on each card) */
let cardSeq = 0;
/* True while capturing */
let running = false;
/* True between Stop and the last final (or STOP_FINAL_WAIT_MS) */
let stopping = false;

/* Live card transcript = finals committed to it + the fresh interim tail */
let cardFinals = [];
let cardFresh = "";
/* Latest full interim hypothesis of the current utterance ("" = none) */
let interimFull = "";
/* Words of the current utterance already frozen into an earlier card */
let utterCarry = "";
/* utterCarry came from an implicit final (no real final seen yet) */
let carryImplicit = false;
/* Last committed final (resend check) and when it came */
let lastFinal = "";
let lastFinalAt = 0;
/* A real inputTranscription arrived this session */
let sawFinal = false;
/* When the live card got its first / latest text (ms) */
let liveStartedAt = 0;
let lastTextAt = 0;
/* When interimFull last changed (implicit-final fallback) */
let interimAt = 0;

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
  The same key serves Live Transcribe and the translate text requests.
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
  now
  Current time in ms (one place, so a test harness can fake the clock).
----------------------------------------------------------------------------*/
function now() {
  return Date.now();
}

/*----------------------------------------------------------------------------
  Text helpers for dedupe (ported from caption-for-nei)
----------------------------------------------------------------------------*/
/* Words of a text */
function wordsOf(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

/* Compare words without case or punctuation (keeps Indic vowel signs) */
function normWord(w) {
  return String(w).toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, "");
}

/* Whole text, normalized word by word */
function normText(text) {
  return wordsOf(text).map(normWord).filter(Boolean).join(" ");
}

/* Join two pieces with one space */
function joinText(a, b) {
  a = String(a || "").trim();
  b = String(b || "").trim();
  return a && b ? a + " " + b : a || b;
}

/*----------------------------------------------------------------------------
  removeOverlap
  The part of `text` that is new compared with `prefix` (already shown):
    text starts with prefix            → the words after it
    text is covered by prefix          → ""
    text is prefix with a few words revised (>= 60% same, not shorter)
                                       → the words after prefix's length
    prefix's end overlaps text's start → the words after the overlap
    no relation                        → all of text
----------------------------------------------------------------------------*/
function removeOverlap(prefix, text) {
  const p = wordsOf(prefix).map(normWord);
  const hw = wordsOf(text);
  const h = hw.map(normWord);
  if (!p.length) return hw.join(" ");
  let k = 0;
  while (k < p.length && k < h.length && p[k] === h[k]) k++;
  if (k === p.length) return hw.slice(k).join(" ");
  if (k === h.length) return "";
  let same = 0;
  const n = Math.min(p.length, h.length);
  for (let i = 0; i < n; i++) if (p[i] === h[i]) same++;
  if (h.length >= p.length && same >= Math.ceil(p.length * 0.6)) return hw.slice(p.length).join(" ");
  for (let m = n; m > 0; m--) {
    let ok = true;
    for (let i = 0; i < m; i++) {
      if (p[p.length - m + i] !== h[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return hw.slice(m).join(" ");
  }
  if (h.length < p.length && same >= Math.ceil(h.length * 0.6)) return "";
  return hw.join(" ");
}

/*----------------------------------------------------------------------------
  collapseRepeats
  Drop a run of words repeated back to back (model loops):
    3+ word phrase twice in a row → once
    2-word phrase 3+ times in a row → once
  Single-word reduplication (धीरे धीरे, জাল জাল) is real speech: kept.
----------------------------------------------------------------------------*/
function collapseRepeats(text) {
  const w = wordsOf(text);
  if (w.length < 4) return w.join(" ");
  const key = function (i, n) { return w.slice(i, i + n).map(normWord).join(" "); };
  for (let n = Math.floor(w.length / 2); n >= 2; n--) {
    let i = 0;
    while (i + 2 * n <= w.length) {
      const a = key(i, n);
      if (!a || a !== key(i + n, n)) { i++; continue; }
      let reps = 2;
      while (i + (reps + 1) * n <= w.length && key(i + reps * n, n) === a) reps++;
      if (n >= 3 || reps >= 3) {
        /* keep the last copy (its punctuation is usually the final one) */
        w.splice(i, (reps - 1) * n);
      } else {
        i++;
      }
    }
  }
  return w.join(" ");
}

/*----------------------------------------------------------------------------
  stripResent
  A final that re-sends the previous final (cumulative) or starts with its
  last 3+ words: keep only the new part.
----------------------------------------------------------------------------*/
function stripResent(prev, text) {
  const p = wordsOf(prev).map(normWord);
  const hw = wordsOf(text);
  const h = hw.map(normWord);
  if (!p.length || !h.length) return hw.join(" ");
  let k = 0;
  while (k < p.length && k < h.length && p[k] === h[k]) k++;
  if (k === p.length && h.length > p.length) return hw.slice(k).join(" ");
  for (let m = Math.min(p.length, h.length - 1); m >= 3; m--) {
    let ok = true;
    for (let i = 0; i < m; i++) {
      if (p[p.length - m + i] !== h[i]) { ok = false; break; }
    }
    if (ok) return hw.slice(m).join(" ");
  }
  return hw.join(" ");
}

/*----------------------------------------------------------------------------
  firstWordDiffers
  True if two texts start with different words (a new utterance).
----------------------------------------------------------------------------*/
function firstWordDiffers(a, b) {
  return normWord(wordsOf(a)[0] || "") !== normWord(wordsOf(b)[0] || "");
}

/*----------------------------------------------------------------------------
  cardText
  Live card transcript: committed finals + fresh interim tail.
----------------------------------------------------------------------------*/
function cardText() {
  return joinText(cardFinals.join(" "), cardFresh);
}

/*----------------------------------------------------------------------------
  ensureLiveBlock
  Create or reuse the top live card.
----------------------------------------------------------------------------*/
function ensureLiveBlock() {
  const host = document.getElementById("blocks");
  if (liveBlockEl && liveBlockEl.parentNode === host) return liveBlockEl;

  cardSeq += 1;
  liveBlockEl = document.createElement("div");
  liveBlockEl.className = "block live";
  liveBlockEl.dataset.seq = String(cardSeq);
  liveBlockEl.style.background = nextColor();
  [["meta", "LIVE · " + formatTime(new Date())], ["line en", ""],
   ["line rom", ""], ["line txt", ""]].forEach(function (part) {
    const d = document.createElement("div");
    d.className = part[0];
    d.textContent = part[1];
    liveBlockEl.appendChild(d);
  });
  host.insertBefore(liveBlockEl, host.firstChild);
  return liveBlockEl;
}

/*----------------------------------------------------------------------------
  renderLiveText
  Paint the live card's transcript + Roman line. English comes after close.
----------------------------------------------------------------------------*/
function renderLiveText() {
  const text = cardText();
  if (!text && !liveBlockEl) return;
  const el = ensureLiveBlock();
  el.dataset.original = text;
  el.querySelector(".txt").textContent = text ? ("(Original) " + text) : "";
  paintRoman(el, text);
}

/*----------------------------------------------------------------------------
  touchCard
  Note new text on the live card (starts its clock on the first text).
----------------------------------------------------------------------------*/
function touchCard() {
  const t = now();
  if (!liveStartedAt) liveStartedAt = t;
  lastTextAt = t;
}

/*----------------------------------------------------------------------------
  commitLiveBlock
  Close the live card: freeze its text and ask for its English.
  Callers set utterCarry first when an utterance continues past the card.
----------------------------------------------------------------------------*/
function commitLiveBlock() {
  const el = liveBlockEl;
  const text = cardText().trim();
  liveBlockEl = null;
  cardFinals = [];
  cardFresh = "";
  liveStartedAt = 0;
  lastTextAt = 0;
  if (!el) return;
  if (!text) {
    el.remove();
    return;
  }
  el.classList.remove("live");
  el.dataset.original = text;
  el.dataset.frozenAt = String(now());
  const meta = el.querySelector(".meta");
  if (meta) meta.textContent = formatTime(new Date());
  el.querySelector(".txt").textContent = "(Original) " + text;
  paintRoman(el, text);
  requestTranslation(el);
}

/*----------------------------------------------------------------------------
  onInterim
  The current utterance so far. REPLACES the live card's tail; words an
  earlier card already holds (utterCarry) are not shown again.
----------------------------------------------------------------------------*/
function onInterim(raw) {
  const h = String(raw || "").trim();
  if (!h) return;
  if (!interimFull) {
    /* Late interim of the utterance that was just finalised → ignore */
    if (lastFinal && !utterCarry && removeOverlap(lastFinal, h) === "") return;
    /* Carry from an implicit final, and this is clearly a new utterance */
    if (utterCarry && carryImplicit && firstWordDiffers(utterCarry, h)) {
      utterCarry = "";
      carryImplicit = false;
    }
  } else if (!sawFinal && firstWordDiffers(interimFull, h) &&
             wordsOf(h).length < wordsOf(interimFull).length) {
    /* No finals from this server: a shorter, different interim means the
       previous utterance ended → treat it as final (no carry needed) */
    commitFinalText(interimFull, true, false);
  }
  if (h === interimFull) return;
  interimFull = h;
  interimAt = now();
  const fresh = collapseRepeats(utterCarry ? removeOverlap(utterCarry, h) : h);
  if (fresh === cardFresh) return;
  cardFresh = fresh;
  touchCard();
  renderLiveText();
}

/*----------------------------------------------------------------------------
  onFinal
  Final text of one utterance from the server: commit it to the live card.
----------------------------------------------------------------------------*/
function onFinal(raw) {
  sawFinal = true;
  commitFinalText(raw, false, false);
}

/*----------------------------------------------------------------------------
  commitFinalText
  Commit one utterance's final text to the live card.
  implicit = made from an interim (server sent no final);
  keepCarry = a real final may still come for it (stale-interim fallback).
----------------------------------------------------------------------------*/
function commitFinalText(raw, implicit, keepCarry) {
  const full = collapseRepeats(String(raw || "").trim());
  const t = now();
  let fresh = utterCarry ? removeOverlap(utterCarry, full) : full;
  if (lastFinal && !utterCarry) fresh = stripResent(lastFinal, fresh);
  const resend = !!fresh && !!lastFinal && normText(fresh) === normText(lastFinal) &&
    t - lastFinalAt < CONFIG.REPEAT_FINAL_MS;
  if (keepCarry) {
    /* the whole hypothesis so far: a late real final is trimmed by it */
    utterCarry = full;
    carryImplicit = true;
  } else {
    utterCarry = "";
    carryImplicit = false;
  }
  interimFull = "";
  cardFresh = "";
  if (fresh && !resend) {
    cardFinals.push(fresh);
    lastFinal = full;
    lastFinalAt = t;
    touchCard();
  } else if (!implicit) {
    lastFinalAt = t;
  }
  renderLiveText();
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

  if (data.setupComplete || data.setup_complete) {
    sessionReady = true;
    if (typeof onSetupComplete === "function") onSetupComplete();
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

  /* A final wins; an interim in the same message is not added on top */
  if (final) onFinal(final);
  else if (interim) onInterim(interim);
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
  tick
  Every TICK_MS: close the live card at a pause / max length, and the
  implicit-final fallback when the server sends no finals.
----------------------------------------------------------------------------*/
function tick() {
  if (!running && !stopping) return;
  const t = now();
  /* Server has sent no final yet and this interim went stale → final */
  if (interimFull && !sawFinal && t - interimAt >= CONFIG.IMPLICIT_FINAL_MS) {
    commitFinalText(interimFull, true, true);
  }
  if (!liveBlockEl || !cardText().trim() || !liveStartedAt) return;
  const age = t - liveStartedAt;
  const quiet = t - lastTextAt;
  if (age >= CONFIG.SEGMENT_MAX_MS) {
    /* Hard split. Mid-utterance: the words so far stay here, the rest of
       the utterance goes to the next card without repeating them. */
    if (interimFull) {
      utterCarry = interimFull;
      carryImplicit = !sawFinal;
    }
    commitLiveBlock();
  } else if (!interimFull && cardFinals.length && age >= CONFIG.SEGMENT_MIN_MS &&
             quiet >= CONFIG.PAUSE_MS) {
    commitLiveBlock();
  }
}

/*----------------------------------------------------------------------------
  startSegmentTimer
  Start the housekeeping tick.
----------------------------------------------------------------------------*/
function startSegmentTimer() {
  stopSegmentTimer();
  segmentTimer = setInterval(tick, CONFIG.TICK_MS);
}

/*----------------------------------------------------------------------------
  stopSegmentTimer
  Clear the housekeeping tick.
----------------------------------------------------------------------------*/
function stopSegmentTimer() {
  if (segmentTimer) {
    clearInterval(segmentTimer);
    segmentTimer = null;
  }
}

/*----------------------------------------------------------------------------
  sendPcmChunk
  Send one PCM chunk — only after the server's setupComplete.
----------------------------------------------------------------------------*/
function sendPcmChunk(pcmBuffer) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !sessionReady) return;
  ws.send(JSON.stringify({
    realtimeInput: {
      audio: {
        data: arrayBufferToBase64(pcmBuffer),
        mimeType: CONFIG.PCM_MIME
      }
    }
  }));
}

/*----------------------------------------------------------------------------
  sendAudioStreamEnd
  Tell the server the mic stream ended, so it finalises the last utterance.
----------------------------------------------------------------------------*/
function sendAudioStreamEnd() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !sessionReady) return false;
  ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  return true;
}

/*----------------------------------------------------------------------------
  sendSetup
  First message after WS open: transcribe model config.
----------------------------------------------------------------------------*/
function sendSetup() {
  const transcription = { languageCodes: CONFIG.LANGUAGE_CODES };
  if (CONFIG.TRANSCRIBE_MODE) transcription.mode = CONFIG.TRANSCRIBE_MODE;
  if (CONFIG.CUSTOM_VOCABULARY && CONFIG.CUSTOM_VOCABULARY.length) {
    transcription.customVocabulary = CONFIG.CUSTOM_VOCABULARY.slice();
  }
  ws.send(JSON.stringify({
    setup: {
      model: "models/" + CONFIG.MODEL,
      generationConfig: {
        responseModalities: ["TEXT"]
      },
      inputAudioTranscription: transcription
    }
  }));
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

/* Resolves connectWs once setupComplete arrives */
let onSetupComplete = null;

/*----------------------------------------------------------------------------
  connectWs
  Open Live Transcribe socket; resolves on the server's setupComplete.
----------------------------------------------------------------------------*/
function connectWs(apiKey) {
  return new Promise(function (resolve, reject) {
    const url = CONFIG.WS_URL + "?key=" + encodeURIComponent(apiKey);
    const sock = new WebSocket(url);
    ws = sock;
    sessionReady = false;
    let settled = false;
    const timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new Error("No answer from the server (setup timeout)"));
    }, CONFIG.SETUP_TIMEOUT_MS);
    onSetupComplete = function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };

    sock.onopen = function () {
      sendSetup();
    };

    sock.onmessage = function (ev) {
      if (sock !== ws) return;
      if (typeof ev.data === "string") {
        handleServerMessage(ev.data);
        return;
      }
      if (ev.data instanceof Blob) {
        ev.data.text().then(handleServerMessage).catch(function () {});
      }
    };

    sock.onerror = function () {
      if (sock !== ws) return;
      setStatus("WebSocket error", "err");
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("WebSocket error"));
      }
    };

    sock.onclose = function (ev) {
      if (sock !== ws) return;
      sessionReady = false;
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("Connection closed: " + (ev.reason || ev.code)));
        return;
      }
      if (running) {
        setStatus("Connection closed: " + (ev.reason || ev.code), "err");
        stopAll(false);
      }
    };
  });
}

/*----------------------------------------------------------------------------
  resetTranscriptState
  Forget the utterance / card bookkeeping (new session or Clear).
----------------------------------------------------------------------------*/
function resetTranscriptState() {
  cardFinals = [];
  cardFresh = "";
  interimFull = "";
  utterCarry = "";
  carryImplicit = false;
  lastFinal = "";
  lastFinalAt = 0;
  sawFinal = false;
  liveStartedAt = 0;
  lastTextAt = 0;
  interimAt = 0;
}

/*----------------------------------------------------------------------------
  startAll
  Validate key, connect, wait for setupComplete, start mic + tick.
----------------------------------------------------------------------------*/
async function startAll() {
  const key = getApiKey();
  if (!key) {
    setStatus("Paste an API key first", "err");
    return;
  }
  if (stopping) return;
  persistApiKey(key);
  document.getElementById("apiKey").value = key;
  const langKey = document.getElementById("langSelect")
    ? document.getElementById("langSelect").value
    : "auto";
  CONFIG.LANGUAGE_CODES = CONFIG.LANGUAGE_OPTIONS[langKey] || [];
  resetTranscriptState();

  document.getElementById("btnStart").disabled = true;
  setStatus("Connecting…");

  try {
    running = true;
    await connectWs(key);
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
    closeWs();
  }
}

/*----------------------------------------------------------------------------
  closeWs
  Close and forget the transcribe socket.
----------------------------------------------------------------------------*/
function closeWs() {
  const sock = ws;
  ws = null;
  sessionReady = false;
  if (sock) {
    try { sock.close(); } catch (e) {}
  }
}

/*----------------------------------------------------------------------------
  waitForLastFinal
  After audioStreamEnd: resolve when no interim is pending (the last final
  arrived) or after STOP_FINAL_WAIT_MS.
----------------------------------------------------------------------------*/
function waitForLastFinal() {
  return new Promise(function (resolve) {
    const until = now() + CONFIG.STOP_FINAL_WAIT_MS;
    (function check() {
      if (!interimFull || now() >= until) resolve();
      else setTimeout(check, 50);
    })();
  });
}

/*----------------------------------------------------------------------------
  stopAll
  Stop capture. If an utterance is still open, send audioStreamEnd and wait
  up to STOP_FINAL_WAIT_MS for its final, then close the last card and the
  socket. closeSocket=false: the socket already closed itself.
  Translations already asked for still land on their cards.
----------------------------------------------------------------------------*/
async function stopAll(closeSocket) {
  if (!running) return;
  running = false;
  stopMic();
  document.getElementById("btnStop").disabled = true;
  if (closeSocket !== false && interimFull && sendAudioStreamEnd()) {
    stopping = true;
    setStatus("Finishing…");
    await waitForLastFinal();
    stopping = false;
  }
  /* No final came: keep what the interim said */
  if (interimFull) commitFinalText(interimFull, true, false);
  commitLiveBlock();
  resetTranscriptState();
  stopSegmentTimer();
  if (closeSocket !== false) closeWs();
  else { ws = null; sessionReady = false; }
  document.getElementById("btnStart").disabled = false;
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
  Remove cards, cancel translations, reset the live card.
----------------------------------------------------------------------------*/
function clearAll() {
  clearTranslations();
  document.getElementById("blocks").innerHTML = "";
  liveBlockEl = null;
  cardFinals = [];
  cardFresh = "";
  liveStartedAt = 0;
  lastTextAt = 0;
  /* An utterance in progress continues on a fresh card without its old words */
  if (interimFull) {
    utterCarry = interimFull;
    carryImplicit = !sawFinal;
  }
  colorIndex = 0;
  if (running) ensureLiveBlock();
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
      /* Off: cancel pending requests, hide English, send nothing more */
      clearTranslations();
      document.querySelectorAll("#blocks .block .en").forEach(function (el) {
        el.textContent = "";
        el.classList.remove("pending");
      });
    }
  });
}

boot();
