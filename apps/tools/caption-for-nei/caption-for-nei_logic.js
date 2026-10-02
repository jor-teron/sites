/**
 * Caption for NEI (Caption for North East India) — caption-for-nei_logic.js
 * Version: 0.17
 * First release: 27 Sep 2026
 * Last edit: 28 Sep 2026
 * Credit: personal project (Karbi Anglong / Assam)
 *
 * Flow:
 *   caption-for-nei.html loads caption-for-nei_config.js, the romanizer
 *   (caption-for-nei_roman_deva.js, _roman_beng.js, _roman.js = CFN_ROMAN),
 *   then this file.
 *   migrateLegacyStorage() copies old lsa_* keys to cfn_* once (boot block).
 *   fillLanguageSelects() builds Input / Output dropdowns from CONFIG.
 *   startSession() opens the mic + audio graph (resumeAudioContexts: tap hint
 *   when the browser keeps audio suspended), then openSocket(): audio is sent
 *   only after setupComplete (AUDIO.SETUP_TIMEOUT_MS, else reconnect).
 *   Unexpected close / error / GoAway → scheduleReconnect() with backoff and
 *   Live session resumption; the mic, AudioContext and caption window survive.
 *   handleServerMessage() turns speech into window text (commitSpokenText →
 *   applyHypothesis → appendToWindow). A stale partial committed early is
 *   later replaced / extended by its final (no doubled words).
 *   renderBlockLines() shows one line per sentence (splitLines).
 *   windowTick() closes the window after CONFIG.WINDOW_SEC (at once on a
 *   sentence end, else after a pause or WINDOW_MAX_EXTRA_SEC, carrying an
 *   unfinished last sentence into the next window); closeWindow() skips empty
 *   windows and finishBlock() sends ONE chat request per window
 *   (translateWindow), unless Input and Output are the same language.
 *   renderAbc() fills each line's romanized sub-line (ABC Off / Local / AI).
 *
 * Does not name the cloud vendor in the UI.
 */

/* All tunables, endpoints, languages, storage keys and text: caption-for-nei_config.js */
const CONFIG = Object.assign({}, window.CFN_CONFIG || {});
if (!CONFIG.MODELS) CONFIG.MODELS = [];
const TEXT = CONFIG.TEXT || {};
const AUDIO = CONFIG.AUDIO || {};
const STORAGE = CONFIG.STORAGE || {};

/* localStorage key name for the API key */
const STORAGE_KEY_NAME = STORAGE.API_KEY;

/* Live WebSocket endpoint (transcribe + optional translate) */
const WS_BASE = CONFIG.WS_BASE;

/* Target sample rate required by live transcription */
const TARGET_SAMPLE_RATE = AUDIO.SAMPLE_RATE;

/* PCM chunk size in samples (~100 ms at 16 kHz) */
const PCM_CHUNK_SAMPLES = AUDIO.CHUNK_SAMPLES;

/**
 * Fill {name} placeholders in a CONFIG.TEXT template.
 */
function fmtText(template, values) {
  return String(template || "").replace(/\{(\w+)\}/g, function (m, k) {
    return values && values[k] !== undefined ? values[k] : m;
  });
}

/**
 * One-time copy of old "Live Subtitle for Assam" (v0.11) localStorage keys
 * to the new cfn_* keys. Map: CONFIG.LEGACY_STORAGE_KEYS (exact keys) and
 * CONFIG.LEGACY_STORAGE_PREFIXES (hour logs). Copies only when the new key is
 * empty; old keys are never deleted. Runs in the boot block before loadSavedKey().
 */
function migrateLegacyStorage() {
  try {
    const exact = CONFIG.LEGACY_STORAGE_KEYS || {};
    Object.keys(exact).forEach(function (oldKey) {
      const newKey = exact[oldKey];
      const oldVal = localStorage.getItem(oldKey);
      if (oldVal !== null && !localStorage.getItem(newKey)) localStorage.setItem(newKey, oldVal);
    });
    const prefixes = CONFIG.LEGACY_STORAGE_PREFIXES || {};
    const allKeys = [];
    for (let i = 0; i < localStorage.length; i++) allKeys.push(localStorage.key(i));
    Object.keys(prefixes).forEach(function (oldPrefix) {
      const newPrefix = prefixes[oldPrefix];
      allKeys.forEach(function (k) {
        if (!k || k.indexOf(oldPrefix) !== 0) return;
        const newKey = newPrefix + k.slice(oldPrefix.length);
        if (!localStorage.getItem(newKey)) localStorage.setItem(newKey, localStorage.getItem(k));
      });
    });
  } catch (err) {
    /* storage blocked or full: keep going with whatever is there */
  }
}

/* Rolling timestamps of chat translate calls */
let modelHits = [];

/* Spoken text waiting for word or time split */
let pendingText = "";
let pendingSince = 0;

/* Bias phrases loaded from VOCAB_FILES */
let CUSTOM_VOCAB = [];

/* Pinned chat model id or "auto" */
let pinnedModel = "auto";

const RPD_STORE = STORAGE.RPD;
/* Hour logs: cfn_hour_YYYY-MM-DD_HH (IST) */
const HOUR_PREFIX = STORAGE.HOUR_PREFIX;
let lastTeeSlot = "";

/* Input language: auto or BCP-47 (CONFIG.INPUT_LANGUAGES) */
let selectedLang = CONFIG.DEFAULT_INPUT || "auto";

/* Output target: off | en | hi | as | bn | ne (CONFIG.OUTPUT_LANGUAGES) */
let translateTarget = CONFIG.DEFAULT_OUTPUT || "off";

/* ABC (romanized sub-line): off | local | ai. Saved in STORAGE.ABC_MODE */
const ABC_MODES = ["off", "local", "ai"];
let abcMode = loadAbcMode();

/* Time windows. windowSec = CONFIG.WINDOW_SEC (config only since v0.15) */
let windowSec = Number(CONFIG.WINDOW_SEC) > 0 ? Number(CONFIG.WINDOW_SEC) : 4.25;
/* When the open window started (ms) */
let winStart = Date.now();
/* Last time any transcript text (interim or final) arrived */
let lastTextAt = 0;
/* Block of the open window; null until its first line (empty windows draw nothing) */
let currentBlock = null;
/* Blocks made so far (drives the BLOCK_COLORS cycle) */
let blockSeq = 0;
/*
 * Stale partial committed before its final (duplicate fix, v0.15):
 *   full   = the whole hypothesis committed so far (this utterance)
 *   frozen = the part of it already in closed blocks (cannot change)
 *   block / start = block holding the rest, and its text length before it
 * null when nothing is waiting for a final.
 */
let partialCommit = null;

/* Session flags */
let isRunning = false;
let socket = null;
let translateSocket = null;
let translateReady = false;
let mediaStream = null;
/* Always-on meter mic (not tied to Transcribe Start/Stop) */
let meterStream = null;
let meterCtx = null;
let meterAnalyser = null;
let meterRaf = 0;
let audioContext = null;
let processorNode = null;
let sourceNode = null;
let silentGain = null;
let pcmLeftover = new Int16Array(0);
/* true only after the server's setupComplete on the current socket (audio gate) */
let sessionReady = false;

/* Session keeper (v0.16) */
/* User wants captions on (Start / auto start); false after Stop */
let wantRunning = false;
/* Bumped for every new / dropped socket; events from old sockets are ignored */
let socketGen = 0;
let setupTimer = 0;
let reconnectTimer = 0;
/* Reconnect tries in a row (reset on setupComplete) */
let reconnectTries = 0;
/* Set while the socket was replaced after a drop (for the "Reconnected" log) */
let reconnecting = false;
/* Latest Live session resumption handle (sessionResumptionUpdate.newHandle) */
let resumeHandle = "";
let resumeEnabled = CONFIG.SESSION_RESUMPTION !== false;
/* What the last setup asked for (to fall back when it fails) */
let setupUsedHandle = false;
let setupUsedResumption = false;
let preSetupFailures = 0;
/* One-shot tap / key listener armed while audio is suspended */
let gestureArmed = false;
/* Shared getUserMedia promise (no double mic prompt) */
let meterPromise = null;
/* Top-bar session note parts: reconnect state and audio hint */
let noteReconnect = "";
let noteAudio = "";

/* DOM */
const apiKeyInput = document.getElementById("apiKey");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const clearKeyBtn = document.getElementById("clearKeyBtn");
const keyToggleBtn = document.getElementById("keyToggleBtn");
const keyPanel = document.getElementById("keyPanel");
const listenSelect = document.getElementById("listenSelect");
const abcSelect = document.getElementById("abcSelect");
const translateSelect = document.getElementById("translateSelect");
const toggleBtn = document.getElementById("toggleBtn");
const interimTextEl = document.getElementById("interimText");
const lineList = document.getElementById("lineList");
const statusEl = document.getElementById("status");
const liveNoteEl = document.getElementById("liveNote");
const sessionNoteEl = document.getElementById("sessionNote");
const ledEl = document.getElementById("led");
const copyBtn = document.getElementById("copyBtn");
const clearTextBtn = document.getElementById("clearTextBtn");
const captionBox = document.getElementById("captionBox");
const micFill = document.getElementById("micFill");
const rpdNote = document.getElementById("rpdNote");
const modelSelect = document.getElementById("modelSelect");
const logBtn = document.getElementById("logBtn");
const logPanel = document.getElementById("logPanel");
const logList = document.getElementById("logList");
const logView = document.getElementById("logView");
const logUsed = document.getElementById("logUsed");
const logDownloadAllBtn = document.getElementById("logDownloadAllBtn");
const gainSlider = document.getElementById("gainSlider");
const gainValueEl = document.getElementById("gainValue");

