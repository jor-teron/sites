/* Video Chat VC2 — media + group call state (mesh, up to 4 people incl. me).
   Invite: VCPeer.call(id, local, {kind:'invite', room, members}) + signal {t:'ring'}; the callee sees
     Accept/Decline (WebAudio ringtone) and who is already in. A VC1 device's call (no kind) is a 1:1 invite.
   Join: on Accept the newcomer calls every member listed in the invite with {kind:'join', room};
     members auto-answer a join for their own room while there is space. Each side sends
     {t:'st', mute, cam, share, ids} on connect and on change; a member that learns of someone it has
     no call with calls them if its peer id sorts lower (no double calls).
   Signals: ring, decline, busy, full, cancel, end, st. Leaving the roster / ICE failure drops a person;
     the call ends when nobody is left (1:1 keeps the VC1 messages).
   Screen share (desktop): getDisplayMedia → replaceTrack on every peer connection's video sender;
     stop (or the browser's own Stop sharing) puts the camera back. */
(function () {
  'use strict';
  var C = {}, cb = {}, MAX = 4;
  var local = null, screen = null, facing = 'user', t0 = 0, tick = 0, ringT = 0, actx = null;
  var room = '', P = {}, pending = null, order = 0, lastRL = [], myMute = false, myCam = true;
  C.MAX = MAX;
  C.on = function (n, f) { cb[n] = f; };
  function fire(n, a, b, c) { if (cb[n]) { try { cb[n](a, b, c); } catch (e) { console.warn(e); } } }
  function rid() { return Math.random().toString(36).slice(2, 10); }
  function ids() { return Object.keys(P); }
  function count() { return ids().length + 1; }
  function nm(id) { return (P[id] && P[id].name) || 'Someone'; }

  /* ---------- local media ---------- */
  function constraints() {
    var cam = VCStore.get('cam'), mic = VCStore.get('mic');
    return {
      video: cam && facing === 'user' ? { deviceId: { ideal: cam } } : { facingMode: facing },
      audio: mic ? { deviceId: { ideal: mic }, echoCancellation: true } : { echoCancellation: true }
    };
  }
  function getMedia() {
    if (local) return Promise.resolve(local);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(friendly({ name: 'NoMedia' }));
    return navigator.mediaDevices.getUserMedia(constraints()).catch(function (e) {
      if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') return navigator.mediaDevices.getUserMedia({ video: true, audio: true }).catch(function () { return navigator.mediaDevices.getUserMedia({ audio: true }); });
      throw e;
    }).then(function (s) { local = s; myMute = false; myCam = true; meter('me', s); fire('local', s); return s; }, function (e) { throw friendly(e); });
  }
  function friendly(e) {
    var n = e && e.name, m;
    if (n === 'NotAllowedError' || n === 'SecurityError') m = 'Camera and microphone are blocked. Allow them for this site in the browser settings, then try again.';
    else if (n === 'NotFoundError') m = 'No camera or microphone was found on this device.';
    else if (n === 'NotReadableError') m = 'The camera or microphone is being used by another app. Close it and try again.';
    else if (n === 'NoMedia') m = 'This browser cannot use the camera here. Open the page over https or in a newer browser.';
    else m = 'Could not start the camera or microphone' + (e && e.message ? ': ' + e.message : '.');
    return new Error(m);
  }
  function stopLocal() {
    if (screen) { screen.getTracks().forEach(function (t) { t.stop(); }); screen = null; }
    if (local) local.getTracks().forEach(function (t) { t.stop(); });
    local = null; fire('local', null);
  }

  /* ringtone: two-tone 440/480 Hz, 1 s on, 2 s off */
  function audioCtx() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.resume) actx.resume(); } catch (_) { actx = null; } return actx; }
  function ring(onOff) {
    clearInterval(ringT);
    if (!onOff || !audioCtx()) return;
    function burst() {
      var t = actx.currentTime, g = actx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.15, t + 0.05); g.gain.setValueAtTime(0.15, t + 0.95); g.gain.linearRampToValueAtTime(0, t + 1);
      g.connect(actx.destination);
      [440, 480].forEach(function (f) { var o = actx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 1); });
    }
    burst(); ringT = setInterval(burst, 3000);
  }

  /* ---------- active speaker (audio level) ---------- */
  var meters = {}, spk = null, spkT = 0, levelT = 0;
  function meter(id, s) {
    unmeter(id);
    if (!s || !s.getAudioTracks().length || !audioCtx()) return;
    try {
      var src = actx.createMediaStreamSource(s), an = actx.createAnalyser(); an.fftSize = 512; src.connect(an);
      meters[id] = { src: src, an: an, buf: new Uint8Array(an.fftSize), lvl: 0 };
    } catch (_) { /* no WebAudio for this stream */ }
    if (!levelT) levelT = setInterval(levels, 200);
  }
  function unmeter(id) { var m = meters[id]; if (m) { try { m.src.disconnect(); } catch (_) { /* */ } delete meters[id]; } }
  function levels() {
    var best = null, bl = 0.02, now = Date.now();
    Object.keys(meters).forEach(function (id) {
      var m = meters[id]; m.an.getByteTimeDomainData(m.buf);
      var sum = 0; for (var i = 0; i < m.buf.length; i++) { var v = (m.buf[i] - 128) / 128; sum += v * v; }
      m.lvl = m.lvl * 0.5 + Math.sqrt(sum / m.buf.length) * 0.5;
      if (id === 'me' && myMute) return;
      if (m.lvl > bl) { bl = m.lvl; best = id; }
    });
    if (C._levels) best = C._levels();   // test hook
    if (best && best !== spk) { spk = best; spkT = now; fire('speaker', spk); }
    else if (!best && spk && now - spkT > 1500) { spk = null; fire('speaker', null); }
    else if (best) spkT = now;
  }

  /* ---------- people ---------- */
  function add(id, name, c, state, out) {
    P[id] = { id: id, name: name || 'Someone', call: c, stream: null, st: { mute: false, cam: true, share: false }, state: state, out: !!out, n: ++order };
    wire(id, c); fire('people');
    return P[id];
  }
  function stNow() { return { t: 'st', mute: myMute, cam: myCam, share: !!screen, ids: ids().filter(function (i) { return P[i].state === 'live'; }) }; }
  function sendSt(to) { (to ? [to] : ids()).forEach(function (id) { if (P[id] && P[id].state !== 'ringing') VCPeer.signal(id, stNow()); }); }
  function videoSenders(c) { var pc = c && c.peerConnection; return pc && pc.getSenders ? pc.getSenders().filter(function (s) { return s.track ? s.track.kind === 'video' : false; }) : []; }
  function sendVideo(c, track) { videoSenders(c).forEach(function (s) { try { var r = s.replaceTrack(track); if (r && r.catch) r.catch(function () {}); } catch (_) { /* */ } }); }
  function wire(id, c) {
    c.on('stream', function (s) {
      var p = P[id]; if (!p || p.call !== c) return;
      var first = p.state !== 'live';
      p.stream = s; p.state = 'live'; clearTimeout(p.ringTo);
      meter(id, s);
      if (screen) sendVideo(c, screen.getVideoTracks()[0]);
      if (!t0) { t0 = Date.now(); clearInterval(tick); tick = setInterval(function () { fire('timer', Date.now() - t0); }, 500); }
      if (first) { sendSt(id); fire('joined', p.name); }
      fire('people'); fire('state', 'Connected');
    });
    c.on('close', function () { if (P[id] && P[id].call === c) drop(id, nm(id) + (count() > 2 ? ' left' : ' ended the call')); });
    c.on('error', function () { if (P[id] && P[id].call === c) drop(id, 'Lost the connection to ' + nm(id)); });
    var w = setInterval(function () {
      var p = P[id]; if (!p || p.call !== c) return clearInterval(w);
      var pc = c.peerConnection, s = pc && pc.iceConnectionState; if (!s) return;
      var was = p.net; p.net = s;
      if (s === 'failed') { clearInterval(w); drop(id, 'The connection to ' + p.name + ' failed (network blocked?)'); }
      else if (s !== was) fire('people');
    }, 1000);
  }
  function drop(id, why, quiet) {
    var p = P[id]; if (!p) return;
    delete P[id]; clearTimeout(p.ringTo); unmeter(id);
    try { p.call.close(); } catch (_) { /* */ }
    if (spk === id) { spk = null; fire('speaker', null); }
    if (!ids().length) return finish(why, quiet);
    fire('people'); fire('note', why);
  }
  function finish(why, quiet) {
    ring(false);
    var had = !!(ids().length || pending || room);
    var old = P; P = {}; room = '';   // clear first: call.close() fires 'close' synchronously
    Object.keys(old).forEach(function (id) { var p = old[id]; clearTimeout(p.ringTo); try { p.call.close(); } catch (_) { /* */ } });
    var pc = pending; pending = null;
    if (pc) { try { pc.call.close(); } catch (_) { /* */ } }
    t0 = 0; clearInterval(tick);
    Object.keys(meters).forEach(unmeter); spk = null;
    stopLocal();
    fire('people');
    if (had) fire('ended', why, quiet);
  }

  /* ---------- outgoing ---------- */
  C.start = function (id, name) {   // call or invite (same thing; starts a call when idle)
    if (pending) return;
    if (P[id]) { fire('note', name + ' is already in the call'); return; }
    if (count() >= MAX) { fire('note', 'A call holds up to ' + MAX + ' people'); return; }
    var fresh = !room;
    if (fresh) { room = rid(); fire('outgoing', name); }
    getMedia().then(function (s) {
      if (!room) return;
      var members = ids().filter(function (i) { return P[i].state === 'live'; }).map(function (i) { return { id: i, name: P[i].name }; });
      var c = VCPeer.call(id, s, { kind: 'invite', room: room, members: members });
      if (!c) throw new Error('Could not reach ' + name);
      var p = add(id, name, c, 'ringing', true);
      VCPeer.signal(id, { t: 'ring', name: VCStore.name(), room: room, members: members });
      fire('state', fresh ? 'Ringing…' : 'Inviting ' + name + '…');
      if (!fresh) fire('note', 'Inviting ' + name + '…');
      p.ringTo = setTimeout(function () { if (P[id] === p && p.state === 'ringing') { VCPeer.signal(id, { t: 'cancel' }); drop(id, name + ' did not answer'); } }, 45000);
    }).catch(function (e) { if (fresh) finish(e.message); else fire('note', e.message); });
  };

  /* ---------- incoming ---------- */
  C.incoming = function (c) {
    var md = c.metadata || {}, from = c.peer, name = String(md.name || 'Someone').slice(0, 40);
    if (md.kind === 'join') {
      var dup = P[from] && P[from].state !== 'live' && !P[from].out && from < VCPeer.myId();
      if (dup && md.room === room) {   // both sides dialled each other: keep the call from the lower id
        getMedia().then(function (s) { var p = P[from]; if (!p) return; var old = p.call; p.call = c; c.answer(s); wire(from, c); try { old.close(); } catch (_) { /* */ } });
        return;
      }
      if (!room || md.room !== room || P[from]) { setTimeout(function () { try { c.close(); } catch (_) { /* */ } }, 300); return; }
      if (count() >= MAX) { VCPeer.signal(from, { t: 'full' }); setTimeout(function () { try { c.close(); } catch (_) { /* */ } }, 300); return; }
      getMedia().then(function (s) { c.answer(s); add(from, name, c, 'connecting'); }).catch(function () { try { c.close(); } catch (_) { /* */ } });
      return;
    }
    if (room || pending) { VCPeer.signal(from, { t: 'busy' }); setTimeout(function () { try { c.close(); } catch (_) { /* */ } }, 500); return; }
    var members = (Array.isArray(md.members) ? md.members : []).filter(function (m) { return m && m.id && m.id !== from && m.id !== VCPeer.myId(); }).slice(0, MAX - 2)
      .map(function (m) { return { id: String(m.id), name: String(m.name || 'Someone').slice(0, 40) }; });
    pending = { call: c, from: from, name: name, room: String(md.room || rid()), members: members };
    c.on('close', function () { if (pending && pending.call === c) { pending = null; ring(false); fire('ended', 'Missed call from ' + name, true); } });
    ring(true); fire('incoming', name, members.map(function (m) { return m.name; }));
  };
  C.accept = function () {
    var pd = pending; if (!pd) return;
    ring(false);
    getMedia().then(function (s) {
      if (pending !== pd) return;
      pending = null; room = pd.room;
      pd.call.answer(s); add(pd.from, pd.name, pd.call, 'connecting');
      pd.members.forEach(function (m) { joinCall(m.id, m.name); });
      fire('accepted', pd.name); fire('state', 'Connecting…');
    }).catch(function (e) { VCPeer.signal(pd.from, { t: 'decline', why: 'media' }); pending = null; finish(e.message); });
  };
  function joinCall(id, name) {
    if (!room || P[id] || id === VCPeer.myId() || count() >= MAX || !local) return;
    var c = VCPeer.call(id, local, { kind: 'join', room: room });
    if (c) add(id, name, c, 'connecting');
  }
  C.decline = function () {
    var pd = pending; if (!pd) return;
    VCPeer.signal(pd.from, { t: 'decline' }); pending = null; ring(false);
    setTimeout(function () { try { pd.call.close(); } catch (_) { /* */ } }, 300);
    fire('ended', 'Declined', true);
  };
  C.end = function () {
    if (pending) return C.decline();
    ids().forEach(function (id) { VCPeer.signal(id, { t: P[id].state === 'ringing' ? 'cancel' : 'end' }); });
    finish('Call ended', true);
  };
  C.cancelInvite = function (id) { if (P[id] && P[id].state === 'ringing') { VCPeer.signal(id, { t: 'cancel' }); drop(id, 'Invite to ' + nm(id) + ' cancelled', true); } };

  /* ---------- signals + roster ---------- */
  C.signal = function (m, from) {
    if (!m || typeof m !== 'object') return;
    if (pending && from === pending.from && (m.t === 'cancel' || m.t === 'end')) {
      var n = pending.name, c = pending.call; pending = null; ring(false); try { c.close(); } catch (_) { /* */ }
      fire('ended', 'Missed call from ' + n, true); return;
    }
    var p = P[from]; if (!p) return;
    var solo = count() <= 2;
    if (m.t === 'decline') drop(from, m.why === 'media' ? p.name + ' could not start their camera' : p.name + ' declined the call');
    else if (m.t === 'busy') drop(from, p.name + ' is in another call');
    else if (m.t === 'full') drop(from, 'The call is full (' + MAX + ' people)');
    else if (m.t === 'end' || m.t === 'cancel') drop(from, p.name + (solo ? ' ended the call' : ' left'), !solo);
    else if (m.t === 'st') {
      var was = p.st.share;
      p.st = { mute: !!m.mute, cam: m.cam !== false, share: !!m.share };
      if (p.st.share && !was) fire('note', p.name + ' is sharing their screen');
      (Array.isArray(m.ids) ? m.ids : []).forEach(function (x) {
        x = String(x);
        if (x !== VCPeer.myId() && !P[x] && VCPeer.myId() < x) setTimeout(function () {   // give the newcomer time to dial us first
          if (P[x] || !room) return;
          var r = lastRL.filter(function (d) { return d.id === x; })[0]; joinCall(x, r ? r.name : 'Someone');
        }, 3000);
      });
      fire('people');
    }
  };
  C.roster = function (list) {
    lastRL = list || [];
    ids().forEach(function (id) {
      if (!lastRL.some(function (d) { return d.id === id; })) setTimeout(function () { if (P[id] && !lastRL.some(function (d) { return d.id === id; })) drop(id, nm(id) + ' left'); }, 4000);
    });
    if (pending && !lastRL.some(function (d) { return d.id === pending.from; })) {
      var pd = pending;
      setTimeout(function () { if (pending === pd && !lastRL.some(function (d) { return d.id === pd.from; })) { pending = null; ring(false); fire('ended', 'Missed call from ' + pd.name, true); } }, 4000);
    }
  };

  /* ---------- controls ---------- */
  C.mute = function () { if (!local) return false; var a = local.getAudioTracks(); myMute = a.length ? a[0].enabled : false; a.forEach(function (t) { t.enabled = !myMute; }); sendSt(); fire('people'); return myMute; };
  C.camOff = function () { if (!local) return false; var v = local.getVideoTracks(); myCam = v.length ? !v[0].enabled : false; v.forEach(function (t) { t.enabled = myCam; }); sendSt(); fire('people'); return !myCam; };
  function useCamTrack(nt) { if (!screen) ids().forEach(function (id) { sendVideo(P[id].call, nt); }); }
  C.flip = function () {
    if (!local) return Promise.resolve(false);
    var want = facing === 'user' ? 'environment' : 'user';
    var old = local.getVideoTracks()[0];
    if (old) old.stop();   // phones often allow only one open camera
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: want } } }).then(function (s) {
      facing = want;
      var nt = s.getVideoTracks()[0];
      if (old) { nt.enabled = old.enabled; local.removeTrack(old); }
      local.addTrack(nt); useCamTrack(nt); fire('local', local);
      return facing === 'environment';
    }, function () {
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } }).then(function (s) {
        var nt = s.getVideoTracks()[0]; if (old) local.removeTrack(old); local.addTrack(nt); useCamTrack(nt);
        fire('local', local);
        throw new Error('This device has only one camera.');
      });
    });
  };
  var UA = navigator.userAgent || '';
  C.isPhone = function () { return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1); };
  C.canShare = function () { return !C.isPhone() && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia); };
  C.share = function () {
    if (screen) { C.stopShare(); return Promise.resolve(false); }
    if (!C.canShare()) return Promise.reject(new Error(C.isPhone() ? 'phone' : 'This browser can’t share its screen.'));
    if (!ids().length) return Promise.reject(new Error('Share your screen once someone has joined the call.'));
    return navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 15, max: 15 } }, audio: false })
      .then(function (s) {
        if (!room) { s.getTracks().forEach(function (t) { t.stop(); }); return false; }
        var other = Object.keys(P).filter(function (i) { return P[i].st.share; })[0];
        screen = s;
        var t = s.getVideoTracks()[0];
        try { t.contentHint = 'detail'; } catch (_) { /* */ }
        t.addEventListener('ended', function () { if (screen === s) C.stopShare(); });
        var noVideo = 0;
        ids().forEach(function (id) { if (!videoSenders(P[id].call).length && P[id].call.peerConnection) noVideo++; sendVideo(P[id].call, t); });
        if (noVideo) fire('note', noVideo + ' person' + (noVideo > 1 ? 's' : '') + ' joined without a camera link and can’t see the share');
        if (other) fire('note', P[other].name + ' was sharing too — your screen is shown big for you');
        sendSt(); fire('share', s); fire('people');
        return true;
      }, function (e) {
        var x = new Error(e && (e.name === 'NotAllowedError' || e.name === 'AbortError') ? 'Screen sharing was cancelled.' : 'Could not share the screen' + (e && e.message ? ': ' + e.message : '.'));
        x.quiet = e && (e.name === 'NotAllowedError' || e.name === 'AbortError'); throw x;
      });
  };
  C.stopShare = function () {
    if (!screen) return;
    var s = screen; screen = null;
    s.getTracks().forEach(function (t) { t.stop(); });
    var cam = local && local.getVideoTracks()[0];
    if (cam) ids().forEach(function (id) { sendVideo(P[id].call, cam); });
    sendSt(); fire('share', null); fire('people');
  };

  /* ---------- state for the UI ---------- */
  C.people = function () {
    return ids().map(function (id) { var p = P[id]; return { id: id, name: p.name, stream: p.stream, st: p.st, state: p.state, net: p.net, n: p.n }; })
      .sort(function (a, b) { return a.n - b.n; });
  };
  C.me = function () { return { id: 'me', name: VCStore.name(), stream: local, screen: screen, st: { mute: myMute, cam: myCam, share: !!screen } }; };
  C.inCall = function (id) { return !!P[id]; };
  C.count = count;
  C.sharing = function () { return !!screen; };
  C.speaker = function () { return spk; };
  C.active = function () { return !!(ids().length || pending || room); };
  addEventListener('pagehide', function () { if (room) C.end(); });
  window.VCCall = C;
})();
