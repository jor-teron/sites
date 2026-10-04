/**
 * Hub phone controller — settings for the trackpad pointer, phone → hub files and the
 * received-file cards (hub_pointer.js, hub_receive.js, hub_notify.js).
 * Key / D-pad forwarding itself lives in hub-controller.js and is not configured here.
 * Loaded before those files; they read window.HUB_CTRL_CONFIG.
 */
window.HUB_CTRL_CONFIG = {
  // Trackpad pointer (drawn by the hub over the page; the real OS mouse is not moved)
  pointer: {
    speed: 1.6,                  // hub px per phone px
    acceleration: 0.9,           // extra gain for fast swipes (0 = none)
    accelCap: 3,                 // most the acceleration can multiply the speed by
    size: 22,                    // arrow height in px
    hideAfterMs: 4000,           // fade out after this long without use (0 = never)
    scrollSpeed: 2.2,            // wheel px per phone px (two-finger drag)
    color: '#ffffff',            // arrow fill
    outline: '#111111',          // arrow outline
    hoverEvents: true,           // send mousemove / mouseover / mouseout while moving
  },

  // Phone → hub files (second PeerJS connection to the same hub peer, metadata.kind 'files')
  receive: {
    autoSave: true,              // download each finished file (original name), no approve step
    maxBytes: 2 * 1024 * 1024 * 1024, // larger offers are refused
    ackEveryBytes: 512 * 1024,   // progress confirmation sent back to the phone
    partBytes: 8 * 1024 * 1024,  // received chunks folded into Blob parts of this size
  },

  // Received-file cards
  notify: {
    position: 'bottom-right',    // 'bottom-right' (default; the browser's download popup is top-right) | 'top-right' | 'top-center'
    durationMs: 5000,            // a finished card stays this long (hover pauses; 0 = until closed)
    maxStack: 3,                 // more cards wait behind a "+N more" line
    previewSize: 56,             // thumbnail / icon box in px
    showPreviews: true,          // false: type icons only, no image thumbnails
    insetPx: 12,                 // gap from the right edge and below the hub bar
    revokeAfterMs: 10 * 60 * 1000, // blob URL kept this long after its card closes (tap-to-open, re-download)
  },
};