/* Mic gain (v0.17): GainNodes in the meter and session graphs (mic → gain → …) */
let micGain = loadMicGain();
let meterGainNode = null;
let sessionGainNode = null;

/**
 * Status + LED text.
 */
function setStatus(message, kind) {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }
  if (kind === "bad" && liveNoteEl) {
    liveNoteEl.textContent = message;
    liveNoteEl.className = "";
  }
}

/**
 * Start/Stop button and LED.
 */
function setToggleUi(running) {
  isRunning = running;
  if (toggleBtn) {
    toggleBtn.textContent = running ? TEXT.stop : TEXT.start;
    toggleBtn.className = running ? "danger" : "primary";
  }
  if (ledEl) ledEl.className = running ? "on" : "";
  /* Listening text removed — LED colour is the session flag */
}

/**
 * Newest lines stay at the top.
 */
function scrollCaptionsToTop() {
  if (captionBox) captionBox.scrollTop = 0;
}

/**
 * Grow a textarea to fit text.
 */
function fitTextarea(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

/**
 * Saved ABC mode, else CONFIG.ABC_MODE, else "local".
 */
function loadAbcMode() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE.ABC_MODE);
  } catch (err) {}
  if (ABC_MODES.indexOf(saved) !== -1) return saved;
  return ABC_MODES.indexOf(CONFIG.ABC_MODE) !== -1 ? CONFIG.ABC_MODE : "local";
}

/** Clamp a gain value to CONFIG.MIC_GAIN_MIN … MIC_GAIN_MAX. */
function clampGain(v) {
  const lo = Number(CONFIG.MIC_GAIN_MIN) || 0.5;
  const hi = Number(CONFIG.MIC_GAIN_MAX) || 4;
  const n = Number(v);
  return Math.min(hi, Math.max(lo, isFinite(n) && n > 0 ? n : 1));
}

/** Saved slider gain (Full page), else CONFIG.MIC_GAIN. */
function loadMicGain() {
  let saved = null;
  try {
    saved = STORAGE.MIC_GAIN ? localStorage.getItem(STORAGE.MIC_GAIN) : null;
  } catch (err) {}
  return clampGain(saved !== null && saved !== "" ? saved : (CONFIG.MIC_GAIN !== undefined ? CONFIG.MIC_GAIN : 1));
}

/** Set the mic gain live on both graphs (and optionally remember it). */
function setMicGain(v, save) {
  micGain = clampGain(v);
  [meterGainNode, sessionGainNode].forEach(function (g) {
    if (g) g.gain.value = micGain;
  });
  if (gainValueEl) gainValueEl.textContent = micGain.toFixed(1) + "\u00d7";
  if (save && STORAGE.MIC_GAIN) {
    try {
      localStorage.setItem(STORAGE.MIC_GAIN, String(micGain));
    } catch (err) {}
  }
}

/** getUserMedia audio constraints: AUDIO.MIC_CONSTRAINTS + the MIC_* switches. */
function micConstraints() {
  return Object.assign({}, AUDIO.MIC_CONSTRAINTS || {}, {
    echoCancellation: CONFIG.MIC_ECHO_CANCEL !== undefined ? !!CONFIG.MIC_ECHO_CANCEL : true,
    noiseSuppression: !!CONFIG.MIC_NOISE_SUPPRESSION,
    autoGainControl: CONFIG.MIC_AUTO_GAIN !== undefined ? !!CONFIG.MIC_AUTO_GAIN : true,
  });
}

/**
 * API key in use: the #apiKey field (key saved in this browser, or typed) →
 * window.SITES_KEYS.GEMINI from ../../script/api_keys.js (optional) → "".
 */
function sharedApiKey() {
  const k = window.SITES_KEYS && window.SITES_KEYS.GEMINI;
  if (typeof k !== "string") return "";
  const t = k.trim();
  return t && t !== (CONFIG.SHARED_KEY_PLACEHOLDER || "PASTE_YOUR_KEY_HERE") ? t : "";
}
function getApiKey() {
  return (apiKeyInput && apiKeyInput.value.trim()) || sharedApiKey();
}

/** #apiKey placeholder tells when the shared key is in use. */
function renderKeyPlaceholder() {
  if (!apiKeyInput) return;
  if (!apiKeyInput.dataset.placeholder) apiKeyInput.dataset.placeholder = apiKeyInput.placeholder || "";
  apiKeyInput.placeholder = sharedApiKey() && TEXT.sharedKeyPlaceholder
    ? TEXT.sharedKeyPlaceholder
    : apiKeyInput.dataset.placeholder;
}

/**
 * "#3d8bfd" + alpha → "rgba(61, 139, 253, a)" for the block tint.
 */
function hexToRgba(hex, alpha) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
  const n = parseInt(h, 16);
  if (h.length !== 6 || !isFinite(n)) return "transparent";
  return "rgba(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ", " + (alpha || 0) + ")";
}

/**
 * True if Devanagari or Bengali-script letters exist (CFN_ROMAN.hasIndic).
 * English / Latin text has no ABC line.
 */
function hasIndicScript(text) {
  if (window.CFN_ROMAN) return window.CFN_ROMAN.hasIndic(text);
  return /[\u0900-\u097F\u0980-\u09FF]/.test(text);
}

/**
 * Local romanizer (caption-for-nei_roman.js). lang = the block's Input code.
 */
function romanizeLocal(text, lang) {
  if (!window.CFN_ROMAN) return "";
  try {
    return window.CFN_ROMAN.romanize(text, lang);
  } catch (err) {
    return "";
  }
}

/* Sentence ends: HARD split anywhere, SOFT only before a space / the end */
const HARD_ENDS = "\u0964\u0965\uFF1F\uFF01\u3002"; /* । ॥ ？ ！ 。 */
const SOFT_ENDS = ".?!";
const CLOSERS = "\"')]}\u201D\u2019\u00BB";
const ABBREVIATIONS = (CONFIG.ABBREVIATIONS || []).map(function (w) {
  return String(w).toLowerCase();
});

/**
 * Line word limit (CONFIG.LINE_MAX_WORDS; WORD_SPLIT is the pre-v0.15 name).
 */
function lineMaxWords() {
  return Number(CONFIG.LINE_MAX_WORDS) || Number(CONFIG.WORD_SPLIT) || 15;
}

/**
 * True if the "." at dotIdx follows an abbreviation (Mr. Dr. e.g.) or a
 * single-letter initial (J.), so it does not end a sentence.
 */
