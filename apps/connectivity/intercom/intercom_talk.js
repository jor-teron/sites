/* Intercom IC2 — talk engine (audio, plus video since IC2).
   Talk: tap the Talk button → getUserMedia(audio [+ video when the 📹 toggle is on]) → ICPeer.call(id, stream,
     {kind:'talk', sid, all, video}) to every target (everyone not on Do Not Disturb, or the one picked device)
     + signal {t:'talk', on:true, sid, all, video}. Tap again (or release after holding > 0.5 s, or 2 min max)
     → {t:'talk', on:false, sid} and the calls close; mic and camera are released.
   Hear: an incoming talk call is answered receive-only; its audio stays muted while a short two-note chime
     plays (~0.45 s), then it is heard at the chosen volume. A video talk shows the caller's picture at once
     (doorbell view); "Two-way" talks straight back with this device's camera. Several talkers mix.
     Do Not Disturb: the call is closed and the talker gets {t:'dnd'}.
   Video (IC2): toggling video during a talk turns the camera track on/off with RTCRtpSender.replaceTrack
     (+ {t:'vid', on, sid}); an audio-only talk that turns video on is restarted with video (same targets,
     {cont:true} = no second chime, the 2-minute limit keeps counting). Front/back = flip(), as Video Chat VC2.
   Auto-answer (IC2, off by default): this device keeps trusted:{did:{name,token}} and sends each trusted device
     {t:'trust', did, name, token}. That device asks {t:'view', did, token} → if auto-answer is on, DND is off,
     nothing else is live and the token matches, this device starts a "view" talk (camera + mic) to it with no
     tap and no 2-minute limit, until either side stops ({t:'viewstop'}) or the viewer leaves. Refusals:
     {t:'viewno', why:'off'|'dnd'|'untrusted'|'busy'|'camera'}. */
