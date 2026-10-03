/*
 * File Drop — filedrop_config.js
 * Every tunable in one place. Loaded first; everything else reads FD.config.
 */
(function (FD) {
  'use strict';
  FD.config = {
    // Link put in the QR. On file:// / localhost / LAN the public copy is used so a phone can open it.
    publicBaseUrl: 'https://jor-teron.github.io/sites/apps/connectivity/filedrop/',
    page: 'filedrop.html',
    peerPrefix: 'jtsites-fd-',          // + 14 random chars → this device's id on the PeerJS server
    peerIdRandom: 14,
    codePrefix: 'jtsites-fd-c-',        // + 4 digits → short-lived "code" id that hands out id + token
    tokenLength: 12,                    // secret in the QR link (#<id>.<token>)
    codeTtlMs: 2 * 60 * 1000,           // 4-digit code refreshes after this (and after each use)
    peerOptions: { debug: 0 },          // self-host later: { host, port, path, secure: true }

    codeAnswerMs: 7000,                 // typed code: give up (wrong / used / expired) after this
    helloTimeoutMs: 8000,               // a new link must say hello{token} within this
    pingEveryMs: 3000,                  // heartbeat while linked
    deadAfterMs: 10000,                 // no message for this long → link treated as dead
    reconnectDelaysMs: [500, 1000, 2000, 3000, 5000, 8000],
    brokerRetryMs: [1000, 2000, 4000, 8000, 15000],

    chunkMax: 64 * 1024,                // frame size cap (also limited by the link's maxMessageSize)
    chunkMin: 16 * 1024,
    bufferHigh: 4 * 1024 * 1024,        // sender pauses above this many queued bytes
    bufferLow: 1024 * 1024,             // … and resumes below this
    ackEveryBytes: 1024 * 1024,         // receiver confirms progress (resume point) this often
    partBytes: 8 * 1024 * 1024,         // received chunks folded into Blob parts of this size
    maxBytes: 2 * 1024 * 1024 * 1024,   // largest file (desktop / Android)
    maxBytesIOS: 1024 * 1024 * 1024,    // largest file on iPhone / iPad
    warnBytesIOS: 300 * 1024 * 1024,    // above this iOS shows a memory warning

    autoSave: true,                     // received files download by themselves (not possible on iOS)
    sound: true,                        // short chime on connect / done
    vibrate: true,
    camera: true,                       // scan for a File Drop QR on the pair screen
    scanEveryMs: 250,
    scanWidth: 480,
  };
})(window.FD = window.FD || {});