function isAbbrevBefore(text, dotIdx) {
  const m = text.slice(0, dotIdx).match(/(\S+)$/);
  if (!m) return false;
  const w = m[1].replace(/^[("'\u201C\u2018\[]+/, "").toLowerCase();
  if (/^\p{L}$/u.test(w)) return true;
  return ABBREVIATIONS.indexOf(w) !== -1;
}

/**
 * Text → sentences [{ text, ended }]. ended = closes with . ? ! । ॥ ？ ！ 。
 * "." "?" "!" end a sentence only before whitespace or the end (so 3.5 and
 * a.b stay whole), "." not after an abbreviation. Runs like "?!" or "..."
 * and closing quotes stay with their sentence. A punctuation-only piece is
 * glued to the sentence before it.
 */
function sentenceSplit(text) {
  const s = String(text || "");
  const out = [];
  let start = 0;
  let i = 0;
  const ends = SOFT_ENDS + HARD_ENDS;
  function push(piece, ended) {
    const t = piece.trim();
    if (!t) return;
    if (!/[\p{L}\p{N}]/u.test(t) && out.length) {
      out[out.length - 1].text += t;
      if (ended) out[out.length - 1].ended = true;
      return;
    }
    out.push({ text: t, ended: ended });
  }
  while (i < s.length) {
    if (ends.indexOf(s[i]) === -1) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < s.length && ends.indexOf(s[j + 1]) !== -1) j++;
    let k = j;
    while (k + 1 < s.length && CLOSERS.indexOf(s[k + 1]) !== -1) k++;
    const run = s.slice(i, j + 1);
    const next = s[k + 1];
    let boundary = false;
    if (/[\u0964\u0965\uFF1F\uFF01\u3002]/.test(run)) boundary = true;
    else if (next === undefined || /\s/.test(next)) {
      boundary = !(run === "." && isAbbrevBefore(s, i));
    }
    if (boundary) {
      push(s.slice(start, k + 1), true);
      start = k + 1;
    }
    i = k + 1;
  }
  push(s.slice(start), false);
  return out;
}

/**
 * Display lines of a block: one per sentence, long sentences cut every
 * LINE_MAX_WORDS words.
 */
function splitLines(text) {
  const limit = lineMaxWords();
  const out = [];
  sentenceSplit(text).forEach(function (sent) {
    const words = sent.text.split(/\s+/).filter(Boolean);
    for (let w = 0; w < words.length; w += limit) out.push(words.slice(w, w + limit).join(" "));
  });
  return out;
}

/**
 * True if the text ends at a sentence end.
 */
function endsSentence(text) {
  const sents = sentenceSplit(text);
  return sents.length > 0 && sents[sents.length - 1].ended;
}

/**
 * Base language: "en-IN" → "en", "hi" → "hi", "auto" / "off" → "".
 */
function baseLang(code) {
  const c = String(code || "").toLowerCase();
  if (!c || c === "auto" || c === "off") return "";
  return c.split(/[-_]/)[0];
}

/* ---------- Duplicate fix: overlap of a committed partial and a newer hypothesis ---------- */

function wordsOf(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

/* compare words without case or punctuation (keeps Indic vowel signs) */
function normWord(w) {
  return String(w).toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, "");
}

/**
 * The part of `text` that is new compared with `prefix` (text already shown).
 *   text starts with prefix            → the words after it
 *   text is prefix with a few words revised (>= 60% same, not shorter)
 *                                      → the words after prefix's length
 *   prefix's end overlaps text's start → the words after the overlap
 *   text is covered by prefix          → ""
 *   no relation                        → all of text
 */
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

/* join two text pieces with one space */
function joinText(a, b) {
  a = String(a || "").trim();
  b = String(b || "").trim();
  return a && b ? a + " " + b : a || b;
}

/**
 * First On model still under RPM this minute.
 */
function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Load RPD counts from localStorage. Resets if the UTC day changed.
 * Store shape: { day, counts: { modelId: number } }
 * Connects to: rpdCount, bumpRpd, writeRpd
 */
function readRpd() {
  let data = { day: utcDay(), counts: {} };
  try {
    const raw = localStorage.getItem(RPD_STORE);
    if (raw) data = JSON.parse(raw);
  } catch (err) {}
  if (data.day !== utcDay()) data = { day: utcDay(), counts: {} };
  return data;
}

/**
 * Persist RPD object to localStorage key RPD_STORE.
 * Connects to: bumpRpd
 */
function writeRpd(data) {
  localStorage.setItem(RPD_STORE, JSON.stringify(data));
}

/**
 * Today's call count for one model id.
 * Connects to: pickChatModel, renderRpd
 */
function rpdCount(id) {
  const data = readRpd();
  return data.counts[id] || 0;
}

/**
 * Add one to today's count for a model, then refresh the bar.
 * Called from translateWindow() before each chat request.
 */
function bumpRpd(id) {
  const data = readRpd();
  data.counts[id] = (data.counts[id] || 0) + 1;
  writeRpd(data);
  renderRpd();
}

/**
 * Draw "3.5 Lite 12/500 · 3.1 Lite 3/500" into #rpdNote.
 */
function renderRpd() {
  if (!rpdNote) return;
  const bits = CONFIG.MODELS.filter(function (m) {
    return m.on;
  }).map(function (m) {
    return (m.label || m.id) + " " + rpdCount(m.id) + "/" + (m.rpd || CONFIG.DEFAULT_RPD);
  });
  rpdNote.textContent = bits.join(" · ");
}

/**
 * Fill #modelSelect from CONFIG.MODELS that are On, plus Auto.
 * Connects to: onModelChange, boot block at bottom
 */
function fillModelSelect() {
  if (!modelSelect) return;
  modelSelect.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = "auto";
  auto.textContent = TEXT.auto;
  modelSelect.appendChild(auto);
  CONFIG.MODELS.forEach(function (m) {
    if (!m.on) return;
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label || m.id;
    modelSelect.appendChild(opt);
  });
  pinnedModel = CONFIG.PINNED_MODEL || "auto";
  modelSelect.value = pinnedModel;
}

/**
 * Fill #listenSelect from CONFIG.INPUT_LANGUAGES and #translateSelect from
 * CONFIG.OUTPUT_LANGUAGES, then select DEFAULT_INPUT / DEFAULT_OUTPUT.
 * Connects to: onListenChange, onTranslateChange, boot block at bottom
 */
function fillLanguageSelects() {
  function fill(select, list, value) {
    if (!select) return;
    select.innerHTML = "";
    (list || []).forEach(function (lang) {
      const opt = document.createElement("option");
      opt.value = lang.code;
      opt.textContent = lang.label || lang.code;
      select.appendChild(opt);
    });
    select.value = value;
  }
  fill(listenSelect, CONFIG.INPUT_LANGUAGES, selectedLang);
  fill(translateSelect, CONFIG.OUTPUT_LANGUAGES, translateTarget);
}

/**
 * Output code → language name for the translate prompt.
 */
function outputLangName(code) {
  const hit = (CONFIG.OUTPUT_LANGUAGES || []).filter(function (l) {
    return l.code === code;
  })[0];
  return (hit && hit.name) || CONFIG.FALLBACK_OUTPUT_NAME;
}

/**
 * Model dropdown changed. Sets pinnedModel for pickChatModel().
 */
function onModelChange() {
  pinnedModel = modelSelect.value;
}

/**
 * RMS of a float PCM frame → #micFill width 0–100%.
 * Called from startSession() onaudioprocess.
 */
function setMicLevel(samples) {
  if (!micFill || !samples || !samples.length) return;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  let pct = Math.min(100, Math.round(rms * AUDIO.METER_GAIN));
  micFill.style.width = pct + "%";
}

/**
 * Mic loudness loop that stays on after Stop.
 * Does not open Transcribe Live. Connects to setMicLevel. One shared
 * promise, so the boot call and startSession() never prompt for the mic twice.
 */
function startMeter() {
  if (meterPromise) return meterPromise;
  meterPromise = (async function () {
    if (meterAnalyser) return;
    try {
      if (!meterStream) {
        meterStream = await navigator.mediaDevices.getUserMedia({
          audio: micConstraints(),
        });
      }
      meterCtx = new AudioContext();
      const src = meterCtx.createMediaStreamSource(meterStream);
      /* mic → gain (MIC_GAIN) → analyser: the bar shows the boosted level */
      meterGainNode = meterCtx.createGain();
      meterGainNode.gain.value = micGain;
      meterAnalyser = meterCtx.createAnalyser();
      meterAnalyser.fftSize = AUDIO.METER_FFT_SIZE;
      src.connect(meterGainNode);
      meterGainNode.connect(meterAnalyser);
      const buf = new Uint8Array(meterAnalyser.fftSize);
      function tick() {
        if (!meterAnalyser) return;
        meterAnalyser.getByteTimeDomainData(buf);
        const floats = new Float32Array(buf.length);
        for (let i = 0; i < buf.length; i++) floats[i] = (buf[i] - 128) / 128;
        setMicLevel(floats);
        meterRaf = requestAnimationFrame(tick);
      }
      tick();
      resumeAudioContexts();
    } catch (err) {
      meterPromise = null;
      setStatus(TEXT.micDenied, "bad");
    }
  })();
  return meterPromise;
}

/**
 * Top-bar session note (#sessionNote): reconnect state and / or the
 * "Tap anywhere to start audio" hint. (#status and #liveNote are hidden.)
 */
function renderSessionNote() {
  if (!sessionNoteEl) return;
  const text = [noteReconnect, noteAudio].filter(Boolean).join(" · ");
  sessionNoteEl.textContent = text;
  sessionNoteEl.hidden = !text;
}

/**
 * Browsers keep an AudioContext "suspended" until a user gesture (auto start
 * on page load). Try resume(); if still suspended after AUDIO.RESUME_CHECK_MS,
 * show TEXT.tapToStartAudio and resume on the first tap / key press.
 */
function resumeAudioContexts() {
  const ctxs = [audioContext, meterCtx].filter(function (c) {
    return c && c.state === "suspended";
  });
  if (!ctxs.length) {
    if (noteAudio) {
      noteAudio = "";
      renderSessionNote();
    }
    return;
  }
  ctxs.forEach(function (c) {
    try {
      const p = c.resume();
      if (p && p.catch) p.catch(function () {});
    } catch (err) {}
  });
  setTimeout(function () {
    const still = [audioContext, meterCtx].some(function (c) {
      return c && c.state === "suspended";
    });
    noteAudio = still ? TEXT.tapToStartAudio || "" : "";
    renderSessionNote();
    if (still) {
      setStatus(TEXT.tapToStartAudio, "bad");
      armGestureResume();
    }
  }, AUDIO.RESUME_CHECK_MS || 400);
}

/**
 * One-shot pointerdown / keydown / touchstart listener that resumes audio
 * (resume() must run inside the gesture).
 */
function armGestureResume() {
  if (gestureArmed) return;
  gestureArmed = true;
  const events = ["pointerdown", "keydown", "touchstart"];
  function onGesture() {
    events.forEach(function (e) {
      window.removeEventListener(e, onGesture, true);
    });
    gestureArmed = false;
    resumeAudioContexts();
  }
  events.forEach(function (e) {
    window.addEventListener(e, onGesture, true);
  });
}

/**
 * Next On model under RPM (60s window in modelHits) and RPD (UTC day).
 * Honours pinnedModel when not "auto". skipIds = models already tried for
 * this window (translateWindow fallback).
 * Connects to: translateWindow
 */
function pickChatModel(skipIds) {
  const now = Date.now();
  let list = CONFIG.MODELS.filter(function (m) {
    return m.on && !(skipIds && skipIds.indexOf(m.id) !== -1);
  });
  if (pinnedModel && pinnedModel !== "auto") {
    list = list.filter(function (m) {
      return m.id === pinnedModel;
    });
  }
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (rpdCount(m.id) >= (m.rpd || CONFIG.DEFAULT_RPD)) continue;
    let n = 0;
    for (let h = 0; h < modelHits.length; h++) {
      if (modelHits[h].id === m.id && now - modelHits[h].t < 60000) n++;
    }
    if (n < (m.rpm || CONFIG.DEFAULT_RPM)) return m;
  }
  return null;
}

/**
 * Romanized sub-line (ABC) of one transcript line, from its stored state:
 *   off → hidden; no Indic script → hidden;
 *   local → CFN_ROMAN; ai → AI roman when one arrived, else local.
 * Input English → hidden in every mode.
 * Called on create, on ABC mode change (all lines) and when word lists load.
 */
function renderAbc(line) {
  if (!line || !line.abcBox) return;
  /* Input English: never a romanized line, whatever the ABC mode */
  const show = abcMode !== "off" && line.indic && baseLang(line.lang) !== "en";
  line.abcRow.hidden = !show;
  if (!show) return;
  if (!line.localRoman || line.localStale) {
    line.localRoman = romanizeLocal(line.source, line.lang) || line.source;
    line.localStale = false;
  }
  line.abcBox.value = abcMode === "ai" && line.aiRoman ? line.aiRoman : line.localRoman;
  fitTextarea(line.abcBox);
}

/**
 * Re-render the ABC sub-line on every line of every block (after ABC mode
 * change or word-list load).
 */
function renderAllAbc(recomputeLocal) {
  const blocks = lineList.querySelectorAll(".block");
  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i].cfn;
    if (!blk) continue;
    blk.lines.forEach(function (line) {
      if (recomputeLocal) line.localStale = true;
      renderAbc(line);
    });
  }
}

