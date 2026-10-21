/* Neon Raid — input: keyboard, on-screen touch bar, Gamepad API, hub D-pad postMessage. */

/* ---------- input ---------- */

/**
 * Held codes per source. keys[] is the OR of every source, so keyboard, touch,
 * a gamepad and the hub controller can be down at the same time.
 *   board — physical / synthetic keyboard
 *   touch — on-screen buttons
 *   pad   — Gamepad API (rewritten each frame)
 *   hub   — hub-dpad / hub-key postMessage
 *   stick — hub-stick postMessage (separate so a recenter does not drop the d-pad)
 */
var hold = { board: {}, touch: {}, pad: {}, hub: {}, stick: {} };
var HOLD_SOURCES = ["board", "touch", "pad", "hub", "stick"];

/** Key state map. Gameplay reads this and nothing else. */
var keys = {};

/** Last screen action, so the hub's follow-up message for that same code does not repeat it. */
var edgeStamp = 0;
var edgeCode = "";

/** Previous Start / Select so gamepad edges fire once per press. */
var padWas = { start: false, select: false };

/**
 * True if the event's code or key is in the list.
 * @param {string[]} list
 * @param {KeyboardEvent} e
 */
function keyIn(list, e) {
  return list.indexOf(e.code) >= 0 || list.indexOf(e.key) >= 0;
}

/**
 * True if a code or key name is in the list.
 * @param {string[]} list
 * @param {string} code
 * @param {string} key
 */
function codeIn(list, code, key) {
  return (code && list.indexOf(code) >= 0) || (key && list.indexOf(key) >= 0);
}

/** Recompute one code from every source. */
function refreshKey(code) {
  if (!code) return;
  var down = false;
  for (var i = 0; i < HOLD_SOURCES.length; i++) {
    if (hold[HOLD_SOURCES[i]][code]) down = true;
  }
  keys[code] = down;
}

/**
 * Set or clear one source. Other sources that still hold the code keep it down.
 * @param {string} source
 * @param {string} code
 * @param {boolean} down
 */
function setHold(source, code, down) {
  if (!code || !hold[source]) return;
  if (down) hold[source][code] = true;
  else delete hold[source][code];
  refreshKey(code);
}

/** Forget every held key (focus lost / screen change: the keyup may never arrive). */
function clearKeys() {
  var s, code, i;
  for (s in hold) {
    for (code in hold[s]) delete hold[s][code];
  }
  for (code in keys) keys[code] = false;
  var nodes = document.querySelectorAll("#touch [data-code]");
  for (i = 0; i < nodes.length; i++) {
    nodes[i]._ptrs = {};
    nodes[i].classList.remove("held");
  }
}

/** True while the start menu / end overlay is on screen. */
function isShown(id) {
  return !document.getElementById(id).classList.contains("hidden");
}

/**
 * Remember that a screen action just ran for this code.
 * The hub posts hub-dpad / hub-key just after it dispatches the same key.
 * @param {string} code
 */
function markEdge(code) {
  edgeCode = code || "";
  edgeStamp = Date.now();
}

/**
 * True when this code's screen action already ran (keyboard, then the hub message).
 * @param {string} code
 */
function edgeTaken(code) {
  return !!code && code === edgeCode && Date.now() - edgeStamp < 120;
}

/**
 * Menu / end-screen / pause action for a code (keyboard, gamepad Start, or hub).
 * @param {string} code
 * @param {string} key
 * @return {boolean} true if a screen changed
 */
function runScreenAction(code, key) {
  var acted = false;
  if (isShown("menu")) {
    if (codeIn(CFG.keys.start, code, key)) { startGame(); acted = true; }
  } else if (isShown("overlay")) {
    if (codeIn(CFG.keys.start, code, key)) { startGame(); acted = true; }
    else if (codeIn(CFG.keys.menu, code, key)) { showMenu(); acted = true; }
  } else if (state && (state.running || state.paused)) {
    if (codeIn(CFG.keys.pause, code, key)) { togglePause(); acted = true; }
    else if (codeIn(CFG.keys.menu, code, key)) { showMenu(); acted = true; }
  }
  if (acted) markEdge(code);
  return acted;
}

