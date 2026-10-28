/* Intercom IC1 — talk engine (audio only).
   Talk: tap the Talk button → getUserMedia(audio) → ICPeer.call(id, mic, {kind:'talk', sid, all}) to every
     target (everyone not on Do Not Disturb, or the one picked device) + signal {t:'talk', on:true, sid, all}.
     Tap again (or release after holding > 0.5 s, or 2 min max) → {t:'talk', on:false, sid} and the calls close.
   Hear: an incoming talk call is answered receive-only; its audio stays muted while a short two-note chime
     plays (~0.45 s), then it is heard at the chosen volume. Several people can talk at once (mixed).
     Do Not Disturb: the call is closed and the talker gets {t:'dnd'}. Two-way: "Reply" on the banner talks
     straight back to that device; both directions are live at the same time (full duplex). */
(function () {
  'use strict';
  var T = {}, cb = {}, MAXMS = 120000, CHIME_MS = 450;
  var sess = null, talkers = {}, actx = null;
  T.on = function (n, f) { (cb[n] = cb[n] || []).push(f); };
  function fire(n, a, b) { (cb[n] || []).forEach(function (f) { try { f(a, b); } catch (e) { console.warn(e); } }); }
  function rid() { return Math.random().toString(36).slice(2, 10); }
  function nameOf(id) { var d = ICPeer.roster().filter(function (x) { return x.id === id; })[0]; return d ? d.name || 'Device' : 'Someone'; }

  /* ---------- sound ---------- */
  function audioCtx() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended' && actx.resume) actx.resume(); } catch (_) { actx = null; } return actx; }
  T.unlock = function () {
    audioCtx();
    Object.keys(talkers).forEach(function (id) { var t = talkers[id]; if (t.el && t.el.paused) t.el.play().catch(function () {}); });
    fire('blocked', false);
  };
  T.soundOk = function () { return !!(actx && actx.state === 'running'); };
  function chime(up) {   // two short sine notes; up = incoming (660→990), else outgoing "on air" (990→660)
    if (!ICSave.get('chime') || !audioCtx()) return 0;
    var v = 0.25 * ICSave.get('volume'), t = actx.currentTime;
    (up ? [660, 990] : [990, 660]).forEach(function (f, i) {
      var o = actx.createOscillator(), g = actx.createGain(), s = t + i * 0.2;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(v, s + 0.02); g.gain.exponentialRampToValueAtTime(0.001, s + 0.22);
      o.connect(g); g.connect(actx.destination); o.start(s); o.stop(s + 0.24);
    });
    T._chimes = (T._chimes || 0) + 1;   // test hook
    return CHIME_MS;
  }
  T.setVolume = function (v) {
    ICSave.set('volume', v);
    Object.keys(talkers).forEach(function (id) { if (talkers[id].el) talkers[id].el.volume = v; });
  };

  /* ---------- talk (outgoing) ---------- */
  function friendly(e) {
    var n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'The microphone is blocked. Allow it for this site in the browser settings, then try again.';
    if (n === 'NotFoundError') return 'No microphone was found on this device.';
    if (n === 'NotReadableError') return 'The microphone is being used by another app. Close it and try again.';
    if (n === 'NoMedia') return 'This browser cannot use the microphone here. Open the page over https or in a newer browser.';
    return 'Could not start the microphone' + (e && e.message ? ': ' + e.message : '.');
  }
  function mic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error(friendly({ name: 'NoMedia' })));
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
      .catch(function (e) { throw new Error(friendly(e)); });
  }
  T.start = function (target) {   // target: 'all' or a peer id
    if (sess) return Promise.resolve(sess);
    audioCtx();
    if (!ICPeer.online()) return Promise.reject(new Error('Not connected yet. Check the Hub code, then try again.'));
    var all = target === 'all', list = ICPeer.roster();
    var ids;
    if (all) {
      ids = list.filter(function (d) { return !d.dnd; }).map(function (d) { return d.id; });
      if (!list.length) return Promise.reject(new Error('No other devices are online on this code.'));
      if (!ids.length) return Promise.reject(new Error('Every other device has Do Not Disturb on.'));
    } else {
      var d = list.filter(function (x) { return x.id === target; })[0];
      if (!d) return Promise.reject(new Error('That device is not online any more.'));
      if (d.dnd) return Promise.reject(new Error(d.name + ' has Do Not Disturb on.'));
      ids = [target];
    }
    var s = sess = { sid: rid(), all: all, to: all ? null : target, ids: ids, calls: {}, stream: null, t0: 0, starting: true };
    fire('talk', s);
    return mic().then(function (stream) {
      if (sess !== s) { stream.getTracks().forEach(function (t) { t.stop(); }); return null; }
      s.stream = stream; s.starting = false; s.t0 = Date.now();
      chime(false);
      ids.forEach(function (id) {
        ICPeer.sendTo(id, { t: 'talk', on: true, sid: s.sid, all: all });
        var c = ICPeer.call(id, stream, { sid: s.sid, all: all });
        if (!c) return;
        s.calls[id] = c;
        c.on('close', function () { if (sess === s && s.calls[id] === c) { delete s.calls[id]; fire('talk', s); } });
        c.on('error', function () { if (sess === s) { delete s.calls[id]; fire('talk', s); } });
      });
      s.maxT = setTimeout(function () { if (sess === s) { T.stop(); fire('note', 'Stopped after 2 minutes. Tap Talk again to keep going.'); } }, MAXMS);
      s.tick = setInterval(function () { fire('tick', Date.now() - s.t0); }, 250);
      fire('talk', s);
      return s;
    }, function (e) { if (sess === s) { sess = null; fire('talk', null); } throw e; });
  };
  T.stop = function () {
    var s = sess; if (!s) return;
    sess = null; clearTimeout(s.maxT); clearInterval(s.tick);
    s.ids.forEach(function (id) { ICPeer.sendTo(id, { t: 'talk', on: false, sid: s.sid }); });
    Object.keys(s.calls).forEach(function (id) { try { s.calls[id].close(); } catch (_) { /* */ } });
    if (s.stream) s.stream.getTracks().forEach(function (t) { t.stop(); });
    fire('talk', null);
  };
  T.talking = function () { return sess; };

  /* ---------- hear (incoming) ---------- */
  function endTalker(id) {
    var t = talkers[id]; if (!t) return;
    delete talkers[id]; clearTimeout(t.chT);
    try { t.call.close(); } catch (_) { /* */ }
    if (t.el) { t.el.srcObject = null; t.el.remove(); }
    fire('talkers');
  }
  T.incoming = function (call) {
    var m = call.metadata || {}, from = call.peer;
    if (m.kind !== 'talk') { try { call.close(); } catch (_) { /* */ } return; }
    var name = String(m.name || nameOf(from)).slice(0, 40);
    if (ICSave.get('dnd')) {
      ICPeer.sendTo(from, { t: 'dnd' });
      try { call.close(); } catch (_) { /* */ }
      fire('missed', name);
      return;
    }
    if (talkers[from]) endTalker(from);   // a new talk from the same device replaces the old one
    var t = talkers[from] = { id: from, name: name, all: !!m.all, sid: m.sid, call: call, el: null, state: 'chime', t0: Date.now() };
    call.on('stream', function (stream) {
      if (talkers[from] !== t) return;
      var el = t.el || document.createElement('audio');
      el.autoplay = true; el.setAttribute('playsinline', ''); el.muted = true; el.volume = ICSave.get('volume');
      el.srcObject = stream; t.el = el; document.body.appendChild(el);
      el.play().catch(function () { fire('blocked', true); });
      var wait = chime(true);
      t.chT = setTimeout(function () { if (talkers[from] === t) { el.muted = false; t.state = 'live'; fire('talkers'); } }, wait);
      fire('talkers');
    });
    call.on('close', function () { if (talkers[from] === t) endTalker(from); });
    call.on('error', function () { if (talkers[from] === t) endTalker(from); });
    call.answer();   // receive only (no mic until you tap Talk or Reply)
    fire('talkers'); fire('heard', t);
  };
  T.signal = function (m, from) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'talk' && m.on === false) { var t = talkers[from]; if (t && (!m.sid || t.sid === m.sid)) endTalker(from); }
    else if (m.t === 'dnd') {
      fire('note', nameOf(from) + ' has Do Not Disturb on and did not hear you.');
      if (sess && sess.calls[from]) { try { sess.calls[from].close(); } catch (_) { /* */ } delete sess.calls[from]; fire('talk', sess); }
    }
  };
  T.roster = function (list) {   // a device that leaves stops being heard / talked to
    var on = {}; list.forEach(function (d) { on[d.id] = 1; });
    Object.keys(talkers).forEach(function (id) { if (!on[id]) endTalker(id); });
    if (sess && !sess.all && !on[sess.to]) { T.stop(); fire('note', 'The device left.'); }
  };
  T.setDnd = function (v) {
    ICSave.set('dnd', !!v); ICPeer.update();
    if (v) Object.keys(talkers).forEach(endTalker);
  };
  T.talkers = function () { return Object.keys(talkers).map(function (id) { var t = talkers[id]; return { id: id, name: t.name, all: t.all, state: t.state }; }); };
  addEventListener('pagehide', function () { T.stop(); });
  window.ICTalk = T;
})();