/**
 * Editable, auto-growing textarea for a block.
 */
function makeArea(className, value) {
  const area = document.createElement("textarea");
  area.className = className;
  area.rows = 1;
  area.value = value || "";
  area.addEventListener("input", function () {
    fitTextarea(area);
  });
  return area;
}

/**
 * One bulleted row: lvl0 = translation, lvl1 = original, lvl2 = romanized.
 */
function makeRow(className, area) {
  const row = document.createElement("div");
  row.className = "blk-row " + className;
  row.appendChild(area);
  return row;
}

/**
 * New block (one time window) at the top of the list. Layout:
 *   • translation of the whole window (hidden until the window closes)
 *     ◦ original line          ┐ one .blk-line per transcript line,
 *        – romanized line      ┘ thin divider between lines
 * Accent colour cycles through CONFIG.BLOCK_COLORS.
 */
function createBlock(lang) {
  const colors = CONFIG.BLOCK_COLORS && CONFIG.BLOCK_COLORS.length ? CONFIG.BLOCK_COLORS : ["#3d8bfd"];
  const colorIndex = blockSeq % colors.length;
  const color = colors[colorIndex];
  blockSeq++;
  const el = document.createElement("div");
  el.className = "block";
  el.dataset.color = String(colorIndex);
  el.style.setProperty("--blk", color);
  el.style.setProperty("--blk-tint", hexToRgba(color, CONFIG.BLOCK_TINT_ALPHA));
  const outBox = makeArea("out-line");
  const transRow = makeRow("lvl0 trans-row", outBox);
  transRow.hidden = true;
  const linesEl = document.createElement("div");
  linesEl.className = "blk-lines";
  el.appendChild(transRow);
  el.appendChild(linesEl);
  const blk = {
    el: el,
    color: color,
    transRow: transRow,
    outBox: outBox,
    linesEl: linesEl,
    lines: [],
    text: "",
    lang: lang || selectedLang,
    stamp: istNow(),
    closed: false,
    wantTrans: false,
    sameLang: false,
    pending: false,
    noted: false,
    logged: false,
  };
  el.cfn = blk;
  lineList.insertBefore(el, lineList.firstChild);
  return blk;
}

/**
 * Rebuild the line rows of a block from blk.text: one row per sentence
 * (splitLines), each with its ABC sub-row. Lines stay in spoken order inside
 * the block; newest block is on top.
 */
function renderBlockLines(blk) {
  blk.linesEl.innerHTML = "";
  blk.lines = [];
  splitLines(blk.text).forEach(function (text) {
    const lineEl = document.createElement("div");
    lineEl.className = "blk-line";
    const orig = makeArea("orig-line", text);
    lineEl.appendChild(makeRow("lvl1", orig));
    const line = {
      source: text,
      lang: blk.lang,
      indic: hasIndicScript(text),
      origBox: orig,
      abcRow: null,
      abcBox: null,
      localRoman: "",
      aiRoman: "",
      localStale: false,
    };
    if (line.indic) {
      line.abcBox = makeArea("abc-line");
      line.abcRow = makeRow("lvl2", line.abcBox);
      lineEl.appendChild(line.abcRow);
    }
    lineEl.cfn = line;
    blk.lines.push(line);
    blk.linesEl.appendChild(lineEl);
    fitTextarea(orig);
    renderAbc(line);
  });
}

/**
 * Set a block's text and redraw its lines.
 */
function setBlockText(blk, text) {
  blk.text = String(text || "").trim();
  renderBlockLines(blk);
  scrollCaptionsToTop();
}

/**
 * Append text to the open window's block (made on the first text, so empty
 * windows never draw a block). Returns { blk, start } where start = block
 * text length before the append, or null when text is empty.
 */
function appendToWindow(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  if (!currentBlock || !currentBlock.el.isConnected) currentBlock = createBlock();
  const blk = currentBlock;
  const start = blk.text.length;
  setBlockText(blk, joinText(blk.text, t));
  return { blk: blk, start: start };
}

/**
 * Put one transcript hypothesis H into the window, without doubling words
 * that a stale partial already committed (partialCommit):
 *   partial still in the open block → replace it there with H (fixes and extends it);
 *   partial in a closed block      → append only the words of H not in it.
 * isFinal = H is the real final: the partial is settled afterwards.
 */
function applyHypothesis(H, isFinal) {
  const pc = partialCommit;
  if (pc && pc.block && pc.block === currentBlock && pc.block.el.isConnected && !pc.block.closed) {
    const tail = removeOverlap(pc.frozen, H);
    setBlockText(pc.block, joinText(pc.block.text.slice(0, pc.start), tail));
    pc.full = H;
  } else {
    const tail = pc ? removeOverlap(pc.full, H) : H;
    const at = appendToWindow(tail);
    if (!isFinal && at) {
      partialCommit = { full: H, frozen: pc ? pc.full : "", block: at.blk, start: at.start };
    }
  }
  if (isFinal) partialCommit = null;
}

/**
 * Window clock (setInterval CONFIG.WINDOW_TICK_MS). When WINDOW_SEC is up:
 *   no text          → close (skip) unless an interim is pending (wait, capped);
 *   ends a sentence  → close now;
 *   pause            → close (no interim pending, no text for WINDOW_PAUSE_GAP_MS);
 *   WINDOW_MAX_EXTRA_SEC used up → close and carry the unfinished last sentence.
 */
function windowTick() {
  const now = Date.now();
  const len = windowSec * 1000;
  if (now - winStart < len) return;
  const capped = now - winStart >= len + (Number(CONFIG.WINDOW_MAX_EXTRA_SEC) || 0) * 1000;
  const text = currentBlock && currentBlock.el.isConnected ? currentBlock.text : "";
  if (!text) {
    if (pendingText && !capped) return;
    closeWindow(now, false);
    return;
  }
  if (endsSentence(text)) {
    closeWindow(now, false);
    return;
  }
  const paused = !pendingText && now - lastTextAt >= (CONFIG.WINDOW_PAUSE_GAP_MS || 0);
  if (paused) {
    closeWindow(now, false);
    return;
  }
  if (capped) closeWindow(now, true);
}

/**
 * End the open window and start the next one. A window with no text sends
 * nothing and draws nothing; otherwise its block is finished (one request).
 * carry = hard close mid-sentence: the text after the last sentence end moves
 * into the next window's block (only when a full sentence comes before it,
 * so a window that is one long unfinished sentence is still translated).
 */
function closeWindow(now, carry) {
  const blk = currentBlock;
  currentBlock = null;
  winStart = now || Date.now();
  if (!blk || !blk.text || !blk.el.isConnected) return;
  if (carry) carryUnfinished(blk);
  blk.closed = true;
  finishBlock(blk);
}

