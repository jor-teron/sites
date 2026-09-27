/**
 * Caption for NEI (Caption for North East India) — caption-for-nei_logic.js
 * Version: 0.13
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
 *   startSession() opens the mic + Transcribe Live WebSocket.
 *   handleServerMessage() turns speech into caption rows (addCaptionBlock).
 *   renderAbc() fills line 2 (ABC Off / Local / AI) on every block.
 *   translateBlock() sends one chat request per block (line 3 and/or AI ABC).
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

/* ABC (line 2): off | local | ai. Saved in STORAGE.ABC_MODE */
const ABC_MODES = ["off", "local", "ai"];
let abcMode = loadAbcMode();

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
let sessionReady = false;

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

/**
 * Split on punctuation then word limit.
 */
function splitSentences(text) {
  const raw = String(text || "").split(/([.?!।])/);
  const rebuilt = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    if (!cur) continue;
    if (/^[.?!।]$/.test(cur) && rebuilt.length) rebuilt[rebuilt.length - 1] += cur;
    else rebuilt.push(cur);
  }
  const out = [];
  const limit = CONFIG.WORD_SPLIT;
  for (let i = 0; i < rebuilt.length; i++) {
    const piece = rebuilt[i].trim();
    if (!piece) continue;
    const words = piece.split(/\s+/);
    if (words.length <= limit) out.push(piece);
    else {
      for (let w = 0; w < words.length; w += limit) {
        out.push(words.slice(w, w + limit).join(" "));
      }
    }
  }
  return out.length ? out : [String(text || "").trim()].filter(Boolean);
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
 * Called from translateBlock() before each chat request.
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
 * Does not open Transcribe Live. Connects to setMicLevel.
 */
async function startMeter() {
  if (meterAnalyser) return;
  try {
    if (!meterStream) {
      meterStream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO.MIC_CONSTRAINTS,
      });
    }
    meterCtx = new AudioContext();
    const src = meterCtx.createMediaStreamSource(meterStream);
    meterAnalyser = meterCtx.createAnalyser();
    meterAnalyser.fftSize = AUDIO.METER_FFT_SIZE;
    src.connect(meterAnalyser);
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
  } catch (err) {
    setStatus(TEXT.micDenied, "bad");
  }
}

/**
 * Next On model under RPM (60s window in modelHits) and RPD (UTC day).
 * Honours pinnedModel when not "auto". skipIds = models already tried for
 * this line (translateBlock fallback).
 * Connects to: translateBlock
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
 * Line 2 (ABC) for one block, from its stored state:
 *   off → hidden; no Indic script → hidden;
 *   local → CFN_ROMAN; ai → AI roman when one arrived, else local.
 * Called on create, on ABC mode change (all blocks) and when word lists load.
 */
function renderAbc(wrap) {
  const st = wrap && wrap.cfn;
  if (!st || !st.abcBox) return;
  const show = abcMode !== "off" && st.indic;
  st.abcBox.hidden = !show;
  if (!show) return;
  if (!st.localRoman || st.localStale) {
    st.localRoman = romanizeLocal(st.source, st.lang) || st.source;
    st.localStale = false;
  }
  st.abcBox.value = abcMode === "ai" && st.aiRoman ? st.aiRoman : st.localRoman;
  fitTextarea(st.abcBox);
}

/**
 * Re-render line 2 on every block (after ABC mode change or word-list load).
 */
function renderAllAbc(recomputeLocal) {
  const blocks = lineList.querySelectorAll(".line");
  for (let i = 0; i < blocks.length; i++) {
    if (recomputeLocal && blocks[i].cfn) blocks[i].cfn.localStale = true;
    renderAbc(blocks[i]);
  }
}

/**
 * One caption block at the top: line 1 original, line 2 ABC (only for
 * Indic script), line 3 translation (when Output is not Off).
 * Starts this block's own chat request (translateBlock) when needed and
 * writes the hour log once line 2/3 are settled.
 */
