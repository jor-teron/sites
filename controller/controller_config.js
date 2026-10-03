/*
 * Gamepad Controller — configuration.
 * Every tunable lives here: PeerJS pairing, buttons, message types, stick / D-pad
 * tuning, haptics, layout sizes, themes (colours), controller modes (gamepad /
 * keyboards) and all UI text.
 * controller_logic.js reads everything from CONTROLLER_CONFIG; controller.css only
 * holds structure + fallback theme values (overridden at runtime by themes[].vars).
 */
const CONTROLLER_CONFIG = {
  version: '1.4',                  // shown small on the pairing screen

  // PeerJS pairing
  peer: {
    idPrefix: 'jtsites-',          // hub peer id = idPrefix + pairing code (must match hub-controller.js)
    options: { debug: 0 },         // options passed to new Peer(...)
    connectOptions: { reliable: true }, // options passed to peer.connect(...)
  },

  // Auto-reconnect (hub reloaded, Wi-Fi blip, phone page reloaded). The LED is amber while
  // trying; tap the LED to retry at once. A code that never connected is not retried
  // (a mistyped code shows "Hub not found" instead).
  reconnect: {
    enabled: true,
    delaysMs: [1000, 2000, 3000, 5000, 8000, 10000], // backoff; the last value repeats
    giveUpMs: 5 * 60 * 1000,       // stop trying after this long without success (0 = never)
    attemptTimeoutMs: 15000,       // an attempt that neither opens nor fails within this is retried
    autoConnectOnLoad: true,       // page (re)load: connect to the last code automatically
  },

  // Pairing code rules
  code: {
    minLength: 4,                  // shorter codes are rejected
    maxLength: 8,                  // input maxlength
    bareHashPattern: /^[A-Z0-9]{4,8}$/i, // a bare "#ABC123" hash (no "code=") is accepted if it matches
    hashParam: 'code',             // hash parameter holding the code: #code=ABC123
  },

  // Buttons. Each value is sent to the hub as the "b" field; the hub maps it to a key
  // (see BTN_MAP in ../hub-controller.js). Must match data-btn attributes in controller.html.
  //   up/down/left/right -> Arrow keys, a -> Space, b -> x, x -> z, y -> c,
  //   l -> q, r -> e, start -> Enter, select -> Escape, home -> (no key, postMessage only)
  buttons: ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r', 'start', 'select', 'home'],

  // Message types (all messages are JSON strings)
  messages: {
    btn: 'btn',                    // { t:'btn', b:<button>, s:1|0 }  press / release (original protocol)
    stick: 'stick',                // { t:'stick', x:-1..1, y:-1..1 } analog stick (y: -1 up, +1 down)
    rumble: 'rumble',              // hub → phone { t:'rumble', ms:N | pattern:[...] } game rumble
    key: 'key',                    // keyboard modes: { t:'key', key:'a', code:'KeyA', s:1|0,
                                   //   shift:0|1, ctrl:0|1, alt:0|1, repeat:0|1 }  keydown / keyup
    stickDecimals: 2,              // rounding of x / y in stick messages
  },
  messageType: 'btn',              // legacy alias of messages.btn

  // Keyboard
  keys: {
    connect: 'Enter',              // key in the code box that connects (KeyboardEvent.key)
  },

  // Controller modes, cycled by the round mode button at the top centre.
  // One entry + one file adds a mode: 'board' names a keyboard registered by a script
  // (kb_pc.js → CTRL_KB.register('pc', ...)); the 'pad' entry is the built-in gamepad.
  //   landscape: true → portrait shows the "rotate" overlay (the mode button stays usable).
  modes: [
    { id: 'pad',   label: 'Gamepad',        icon: '🎮', landscape: true },
    { id: 'pc',    label: 'PC keyboard',    icon: '⌨️', landscape: true,  board: 'pc' },
    { id: 'phone', label: 'Phone keyboard', icon: '📱', landscape: false, board: 'phone' },
  ],
  defaultMode: 'pad',

  // Mode button gestures
  modeButton: {
    longPressMs: 500,              // hold this long → menu (modes, fullscreen, light / dark)
    swipePx: 24,                   // horizontal swipe on the button: left = previous, right = next
    toastMs: 1000,                 // mode name toast after a change
  },

  // Keyboard modes (kb_common.js)
  keyboard: {
    repeatDelayMs: 450,            // hold a key this long → auto-repeat keydown (repeat:1)
    repeatMs: 60,                  // auto-repeat interval
    repeatKeys: true,              // false: no auto-repeat at all
    hapticMs: 12,                  // tick on every key press (Vib toggle respected)
    // PC keyboard: keys with a thin accent border (gaming keys). Values are data-key
    // ('w', 'ArrowUp', ' ' = Space, 'Enter', 'Escape') or a modifier ('shift').
    // [] = no highlight.
    highlightKeys: ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Escape', 'shift'],
  },

  // Left-side control mode: analog stick, D-pad, or both
  leftModes: ['both', 'stick', 'dpad'], // order the toggle cycles through
  defaultLeftMode: 'both',

  // Floating analog stick
  stick: {
    deadZone: 0.15,                // radial dead zone (fraction of full travel); output rescaled beyond it
    travel: 0.5,                   // max knob travel = travel * base diameter (px computed at runtime)
    sendHz: 40,                    // analog message rate while the stick is held / moving
    dpadThreshold: 0.5,            // magnitude at which the stick starts emulating D-pad arrows
    dpadRelease: 0.4,              // magnitude below which emulated arrows release (hysteresis)
    diagonals: true,               // 8 sectors (diagonal = two arrows) instead of 4
    restX: 0.34,                   // resting centre of the (ghost) stick, fraction of the left zone ('both' mode)
    restY: 0.36,
    restXSolo: 0.5,                // resting centre in 'stick'-only mode
    restYSolo: 0.5,
    keepInZone: true,              // clamp a new stick centre so the base stays inside the left zone
  },

  // D-pad
  dpad: {
    deadZone: 0.14,                // centre dead zone (fraction of D-pad size from centre)
    diagonals: true,               // corners press two arrows
  },

  // Haptics (navigator.vibrate — not available on iOS Safari; visual flash is always shown)
  haptics: {
    enabled: true,                 // default on/off (user toggle is remembered)
    shortMs: 50,                   // SHORT pulse: stick / D-pad slides into a new direction (tick)
    longMs: 100,                   // LONG pulse: a button is pressed (press)
    rumbleMaxMs: 5000,             // game rumble from the hub: longest single pulse / pattern step
    rumbleMaxSteps: 20,            // game rumble pattern: max steps
    rumbleWins: true,              // while a game rumble runs, button / D-pad taps do not vibrate
                                   // (a new navigator.vibrate call cancels the running one)
  },

  // Vibration diagnostics panel (hold menu of the mode button, Diag link on the pairing screen)
  diag: {
    enabled: true,                 // false hides the Diag menu item / link
    testMs: 250,                   // "Test" button: navigator.vibrate(testMs), ignores the Vib toggle
    refreshMs: 1000,               // panel refresh while open (userActivation can change)
  },

  // Built-in QR scanner (camera overlay; decodes with the local vendor/jsQR.js)
  qrScanner: {
    icon: 'controller_qr_icon.png', // button icon (relative to controller.html)
    facingMode: 'environment',     // back camera
    idealWidth: 1280,              // camera resolution hint
    scanWidth: 480,                // frames are downscaled to this width before decoding
    scanEveryMs: 120,              // decode interval
    inversionAttempts: 'attemptBoth', // jsQR option: 'dontInvert' | 'onlyInvert' | 'attemptBoth'
    useBarcodeDetector: false,     // true: try the browser's BarcodeDetector first (jsQR is always the fallback)
  },

  // Remembered user choices (localStorage keys)
  storage: {
    leftMode: 'jtsites-ctrl-leftmode',
    haptics: 'jtsites-ctrl-haptics',
    theme: 'jtsites-ctrl-theme',
    lastCode: 'jtsites-ctrl-lastcode', // last pairing code that connected (auto-connect on load)
    mode: 'jtsites-ctrl-mode',     // last controller mode (pad / pc / phone)
  },

  // Debug: controller.html?demo=1 skips pairing, shows the pad and logs outgoing
  // messages to window.__ctrlOut (nothing is sent anywhere).
  demo: {
    param: 'demo',
    logLimit: 500,
  },

  // Browser features requested on touch
  browser: {
    autoFullscreen: true,          // try fullscreen on touch (retried until it works; stops once
                                   // the user leaves fullscreen with the ⛶ button / menu)
    fullscreenIcon: '⛶',           // ⛶ button glyph: not fullscreen
    fullscreenExitIcon: '⊡',        // ⛶ button glyph: fullscreen (tap to leave)
    orientationLock: 'landscape',  // screen.orientation.lock(...) target (landscape modes)
    wakeLockType: 'screen',        // navigator.wakeLock.request(...) type
    portraitQuery: '(orientation: portrait)', // shows the rotate overlay when it matches
  },

  // LED timing
  led: {
    errorBlinkMs: 900,             // brief blink on error
  },

  // Layout sizes -> CSS custom properties on <body> (any CSS length / expression).
  // Heights use dvh (dynamic viewport: excludes the browser address bar); browsers without
  // dvh get the same value with vh (controller_logic.js applyLayout swaps the unit).
  // Sized so nothing overlaps on a ~360 px tall landscape phone.
  layout: {
    '--shoulder-w': 'min(24vw, 210px)',
    '--shoulder-h': 'min(15dvh, 58px)',
    '--left-zone-w': '42vw',
    '--right-zone-w': '40vw',
    '--stick-base': 'min(50dvh, 185px)',
    '--stick-knob': 'min(24dvh, 88px)',
    '--dpad-size': 'min(50dvh, 185px)',
    '--dpad-size-solo': 'min(64dvh, 245px)',
    '--dpad-arm': '34%',            // arm thickness (fraction of D-pad size)
    '--face-size': 'min(21dvh, 80px)',
    '--face-spread': 'min(23dvh, 86px)', // distance from diamond centre to each face button centre
    '--sys-w': 'min(13vw, 58px)',
    '--sys-h': 'min(7.5dvh, 28px)',
    '--home-size': 'min(13dvh, 48px)',
    '--led-size': '10px',
    '--press-scale': '0.94',
    '--mode-btn': '28px',           // round mode button (top centre, every mode)
    '--kb-tab-h': '30px',           // keyboards: strip reserved at the top for the mode button
  },

  // Themes. Colours are applied as CSS custom properties on <body> together with the
  // class "theme-<id>". Add another entry (plus optional CSS under body.theme-<id>) for new pads.
  // The Light / Dark toggle (mode button menu) switches between lightTheme and darkTheme;
  // the choice is remembered (storage.theme).
  defaultTheme: 'light',
  lightTheme: 'light',
  darkTheme: 'dark-gloss',
  themes: [
    {
      id: 'light',
      label: 'Light',
      vars: {
        '--bg-1': '#f7f8fa',
        '--bg-2': '#dde1e7',
        '--text': '#1d232b',
        '--muted': '#5d6672',
        '--accent': '#2563d9',
        '--btn-1': '#ffffff',
        '--btn-2': '#e9ecf0',
        '--btn-rim': '#c2c8d0',
        '--btn-hi': 'rgba(255,255,255,0.9)',
        '--shadow': 'rgba(40,52,72,0.22)',
        '--glyph': '#2a313b',
        '--glow': 'rgba(37,99,217,0.35)',
        '--a': '#14955a',
        '--b': '#d6283c',
        '--x': '#2563d9',
        '--y': '#c08a00',
        '--stick-ring': 'rgba(30,40,60,0.16)',
        '--stick-ghost': 'rgba(30,40,60,0.05)',
        '--led-off': '#ecc9cc',
        '--led-red': '#e5262f',
        '--led-amber': '#f08c00',
        '--led-green': '#10b358',
        '--panel': 'rgba(255,255,255,0.94)',
      },
    },
    {
      id: 'dark-gloss',
      label: 'Dark Gloss',
      vars: {
        '--bg-1': '#1b1f27',          // body gradient (centre)
        '--bg-2': '#07080b',          // body gradient (edges)
        '--text': '#e8eaed',
        '--muted': '#8a919c',
        '--accent': '#6ea8fe',
        '--btn-1': '#3a404b',         // glossy button gradient (top)
        '--btn-2': '#15181e',         // glossy button gradient (bottom)
        '--btn-rim': '#4a515e',
        '--btn-hi': 'rgba(255,255,255,0.22)', // inner highlight
        '--shadow': 'rgba(0,0,0,0.65)',
        '--glyph': '#c9d1dc',
        '--glow': 'rgba(110,168,254,0.55)',
        '--a': '#3ddc84',
        '--b': '#ff4d5e',
        '--x': '#3d8bff',
        '--y': '#ffc93d',
        '--stick-ring': 'rgba(255,255,255,0.10)',
        '--stick-ghost': 'rgba(255,255,255,0.05)',
        '--led-off': '#3a0d10',
        '--led-red': '#ff3b3b',
        '--led-amber': '#ffb020',
        '--led-green': '#2bff88',
        '--panel': 'rgba(24,27,34,0.85)',
      },
    },
  ],

  // CSS classes used by the logic
  classes: {
    active: 'active',              // pressed-button highlight
    flash: 'flash',                // visual press flash (always; the haptic fallback)
    stickActive: 'stick-active',
    themePrefix: 'theme-',
    modePrefix: 'mode-',           // left-side mode (both / stick / dpad)
    viewPrefix: 'view-',           // controller mode (pad / pc / phone) on <body>
  },

  // UI / status text
  text: {
    title: 'Gamepad',
    hint: 'Enter the pairing code shown on the hub',
    placeholder: 'CODE',
    connectBtn: 'Connect',
    rotate: 'Rotate your phone to landscape',
    connecting: 'Connecting…',
    connected: 'Connected',
    disconnected: 'Disconnected — tap the light to reconnect',
    reconnecting: 'Reconnecting… (tap the light to retry now)',
    error: 'Error',
    peerMissing: 'PeerJS missing',
    hubNotFound: 'Hub not found',
    hubNotFoundHint: 'Hub not found — check the code',
    invalidCode: 'Enter a valid code',
    genericError: 'error',         // shown when a peer error has no type
    modeLabels: { both: 'Both', stick: 'Stick', dpad: 'D-pad' },
    modeTitle: 'Left side: stick / D-pad / both',
    hapticsOn: 'Vib on',
    hapticsOff: 'Vib off',
    hapticsNA: 'No vibe',
    hapticsTitle: 'Haptic feedback',
    diagBtn: 'Diag',
    diagTitle: 'Vibration diagnostics',
    diagTest: 'Test {ms} ms',
    diagYes: 'yes',
    diagNo: 'no',
    diagNone: '—',
    diagNA: 'n/a',
    select: 'SELECT',
    start: 'START',
    demo: 'DEMO',
    scanBtn: 'Scan QR',            // pairing screen button
    scanTitle: 'Scan the QR code on the hub',
    scanStarting: 'Starting camera…',
    scanLooking: 'Point the camera at the hub QR code',
    scanFound: 'Code found: {code}',
    scanNotController: 'That QR code is not a hub pairing code',
    scanInsecure: 'Camera needs a secure (https) page — type the code instead',
    scanNoCamera: 'No camera found — type the code instead',
    scanDenied: 'Camera permission denied — allow it or type the code instead',
    scanError: 'Camera error — type the code instead',
    scanUnavailable: 'QR decoder missing — type the code instead',
    scanCancel: 'Cancel',
    scanTypeCode: 'Type code',
    scanIconAlt: 'Scan QR',
    modeBtnTitle: 'Mode: tap = next, swipe = prev / next, hold = menu',
    menuModes: 'Mode',
    menuFullscreen: 'Fullscreen',
    menuExitFullscreen: 'Exit fullscreen',
    menuDark: 'Dark theme',
    menuLight: 'Light theme',
    fullscreenTitle: 'Fullscreen',
    menuDiag: 'Vibration test (Diag)',
    themeChipToDark: '☾',          // theme chip on the pad while light (tap → dark)
    themeChipToLight: '☀',         // theme chip on the pad while dark (tap → light)
    themeChipTitle: 'Light / dark theme',
  },
};