/**
 * Move blk's unfinished last sentence into a new open block (currentBlock),
 * keeping partialCommit pointing at the right place.
 */
function carryUnfinished(blk) {
  const sents = sentenceSplit(blk.text);
  const last = sents[sents.length - 1];
  if (sents.length < 2 || !last || last.ended) return;
  const orig = blk.text;
  const carryStart = orig.lastIndexOf(last.text);
  if (carryStart <= 0) return;
  setBlockText(blk, orig.slice(0, carryStart));
  const next = createBlock(blk.lang);
  setBlockText(next, last.text);
  currentBlock = next;
  const pc = partialCommit;
  if (pc && pc.block === blk) {
    if (pc.start >= carryStart) {
      pc.block = next;
      pc.start = Math.max(0, pc.start - carryStart);
    } else {
      /* partial began before the carried sentence: that part is now frozen */
      pc.frozen = joinText(pc.frozen, orig.slice(pc.start, carryStart));
      pc.block = next;
      pc.start = 0;
    }
  }
}

/**
 * Closed block: show the faint "translating…" line and send the window's one
 * request (translation and/or AI ABC), then write the hour log.
 */
function finishBlock(blk) {
  const chatOk = CONFIG.OUTPUT_ENGINE !== "live";
  const inBase = baseLang(blk.lang);
  /* Input and Output the same base language (en-IN → en): no translation */
  const sameLang = translateTarget !== "off" && !!inBase && inBase === baseLang(translateTarget);
  const wantTrans = chatOk && translateTarget !== "off" && !sameLang;
  /* AI romanization (never for English Input); rides in the same request */
  const wantAi =
    chatOk &&
    abcMode === "ai" &&
    inBase !== "en" &&
    blk.lines.some(function (l) {
      return l.indic;
    });
  blk.wantTrans = wantTrans;
  blk.sameLang = sameLang;
  if (sameLang) {
    blk.transRow.hidden = false;
    setBlockTranslation(blk, TEXT.sameLangNote || "", true);
    blk.outBox.classList.add("same-lang");
  } else if (wantTrans) {
    blk.transRow.hidden = false;
    blk.pending = true;
    blk.outBox.classList.add("pending");
    blk.outBox.value = TEXT.translating || "…";
    fitTextarea(blk.outBox);
  }
  const job = wantTrans || wantAi ? translateWindow(blk, wantTrans, wantAi) : Promise.resolve();
  job
    .catch(function () {})
    .then(function () {
      if (blk.pending) setBlockTranslation(blk, TEXT.translateNoModel, true);
      logBlock(blk);
    });
}

/**
 * Fill a block's translation line (note = a short "(no model free)" style note).
 */
function setBlockTranslation(blk, text, note) {
  blk.pending = false;
  blk.noted = !!note;
  blk.outBox.classList.remove("pending");
  blk.outBox.classList.toggle("noted", !!note);
  blk.outBox.value = text || "";
  fitTextarea(blk.outBox);
}

/**
 * Push spoken text into blocks.
 */

/**
 * Current instant in Asia/Kolkata for stamps and hour keys.
 */
function istNow() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: CONFIG.TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = {};
  fmt.formatToParts(new Date()).forEach(function (x) {
    parts[x.type] = x.value;
  });
  return parts;
}

function hourKeyFromParts(p) {
  return HOUR_PREFIX + p.year + "-" + p.month + "-" + p.day + "_" + p.hour;
}

function stampFromParts(p) {
  return p.year + "-" + p.month + "-" + p.day + " " + p.hour + ":" + p.minute + ":" + p.second + " " + CONFIG.TIME_ZONE_LABEL;
}

function listHourKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.indexOf(HOUR_PREFIX) === 0) keys.push(k);
  }
  keys.sort();
  keys.reverse();
  return keys;
}

function storageUsedBytes() {
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    n += k.length + (localStorage.getItem(k) || "").length;
  }
  return n;
}

/**
 * Append one window block to its IST hour bucket. Entry format (v0.14):
 *   stamp
 *   original line 1
 *   ABC: romanized 1      (only when shown; CONFIG.LOG_ABC_PREFIX)
 *   original line 2 ...
 *   TR: translation       (whole window, only when there is one; CONFIG.LOG_TRANS_PREFIX)
 *   (blank line)
 * Older entries (v0.13: stamp, original, ABC, unprefixed translation) stay as they are.
 * lines = [{ source, roman }]. p = istNow() parts from when the block was made.
 */
function appendHourLog(lines, transText, p) {
  p = p || istNow();
  const key = hourKeyFromParts(p);
  let body = localStorage.getItem(key) || "";
  body += stampFromParts(p);
  (lines || []).forEach(function (l) {
    body += "\n" + l.source;
    if (l.roman) body += "\n" + (CONFIG.LOG_ABC_PREFIX || "") + l.roman;
  });
  if (transText) body += "\n" + (CONFIG.LOG_TRANS_PREFIX || "") + transText;
  body += "\n\n";
  try {
    localStorage.setItem(key, body);
  } catch (err) {
    setStatus(TEXT.logFull, "bad");
  }
  renderLogList();
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
  }, 500);
}

function renderLogList() {
  if (!logList) return;
  logList.innerHTML = "";
  if (logUsed) {
    const kb = Math.round(storageUsedBytes() / 1024);
    logUsed.textContent = fmtText(TEXT.storageUsed, { used: kb, quota: CONFIG.STORAGE_QUOTA_KB });
  }
  listHourKeys().forEach(function (key) {
    const label = key.replace(HOUR_PREFIX, "").replace("_", " ") + ":00";
    const row = document.createElement("div");
    row.className = "log-row";
    const name = document.createElement("span");
    name.textContent = label;
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.textContent = TEXT.view;
    viewBtn.onclick = function () {
      if (logView) logView.value = localStorage.getItem(key) || "";
    };
    const dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.textContent = TEXT.download;
    dlBtn.onclick = function () {
      downloadText(key.replace(HOUR_PREFIX, CONFIG.LOG_FILE_PREFIX) + ".txt", localStorage.getItem(key) || "");
    };
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = TEXT.delete;
    delBtn.onclick = function () {
      localStorage.removeItem(key);
      renderLogList();
      if (logView) logView.value = "";
    };
    row.appendChild(name);
    row.appendChild(viewBtn);
    row.appendChild(dlBtn);
    row.appendChild(delBtn);
    logList.appendChild(row);
  });
}

function toggleLogPanel() {
  if (!logPanel) return;
  logPanel.classList.toggle("open");
  if (logPanel.classList.contains("open")) renderLogList();
}

function downloadAllAndClear() {
  const keys = listHourKeys();
  if (!keys.length) {
    setStatus(TEXT.noLogs, "bad");
    return;
  }
  if (!confirm(TEXT.confirmDownloadAll)) return;
  let all = "";
  keys.slice().reverse().forEach(function (key) {
    all += "===== " + key.replace(HOUR_PREFIX, "") + " =====\n";
    all += localStorage.getItem(key) || "";
    all += "\n";
  });
  const p = istNow();
  downloadText(CONFIG.LOG_FILE_PREFIX + "all-" + p.year + "-" + p.month + "-" + p.day + ".txt", all);
  keys.forEach(function (key) {
    localStorage.removeItem(key);
  });
  renderLogList();
  if (logView) logView.value = "";
}

/**
 * Clock slot id for SAVE_MINUTES tee (HH:00 HH:05 ... when 5).
 */
function teeSlotId() {
  const p = istNow();
  const step = CONFIG.SAVE_MINUTES;
  const m = String(Math.floor(Number(p.minute) / step) * step).padStart(2, "0");
  return p.year + "-" + p.month + "-" + p.day + "_" + p.hour + ":" + m;
}

function tickTee() {
  const slot = teeSlotId();
  if (slot === lastTeeSlot) return;
  lastTeeSlot = slot;
  renderLogList();
}

/**
 * Write one window block to the hour log: each original line with its ABC
 * line (if shown), then the window's translation.
 */
function logBlock(blk) {
  if (!blk || blk.logged) return;
  blk.logged = true;
  const lines = blk.lines.map(function (l) {
    return {
      source: l.source,
      roman: l.abcRow && !l.abcRow.hidden ? l.abcBox.value.trim() : "",
    };
  });
  /* skip the "(no model free)" / "(add an API key)" notes and the placeholder */
  const trans = blk.wantTrans && !blk.noted && !blk.pending ? blk.outBox.value.trim() : "";
  appendHourLog(lines, trans, blk.stamp);
}

/**
 * Speech text → the open window. isFinal = a real final transcript; else a
 * stale partial committed early (replaced / extended later, no duplicates).
 */
function commitSpokenText(text, isFinal) {
  const piece = (text || "").trim();
  if (!piece) return;
  applyHypothesis(piece, !!isFinal);
  pendingText = "";
  pendingSince = 0;
}

/**
 * Copy visible text.
 */
