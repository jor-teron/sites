/*
 * OCR — ocr_config.js
 * Every setting in one place. All ocr_*.js files share the global namespace window.OCR
 * (plain <script> tags, no modules). Every library is local in ./vendor (no CDN).
 */
window.OCR = window.OCR || {};

OCR.config = {
  version: '2.1',

  // Accepted files
  accept: {
    types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    ext: ['.jpg', '.jpeg', '.png', '.webp', '.pdf'],
    pickerAccept: '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf',
    maxBytes: 20 * 1024 * 1024,        // 20 MB per file
    maxFiles: 20                       // files queued from one pick / drop
  },

  // Tesseract.js (all paths are inside ./vendor; turned into absolute URLs at run time)
  tesseract: {
    lang: 'eng',
    oem: 1,                             // 1 = LSTM only (matches the vendored *-lstm cores)
    workerPath: 'vendor/worker.min.js',
    corePath: 'vendor/',                // picks tesseract-core-simd-lstm.wasm.js or -lstm.wasm.js
    langPath: 'vendor/lang/',           // eng.traineddata.gz = tessdata_best (integer) model
    initTimeoutMs: 45000                // engine start-up longer than this = error (offline / file://)
  },

  // Images are scaled down before OCR when their longest side is above this
  ocrMaxSide: 3500,

  // PDFs (pdf.js 3.11 legacy build)
  pdf: {
    workerSrc: 'vendor/pdf.worker.min.js',
    standardFontDataUrl: 'vendor/standard_fonts/',
    minTextChars: 20,                   // a page with fewer letters/digits in its text layer is OCR'd
    ocrScale: 3,                        // render scale for OCR (≈216 dpi) …
    ocrMaxSide: 3500,                   // … but never above this many pixels
    previewMaxSide: 1800                // preview render size
  },

  // Google Cloud Vision
  vision: {
    url: 'https://vision.googleapis.com/v1/images:annotate',
    feature: 'DOCUMENT_TEXT_DETECTION',
    jpegQuality: 0.9
  },

  storage: {
    key: 'ocr_vision_api_key',          // same name as v1, so a saved key carries over
    engine: 'ocr_engine'
  },

  download: {
    base: 'ocr-text',                   // used when there is no source file name
    revokeDelayMs: 30000
  },

  // Send from phone (QR). The computer page registers a fresh random PeerJS id per QR on the
  // default public PeerJS server (same as the hub controller); the phone page ocr_send.html
  // connects to it. Only one phone per session; the QR token is single-session.
  send: {
    publicBaseUrl: 'https://jor-teron.github.io/sites/apps/office/ocr/', // used on file:// / localhost / LAN
    phonePage: 'ocr_send.html',
    peerPrefix: 'jtocr',                // + random → ~16-char peer id
    peerIdLength: 16,
    tokenLength: 12,
    peerOptions: { debug: 0 },
    idleMs: 10 * 60 * 1000,             // session ends after 10 min with no files / activity
    helloTimeoutMs: 10000,              // a new connection must send hello{token} within this
    rxStallMs: 30000,                   // transfer aborted when no chunk arrives for this long
    chunkBytes: 16000,                  // ≈16 KB binary chunks (kept under PeerJS's 16300-byte MTU)
    ackEvery: 16,                       // receiver acks every N chunks (progress on the phone)
    maxBuffered: 1024 * 1024,           // phone waits while more than this is queued to send
    replyTimeoutMs: 15000,              // phone: wait this long for go / ✓ replies
    reconnectDelaysMs: [1000, 2000, 3000, 5000, 8000, 10000], // phone backoff (last repeats)
    reconnectGiveUpMs: 120000,
    brokerRetryMs: [2000, 5000, 10000, 20000] // computer: re-register with the PeerJS server
  },

  text: {
    pageMarker: (n) => '— Page ' + n + ' —',
    fileMarker: (name) => '=== ' + name + ' ===',
    status: {
      ready: 'Drop, paste or tap to open a JPG, PNG, WebP or PDF',
      wrongType: 'Only JPG, PNG, WebP or PDF files',
      tooBig: 'File is over 20 MB',
      busy: 'Busy — wait or Cancel first',
      noText: 'No text found',
      done: 'Done',
      loadingEngine: 'Loading OCR engine…',
      password: 'Password-protected PDFs are not supported',
      engineFailed: 'OCR engine failed to load',
      engineFileUrl: 'OCR engine cannot start from file:// — open the app over http(s)',
      needKey: 'Add a Cloud Vision API key first (Key 🗝️)',
      visionOffline: 'Cloud Vision needs an internet connection',
      cancelled: 'Cancelled'
    }
  }
};
