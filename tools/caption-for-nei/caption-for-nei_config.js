/**
 * Caption for NEI (Caption for North East India) — caption-for-nei_config.js
 * Version: 0.13
 * First release: 27 Sep 2026
 * Last edit: 28 Sep 2026
 * Credit: personal project (Karbi Anglong / Assam)
 *
 * Loaded first (before the caption-for-nei_roman*.js files and caption-for-nei_logic.js).
 * window.CFN_CONFIG is merged into CONFIG and also read by the romanizer.
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
  /*
   * ABC (line 2, romanized) default mode: "off" | "local" | "ai".
   * local = caption-for-nei_roman.js (rules + word lists, no network).
   * ai = ask the chat model too (falls back to local). The user's choice is
   * remembered in localStorage (STORAGE.ABC_MODE) and wins over this.
   */
  ABC_MODE: "local",
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

  /* Local romanizer (ABC line) */
  /* Word lists (native,roman) per language; whole words win over the rules */
  ROMAN_WORD_FILES: {
    hi: "roman_hi.csv",
    ne: "roman_ne.csv",
    as: "roman_as.csv",
    bn: "roman_bn.csv",
  },
  /* Input "auto" (or a script that does not match Input): which rules to use */
  ROMAN_AUTO_DEVANAGARI_LANG: "hi",
  ROMAN_AUTO_BENGALI_SCRIPT_LANG: "as",
  /*
   * Everyday phone-typing style. Final = last letter of a word.
   * Assamese/Bengali set their own long vowels in the beng data file
   * (a / i / u); override per language below with ROMAN_LANG[lang].style.
   */
  ROMAN_STYLE: {
    longA: "aa", longAFinal: "a",   /* naam, mera */
    longI: "ee", longIFinal: "i",   /* jeevan, hindi */
    longU: "oo", longUFinal: "u",   /* joote, tu */
    va: "v",                        /* व: "v" or "w" */
    nasal: "n",                     /* ं ँ ঁ */
    nasalLabial: "m",               /* ं before p/b/m: sambandh */
  },
  /*
   * Per-language overrides on top of caption-for-nei_roman_deva.js /
   * _beng.js langs (keys: inherent, consonants, initialVowels, style,
   * glideY, diphthong, medialBlockAfterInitial, keepFinalAfterCluster, suffixes).
   */
  ROMAN_LANG: {
    hi: { inherent: "a" },
    ne: { inherent: "a" },
    /* Assamese: inherent "o", word-initial অ → "a" (অসম → axom),
       চ/ছ → "s", স/শ/ষ → "x" */
    as: {
      inherent: "o",
      initialVowels: { "অ": "a" },
      consonants: { "চ": "s", "ছ": "s", "স": "x", "শ": "x", "ষ": "x" },
    },
    /* Bengali: inherent "o", স → "s", শ/ষ → "sh" */
    bn: {
      inherent: "o",
      consonants: { "স": "s", "শ": "sh", "ষ": "sh" },
    },
  },

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
    /* ABC mode chosen on the top bar: off | local | ai */
    ABC_MODE: "cfn_abc_mode_v1",
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
  /* Hour log entry: stamp, original, then "ABC: <roman>" (when shown), then translation */
  LOG_ABC_PREFIX: "ABC: ",

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
   * Every caption line is its own request; if a model errors or is at its
   * cap, the next On model is tried for that line.
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
    /* Line 3 when no model could translate the line */
    translateNoModel: "(no model free — try later)",
    translateNoKey: "(add an API key to translate)",
    /* {lang} = OUTPUT_LANGUAGES[].name, {text} = source line */
    translatePrompt: "Translate into {lang}. Return only the translation.\n\n{text}",
    /* ABC = AI: {src} = Input language name, {lang} = Output language name */
    aiRomanBothPrompt:
      "Text in {src}. 1) Write it in everyday Latin letters the way people type it on a phone (not formal transliteration). 2) Translate it into {lang}. Reply only with JSON: {\"roman\": \"...\", \"translation\": \"...\"}\n\n{text}",
    aiRomanOnlyPrompt:
      "Text in {src}. Write it in everyday Latin letters the way people type it on a phone (not formal transliteration). Reply only with JSON: {\"roman\": \"...\"}\n\n{text}",
    /* {src} fallback when Input is Auto */
    autoSourceName: "an Indian language (Assamese, Hindi, Bengali or Nepali)",
    listening: "Listening",
    addKeyFirst: "Add an API key first.",
    connecting: "Connecting…",
    connected: "Connected",
    connectionError: "Connection error.",
    stoppedServer: "Stopped",
    stopped: "Stopped.",
  },
};