(function () {
  'use strict';
  var T = {}, cb = {}, MAXMS = 120000, CHIME_MS = 450, VIEW_WAIT = 12000;
  var sess = null, talkers = {}, actx = null, wantView = {}, trustSent = {};
  T.MAXMS = MAXMS;
  T.on = function (n, f) { (cb[n] = cb[n] || []).push(f); };
  function fire(n, a, b) { (cb[n] || []).forEach(function (f) { try { f(a, b); } catch (e) { console.warn(e); } }); }
  function rid() { return Math.random().toString(36).slice(2, 10); }
  function dev(id) { return ICPeer.roster().filter(function (x) { return x.id === id; })[0]; }
  function nameOf(id) { var d = dev(id); return d ? d.name || 'Device' : 'Someone'; }

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

  /* ---------- media ---------- */
  function friendly(e, video) {
    var n = e && e.name, what = video ? 'camera or microphone' : 'microphone';
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'The ' + what + ' is blocked. Allow it for this site in the browser settings, then try again.';
    if (n === 'NotFoundError') return 'No ' + what + ' was found on this device.';
    if (n === 'NotReadableError') return 'The ' + what + ' is being used by another app. Close it and try again.';
    if (n === 'NoMedia') return 'This browser cannot use the ' + what + ' here. Open the page over https or in a newer browser.';
    return 'Could not start the ' + what + (e && e.message ? ': ' + e.message : '.');
  }
  function camC(facing) { return { facingMode: facing || ICSave.get('facing'), width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } }; }
  var AUD = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  function media(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error(friendly({ name: 'NoMedia' }, video)));
    var md = navigator.mediaDevices;
    if (!video) return md.getUserMedia({ audio: AUD, video: false }).catch(function (e) { throw new Error(friendly(e)); });
    return md.getUserMedia({ audio: AUD, video: camC() }).catch(function (e) {
      if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError' || e.name === 'NotReadableError')) {
        return md.getUserMedia({ audio: AUD, video: false }).then(function (s) { s._noCam = true; return s; });
      }
      throw e;
    }).catch(function (e) { throw new Error(friendly(e, true)); });
  }
  function camTrack(facing, exact) {
    var c = camC(facing); if (exact) c.facingMode = { exact: facing };
    return navigator.mediaDevices.getUserMedia({ video: c, audio: false }).then(function (s) { return s.getVideoTracks()[0]; });
  }
  function videoSenders(c) { var pc = c && c.peerConnection; return pc && pc.getSenders ? pc.getSenders().filter(function (s) { return s.track ? s.track.kind === 'video' : !!s._vid; }) : []; }
  function sendVideo(s, track) {   // put a camera track (or null = nothing) on every call's video sender
    Object.keys(s.calls).forEach(function (id) {
      videoSenders(s.calls[id]).forEach(function (snd) {
        snd._vid = true;
        try { var r = snd.replaceTrack(track); if (r && r.catch) r.catch(function () {}); } catch (_) { /* */ }
      });
    });
  }

  /* ---------- talk (outgoing) ---------- */
  // opts: {video, view (auto-answer view: no 2-min limit, no DND check), cont (restart of a live talk)}
  T.start = function (target, opts) {
    opts = opts || {};
    if (sess) return Promise.resolve(sess);
    audioCtx();
    if (!ICPeer.online()) return Promise.reject(new Error('Not connected yet. Check the Hub code, then try again.'));
    var all = target === 'all', list = ICPeer.roster(), ids;
    if (all) {
      ids = list.filter(function (d) { return !d.dnd; }).map(function (d) { return d.id; });
      if (!list.length) return Promise.reject(new Error('No other devices are online on this code.'));
      if (!ids.length) return Promise.reject(new Error('Every other device has Do Not Disturb on.'));
    } else {
      var d = dev(target);
      if (!d) return Promise.reject(new Error('That device is not online any more.'));
      if (d.dnd && !opts.view) return Promise.reject(new Error(d.name + ' has Do Not Disturb on.'));
      ids = [target];
    }
    var video = opts.video === undefined ? !!ICSave.get('video') : !!opts.video;
    var s = sess = { sid: rid(), all: all, to: all ? null : target, ids: ids, calls: {}, stream: null, t0: 0, starting: true,
      video: video, camOn: video, view: !!opts.view, viewer: opts.view ? nameOf(target) : '' };
    fire('talk', s);
    return media(video).then(function (stream) {
      if (sess !== s) { stream.getTracks().forEach(function (t) { t.stop(); }); return null; }
      if (stream._noCam) { s.video = s.camOn = false; fire('note', 'No camera could start, so this talk is voice only.'); }
      s.stream = stream; s.starting = false; s.t0 = opts.t0 || Date.now();
      if (!opts.cont) chime(false);
      ids.forEach(function (id) { open(s, id, opts.cont); });
      if (!s.view) s.maxT = setTimeout(function () { if (sess === s) { T.stop(); fire('note', 'Stopped after 2 minutes. Tap Talk again to keep going.'); } }, Math.max(0, MAXMS - (Date.now() - s.t0)));
      s.tick = setInterval(function () { fire('tick', Date.now() - s.t0); }, 250);
      fire('talk', s);
      return s;
    }, function (e) { if (sess === s) { sess = null; fire('talk', null); } throw e; });
  };
  function open(s, id, cont) {
    var meta = { sid: s.sid, all: s.all, video: s.video };
    if (s.view) meta.view = true;
    if (cont) meta.cont = true;
    ICPeer.sendTo(id, { t: 'talk', on: true, sid: s.sid, all: s.all, video: s.video });
    var c = ICPeer.call(id, s.stream, meta);
    if (!c) return;
    s.calls[id] = c;
    c.on('close', function () { if (sess === s && s.calls[id] === c) { delete s.calls[id]; if (s.view) T.stop(); else fire('talk', s); } });
    c.on('error', function () { if (sess === s) { delete s.calls[id]; if (s.view) T.stop(); else fire('talk', s); } });
  }
  function release(s, sendOff) {
    clearTimeout(s.maxT); clearInterval(s.tick);
    if (sendOff) s.ids.forEach(function (id) { ICPeer.sendTo(id, { t: 'talk', on: false, sid: s.sid }); });
    Object.keys(s.calls).forEach(function (id) { try { s.calls[id].close(); } catch (_) { /* */ } });
    if (s.stream) s.stream.getTracks().forEach(function (t) { t.stop(); });
  }
  T.stop = function () {
    var s = sess; if (!s) return;
    sess = null; release(s, true);
    fire('talk', null);
  };
  T.talking = function () { return sess; };

  /* video on/off during a talk + the saved toggle for the next one */
  T.setVideo = function (on) {
    on = !!on; ICSave.set('video', on);
    var s = sess;
    if (!s || s.starting) { fire('talk', s); return Promise.resolve(on); }
    if (on && !s.video) return restart(s, { video: true });
    if (on === s.camOn) return Promise.resolve(on);
    if (!on) {
      s.stream.getVideoTracks().forEach(function (t) { t.stop(); s.stream.removeTrack(t); });
      s.camOn = false; sendVideo(s, null); sig(s, { t: 'vid', on: false, sid: s.sid }); fire('talk', s);
      return Promise.resolve(false);
    }
    return camTrack(ICSave.get('facing')).then(function (nt) {
      if (sess !== s) { nt.stop(); return false; }
      s.stream.addTrack(nt); s.camOn = true; sendVideo(s, nt); sig(s, { t: 'vid', on: true, sid: s.sid }); fire('talk', s);
      return true;
    }, function (e) { throw new Error(friendly(e, true)); });
  };
  function sig(s, m) { s.ids.forEach(function (id) { ICPeer.sendTo(id, m); }); }
  function restart(old, o) {   // same targets, new calls with video; the old calls close after the new ones are up
    var ids = old.ids.filter(function (id) { return dev(id); });
    if (!ids.length) { T.stop(); return Promise.resolve(false); }
    sess = null; clearTimeout(old.maxT); clearInterval(old.tick);
    var target = old.all ? 'all' : old.to;
    return T.start(target, { video: o.video, view: old.view, cont: true, t0: old.t0 }).then(function (s) {
      release(old, false);
      ids.forEach(function (id) { ICPeer.sendTo(id, { t: 'talk', on: false, sid: old.sid }); });
      return !!(s && s.video);
    }, function (e) { release(old, true); throw e; });
  }
  T.flip = function () {   // front ↔ back camera (as Video Chat VC2)
    var want = ICSave.get('facing') === 'user' ? 'environment' : 'user';
    var s = sess;
    if (!s || !s.camOn || !s.stream) { ICSave.set('facing', want); fire('talk', s); return Promise.resolve(want === 'environment'); }
    var old = s.stream.getVideoTracks()[0];
    if (old) old.stop();   // phones often allow only one open camera
    function put(nt) { if (old) s.stream.removeTrack(old); s.stream.addTrack(nt); sendVideo(s, nt); fire('talk', s); }
    return camTrack(want, true).then(function (nt) {
      if (sess !== s) { nt.stop(); return false; }
      ICSave.set('facing', want); put(nt); return want === 'environment';
    }, function () {
      return camTrack(ICSave.get('facing')).then(function (nt) {
        if (sess === s) put(nt); else nt.stop();
        throw new Error('This device has only one camera.');
      });
    });
  };

  /* ---------- hear (incoming) ---------- */
  function endTalker(id) {
    var t = talkers[id]; if (!t) return;
    delete talkers[id]; clearTimeout(t.chT);
    try { t.call.close(); } catch (_) { /* */ }
    if (t.el) { try { t.el.pause(); } catch (_) { /* */ } t.el.srcObject = null; t.el.remove(); }
    fire('talkers');
  }
  T.incoming = function (call) {
    var m = call.metadata || {}, from = call.peer;
    if (m.kind !== 'talk') { try { call.close(); } catch (_) { /* */ } return; }
    var name = String(m.name || nameOf(from)).slice(0, 40);
    var asked = !!(m.view && wantView[from]);
    if (asked) { clearTimeout(wantView[from]); delete wantView[from]; }
    if (ICSave.get('dnd') && !asked) {
      ICPeer.sendTo(from, { t: 'dnd' });
      try { call.close(); } catch (_) { /* */ }
      fire('missed', name);
      return;
    }
    // IC3: public mesh (0000) — a device that is not trusted (token check) must be accepted first; nothing plays until then
    var tr = (ICSave.get('trusted') || {})[m.did], trustedCaller = !!(tr && m.tok && tr.token === m.tok);
    if (ICPeer.open() && !asked && !trustedCaller && !call._icOk) {
      if (m.cont && talkers[from]) { call._icOk = true; } else {
        var done = false, to = setTimeout(function () { finish(false); }, 30000);
        var finish = function (ok) {
          if (done) return; done = true; clearTimeout(to);
          if (ok && !ICSave.get('dnd') && call.open !== false) { call._icOk = true; T.incoming(call); }
          else { ICPeer.sendTo(from, { t: 'declined' }); try { call.close(); } catch (_) { /* */ } if (!ok) fire('missed', name); }
        };
        call.on('close', function () { finish(false); });
        fire('ask', { name: name, video: !!m.video, answer: finish });
        return;
      }
    }
    var cont = !!(m.cont && talkers[from]);
    if (talkers[from]) endTalker(from);   // a new talk from the same device replaces the old one
    var quiet = asked || cont;
    var t = talkers[from] = { id: from, name: name, all: !!m.all, sid: m.sid, call: call, el: null, state: quiet ? 'live' : 'chime', t0: Date.now(),
      video: !!m.video, cam: !!m.video, view: !!m.view, mine: asked };
    call.on('stream', function (stream) {
      if (talkers[from] !== t) return;
      var vid = stream.getVideoTracks().length > 0;
      var el = t.el || document.createElement(vid ? 'video' : 'audio');
      el.autoplay = true; el.setAttribute('playsinline', ''); el.playsInline = true; el.muted = !quiet; el.volume = ICSave.get('volume');
      el.srcObject = stream; t.el = el; t.video = vid && t.video !== false; t.hasVideo = vid;
      if (!vid) document.body.appendChild(el);   // video elements are placed on the stage by the app
      el.play().catch(function () { fire('blocked', true); });
      var wait = quiet ? 0 : chime(true);
      t.chT = setTimeout(function () { if (talkers[from] === t) { el.muted = false; t.state = 'live'; fire('talkers'); } }, wait);
      fire('talkers');
    });
    call.on('close', function () { if (talkers[from] === t) endTalker(from); });
    call.on('error', function () { if (talkers[from] === t) endTalker(from); });
    call.answer();   // receive only (no mic or camera until you tap Talk, Reply or Two-way)
    fire('talkers'); if (!cont) fire('heard', t);
  };
  T.signal = function (m, from) {
    if (!m || typeof m !== 'object') return;
    var t = talkers[from];
    if (m.t === 'talk' && m.on === false) { if (t && (!m.sid || t.sid === m.sid)) endTalker(from); }
    else if (m.t === 'dnd') {
      fire('note', nameOf(from) + ' has Do Not Disturb on and did not hear you.');
      if (sess && sess.calls[from]) { try { sess.calls[from].close(); } catch (_) { /* */ } delete sess.calls[from]; fire('talk', sess); }
    }
    else if (m.t === 'declined') {   // IC3
      fire('note', nameOf(from) + ' declined.');
      if (sess && sess.calls[from]) { try { sess.calls[from].close(); } catch (_) { /* */ } delete sess.calls[from]; fire('talk', sess); }
    }
    else if (m.t === 'vid') { if (t && (!m.sid || t.sid === m.sid)) { t.cam = !!m.on; if (m.on) t.video = true; fire('talkers'); } }
    else if (m.t === 'view') viewAsked(m, from);
    else if (m.t === 'viewno') {
      if (wantView[from]) { clearTimeout(wantView[from]); delete wantView[from]; }
      var n = nameOf(from), why = {
        off: n + ' has auto-answer turned off.', dnd: n + ' has Do Not Disturb on.', untrusted: n + ' does not trust this device any more.',
        busy: n + ' is busy talking. Try again in a moment.', camera: n + ' could not start its camera or microphone.' }[m.why];
      fire('note', why || n + ' did not open.'); fire('viewing');
    }
    else if (m.t === 'viewstop') { if (sess && sess.view && sess.to === from) { T.stop(); fire('note', nameOf(from) + ' stopped watching.'); } }
    else if (m.t === 'trust') {
      var did = String(m.did || ''), tok = String(m.token || '');
      if (!/^[0-9a-f]{12,32}$/.test(did) || !/^[0-9a-f]{16,64}$/.test(tok)) return;
      var k = Object.assign({}, ICSave.get('keys')); k[did] = { name: String(m.name || nameOf(from)).slice(0, 40), token: tok };
      ICSave.set('keys', k); fire('keys');
    }
    else if (m.t === 'untrust') {
      var k2 = Object.assign({}, ICSave.get('keys')); if (k2[m.did]) { delete k2[m.did]; ICSave.set('keys', k2); fire('keys'); }
    }
  };

  /* ---------- auto-answer (this device = room camera) ---------- */
  function viewAsked(m, from) {
    var tr = (ICSave.get('trusted') || {})[m.did], why = '';
    if (!tr || !m.token || tr.token !== m.token) why = 'untrusted';
    else if (ICSave.get('dnd')) why = 'dnd';
    else if (!ICSave.get('autoAnswer')) why = 'off';
    else if (sess && !(sess.view && sess.to === from)) why = 'busy';
    if (why) { ICPeer.sendTo(from, { t: 'viewno', why: why }); fire('refused', { name: tr ? tr.name : nameOf(from), why: why }); return; }
    if (sess) return;   // already showing this viewer
    T.start(from, { view: true, video: m.video !== false }).then(function (s) {
      if (s) fire('view', s);
    }, function () { ICPeer.sendTo(from, { t: 'viewno', why: 'camera' }); fire('note', 'A trusted device asked to view, but the camera could not start.'); });
  }
  T.canView = function (id) { var d = dev(id); return !!(d && d.did && (ICSave.get('keys') || {})[d.did]); };
  T.requestView = function (id) {   // ask a device that trusts this one to open its camera (no tap there)
    var d = dev(id), k = d && d.did && (ICSave.get('keys') || {})[d.did];
    if (!k) return Promise.reject(new Error('That device has not trusted this one.'));
    if (ICSave.get('dnd')) return Promise.reject(new Error('Turn off Do Not Disturb here first.'));
    audioCtx();
    clearTimeout(wantView[id]);
    wantView[id] = setTimeout(function () { delete wantView[id]; fire('note', (d.name || 'The device') + ' did not answer.'); fire('viewing'); }, VIEW_WAIT);
    ICPeer.sendTo(id, { t: 'view', did: ICSave.get('did'), token: k.token, video: true });
    fire('viewing');
    return Promise.resolve(true);
  };
  T.asking = function (id) { return !!wantView[id]; };
  T.stopView = function (id) { ICPeer.sendTo(id, { t: 'viewstop' }); endTalker(id); };
  T.trust = function (did, name, on) {
    var tr = Object.assign({}, ICSave.get('trusted'));
    if (on) tr[did] = { name: String(name || 'Device').slice(0, 40), token: (tr[did] && tr[did].token) || ICSave.token(16) };
    else delete tr[did];
    ICSave.set('trusted', tr);
    ICPeer.roster().forEach(function (d) {
      if (d.did !== did) return;
      if (on && ICPeer.open()) return;   // IC3: trust a device on a private code
      if (on) { ICPeer.sendTo(d.id, { t: 'trust', did: ICSave.get('did'), name: ICSave.name(), token: tr[did].token }); trustSent[d.id] = 1; }
      else { ICPeer.sendTo(d.id, { t: 'untrust', did: ICSave.get('did') }); delete trustSent[d.id]; if (sess && sess.view && sess.to === d.id) T.stop(); }
    });
    fire('trust');
  };
  T.setAutoAnswer = function (v) { ICSave.set('autoAnswer', !!v); if (!v && sess && sess.view) T.stop(); };

  T.roster = function (list) {   // a device that leaves stops being heard / talked to; trusted devices get their token
    var on = {}, tr = ICSave.get('trusted') || {};
    list.forEach(function (d) {
      on[d.id] = 1;
      if (d.did && tr[d.did] && !trustSent[d.id] && !ICPeer.open()) {   /* IC3: tokens only on a private code */ trustSent[d.id] = 1; ICPeer.sendTo(d.id, { t: 'trust', did: ICSave.get('did'), name: ICSave.name(), token: tr[d.did].token }); }
    });
    Object.keys(trustSent).forEach(function (id) { if (!on[id]) delete trustSent[id]; });
    Object.keys(talkers).forEach(function (id) { if (!on[id]) endTalker(id); });
    if (sess && !sess.all && !on[sess.to]) { T.stop(); fire('note', 'The device left.'); }
  };
  T.setDnd = function (v) {
    ICSave.set('dnd', !!v); ICPeer.update();
    if (v) { Object.keys(talkers).forEach(endTalker); if (sess && sess.view) T.stop(); }
  };
  T.talkers = function () {
    return Object.keys(talkers).map(function (id) {
      var t = talkers[id];
      return { id: id, name: t.name, all: t.all, state: t.state, video: !!(t.video && t.hasVideo), cam: t.cam, view: t.view, mine: t.mine, el: t.el };
    });
  };
  addEventListener('pagehide', function () { T.stop(); });
  window.ICTalk = T;
})();
