/*
 * Gamepad Controller — configuration.
 * Every tunable lives here: PeerJS pairing, buttons, message types, stick / D-pad
 * tuning, haptics, layout sizes, themes (colours) and all UI text.
 * controller_logic.js reads everything from CONTROLLER_CONFIG; controller.css only
 * holds structure + fallback theme values (overridden at runtime by themes[].vars).
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
    stickDecimals: 2,              // rounding of x / y in stick messages
  },
  messageType: 'btn',              // legacy alias of messages.btn

  // Keyboard
  keys: {
    connect: 'Enter',              // key in the code box that connects (KeyboardEvent.key)
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
    pressMs: 12,                   // button press pulse
    tickMs: 6,                     // softer tick when the stick enters a new direction sector
  },

  // Remembered user choices (localStorage keys)
  storage: {
    leftMode: 'jtsites-ctrl-leftmode',
    haptics: 'jtsites-ctrl-haptics',
    theme: 'jtsites-ctrl-theme',
  },

  // Debug: controller.html?demo=1 skips pairing, shows the pad and logs outgoing
  // messages to window.__ctrlOut (nothing is sent anywhere).
  demo: {
    param: 'demo',
    logLimit: 500,
  },

  // Browser features requested on first touch
  browser: {
    orientationLock: 'landscape',  // screen.orientation.lock(...) target
    wakeLockType: 'screen',        // navigator.wakeLock.request(...) type
    portraitQuery: '(orientation: portrait)', // shows the rotate overlay when it matches
  },

  // LED timing
  led: {
    errorBlinkMs: 900,             // brief blink on error
  },

  // Layout sizes -> CSS custom properties on <body> (any CSS length / expression)
  layout: {
    '--shoulder-w': 'min(24vw, 210px)',
    '--shoulder-h': 'min(13vh, 52px)',
    '--left-zone-w': '42vw',
    '--right-zone-w': '40vw',
    '--stick-base': 'min(34vh, 150px)',
    '--stick-knob': 'min(17vh, 72px)',
    '--dpad-size': 'min(36vh, 150px)',
    '--dpad-size-solo': 'min(52vh, 200px)',
    '--dpad-arm': '34%',            // arm thickness (fraction of D-pad size)
    '--face-size': 'min(16vh, 66px)',
    '--face-spread': 'min(15vh, 62px)', // distance from diamond centre to each face button centre
    '--sys-w': 'min(13vw, 58px)',
    '--sys-h': 'min(7vh, 26px)',
    '--home-size': 'min(13vh, 48px)',
    '--led-size': '10px',
    '--press-scale': '0.94',
  },

  // Themes. Colours are applied as CSS custom properties on <body> together with the
  // class "theme-<id>". Add another entry (plus optional CSS under body.theme-<id>) for new pads.
  defaultTheme: 'dark-gloss',
  themes: [
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
    modePrefix: 'mode-',
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
    error: 'Error',
    peerMissing: 'PeerJS missing',
    hubNotFound: 'Hub not found',
    hubNotFoundHint: 'Hub not found — check the code',
    invalidCode: 'Enter a valid code',
    genericError: 'error',         // shown when a peer error has no type
    modeLabels: { both: 'Both', stick: 'Stick', dpad: 'D-pad' },
    modeTitle: 'Left side: stick / D-pad / both',
    hapticsOn: 'Vibe on',
    hapticsOff: 'Vibe off',
    hapticsNA: 'No vibe',
    hapticsTitle: 'Haptic feedback',
    select: 'SELECT',
    start: 'START',
    demo: 'DEMO',
  },
};
