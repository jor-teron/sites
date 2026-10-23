/*
 * ========================================================================
 * Ping Pong — ui/hub.js: the optional sites-hub bridge (header name / score / New Game / Customize).
 * Loaded after core/game.js (it calls resetMatch, fitCourt); the game calls hubSendStats,
 * hubSendApp, hubRumble and hubPost at run time.
 * ========================================================================
 */

/* ---------------------------------------------------------------------------
 * Hub bridge (optional; same protocol as Snake / Swell Foop / hub-gamebar.js, v:1).
 * Only active in a frame, after the hub's hello:
 *   game → hub  {type:'hub-ready'}                     on load
 *   hub → game  {type:'hub-hello'}                     → body.in-hub, reply hub-app
 *   game → hub  {type:'hub-app', app, stats, buttons}  You / CPU score, New Game
 *   game → hub  {type:'hub-stat', id, value}           when a score changes
 *   hub → game  {type:'hub-action', id:'new'}          → new match
 *   hub → game  {type:'hub-action', id:'customize'}    → open the Customize picker (themes, balls, paddles)
 *   game → hub  {type:'hub-rumble', ms | pattern}      every point (CFG.rumble.point)
 *               → the hub relays it to the paired phone controller
 * Accepted only from window.parent with a same-origin / file:// origin.
 * ------------------------------------------------------------------------- */
const HUB_V = 1;
const IN_FRAME = (function () { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();
let hubLinked = false;
const hubLastSent = {};

function hubPost(msg) {
  if (!IN_FRAME) return;
  try { window.parent.postMessage(Object.assign({ v: HUB_V }, msg), "*"); } catch (e) { /* ignore */ }
}

function hubOriginOk(origin) {
  return origin === location.origin || origin === "null" || location.origin === "null" ||
    String(origin).indexOf("file:") === 0;
}

function hubStats() {
  return [
    { id: "left", label: twoP ? (CFG.text.statP1 || "P1") : (CFG.text.statLeft || "You"), value: scoreL },
    { id: "right", label: twoP ? (CFG.text.statP2 || "P2") : (CFG.text.statRight || "CPU"), value: scoreR },
  ];
}

/** Header layout for the hub (also re-sent when You / CPU switch to P1 / P2). */
function hubSendApp() {
  const stats = hubStats();
  stats.forEach(function (st) { hubLastSent[st.id] = st.value; });
  hubPost({
    type: "hub-app",
    app: { name: APP.name, version: APP.version },
    stats: stats,
    buttons: [
      { id: "new", label: CFG.text.newGame || "New Game" },
      { id: "customize", label: CFG.text.customize || "Customize" },   // the floating Themes button is hidden in the hub
    ],
  });
}

/** Phone rumble via the hub (same as Snake / 2048): ms, or a pattern array; 0 = off. */
function hubRumble(v) {
  if (!hubLinked || !v) return;
  if (Array.isArray(v)) hubPost({ type: "hub-rumble", pattern: v.slice(0, 20) });
  else if (Number(v) > 0) hubPost({ type: "hub-rumble", ms: Number(v) });
}

function hubSendStats() {
  if (!hubLinked) return;
  hubStats().forEach(function (st) {
    if (hubLastSent[st.id] === st.value) return;
    hubLastSent[st.id] = st.value;
    hubPost({ type: "hub-stat", id: st.id, value: st.value });
  });
}

function onHubMessage(e) {
  if (e.source !== window.parent || !hubOriginOk(e.origin)) return;
  const d = e.data;
  if (!d || typeof d !== "object" || d.v !== HUB_V) return;
  if (d.type === "hub-hello") {
    if (!hubLinked) {
      hubLinked = true;
      document.body.classList.add("in-hub");
      fitCourt();
    }
    hubSendApp();
  } else if (d.type === "hub-action" && hubLinked && d.id === "new") {
    if (PP.pickerOpen && PP.pickerOpen()) PP.closePicker();   // a new match must not run behind the open panel
    resetMatch();
  } else if (d.type === "hub-action" && hubLinked && d.id === "customize") {
    if (PP.openPicker) PP.openPicker();     // same panel as the standalone Themes button (pauses a running match)
  }
}

if (IN_FRAME) window.addEventListener("message", onHubMessage);