/**
 * Menu / end-screen / pause keys (Enter / Space / Escape).
 * @param {KeyboardEvent} e
 */
function onScreenKey(e) {
  if (runScreenAction(e.code, e.key)) e.preventDefault();
}

/**
 * Bind keyboard listeners.
 */
function bindInput() {
  window.addEventListener("keydown", function (e) {
    if (!e.repeat) {
      var before = isShown("menu") || isShown("overlay");
      onScreenKey(e);
      // the key that started a match must not also jump / fire
      if (before && !(isShown("menu") || isShown("overlay"))) return;
    }
    if (e.code) setHold("board", e.code, true);
    if (e.key && e.key !== e.code) keys[e.key] = true;
    if (keyIn(CFG.keys.preventDefault, e)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", function (e) {
    if (e.code) setHold("board", e.code, false);
    if (e.key && e.key !== e.code) keys[e.key] = false;
  });
  window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", function () { if (document.hidden) clearKeys(); });
}

/**
 * True if any listed code is down.
 * @param {string[]} codes
 */
function keyAny(codes) {
  for (var i = 0; i < codes.length; i++) {
    if (keys[codes[i]]) return true;
  }
  return false;
}

/** Lock gestures while a match is running or paused. The menu can still scroll inside itself. */
function syncChrome() {
  document.body.classList.toggle("playing", !!(state && (state.running || state.paused)));
}

/**
 * Show the on-screen pad on touch devices only (coarse pointer or a touch screen).
 */
function detectTouch() {
  var mq = window.matchMedia("(pointer: coarse)");
  function apply() {
    var on = mq.matches || (navigator.maxTouchPoints || 0) > 0;
    document.body.classList.toggle("touch-device", !!on);
  }
  apply();
  if (mq.addEventListener) mq.addEventListener("change", apply);
  else if (mq.addListener) mq.addListener(apply);
}

/**
 * Hold an on-screen button for as long as its own pointer is down.
 * Each button tracks pointer ids, so left + jump + fire work together.
 * @param {HTMLElement} el
 */
function bindHold(el) {
  var code = el.getAttribute("data-code");
  el._ptrs = {};
  function down(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    el._ptrs[e.pointerId] = true;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    setHold("touch", code, true);
    el.classList.add("held");
  }
  function up(e) {
    if (!el._ptrs) return;
    delete el._ptrs[e.pointerId];
    var any = false;
    for (var id in el._ptrs) any = true;
    if (!any) {
      setHold("touch", code, false);
      el.classList.remove("held");
    }
  }
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("lostpointercapture", up);
}

/** One-shot on-screen button (pause / menu). */
function bindTap(el, fn) {
  el.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    fn();
  });
}

/**
 * On-screen controls write the same codes the keyboard uses.
 * Scroll, pinch-zoom and the long-press menu are cancelled while playing.
 */
function bindTouch() {
  var holds = document.querySelectorAll("#touch [data-code]");
  var i;
  for (i = 0; i < holds.length; i++) bindHold(holds[i]);
  bindTap(document.getElementById("tPause"), function () {
    if (state && (state.running || state.paused)) togglePause();
  });
  bindTap(document.getElementById("tMenu"), function () {
    if (isShown("overlay") || (state && (state.running || state.paused))) showMenu();
  });
  document.addEventListener("touchmove", function (e) {
    var onPad = e.target && e.target.closest && e.target.closest("#touch");
    if (onPad || (state && (state.running || state.paused))) e.preventDefault();
  }, { passive: false });
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.addEventListener("contextmenu", function (e) {
    var t = e.target;
    var onGame = t && t.closest && (t.closest("#touch") || t.closest("#frame"));
    if (onGame || (state && (state.running || state.paused))) e.preventDefault();
  });
}

/**
 * First connected standard gamepad, or null.
 */
function readPad() {
  if (!navigator.getGamepads) return null;
  var list;
  try { list = navigator.getGamepads(); } catch (err) { return null; }
  if (!list) return null;
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].connected) return list[i];
  }
  return null;
}

/**
 * @param {Gamepad} pad
 * @param {number} index
 */
