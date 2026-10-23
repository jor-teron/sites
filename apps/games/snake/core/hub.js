/**
 * Snake — hub bridge (optional; same protocol as Swell Foop / hub-gamebar.js, v:1).
 * Only active in a frame, after the hub's hello:
 *   game → hub  {type:'hub-ready'}                     on load
 *   hub → game  {type:'hub-hello'}                     → body.in-hub, reply hub-app
 *   game → hub  {type:'hub-app', app, stats, buttons}  Score / Best, New Game
 *   game → hub  {type:'hub-stat', id, value}           when Score / Best change
 *   hub → game  {type:'hub-action', id:'new'}          → new game
 *   game → hub  {type:'hub-rumble', ms}                on death (DIE_VIBRATE_MS) and on eating (EAT_VIBRATE_MS;
 *               an array is sent as pattern) → hub relays to the paired phone
 * Accepted only from window.parent with a same-origin / file:// origin.
 * Standalone the page is unchanged and keeps its own HUD.
 */
window.SN = window.SN || {};
(function () {
  'use strict';
  const G = SN.G, TX = SN.TX, APP = SN.APP;
  const HUB_V = 1;
  const IN_FRAME = (() => { try { return window.parent && window.parent !== window; } catch (_) { return true; } })();
  let hubLinked = false;
  const hubLastSent = {};

  function post(msg) {
    if (!IN_FRAME) return;
    try { window.parent.postMessage(Object.assign({ v: HUB_V }, msg), '*'); } catch (_) { /* ignore */ }
  }
  function originOk(origin) {
    return origin === location.origin || origin === 'null' || location.origin === 'null' ||
      String(origin).indexOf('file:') === 0;
  }
  function stats() {
    return [
      { id: 'score', label: TX.statScore || 'Score', value: G.score },
      { id: 'best', label: TX.statBest || 'Best', value: G.best },
    ];
  }
  function sendStats() {
    if (!hubLinked) return;
    stats().forEach((st) => {
      if (hubLastSent[st.id] === st.value) return;
      hubLastSent[st.id] = st.value;
      post({ type: 'hub-stat', id: st.id, value: st.value });
    });
  }
  function sendApp() {
    if (!hubLinked) return;
    const s = stats();
    s.forEach((st) => { hubLastSent[st.id] = st.value; });
    post({
      type: 'hub-app',
      app: { name: APP.name, version: APP.version },
      stats: s,
      buttons: [
        { id: 'new', label: TX.newGame || 'New Game' },
        { id: 'dpad', label: G.dpadOn ? (TX.hubDpadOn || 'D-pad: On') : (TX.hubDpadOff || 'D-pad: Off') },
      ],
    });
  }
  function rumble(v) {
    if (!hubLinked || !v) return;
    if (Array.isArray(v)) post({ type: 'hub-rumble', pattern: v.slice(0, 20) });
    else if (Number(v) > 0) post({ type: 'hub-rumble', ms: Number(v) });
  }
  function onMessage(e) {
    if (e.source !== window.parent || !originOk(e.origin)) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.v !== HUB_V) return;
    if (d.type === 'hub-hello') {
      if (!hubLinked) {
        hubLinked = true;
        document.body.classList.add('in-hub');
      }
      sendApp();
    } else if (d.type === 'hub-action' && hubLinked && d.id === 'new') {
      SN.game.newGame();
    } else if (d.type === 'hub-action' && hubLinked && d.id === 'dpad') {
      SN.touch.setDpad(!G.dpadOn);
    }
  }
  if (IN_FRAME) window.addEventListener('message', onMessage);

  SN.hub = { post, sendStats, sendApp, rumble, get linked() { return hubLinked; } };
})();