async function copyCaptions() {
  const blocks = lineList.querySelectorAll(".block");
  const chunks = [];
  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i].cfn;
    if (!blk) continue;
    const bits = [];
    if (!blk.transRow.hidden && !blk.pending) {
      const t = blk.outBox.value.trim();
      if (t) bits.push(t);
    }
    blk.lines.forEach(function (l) {
      const o = l.origBox.value.trim();
      if (o) bits.push(o);
      if (l.abcRow && !l.abcRow.hidden) {
        const r = l.abcBox.value.trim();
        if (r) bits.push(r);
      }
    });
    if (bits.length) chunks.push(bits.join("\n"));
  }
  const blob = chunks.join("\n\n");
  if (!blob) {
    setStatus(TEXT.nothingToCopy, "bad");
    return;
  }
  try {
    await navigator.clipboard.writeText(blob);
    if (liveNoteEl) liveNoteEl.textContent = TEXT.copied;
  } catch (err) {
    setStatus(TEXT.copyFailed, "bad");
  }
}

/**
 * Clear lines only.
 */
function clearCaptionText() {
  lineList.innerHTML = "";
  /* the open window starts a fresh block for its next line */
  currentBlock = null;
  if (partialCommit) {
    partialCommit.frozen = partialCommit.full;
    partialCommit.block = null;
  }
  interimTextEl.textContent = "";
  if (liveNoteEl && isRunning) {
    liveNoteEl.textContent = TEXT.listeningDots;
    liveNoteEl.className = "on";
  }
}

/**
 * Put the saved API key into #apiKey. Uses STORAGE_KEY_NAME.
 */
function loadSavedKey() {
  const saved = localStorage.getItem(STORAGE_KEY_NAME);
  if (saved) apiKeyInput.value = saved;
}

/**
 * Save #apiKey to localStorage. Used by the Key panel Save button.
 */
function saveKey() {
  const value = apiKeyInput.value.trim();
  if (!value) {
    setStatus(TEXT.pasteKeyFirst, "bad");
    return;
  }
  localStorage.setItem(STORAGE_KEY_NAME, value);
  setStatus(TEXT.keySaved, "ok");
  keyPanel.classList.remove("open");
}

/**
 * Remove the saved API key from this browser.
 */
function clearKey() {
  localStorage.removeItem(STORAGE_KEY_NAME);
  apiKeyInput.value = "";
  setStatus(TEXT.keyCleared);
}

/**
 * Show or hide the Key row under the top bar.
 */
function toggleKeyPanel() {
  keyPanel.classList.toggle("open");
}

/**
 * Input language changed. Restarts the live session if one is running.
 */
function onListenChange() {
  selectedLang = listenSelect.value;
  if (isRunning) {
    stopSession().then(function () {
      startSession();
    });
  }
}

/**
 * ABC dropdown (Off / Local / AI). Saves the choice and re-renders the ABC
 * sub-line on every existing block. AI does not re-ask old blocks (quota); they show
 * an AI result only if one arrived earlier, else the local one.
 */
function onAbcChange() {
  abcMode = ABC_MODES.indexOf(abcSelect.value) !== -1 ? abcSelect.value : "local";
  try {
    localStorage.setItem(STORAGE.ABC_MODE, abcMode);
  } catch (err) {}
  renderAllAbc(false);
}

/**
 * Output language changed. Windows that close from now on use this; old blocks stay.
 */
function onTranslateChange() {
  translateTarget = translateSelect.value;
}

/**
 * ArrayBuffer → base64 string for Live JSON audio frames.
 * Connects to: sendPcmChunk
 */
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Float32 -1..1 samples → Int16 PCM.
 * Connects to: startSession onaudioprocess → enqueuePcm
 */
function floatToPcm16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let s = float32[i];
    if (s > 1) s = 1;
    if (s < -1) s = -1;
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Linear resample to 16 kHz for Transcribe Live.
 * Connects to: startSession onaudioprocess
 */
function resampleTo16k(input, fromRate) {
  if (fromRate === TARGET_SAMPLE_RATE) return input;
  const ratio = fromRate / TARGET_SAMPLE_RATE;
  const newLen = Math.floor(input.length / ratio);
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = src - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/**
 * Buffer PCM until PCM_CHUNK_SAMPLES, then sendPcmChunk.
 * Uses pcmLeftover for the remainder.
 */
function enqueuePcm(samples) {
  const merged = new Int16Array(pcmLeftover.length + samples.length);
  merged.set(pcmLeftover, 0);
  merged.set(samples, pcmLeftover.length);
  let offset = 0;
  while (offset + PCM_CHUNK_SAMPLES <= merged.length) {
    sendPcmChunk(merged.subarray(offset, offset + PCM_CHUNK_SAMPLES));
    offset += PCM_CHUNK_SAMPLES;
  }
  pcmLeftover = merged.slice(offset);
}

/**
 * One ~100 ms PCM frame on the Transcribe WebSocket.
 * Requires sessionReady (set only by the server's setupComplete); frames
 * before that are dropped, never sent into an unready session.
 */
function sendPcmChunk(pcmChunk) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !sessionReady) return;
  const b64 = bufferToBase64(pcmChunk.buffer);
  socket.send(
    JSON.stringify({
      realtimeInput: {
        audio: { data: b64, mimeType: AUDIO.MIME_TYPE },
      },
    })
  );
}

/**
 * Tell the server the mic stream ended. Called from stopSession().
 */
function sendAudioStreamEnd() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
}

/**
 * Input language name for the AI ABC prompt.
 */
function inputLangName(code) {
  const hit = (CONFIG.INPUT_LANGUAGES || []).filter(function (l) {
    return l.code === code;
  })[0];
  return code && code !== "auto" && hit ? hit.label : TEXT.autoSourceName;
}

/* ---------- ABC = AI (kept separate so AI mode can be removed later) ----------
 * The AI romanization rides in the window's single request (no extra call).
 * To drop AI mode: remove this section, the wantAi branches in finishBlock()
 * and translateWindow(), and the "ai" option in the HTML / ABC_MODES.
 */

/**
 * Pull a JSON object out of a model reply (maybe in ``` fences).
 */
function parseAiJson(textOut) {
  const raw = String(textOut || "").trim();
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a === -1 || b <= a) return null;
  try {
    return JSON.parse(raw.slice(a, b + 1));
  } catch (err) {
    return null;
  }
}

/**
 * Prompt for one window in AI mode: the window's lines as a JSON array;
 * the reply carries one romanized string per line (+ the translation).
 */
function aiWindowPrompt(blk, wantTrans, langName) {
  return fmtText(wantTrans ? TEXT.aiRomanBothPrompt : TEXT.aiRomanOnlyPrompt, {
    src: inputLangName(blk.lines[0] && blk.lines[0].lang),
    lang: langName,
    lines: JSON.stringify(
      blk.lines.map(function (l) {
        return l.source;
      })
    ),
  });
}

/**
 * Apply an AI reply {roman: [..per line..], translation} to a block.
 * Lines without a usable AI roman keep the local one.
 * Returns { roman: true if any line got one, trans: translation or "" }.
 */
function applyAiWindowReply(blk, textOut) {
  const parsed = parseAiJson(textOut);
  if (!parsed) return { roman: false, trans: "" };
  let romans = parsed.roman;
  if (typeof romans === "string") romans = blk.lines.length === 1 ? [romans] : romans.split(/\n/);
  let any = false;
  if (Array.isArray(romans)) {
    blk.lines.forEach(function (line, i) {
      const r = typeof romans[i] === "string" ? romans[i].trim() : "";
      if (!r || !line.indic) return;
      line.aiRoman = r;
      any = true;
      renderAbc(line);
    });
  }
  const trans = typeof parsed.translation === "string" ? parsed.translation.trim() : "";
  return { roman: any, trans: trans };
}

/* ---------- end ABC = AI ---------- */

/**
 * ONE chat request for one closed window, holding only that window's lines
 * (no earlier blocks as context). wantTrans = Output is on (fills the block's
 * translation line); wantAi = ABC is AI and a line has Indic script (the same
 * request returns JSON with the romanized lines).
 * Model fallback: if a model errors, returns nothing, or is at its RPM/RPD
 * cap, the next On model (pickChatModel skipIds) is tried. If none work, the
 * translation line shows a short note and ABC keeps the local romanization.
 */