function addCaptionBlock(sourceText) {
  const text = sourceText || "";
  const wrap = document.createElement("div");
  wrap.className = "line";
  const orig = document.createElement("textarea");
  orig.className = "orig-line";
  orig.rows = 1;
  orig.value = text;
  orig.addEventListener("input", function () {
    fitTextarea(orig);
  });
  wrap.appendChild(orig);
  const st = {
    source: text,
    lang: selectedLang,
    indic: !!text && hasIndicScript(text),
    abcBox: null,
    outBox: null,
    localRoman: "",
    aiRoman: "",
    stamp: istNow(),
  };
  wrap.cfn = st;
  if (st.indic) {
    const abcBox = document.createElement("textarea");
    abcBox.className = "abc-line";
    abcBox.rows = 1;
    abcBox.addEventListener("input", function () {
      fitTextarea(abcBox);
    });
    wrap.appendChild(abcBox);
    st.abcBox = abcBox;
  }
  if (translateTarget !== "off" && text) {
    const outBox = document.createElement("textarea");
    outBox.className = "out-line";
    outBox.rows = 1;
    outBox.value = "";
    outBox.addEventListener("input", function () {
      fitTextarea(outBox);
    });
    wrap.appendChild(outBox);
    st.outBox = outBox;
  }
  lineList.insertBefore(wrap, lineList.firstChild);
  fitTextarea(orig);
  renderAbc(wrap);
  scrollCaptionsToTop();
  if (text) {
    const wantAi = abcMode === "ai" && st.indic;
    const job = st.outBox || wantAi ? translateBlock(wrap, wantAi) : Promise.resolve();
    job.catch(function () {}).then(function () {
      logBlock(wrap);
    });
  }
  return wrap;
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
 * Append one caption to its IST hour bucket. Entry format (v0.13):
 *   stamp
 *   original
 *   ABC: romanized        (only when line 2 is shown; CONFIG.LOG_ABC_PREFIX)
 *   translation           (only when there is one)
 *   (blank line)
 * Older entries (stamp, original, translation) read the same way.
 * p = istNow() parts from when the block was created (defaults to now).
 */
function appendHourLog(sourceText, transText, romanText, p) {
  p = p || istNow();
  const key = hourKeyFromParts(p);
  let body = localStorage.getItem(key) || "";
  body += stampFromParts(p) + "\n" + sourceText;
  if (romanText) body += "\n" + (CONFIG.LOG_ABC_PREFIX || "") + romanText;
  if (transText) body += "\n" + transText;
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
 * Write one block to the hour log: original, line 2 (if shown), line 3.
 */
function logBlock(wrap) {
  const st = wrap && wrap.cfn;
  if (!st || st.logged) return;
  st.logged = true;
  const roman = st.abcBox && !st.abcBox.hidden ? st.abcBox.value.trim() : "";
  /* skip the "(no model free)" / "(add an API key)" notes */
  const trans = st.outBox && !st.noted ? st.outBox.value.trim() : "";
  appendHourLog(st.source, trans, roman, st.stamp);
}

function commitSpokenText(text) {
  const piece = (text || "").trim();
  if (!piece) return;
  const bits = splitSentences(piece);
  for (let i = bits.length - 1; i >= 0; i--) {
    addCaptionBlock(bits[i]);
  }
  pendingText = "";
  pendingSince = 0;
}

/**
 * Copy visible text.
 */
async function copyCaptions() {
  const blocks = lineList.querySelectorAll(".line");
  const chunks = [];
  for (let i = 0; i < blocks.length; i++) {
    const areas = blocks[i].querySelectorAll("textarea");
    const bits = [];
    for (let j = 0; j < areas.length; j++) {
      if (areas[j].hidden) continue;
      const t = areas[j].value.trim();
      if (t) bits.push(t);
    }
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
 * ABC dropdown (Off / Local / AI). Saves the choice and re-renders line 2
 * on every existing block. AI does not re-ask old blocks (quota); they show
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
 * Output language changed. New rows use this; old rows stay as they are.
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
 * Requires sessionReady (set after setupComplete or AUDIO.SETUP_FALLBACK_MS fallback).
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

/**
 * Pull {roman, translation} out of a model reply (JSON, maybe in ``` fences).
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
 * One chat request for one block (every caption line on its own; no batching).
 * wantAi = ABC is AI and the line has Indic script: the same request also
 * returns the romanized line as JSON {roman, translation}.
 * Model fallback: if a model errors, returns nothing, or is at its RPM/RPD cap,
 * the next On model (pickChatModel skipIds) is tried. If none work, line 3
 * shows a short note and line 2 keeps the local romanization.
 */
async function translateBlock(wrap, wantAi) {
  const st = wrap && wrap.cfn;
  if (!st || !st.source) return;
  if (CONFIG.OUTPUT_ENGINE === "live") return;
  const wantTrans = !!st.outBox;
  if (!wantTrans && !wantAi) return;
  const googleKey = apiKeyInput.value.trim() || (CONFIG.KEYS && CONFIG.KEYS.google) || "";
  function note(msg) {
    if (st.outBox && !st.outBox.value) {
      st.noted = true;
      st.outBox.value = msg;
      fitTextarea(st.outBox);
    }
  }
  if (!googleKey) {
    note(TEXT.translateNoKey);
    return;
  }
  const langName = outputLangName(translateTarget);
  let prompt;
  if (wantAi) {
    prompt = fmtText(wantTrans ? TEXT.aiRomanBothPrompt : TEXT.aiRomanOnlyPrompt, {
      src: inputLangName(st.lang),
      lang: langName,
      text: st.source,
    });
  } else {
    prompt = fmtText(TEXT.translatePrompt, { lang: langName, text: st.source });
  }
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
        st.outBox.value = textOut.trim();
        fitTextarea(st.outBox);
        return;
      }
      const parsed = parseAiJson(textOut);
      const roman = parsed && typeof parsed.roman === "string" ? parsed.roman.trim() : "";
      const trans = parsed && typeof parsed.translation === "string" ? parsed.translation.trim() : "";
      if (!roman && !(wantTrans && trans)) {
        lastError = TEXT.translateFailedShort;
        continue;
      }
      if (roman) {
        st.aiRoman = roman;
        renderAbc(wrap);
      }
      if (wantTrans) {
        if (trans) {
          st.outBox.value = trans;
          fitTextarea(st.outBox);
        } else {
          /* AI gave roman only: translate with the plain prompt next round */
          wantAi = false;
          prompt = fmtText(TEXT.translatePrompt, { lang: langName, text: st.source });
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
 * setupComplete → sessionReady
 * interim / final text → commitSpokenText when word or time split hits
 * Connects to: onSocketMessage
 */
function handleServerMessage(msg) {
  if (msg.setupComplete) {
    sessionReady = true;
    setStatus(TEXT.listening, "ok");
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
    interimTextEl.textContent = live;
    pendingText = live;
    if (!pendingSince) pendingSince = Date.now();
    const words = live.split(/\s+/).filter(Boolean).length;
    const aged = Date.now() - pendingSince >= CONFIG.SPLIT_SECONDS * 1000;
    if (words >= CONFIG.WORD_SPLIT || aged) {
      commitSpokenText(live);
      interimTextEl.textContent = "";
    }
  }
  if (content.inputTranscription && content.inputTranscription.text) {
    commitSpokenText(content.inputTranscription.text.trim());
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
  socket.send(
    JSON.stringify({
      setup: {
        model: "models/" + CONFIG.TRANSCRIBE_MODEL,
        generationConfig: { responseModalities: ["TEXT"] },
        inputAudioTranscription: {
          languageCodes: selectedLang === "auto" ? [] : [selectedLang],
          customVocabulary: CUSTOM_VOCAB,
          mode: CONFIG.TRANSCRIBE_MODE,
        },
      },
    })
  );
}

/**
 * Mic + AudioContext + Transcribe Live socket.
 * Connects to: sendSetup, onSocketMessage, setMicLevel, enqueuePcm
 */
async function startSession() {
  if (socket && socket.readyState === WebSocket.OPEN) return;
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    keyPanel.classList.add("open");
    setStatus(TEXT.addKeyFirst, "bad");
    return;
  }
  sessionReady = false;
  pcmLeftover = new Int16Array(0);
  setToggleUi(true);
  setStatus(TEXT.connecting);
  try {
    if (!meterStream) await startMeter();
    mediaStream = meterStream;
    if (!mediaStream) {
      setStatus(TEXT.micDenied, "bad");
      setToggleUi(false);
      return;
    }
  } catch (err) {
    setStatus(TEXT.micDenied, "bad");
    setToggleUi(false);
    return;
  }
  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processorNode = audioContext.createScriptProcessor(AUDIO.PROCESSOR_BUFFER, 1, 1);
  silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  processorNode.onaudioprocess = function (ev) {
    const input = ev.inputBuffer.getChannelData(0);
    const resampled = resampleTo16k(input, audioContext.sampleRate);
    setMicLevel(resampled);
    enqueuePcm(floatToPcm16(resampled));
  };
  sourceNode.connect(processorNode);
  processorNode.connect(silentGain);
  silentGain.connect(audioContext.destination);
  socket = new WebSocket(WS_BASE + "?key=" + encodeURIComponent(apiKey));
  socket.onopen = function () {
    sendSetup();
    setTimeout(function () {
      sessionReady = true;
    }, AUDIO.SETUP_FALLBACK_MS);
    setStatus(TEXT.connected);
  };
  socket.onmessage = onSocketMessage;
  socket.onerror = function () {
    setStatus(TEXT.connectionError, "bad");
  };
  socket.onclose = function () {
    setStatus(TEXT.stoppedServer);
    setToggleUi(false);
  };
}

/**
 * Tear down mic graph and Transcribe socket. Meter stops with the session.
 */
async function stopSession() {
  sendAudioStreamEnd();
  sessionReady = false;
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
  if (audioContext) {
    await audioContext.close();
    audioContext = null;
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
 * recompute line 2 on blocks made before the lists arrived.
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
loadRomanWords();
loadVocabCsv();
fillModelSelect();
renderRpd();
renderLogList();
setInterval(tickTee, CONFIG.TEE_CHECK_MS);
startMeter();
if (CONFIG.AUTO_START) startSession();
