/**
 * Caption for NEI (Caption for North East India) — caption-for-nei_config.js
 * Version: 0.12
 * First release: 27 Sep 2026
 * Last edit: 28 Sep 2026
 * Credit: personal project (Karbi Anglong / Assam)
 *
 * Loaded before caption-for-nei_logic.js. window.CFN_CONFIG is merged into CONFIG.
 * Edit tunables, languages, storage keys and UI text here; leave the logic file for logic.
 * Never put a real API key in this file (the site is public). Use the Key panel.
 */
window.CFN_CONFIG = {
  /* Max words in one caption block (splitSentences) */
  WORD_SPLIT: 25,
  /* Max seconds before a new row (handleServerMessage) */
  SPLIT_SECONDS: 4.25,
  /* Call startSession() on load if a key is saved */
  AUTO_START: true,
  /* Append/tee hour log on these clock minutes (0,5,10,...) */
  SAVE_MINUTES: 5,
  /* How often (ms) the tee slot is checked (setInterval tickTee) */
  TEE_CHECK_MS: 15000,
  /* One chat translate per this many seconds (batch short talk) */
  TRANSLATE_SECONDS: 5,
  /* ABC romanize parked; addCaptionBlock skips ABC when false */
  ABC_ON: false,
  /* Do not play translated audio */
  SPEAKER: false,
  /* sendSetup() Input WebSocket model */
  TRANSCRIBE_MODEL: "gemini-3.5-transcribe-live",
  /* sendSetup() inputAudioTranscription.mode: "SMART" or "VERBATIM" */
  TRANSCRIBE_MODE: "SMART",
  /* Parked Live Translate id (unused while OUTPUT_ENGINE is chat) */
  TRANSLATE_MODEL: "gemini-3.5-live-translate-preview",
  /* chat = translateLine(). live = unused Live Translate path */
  OUTPUT_ENGINE: "chat",
  /* Model dropdown default: "auto" or a MODELS[].id */
  PINNED_MODEL: "auto",
  /* loadVocabCsv() fetches these into CUSTOM_VOCAB */
  VOCAB_FILES: ["city.csv", "town.csv", "surname.csv", "vocab.csv"],

  /* Endpoints */
  /* Live WebSocket endpoint (transcribe + optional translate); "?key=" is appended */
  WS_BASE:
    "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
  /* Chat translate REST base; "<model>:generateContent?key=" is appended */
  CHAT_API_BASE: "https://generativelanguage.googleapis.com/v1beta/models/",

  /* Audio pipeline */
  AUDIO: {
    /* Target sample rate required by live transcription */
    SAMPLE_RATE: 16000,
    /* PCM chunk size in samples (~100 ms at 16 kHz) */
    CHUNK_SAMPLES: 1600,
    /* mimeType sent with each realtimeInput audio frame */
    MIME_TYPE: "audio/pcm;rate=16000",
    /* ScriptProcessor buffer size (startSession) */
    PROCESSOR_BUFFER: 4096,
    /* Analyser fftSize for the always-on mic meter */
    METER_FFT_SIZE: 512,
    /* RMS → percent multiplier for the mic bar */
    METER_GAIN: 140,
    /* getUserMedia audio constraints */
    MIC_CONSTRAINTS: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    /* Start sending audio this long after socket open if setupComplete is late */
    SETUP_FALLBACK_MS: 800,
  },

  /*
   * Input languages (Transcribe Live). code = BCP-47 sent in
   * inputAudioTranscription.languageCodes; "auto" sends [] (auto-detect).
   * Codes from Google's Gemini 3.5 Transcribe Live supported-language list.
   * script = writing system the transcript comes back in (Assamese and
   * Bengali share the Bengali script U+0980–U+09FF; Hindi and Nepali share
   * Devanagari U+0900–U+097F), so script alone cannot tell them apart.
   */
  INPUT_LANGUAGES: [
    { code: "auto", label: "Auto" },
    { code: "en-IN", label: "English", script: "Latin" },
    { code: "as-IN", label: "Assamese", script: "Bengali" },
    { code: "hi-IN", label: "Hindi", script: "Devanagari" },
    { code: "bn-IN", label: "Bengali", script: "Bengali" },
    { code: "ne-NP", label: "Nepali", script: "Devanagari" },
  ],
  /* Input dropdown default ("auto" or an INPUT_LANGUAGES code) */
  DEFAULT_INPUT: "auto",

  /*
   * Output (chat translate) targets. code = dropdown value,
   * name = language name used in TEXT.translatePrompt. "off" = no translate.
   */
  OUTPUT_LANGUAGES: [
    { code: "off", label: "Off" },
    { code: "en", label: "English", name: "English" },
    { code: "hi", label: "Hindi", name: "Hindi" },
    { code: "as", label: "Assamese", name: "Assamese" },
    { code: "bn", label: "Bengali", name: "Bengali" },
    { code: "ne", label: "Nepali", name: "Nepali" },
  ],
  /* Output dropdown default */
  DEFAULT_OUTPUT: "off",
  /* Used when an Output code has no name */
  FALLBACK_OUTPUT_NAME: "English",

  /*
   * localStorage keys (prefix cfn_). Hour logs are HOUR_PREFIX + YYYY-MM-DD_HH (IST).
   */
  STORAGE: {
    API_KEY: "cfn_gemini_api_key_v01",
    RPD: "cfn_rpd_utc_v1",
    HOUR_PREFIX: "cfn_hour_",
  },
  /* Rough browser quota shown in the Log panel */
  STORAGE_QUOTA_KB: 5000,
  /*
   * One-time migration from the old "Live Subtitle for Assam" keys (v0.11).
   * migrateLegacyStorage() copies old → new only when the new key is empty.
   * Old keys are left in place.
   */
  LEGACY_STORAGE_KEYS: {
    lsa_gemini_api_key_v01: "cfn_gemini_api_key_v01",
    lsa_rpd_utc_v1: "cfn_rpd_utc_v1",
  },
  /* Prefix migration: every lsa_hour_* key → cfn_hour_* */
  LEGACY_STORAGE_PREFIXES: {
    lsa_hour_: "cfn_hour_",
  },

  /* Time zone for log stamps and hour buckets */
  TIME_ZONE: "Asia/Kolkata",
  TIME_ZONE_LABEL: "IST",
  /* Downloaded log file names: <prefix>YYYY-MM-DD_HH.txt and <prefix>all-YYYY-MM-DD.txt */
  LOG_FILE_PREFIX: "cfn-",

  /* Defaults when a MODELS entry leaves rpm / rpd out */
  DEFAULT_RPM: 15,
  DEFAULT_RPD: 500,

  /* Optional extra keys; Google key usually from the Key panel. Keep empty in git. */
  KEYS: {
    google: "",
    groq: "",
    openrouter: "",
  },
  /*
   * Chat Output models. pickChatModel() takes the first that is On,
   * under rpm (modelHits / 60s) and under rpd (UTC day store).
   */
  MODELS: [
    { id: "gemini-3.5-flash-lite", provider: "google", rpm: 15, rpd: 500, on: true, label: "3.5 Lite" },
    { id: "gemini-3.1-flash-lite", provider: "google", rpm: 15, rpd: 500, on: true, label: "3.1 Lite" },
    { id: "gemini-2.5-flash-lite", provider: "google", rpm: 15, rpd: 10000, on: false, label: "2.5 Lite" },
    { id: "llama-3.1-8b-instant", provider: "groq", rpm: 60, rpd: 10000, on: false, label: "Groq 8B" },
    { id: "google/gemini-2.0-flash-lite-preview", provider: "openrouter", rpm: 20, rpd: 10000, on: false, label: "OR Lite" },
  ],

  /* UI and status text */
  TEXT: {
    start: "Start",
    stop: "Stop",
    auto: "Auto",
    micDenied: "Mic permission denied.",
    logFull: "Log storage full. Download logs.",
    noLogs: "No logs.",
    confirmDownloadAll: "Download all hour logs as one txt, then delete them?",
    batchOutput: "(batch output)",
    view: "View",
    download: "Download",
    delete: "Delete",
    storageUsed: "Storage ~{used} KB / {quota} KB",
    nothingToCopy: "Nothing to copy.",
    copied: "Copied",
    copyFailed: "Copy failed.",
    listeningDots: "Listening..",
    pasteKeyFirst: "Paste a key first.",
    keySaved: "Key saved on this device.",
    keyCleared: "Key cleared.",
    rpmCap: "All chat models at RPM cap. Wait.",
    providerOff: "Turn that provider on and add KEYS in caption-for-nei_config.js",
    translateFailedShort: "Translate failed",
    translateFailed: "Translate failed.",
    /* {lang} = OUTPUT_LANGUAGES[].name, {text} = source lines */
    translatePrompt: "Translate into {lang}. Return only the translation.\n\n{text}",
    listening: "Listening",
    addKeyFirst: "Add an API key first.",
    connecting: "Connecting…",
    connected: "Connected",
    connectionError: "Connection error.",
    stoppedServer: "Stopped",
    stopped: "Stopped.",
  },
};