async function translateWindow(blk, wantTrans, wantAi) {
  if (!blk || !blk.lines.length) return;
  if (!wantTrans && !wantAi) return;
  const text = blk.lines
    .map(function (l) {
      return l.source;
    })
    .join("\n");
  const googleKey = getApiKey() || (CONFIG.KEYS && CONFIG.KEYS.google) || "";
  function note(msg) {
    if (wantTrans && blk.pending) setBlockTranslation(blk, msg, true);
  }
  if (!googleKey) {
    note(TEXT.translateNoKey);
    return;
  }
  const langName = outputLangName(translateTarget);
  const plainPrompt = fmtText(TEXT.translatePrompt, { lang: langName, text: text });
  let prompt = wantAi ? aiWindowPrompt(blk, wantTrans, langName) : plainPrompt;
  const tried = [];
  let lastError = "";
  for (;;) {
    let model = pickChatModel(tried);
    while (model && model.provider !== "google") {
      tried.push(model.id);
      model = pickChatModel(tried);
    }
    if (!model) break;
    tried.push(model.id);
    modelHits.push({ id: model.id, t: Date.now() });
    bumpRpd(model.id);
    try {
      const body = { contents: [{ parts: [{ text: prompt }] }] };
      if (wantAi) body.generationConfig = { responseMimeType: "application/json" };
      const res = await fetch(
        CONFIG.CHAT_API_BASE + model.id + ":generateContent?key=" + encodeURIComponent(googleKey),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      const textOut =
        data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text;
      if (!textOut) {
        lastError = (data && data.error && data.error.message) || TEXT.translateFailedShort;
        continue;
      }
      if (!wantAi) {
        setBlockTranslation(blk, textOut.trim(), false);
        return;
      }
      const got = applyAiWindowReply(blk, textOut);
      if (!got.roman && !(wantTrans && got.trans)) {
        lastError = TEXT.translateFailedShort;
        continue;
      }
      if (wantTrans) {
        if (got.trans) {
          setBlockTranslation(blk, got.trans, false);
        } else {
          /* AI gave roman only: translate with the plain prompt next round */
          wantAi = false;
          prompt = plainPrompt;
          continue;
        }
      }
      return;
    } catch (err) {
      lastError = TEXT.translateFailed;
    }
  }
  if (lastError) setStatus(lastError, "bad");
  else setStatus(TEXT.rpmCap, "bad");
  note(TEXT.translateNoModel);
}

/**
 * Parse one Transcribe Live JSON object.
 * setupComplete → onSetupComplete (audio may flow)
 * sessionResumptionUpdate → keep the handle; goAway → renew the session
 * interim / final text → commitSpokenText (text of the open window; a stale
 * interim is committed after SPLIT_SECONDS or LINE_MAX_WORDS new words);
 * lastTextAt feeds the window's pause check (windowTick)
 * Connects to: onSocketMessage
 */
function handleServerMessage(msg) {
  if (msg.sessionResumptionUpdate) onResumptionUpdate(msg.sessionResumptionUpdate);
  if (msg.goAway) {
    onGoAway(msg.goAway);
    return;
  }
  if (msg.setupComplete) {
    onSetupComplete();
    return;
  }
  if (msg.error) {
    setStatus(msg.error.message || JSON.stringify(msg.error), "bad");
    return;
  }
  const content = msg.serverContent;
  if (!content) return;
  if (content.interimInputTranscription && content.interimInputTranscription.text) {
    const live = content.interimInputTranscription.text.trim();
    lastTextAt = Date.now();
    /* only the words not committed yet (stale partial) count and show */
    const fresh = partialCommit ? removeOverlap(partialCommit.full, live) : live;
    interimTextEl.textContent = fresh;
    pendingText = live;
    if (!pendingSince) pendingSince = Date.now();
    const words = wordsOf(fresh).length;
    const aged = Date.now() - pendingSince >= CONFIG.SPLIT_SECONDS * 1000;
    if (fresh && (words >= lineMaxWords() || aged)) {
      commitSpokenText(live, false);
      interimTextEl.textContent = "";
    }
  }
  if (content.inputTranscription && content.inputTranscription.text) {
    lastTextAt = Date.now();
    commitSpokenText(content.inputTranscription.text.trim(), true);
    interimTextEl.textContent = "";
  }
}

/**
 * WebSocket onmessage: Blob/text → JSON → handleServerMessage.
 */
async function onSocketMessage(event) {
  let raw = event.data;
  if (raw instanceof Blob) raw = await raw.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return;
  }
  handleServerMessage(parsed);
}

/**
 * Input socket always uses Transcribe Live — not Live Translate.
 */
function sendSetup() {
  const setup = {
    model: "models/" + CONFIG.TRANSCRIBE_MODEL,
    generationConfig: { responseModalities: ["TEXT"] },
    inputAudioTranscription: {
      languageCodes: selectedLang === "auto" ? [] : [selectedLang],
      customVocabulary: CUSTOM_VOCAB,
      mode: CONFIG.TRANSCRIBE_MODE,
    },
  };
  /* Live session resumption: {} asks for handles, {handle} resumes */
  setupUsedResumption = resumeEnabled;
  setupUsedHandle = resumeEnabled && !!resumeHandle;
  if (resumeEnabled) setup.sessionResumption = resumeHandle ? { handle: resumeHandle } : {};
  if (CONFIG.CONTEXT_COMPRESSION) {
    setup.contextWindowCompression = CONFIG.CONTEXT_COMPRESSION_CONFIG || { slidingWindow: {} };
  }
  socket.send(JSON.stringify({ setup: setup }));
}

/**
 * Mic + AudioContext + Transcribe Live socket (user Start / auto start).
 * Connects to: startMeter, ensureAudioGraph, openSocket
 */
async function startSession() {
  if (wantRunning) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    keyPanel.classList.add("open");
    setStatus(TEXT.addKeyFirst, "bad");
    return;
  }
  wantRunning = true;
  reconnectTries = 0;
  reconnecting = false;
  preSetupFailures = 0;
  pcmLeftover = new Int16Array(0);
  /* first window starts with the session (unless one already has lines) */
  if (!currentBlock) winStart = Date.now();
  setToggleUi(true);
  if (ledEl) ledEl.className = "wait";
  setStatus(TEXT.connecting);
  try {
    if (!meterStream) await startMeter();
    mediaStream = meterStream;
    if (!mediaStream) throw new Error("no mic");
  } catch (err) {
    setStatus(TEXT.micDenied, "bad");
    wantRunning = false;
    setToggleUi(false);
    return;
  }
  if (!wantRunning) return; /* Stop pressed while the mic prompt was open */
  ensureAudioGraph();
  openSocket();
}

/**
 * Audio graph mic → gain (MIC_GAIN) → ScriptProcessor → 16 kHz PCM (kept across
 * reconnects; built once per Start). Resumes the context if the browser suspended it.
 */
function ensureAudioGraph() {
  if (!audioContext) {
    audioContext = new AudioContext();
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    sessionGainNode = audioContext.createGain();
    sessionGainNode.gain.value = micGain;
    processorNode = audioContext.createScriptProcessor(AUDIO.PROCESSOR_BUFFER, 1, 1);
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    processorNode.onaudioprocess = function (ev) {
      const input = ev.inputBuffer.getChannelData(0);
      const resampled = resampleTo16k(input, audioContext.sampleRate);
      setMicLevel(resampled);
      enqueuePcm(floatToPcm16(resampled));
    };
    sourceNode.connect(sessionGainNode);
    sessionGainNode.connect(processorNode);
    processorNode.connect(silentGain);
    silentGain.connect(audioContext.destination);
  }
  resumeAudioContexts();
}

/**
 * Open one Live socket and send setup. Audio waits for setupComplete; if it
 * does not come within AUDIO.SETUP_TIMEOUT_MS the connect counts as failed.
 * Events from older sockets are ignored (socketGen).
 */
function openSocket() {
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  if (!wantRunning) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    wantRunning = false;
    setToggleUi(false);
    keyPanel.classList.add("open");
    setStatus(TEXT.addKeyFirst, "bad");
    return;
  }
  const gen = ++socketGen;
  sessionReady = false;
  pcmLeftover = new Int16Array(0);
  const ws = new WebSocket(WS_BASE + "?key=" + encodeURIComponent(apiKey));
  socket = ws;
  ws.onopen = function () {
    if (gen !== socketGen) return;
    sendSetup();
    setStatus(TEXT.connected);
    clearTimeout(setupTimer);
    setupTimer = setTimeout(function () {
      if (gen !== socketGen || sessionReady) return;
      setStatus(TEXT.setupTimeout, "bad");
      abandonSocket();
      handleDisconnect({ preSetup: true, reason: "setup timeout" });
    }, AUDIO.SETUP_TIMEOUT_MS || 5000);
  };
  ws.onmessage = function (ev) {
    if (gen !== socketGen) return;
    onSocketMessage(ev);
  };
  ws.onerror = function () {
    if (gen !== socketGen) return;
    setStatus(TEXT.connectionError, "bad");
  };
  ws.onclose = function (ev) {
    if (gen !== socketGen) return;
    const wasReady = sessionReady;
    socket = null;
    sessionReady = false;
    clearTimeout(setupTimer);
    handleDisconnect({
      preSetup: !wasReady,
      code: ev && ev.code,
      reason: (ev && ev.reason) || "closed" + (ev && ev.code ? " " + ev.code : ""),
    });
  };
}

/**
 * Detach the current socket (its events are ignored from now on) and close it.
 */
function abandonSocket() {
  const ws = socket;
  socketGen++;
  socket = null;
  sessionReady = false;
  clearTimeout(setupTimer);
  if (ws) {
    try {
      ws.close();
    } catch (err) {}
  }
}

/**
 * Server setupComplete: the session is ready, audio may flow.
 */