function padPressed(pad, index) {
  var b = pad.buttons && pad.buttons[index];
  return !!(b && (b.pressed || b.value > 0.5));
}

/**
 * Sample the Gamepad API once per frame onto the keyboard codes.
 * D-pad / left stick move, stick or d-pad up jumps, A jumps, B / X fire, Start pauses.
 */
function pollGamepad() {
  var pad = readPad();
  var dz = (CFG.gamepad && CFG.gamepad.deadzone) || 0.4;
  var left = false, right = false, up = false;
  var a = false, b = false, x = false, start = false, select = false;
  if (pad) {
    var ax = pad.axes && pad.axes.length > 0 ? pad.axes[0] : 0;
    var ay = pad.axes && pad.axes.length > 1 ? pad.axes[1] : 0;
    left = ax < -dz || padPressed(pad, 14);
    right = ax > dz || padPressed(pad, 15);
    up = ay < -dz || padPressed(pad, 12);
    a = padPressed(pad, 0);
    b = padPressed(pad, 1);
    x = padPressed(pad, 2);
    start = padPressed(pad, 9);
    select = padPressed(pad, 8);
  }
  setHold("pad", "ArrowLeft", left);
  setHold("pad", "ArrowRight", right);
  setHold("pad", "ArrowUp", up);
  setHold("pad", "Space", a);
  setHold("pad", "KeyX", b);
  setHold("pad", "KeyZ", x);
  if (start && !padWas.start) runScreenAction("Enter", "Enter");
  if (select && !padWas.select) runScreenAction("Escape", "Escape");
  padWas.start = start;
  padWas.select = select;
}

/**
 * Hub phone controller button name → keyboard code.
 * Same map the hub injects as KeyboardEvents (hub/controller/hub-controller.js).
 */
var HUB_BTN = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  a: "Space",
  b: "KeyX",
  x: "KeyZ",
  y: "KeyC",
  l: "KeyQ",
  r: "KeyE",
  start: "Enter",
  select: "Escape"
};

/**
 * Apply one hub button / key. The hub also dispatches a KeyboardEvent before this
 * message; edgeTaken() keeps Start / Select / A from firing twice. A press that
 * leaves the menu is not held, so it does not immediately jump.
 * @param {string} code
 * @param {boolean} down
 */
function onHubCode(code, down) {
  if (!code) return;
  if (!down) {
    setHold("hub", code, false);
    return;
  }
  var alias = code === "Space" ? " " : code;
  if (edgeTaken(code)) {
    if (!hold.board[code]) return;
    setHold("hub", code, true);
    return;
  }
  var before = isShown("menu") || isShown("overlay");
  runScreenAction(code, alias);
  if (before && !(isShown("menu") || isShown("overlay"))) return;
  setHold("hub", code, true);
}

/**
 * Hub D-pad postMessage path. Same-origin parent only.
 *   {type:'hub-dpad', b, s:1|0}   buttons
 *   {type:'hub-stick', x, y}      left stick, -1..1 (up is negative)
 *   {type:'hub-key', code, key, s} keyboard mode
 */
function onHubMessage(e) {
  if (e.source !== window.parent) return;
  var originOk = e.origin === location.origin || e.origin === "null" || location.origin === "null" ||
    String(e.origin).indexOf("file:") === 0;
  if (!originOk) return;
  var d = e.data;
  if (!d || typeof d !== "object") return;
  if (d.type === "hub-dpad") {
    onHubCode(HUB_BTN[d.b], !!d.s);
    return;
  }
  if (d.type === "hub-key") {
    onHubCode(d.code || d.key, !!d.s);
    return;
  }
  if (d.type === "hub-stick") {
    var x = Number(d.x), y = Number(d.y);
    if (!isFinite(x) || !isFinite(y)) return;
    var dz = (CFG.gamepad && CFG.gamepad.deadzone) || 0.4;
    setHold("stick", "ArrowLeft", x < -dz);
    setHold("stick", "ArrowRight", x > dz);
    setHold("stick", "ArrowUp", y < -dz);
  }
}

/** Listen for the hub controller. Keyboard forwarding from the hub keeps working too. */
function bindHub() {
  window.addEventListener("message", onHubMessage);
}
