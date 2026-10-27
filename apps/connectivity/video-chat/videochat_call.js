/* Video Chat VC1 — media + one-to-one call state.
   Caller: VCPeer.call(id, localStream) and signal {t:'ring'}; callee shows Accept/Decline
   (WebAudio ringtone). Decline → {t:'decline'}; End → {t:'end'} + call.close(). The other
   side leaving the roster or the media connection failing ends the call with a notice. */
(function () {
  'use strict';
  var C = {}, local = null, call = null, peerId = '', peerName = '', facing = 'user', t0 = 0, tick = 0, ringT = 0, actx = null, pending = null;
  var cb = {};
  C.on = function (n, f) { cb[n] = f; };
  function fire(n, a, b, c) { if (cb[n]) cb[n](a, b, c); }

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
    }).then(function (s) { local = s; fire('local', s); return s; }, function (e) { throw friendly(e); });
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
  function stopLocal() { if (local) local.getTracks().forEach(function (t) { t.stop(); }); local = null; fire('local', null); }

  /* ringtone: two-tone 440/480 Hz, 1 s on, 2 s off */
  function ring(onOff) {
    clearInterval(ringT);
    if (!onOff) return;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.resume) actx.resume(); } catch (_) { return; }
    function burst() {
      var t = actx.currentTime, g = actx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.15, t + 0.05); g.gain.setValueAtTime(0.15, t + 0.95); g.gain.linearRampToValueAtTime(0, t + 1);
      g.connect(actx.destination);
      [440, 480].forEach(function (f) { var o = actx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 1); });
    }
    burst(); ringT = setInterval(burst, 3000);
  }

  function wire(c) {
    call = c;
    c.on('stream', function (s) {
      fire('remote', s); fire('state', 'Connected');
      if (!t0) { t0 = Date.now(); clearInterval(tick); tick = setInterval(function () { fire('timer', Date.now() - t0); }, 500); }
    });
    c.on('close', function () { if (call === c) finish('Call ended'); });
    c.on('error', function () { if (call === c) finish('The connection was lost'); });
    var watch = setInterval(function () {
      if (call !== c) return clearInterval(watch);
      var pc = c.peerConnection; if (!pc) return;
      var s = pc.iceConnectionState;
      if (s === 'checking' || s === 'new') fire('state', t0 ? 'Connecting…' : 'Ringing…');
      else if (s === 'disconnected') fire('state', 'Reconnecting…');
      else if (s === 'failed') { clearInterval(watch); finish('The connection failed (network blocked?)'); }
      else if (s === 'connected' || s === 'completed') fire('state', 'Connected');
    }, 1000);
  }
  function finish(why, quiet) {
    ring(false);
    var had = !!(call || pending || peerId);
    var c = call, p = pending;
    call = pending = null; peerId = ''; t0 = 0; clearInterval(tick);
    try { c && c.close(); } catch (_) { /* */ }
    try { p && p.close(); } catch (_) { /* */ }
    stopLocal();
    if (had) fire('ended', why, quiet);
  }

  C.start = function (id, name) {
    if (call || pending || peerId) return;
    peerId = id; peerName = name;
    fire('outgoing', name);
    getMedia().then(function (s) {
      if (peerId !== id) return;
      var c = VCPeer.call(id, s);
      if (!c) throw new Error('Could not reach ' + name);
      wire(c); fire('state', 'Ringing…');
      VCPeer.signal(id, { t: 'ring', name: VCStore.name() });
    }).catch(function (e) { finish(e.message); });
  };
  C.incoming = function (c) {
    if (call || pending || peerId) { VCPeer.signal(c.peer, { t: 'busy' }); setTimeout(function () { try { c.close(); } catch (_) { /* */ } }, 500); return; }
    pending = c; peerId = c.peer; peerName = (c.metadata && c.metadata.name) || 'Someone';
    c.on('close', function () { if (pending === c) finish('Missed call from ' + peerName, true); });
    ring(true); fire('incoming', peerName);
  };
  C.accept = function () {
    var c = pending; if (!c) return;
    ring(false);
    getMedia().then(function (s) { pending = null; c.answer(s); wire(c); fire('accepted', peerName); fire('state', 'Connecting…'); })
      .catch(function (e) { VCPeer.signal(c.peer, { t: 'decline', why: 'media' }); finish(e.message); });
  };
  C.decline = function () { if (pending) VCPeer.signal(pending.peer, { t: 'decline' }); finish('Declined', true); };
  C.end = function () { if (peerId) VCPeer.signal(peerId, { t: 'end' }); finish('Call ended', true); };
  C.signal = function (m, from) {
    if (from !== peerId) return;
    if (m.t === 'decline') finish(m.why === 'media' ? peerName + ' could not start their camera' : peerName + ' declined the call');
    else if (m.t === 'busy') finish(peerName + ' is in another call');
    else if (m.t === 'end') finish(peerName + ' ended the call');
  };
  C.roster = function (list) {
    if (peerId && !list.some(function (d) { return d.id === peerId; })) {
      var id = peerId;
      setTimeout(function () { if (peerId === id && !VCPeer.roster().some(function (d) { return d.id === id; })) finish(peerName + ' left'); }, 4000);
    }
  };
  C.mute = function () { if (!local) return false; var a = local.getAudioTracks(); a.forEach(function (t) { t.enabled = !t.enabled; }); return a.length && !a[0].enabled; };
  C.camOff = function () { if (!local) return false; var v = local.getVideoTracks(); v.forEach(function (t) { t.enabled = !t.enabled; }); return v.length && !v[0].enabled; };
  C.flip = function () {
    if (!local) return Promise.resolve(false);
    var want = facing === 'user' ? 'environment' : 'user';
    var old = local.getVideoTracks()[0];
    if (old) old.stop();   // phones often allow only one open camera
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: want } } }).then(function (s) {
      facing = want;
      var nt = s.getVideoTracks()[0];
      if (old) { nt.enabled = old.enabled; local.removeTrack(old); }
      local.addTrack(nt);
      var pc = call && call.peerConnection;
      if (pc) pc.getSenders().forEach(function (snd) { if (snd.track && snd.track.kind === 'video') snd.replaceTrack(nt); });
      fire('local', local);
      return facing === 'environment';
    }, function () {
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } }).then(function (s) {
        var nt = s.getVideoTracks()[0]; if (old) local.removeTrack(old); local.addTrack(nt);
        var pc = call && call.peerConnection;
        if (pc) pc.getSenders().forEach(function (snd) { if (snd.track && snd.track.kind === 'video') snd.replaceTrack(nt); });
        fire('local', local);
        throw new Error('This device has only one camera.');
      });
    });
  };
  C.active = function () { return !!(call || pending || peerId); };
  window.VCCall = C;
})();
