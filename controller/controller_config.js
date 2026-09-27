/*
 * D-Pad Controller — configuration.
 * PeerJS pairing, button names, touch tuning, browser options and status text.
 * controller_logic.js reads everything from CONTROLLER_CONFIG.
 * (Layout, sizes and colours of the pad itself live in controller.css.)
 */
const CONTROLLER_CONFIG = {
  // PeerJS pairing
  peer: {
    idPrefix: 'jtsites-',          // hub peer id = idPrefix + pairing code (must match hub-controller.js)
    options: { debug: 0 },         // options passed to new Peer(...)
    connectOptions: { reliable: true }, // options passed to peer.connect(...)
  },

  // Pairing code rules
  code: {
    minLength: 4,                  // shorter codes are rejected
    bareHashPattern: /^[A-Z0-9]{4,8}$/i, // a bare "#ABC123" hash (no "code=") is accepted if it matches
    hashParam: 'code',             // hash parameter holding the code: #code=ABC123
  },

  // Buttons. Each value is sent to the hub as the "b" field; the hub maps it to a key.
  // Must match the data-btn attributes in controller.html.
  buttons: ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'],

  // Message sent on press / release: { t: messageType, b: button, s: 1|0 }
  messageType: 'btn',

  // Keyboard
  keys: {
    connect: 'Enter',              // key in the code box that connects (KeyboardEvent.key)
  },

  // Touch / feedback tuning
  touch: {
    dpadDeadZone: 0.12,            // centre dead zone of the D-pad (fraction of its size from centre)
    vibrateMs: 15,                 // haptic pulse length on press
  },

  // Browser features requested on first touch
  browser: {
    orientationLock: 'landscape',  // screen.orientation.lock(...) target
    wakeLockType: 'screen',        // navigator.wakeLock.request(...) type
    portraitQuery: '(orientation: portrait)', // shows the rotate overlay when it matches
  },

  // CSS classes used by the logic
  classes: {
    active: 'active',              // pressed-button highlight
    dot: 'dot',                    // base class of the status dot
    activeSelector: '.dir.active, .face.active, .sys.active', // elements cleared on release-all
    boundButtons: '.face, .sys',   // buttons bound individually (D-pad dirs use sliding)
  },

  // Status / error text
  text: {
    connecting: 'Connecting…',
    connected: 'Connected',
    disconnected: 'Disconnected',
    error: 'Error',
    peerMissing: 'PeerJS missing',
    hubNotFound: 'Hub not found',
    hubNotFoundHint: 'Hub not found — check the code',
    invalidCode: 'Enter a valid code',
    genericError: 'error',         // shown when a peer error has no type
  },
};
