/*
  File: core/hub.js
  Project: Demolisher
  Purpose: Sites hub bridge: postMessage stats, buttons, controller stick, rumble.
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: state.js .. input.js.
*/

'use strict';

/* ============================================================
   HUB BRIDGE
   ============================================================ */
/*
  Optional; same protocol as Snake / 2048 / hub-gamebar.js (v:1). Only in a frame:
    game → hub  {type:'hub-ready'}                     on load
    hub → game  {type:'hub-hello'}                     → body.in-hub, reply hub-app
    game → hub  {type:'hub-app', app, stats, buttons}  HP / Score / Targets|Enemies;
                                                       New Game / Mode / Weapon
    game → hub  {type:'hub-stat', id, value}           on change
    hub → game  {type:'hub-action', id:'new'|'mode'|'weapon'}
    game → hub  {type:'hub-rumble', ms | pattern}      CFG.rumble events
    hub → game  {type:'hub-stick', x, y}               analog stick → aim
  Accepted only from window.parent with a same-origin / file:// origin.
*/
const HUB_V = 1;
const IN_FRAME = (() => { try { return window.parent && window.parent !== window; } catch (_) { return true; } })();
let hubLinked = false;
const hubLastSent = {};
let lastRumbleAt = 0;
function hubPost(msg) {
  if (!IN_FRAME) return;
  try { window.parent.postMessage(Object.assign({ v: HUB_V }, msg), '*'); } catch (_) { /* ignore */ }
}
function hubOriginOk(origin) {
  return origin === location.origin || origin === 'null' || location.origin === 'null' ||
    String(origin).indexOf('file:') === 0;
}
function hubStats() {
  const mission = currentMode !== 'sandbox';
  return [
    { id: 'hp', label: TX.statHp, value: player ? Math.max(0, Math.floor(player.hp)) : MAX_HP },
    { id: 'score', label: TX.statScore, value: score },
    { id: 'obj', label: mission ? TX.statTargets : TX.statEnemies, value: mission ? targetsLeft() : enemiesLeft() },
  ];
}
function hubSendStats() {
  if (!hubLinked) return;
  hubStats().forEach((st) => {
    if (hubLastSent[st.id] === st.value) return;
    hubLastSent[st.id] = st.value;
    hubPost({ type: 'hub-stat', id: st.id, value: st.value });
  });
}
function hubSendApp() {
  if (!hubLinked) return;
  const stats = hubStats();
  stats.forEach((st) => { hubLastSent[st.id] = st.value; });
  hubPost({
    type: 'hub-app',
    app: { name: APP.name, version: APP.version },
    stats: stats,
    buttons: [
      { id: 'new', label: TX.newGame },
      { id: 'mode', label: fmt(TX.modeBtn, { mode: currentMode === 'level' ? fmt(TX.modeLevel, { n: SEED.pad2(levelNo) }) : currentMode === 'mission' ? (TX.modeMission || TX.mission) : (TX.modeSandbox || TX.sandbox) }) },
      { id: 'weapon', label: fmt(TX.weaponBtn, { weapon: WEAPONS[currentWeapon].label || currentWeapon }) },
    ],
  });
}
/* Phone rumble via the hub: ms or a pattern; 0 / empty = off. Short buzzes are
   throttled (50 ms) so auto-fire kills do not flood the link. */
function hubRumble(v) {
  if (!hubLinked || !v) return;
  const now = performance.now();
  if (!Array.isArray(v) && now - lastRumbleAt < 50) return;
  lastRumbleAt = now;
  if (Array.isArray(v)) hubPost({ type: 'hub-rumble', pattern: v.slice(0, 20) });
  else if (Number(v) > 0) hubPost({ type: 'hub-rumble', ms: Number(v) });
}
function onHubMessage(e) {
  if (e.source !== window.parent || !hubOriginOk(e.origin)) return;
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  if (d.type === 'hub-stick') {                     // no v field on this one
    const x = Number(d.x), y = Number(d.y);
    if (isFinite(x) && isFinite(y)) { hubStick.x = x; hubStick.y = y; }
    return;
  }
  if (d.v !== HUB_V) return;
  if (d.type === 'hub-hello') {
    if (!hubLinked) {
      hubLinked = true;
      document.body.classList.add('in-hub');        // own top bar + RESET hidden
      requestAnimationFrame(resize);
    }
    hubSendApp();
  } else if (d.type === 'hub-action' && hubLinked) {
    if (d.id === 'new') newGame();
    else if (d.id === 'mode') cycleMode();
    else if (d.id === 'weapon') nextWeapon();
  }
}
if (IN_FRAME) window.addEventListener('message', onHubMessage);