function onSetupComplete() {
  sessionReady = true;
  clearTimeout(setupTimer);
  if (reconnecting) {
    logSessionEvent(setupUsedHandle ? TEXT.logResumed : TEXT.logReconnected);
    if (liveNoteEl) liveNoteEl.textContent = TEXT.reconnected;
  }
  reconnecting = false;
  reconnectTries = 0;
  preSetupFailures = 0;
  noteReconnect = "";
  renderSessionNote();
  if (wantRunning && ledEl) ledEl.className = "on";
  setStatus(TEXT.listening, "ok");
}

/**
 * sessionResumptionUpdate: keep the newest resumable handle.
 */
function onResumptionUpdate(upd) {
  if (!upd) return;
  if (upd.resumable === false) return;
  if (upd.newHandle) resumeHandle = String(upd.newHandle);
}

/**
 * GoAway: the server will drop this connection soon. Renew now (with the
 * resumption handle) instead of waiting for the drop.
 */
function onGoAway() {
  if (!wantRunning) return;
  logSessionEvent(TEXT.logGoAway);
  noteReconnect = TEXT.renewing || "";
  renderSessionNote();
  setStatus(TEXT.renewing);
  abandonSocket();
  handleDisconnect({ preSetup: false, immediate: true, reason: "goAway" });
}

/**
 * The socket is gone (close, error, setup timeout, GoAway). The open caption
 * window stays open; only the unfinished interim is dropped (a new session
 * starts new utterances). Reconnects unless the user pressed Stop.
 * A failed setup that used a resumption handle retries fresh; a clear
 * rejection of sessionResumption switches it off for this page load.
 */
function handleDisconnect(info) {
  if (interimTextEl) interimTextEl.textContent = "";
  pendingText = "";
  pendingSince = 0;
  partialCommit = null;
  if (!wantRunning) {
    setToggleUi(false);
    setStatus(TEXT.stoppedServer);
    return;
  }
  if (info.preSetup && setupUsedResumption) {
    if (setupUsedHandle) {
      resumeHandle = "";
    } else {
      preSetupFailures++;
      const why = String(info.reason || "");
      if (/resum|unknown name|invalid/i.test(why) || info.code === 1007 || preSetupFailures >= 2) {
        resumeEnabled = false;
      }
    }
  }
  scheduleReconnect(info.immediate ? 0 : null, info.reason);
}

/**
 * Reconnect after a backoff (RECONNECT_BASE_MS doubling to RECONNECT_MAX_MS),
 * at most RECONNECT_MAX_TRIES in a row. delay 0 = at once (GoAway, not counted).
 */
function scheduleReconnect(delay, reason) {
  clearTimeout(reconnectTimer);
  reconnecting = true;
  if (ledEl) ledEl.className = "wait";
  if (delay === 0) {
    reconnectTimer = setTimeout(openSocket, 0);
    return;
  }
  reconnectTries++;
  const maxTries = Number(CONFIG.RECONNECT_MAX_TRIES) || 20;
  if (reconnectTries > maxTries) {
    wantRunning = false;
    reconnecting = false;
    noteReconnect = TEXT.reconnectGaveUp || "";
    renderSessionNote();
    setToggleUi(false);
    setStatus(TEXT.reconnectGaveUp, "bad");
    logSessionEvent(TEXT.logGaveUp);
    return;
  }
  const base = Number(CONFIG.RECONNECT_BASE_MS) || 1000;
  const max = Number(CONFIG.RECONNECT_MAX_MS) || 15000;
  const wait = delay == null ? Math.min(max, base * Math.pow(2, reconnectTries - 1)) : delay;
  noteReconnect = fmtText(TEXT.reconnecting, { n: reconnectTries });
  renderSessionNote();
  setStatus(noteReconnect, "bad");
  logSessionEvent(fmtText(TEXT.logReconnect, { n: reconnectTries, why: reason || "" }));
  reconnectTimer = setTimeout(openSocket, wait);
}

/**
 * One short event entry in the hour log ("<stamp>\n# <text>\n\n").
 */
function logSessionEvent(text) {
  if (!CONFIG.LOG_SESSION_EVENTS || !text) return;
  const p = istNow();
  const key = hourKeyFromParts(p);
  const body =
    (localStorage.getItem(key) || "") + stampFromParts(p) + "\n" + (CONFIG.LOG_EVENT_PREFIX || "") + text + "\n\n";
  try {
    localStorage.setItem(key, body);
  } catch (err) {
    return;
  }
  renderLogList();
}

/**
 * User Stop (or Input change): cancel any pending reconnect, tear down mic
 * graph and socket. Meter stays on.
 */
async function stopSession() {
  wantRunning = false;
  reconnecting = false;
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  clearTimeout(setupTimer);
  sendAudioStreamEnd();
  /* ignore events of the socket being closed */
  socketGen++;
  sessionReady = false;
  resumeHandle = "";
  noteReconnect = "";
  renderSessionNote();
  if (processorNode) {
    processorNode.disconnect();
    processorNode = null;
  }
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (silentGain) {
    silentGain.disconnect();
    silentGain = null;
  }
  if (sessionGainNode) {
    sessionGainNode.disconnect();
    sessionGainNode = null;
  }
  if (audioContext) {
    const ctx = audioContext;
    audioContext = null;
    try {
      await ctx.close();
    } catch (err) {}
  }
  /* Keep meterStream running so the bar still moves after Stop */
  mediaStream = null;
  if (socket) {
    try {
      socket.close();
    } catch (err) {
      /* ignore */
    }
    socket = null;
  }
  setToggleUi(false);
  setStatus(TEXT.stopped);
  /* close the open window now so its last lines still get translated */
  pendingText = "";
  pendingSince = 0;
  partialCommit = null;
  closeWindow(Date.now(), false);
}

/**
 * Start/Stop button. Toggles startSession / stopSession.
 */
function onToggleClick() {
  if (isRunning) stopSession();
  else startSession();
}

/**
 * Parse csv/text lines into CUSTOM_VOCAB (first column).
 * Connects to: loadVocabCsv
 */
function addVocabLines(text) {
  if (!text) return;
  text.split(/\r?\n/).forEach(function (line) {
    const w = line.split(",")[0].trim();
    if (!w || w.charAt(0) === "#") return;
    if (CUSTOM_VOCAB.indexOf(w) === -1) CUSTOM_VOCAB.push(w);
  });
}

/**
 * Fetch CONFIG.VOCAB_FILES and merge names into CUSTOM_VOCAB for sendSetup().
 */
function loadVocabCsv() {
  const files = CONFIG.VOCAB_FILES || [];
  files.forEach(function (file) {
    fetch(file)
      .then(function (res) {
        return res.ok ? res.text() : "";
      })
      .then(addVocabLines)
      .catch(function () {});
  });
}

/**
 * Fetch CONFIG.ROMAN_WORD_FILES (roman_xx.csv) into CFN_ROMAN, then
 * recompute the ABC lines made before the lists arrived.
 */
function loadRomanWords() {
  if (!window.CFN_ROMAN) return;
  const files = CONFIG.ROMAN_WORD_FILES || {};
  Object.keys(files).forEach(function (lang) {
    fetch(files[lang])
      .then(function (res) {
        return res.ok ? res.text() : "";
      })
      .then(function (text) {
        if (text && window.CFN_ROMAN.addWords(lang, text)) renderAllAbc(true);
      })
      .catch(function () {});
  });
}

if (gainSlider) {
  gainSlider.min = String(Number(CONFIG.MIC_GAIN_MIN) || 0.5);
  gainSlider.max = String(Number(CONFIG.MIC_GAIN_MAX) || 4);
  gainSlider.value = String(micGain);
  if (TEXT.gainTitle) gainSlider.title = TEXT.gainTitle;
  gainSlider.addEventListener("input", function () {
    setMicGain(gainSlider.value, true);
  });
}
setMicGain(micGain, false);
saveKeyBtn.addEventListener("click", saveKey);
clearKeyBtn.addEventListener("click", clearKey);
keyToggleBtn.addEventListener("click", toggleKeyPanel);
listenSelect.addEventListener("change", onListenChange);
abcSelect.addEventListener("change", onAbcChange);
translateSelect.addEventListener("change", onTranslateChange);
if (modelSelect) modelSelect.addEventListener("change", onModelChange);
toggleBtn.addEventListener("click", onToggleClick);
copyBtn.addEventListener("click", copyCaptions);
clearTextBtn.addEventListener("click", clearCaptionText);
if (logBtn) logBtn.addEventListener("click", toggleLogPanel);
if (logDownloadAllBtn) logDownloadAllBtn.addEventListener("click", downloadAllAndClear);

migrateLegacyStorage();
fillLanguageSelects();
if (abcSelect) abcSelect.value = abcMode;
loadSavedKey();
renderKeyPlaceholder();
loadRomanWords();
loadVocabCsv();
fillModelSelect();
renderRpd();
renderLogList();
setInterval(tickTee, CONFIG.TEE_CHECK_MS);
setInterval(windowTick, CONFIG.WINDOW_TICK_MS || 100);
startMeter();
if (CONFIG.AUTO_START) startSession();
