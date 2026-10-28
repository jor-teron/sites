/* Telephone TP2 — one call at a time: dial → ring → answer → talk → hang up, plus all tones.
   Signals (always to ONE device, relayed by the lobby; every one carries the call id cid):
     caller → callee {t:'ring', cid, num, name, did}      callee → caller {t:'ringing', cid}  (ack; none in 6 s = unreachable)
     callee → caller {t:'answer', cid} | {t:'decline', cid} | {t:'busy', cid}
     caller → callee {t:'cancel', cid, why:'cancelled'|'timeout'}       either side {t:'hang', cid} · {t:'mute', cid, on}
   After 'answer' the CALLER opens the audio MediaConnection (metadata {kind:'phone', cid, num, name}); the callee answers it
   only when peer + cid match the call it accepted. No answer in 30 s = "No answer" (missed on the other side). Connect limit 15 s.
   Media: getUserMedia audio only (echo cancel, noise suppression, AGC), asked BEFORE the other phone rings.
   Output: <audio>.setSinkId(sink) where the browser has it (Chrome/Edge desktop, Android Chrome); else the browser decides.
   Tones are WebAudio oscillators (no files): ringback 440+480 Hz 2 s on / 4 s off, busy 480+620 Hz ½ s on/off ×4,
   ringtone 2 short warbles every 3 s, "not online" three rising notes, keypad DTMF 120 ms.
   TP2 Do Not Disturb: a ring while DND is on (and the caller is not a favourite contact with "favourites ring" on) is
     declined without a sound: {t:'dnd', cid} to the caller ("Do Not Disturb") and a missed entry why:'dnd' here.
   TP2 video (IC2 / Video Chat pattern, but one-way streams so nothing is renegotiated): during an active call, Video on =
     getUserMedia camera (640×480 ideal, 15 fps) → a SECOND MediaConnection {kind:'phone-video', cid} carrying only that
     camera, + {t:'vid', on:true}. The other side answers it receive-only (only when peer + cid match the live call) and
     shows it big. Both sides can do this at once (two one-way streams). Video off = {t:'vid', on:false} + close + camera
     released. Front/back flip = new camera track + RTCRtpSender.replaceTrack (exact facingMode first; one camera → note). */
(function () {
  'use strict';
  var T = {}, cb = {}, RING_MS = 30000, ACK_MS = 6000, CONNECT_MS = 15000, SHOW_END_MS = 2200;
  var c = null, actx = null, tone = null, toneT = 0;
  T._times = function (o) { RING_MS = o.ring || RING_MS; ACK_MS = o.ack || ACK_MS; CONNECT_MS = o.connect || CONNECT_MS; SHOW_END_MS = o.show || SHOW_END_MS; };   // test hook
  T.on = function (n, f) { (cb[n] = cb[n] || []).push(f); };
  function fire(n, a, b) { (cb[n] || []).forEach(function (f) { try { f(a, b); } catch (e) { console.warn(e); } }); }
  function rid() { return Math.random().toString(36).slice(2, 10); }
  function dev(id) { return TPPeer.roster().filter(function (x) { return x.id === id; })[0]; }

  /* ---------- tones ---------- */
  function audioCtx() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended' && actx.resume) actx.resume(); } catch (_) { actx = null; } return actx; }
  T.unlock = function () { audioCtx(); if (c && c.el && c.el.paused) c.el.play().catch(function () {}); fire('blocked', false); };
  T.soundOk = function () { return !!(actx && actx.state === 'running'); };
  var DTMF = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], '*': [941, 1209], 0: [941, 1336], '#': [941, 1477] };
  var PAT = {
    ringback: { loop: true, steps: [[[440, 480], 2000], [null, 4000]] },
    busy: { loop: false, steps: [[[480, 620], 500], [null, 500], [[480, 620], 500], [null, 500], [[480, 620], 500], [null, 500], [[480, 620], 500]] },
    ring: { loop: true, steps: [[[880, 1100], 400], [null, 200], [[880, 1100], 400], [null, 2000]], loud: 1 },
    notfound: { loop: false, steps: [[[950], 330], [[1400], 330], [[1800], 330]] }
  };
  function burst(freqs, ms, gain) {
    if (!audioCtx()) return;
    var t = actx.currentTime, g = actx.createGain(), end = t + ms / 1000;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.setValueAtTime(gain, Math.max(t + 0.02, end - 0.02)); g.gain.linearRampToValueAtTime(0, end);
    g.connect(actx.destination);
    freqs.forEach(function (f) { var o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(end + 0.01); });
  }
  function stopTone() { clearTimeout(toneT); tone = null; }
  function playTone(name) {
    stopTone();
    var p = PAT[name]; if (!p) return;
    tone = name; T._tones = (T._tones || []).concat(name);   // test hook
    var i = 0, gain = (p.loud ? 0.22 : 0.12) * TPSave.get('volume');
    if (name === 'ring' && audioCtx() && actx.state !== 'running') fire('blocked', true);
    (function step() {
      if (tone !== name) return;
      if (i >= p.steps.length) { if (!p.loop) { tone = null; return; } i = 0; }
      var s = p.steps[i++];
      if (s[0]) burst(s[0], s[1], gain);
      toneT = setTimeout(step, s[1]);
    })();
  }
  T.key = function (k) { if (TPSave.get('keytones') && DTMF[k]) burst(DTMF[k], 120, 0.08 * TPSave.get('volume')); };
  T.tone = function () { return tone; };

  /* ---------- media ---------- */
  var AUD = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  function friendly(e) {
    var n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'The microphone is blocked. Allow it for this site in the browser settings, then try again.';
    if (n === 'NotFoundError') return 'No microphone was found on this device.';
    if (n === 'NotReadableError') return 'The microphone is being used by another app. Close it and try again.';
    if (n === 'NoMedia') return 'This browser cannot use the microphone here. Open the page over https or in a newer browser.';
    return 'Could not start the microphone' + (e && e.message ? ': ' + e.message : '.');
  }
  function mic() {
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return Promise.reject(new Error(friendly({ name: 'NoMedia' })));
    return md.getUserMedia({ audio: AUD, video: false }).catch(function (e) { throw new Error(friendly(e)); });
  }
  T.sinkOk = function () { return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype; };
  T.outputs = function () {
    var md = navigator.mediaDevices;
    if (!T.sinkOk() || !md || !md.enumerateDevices) return Promise.resolve([]);
    return md.enumerateDevices().then(function (l) {
      return l.filter(function (d) { return d.kind === 'audiooutput'; }).map(function (d, i) { return { id: d.deviceId, label: d.label || (d.deviceId === 'default' ? 'Default output' : 'Output ' + (i + 1)) }; });
    }).catch(function () { return []; });
  };
  T.pickOutput = function () {   // browsers with the chooser (Firefox): the browser's own picker
    var md = navigator.mediaDevices;
    if (!md || !md.selectAudioOutput) return Promise.reject(new Error('no chooser'));
    return md.selectAudioOutput().then(function (d) { return T.setSink(d.deviceId).then(function () { return d; }); });
  };
  T.setSink = function (id) {
    TPSave.set('sink', id || '');
    if (c && c.el && c.el.setSinkId) return c.el.setSinkId(id || '').catch(function (e) { TPSave.set('sink', ''); throw new Error('That speaker could not be used' + (e && e.message ? ': ' + e.message : '')); });
    return Promise.resolve();
  };
  T.setVolume = function (v) { TPSave.set('volume', v); if (c && c.el) c.el.volume = v; };

  /* ---------- call state ---------- */
  function emit() { fire('state', c); }
  function idleChanged() { try { TPPeer.update(); } catch (_) { /* */ } }
  function send(msg) { if (c) { msg.cid = c.cid; TPPeer.sendTo(c.peer, msg); } }
  /* ---------- video (TP2) ---------- */
  function camC(facing) {   // null = any camera (fallback)
    var o = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } };
    if (facing !== null) o.facingMode = facing || TPSave.get('facing');
    return o;
  }
  function camFriendly(e) {
    var n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'The camera is blocked. Allow it for this site in the browser settings, then try again.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera was found on this device.';
    if (n === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
    return 'Could not start the camera' + (e && e.message ? ': ' + e.message : '.');
  }
  function cam(facing, exact) {
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) { var e = new Error('This browser cannot use the camera here.'); e.name = 'NoMedia'; return Promise.reject(e); }
    var cc = camC(facing); if (exact) cc.facingMode = { exact: facing };
    return md.getUserMedia({ video: cc, audio: false });
  }
  function dropOut(x, tell) {   // stop sending my camera
    var v = x && x.vout; if (!v) return;
    x.vout = null;
    if (tell && x.state === 'active') send({ t: 'vid', on: false });
    try { v.media && v.media.close(); } catch (_) { /* */ }
    if (v.stream) v.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) { /* */ } });
  }
  function dropIn(x) {   // stop showing theirs
    var v = x && x.vin; if (!v) return;
    x.vin = null;
    try { v.media && v.media.close(); } catch (_) { /* */ }
  }
  T.video = function (on) {
    var x = c;
    if (!x || x.state !== 'active') return Promise.reject(new Error('Video can be turned on once the call is connected.'));
    on = on === undefined ? !x.vout : !!on;
    if (!on) { dropOut(x, true); emit(); return Promise.resolve(false); }
    if (x.vout) return Promise.resolve(true);
    x.vout = { starting: true }; emit();
    return cam(TPSave.get('facing')).catch(function (e) { if (e && (e.name === 'NotAllowedError' || e.name === 'NoMedia')) throw e; return cam(null); }).then(function (st) {
      if (c !== x || x.state !== 'active' || !x.vout || !x.vout.starting) { st.getTracks().forEach(function (t) { t.stop(); }); return false; }
      var media = TPPeer.call(x.peer, st, { kind: 'phone-video', cid: x.cid });
      if (!media) { st.getTracks().forEach(function (t) { t.stop(); }); x.vout = null; emit(); throw new Error('Video could not start. Try again.'); }
      x.vout = { media: media, stream: st };
      media.on('close', function () { if (c === x && x.vout && x.vout.media === media) { dropOut(x, false); emit(); } });
      media.on('error', function () { if (c === x && x.vout && x.vout.media === media) { dropOut(x, false); emit(); } });
      send({ t: 'vid', on: true });
      emit();
      return true;
    }, function (e) { if (c === x) { x.vout = null; emit(); } throw new Error(camFriendly(e)); });
  };
  T.flip = function () {   // front ↔ back (as Intercom IC2 / Video Chat VC2)
    var x = c, want = TPSave.get('facing') === 'user' ? 'environment' : 'user';
    if (!x || !x.vout || !x.vout.stream) { TPSave.set('facing', want); emit(); return Promise.resolve(want); }
    var v = x.vout, old = v.stream.getVideoTracks()[0];
    if (old) old.stop();   // phones often allow only one open camera
    function put(nt) {
      if (c !== x || x.vout !== v) { nt.stop(); return; }
      if (old) v.stream.removeTrack(old); v.stream.addTrack(nt);
      var pc = v.media && v.media.peerConnection;
      (pc && pc.getSenders ? pc.getSenders() : []).forEach(function (snd) {
        if (snd.track ? snd.track.kind === 'video' : true) { try { var r = snd.replaceTrack(nt); if (r && r.catch) r.catch(function () {}); } catch (_) { /* */ } }
      });
      emit();
    }
    return cam(want, true).then(function (st) { TPSave.set('facing', want); put(st.getVideoTracks()[0]); return want; }, function () {
      return cam(TPSave.get('facing')).then(function (st) { put(st.getVideoTracks()[0]); throw new Error('This device has only one camera.'); }, function (e) { dropOut(x, true); emit(); throw new Error(camFriendly(e)); });
    });
  };
  function clearTimers() { if (!c) return; clearTimeout(c.ringT); clearTimeout(c.ackT); clearTimeout(c.conT); clearInterval(c.tickT); }
  function end(why, tn) {
    if (!c || c.state === 'ended') return;
    var x = c;
    x.state = 'ended'; x.why = why;   // first, so a media 'close' fired by the cleanup below cannot end (and log) it twice
    clearTimers(); stopTone();
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (_) { /* */ } }
    dropOut(x, false); dropIn(x);
    try { x.media && x.media.close(); } catch (_) { /* */ }
    if (x.stream) x.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) { /* */ } });
    if (x.el) { try { x.el.pause(); x.el.srcObject = null; x.el.remove(); } catch (_) { /* */ } x.el = null; }
    x.dur = x.t0 ? (Date.now() - x.t0) / 1000 : 0;
    var dir = x.dir === 'out' ? 'out' : (x.t0 || why === 'declined' ? 'in' : 'missed');
    TPSave.addLog({ dir: dir, num: x.num, name: x.name, did: x.did, at: x.at, dur: x.dur, why: why });
    if (tn) playTone(tn);
    if (dir === 'missed') fire('missed', x);
    emit(); idleChanged();
    x.clearT = setTimeout(function () { if (c === x) { c = null; emit(); } }, SHOW_END_MS);
  }
  function fresh(o) {
    if (c && c.state === 'ended') { clearTimeout(c.clearT); c = null; }
    c = Object.assign({ cid: rid() + rid(), at: Date.now(), state: 'dialing', muted: false, t0: 0, rmuted: false }, o);
    return c;
  }
  T.current = function () { return c; };
  T.busy = function () { return !!(c && c.state !== 'ended'); };
  T.find = function (num) {   // newest device with that number
    return TPPeer.roster().filter(function (d) { return d.num === num; }).sort(function (a, b) { return (b.since || 0) - (a.since || 0); })[0] || null;
  };
  T.dial = function (num) {
    num = String(num || '').replace(/\D/g, '');
    if (T.busy()) return Promise.reject(new Error('You are already on a call.'));
    if (!/^\d{4}$/.test(num)) return Promise.reject(new Error('Phone numbers here have 4 digits.'));
    if (num === TPSave.get('num')) return Promise.reject(new Error('That is this device’s own number.'));
    if (!TPPeer.online()) return Promise.reject(new Error('Not connected yet. Check the Hub code and the internet, then try again.'));
    T.unlock();
    var d = T.find(num);
    if (!d) { fresh({ dir: 'out', num: num, name: '', peer: '' }); emit(); end('notfound', 'notfound'); return Promise.resolve(c); }
    var x = fresh({ dir: 'out', num: num, name: d.name || 'Device', peer: d.id, did: d.did || '' });
    emit(); idleChanged();
    return mic().then(function (s) {
      if (c !== x || x.state === 'ended') { s.getTracks().forEach(function (t) { t.stop(); }); return x; }
      x.stream = s; x.state = 'ringing';
      send({ t: 'ring', num: TPSave.get('num'), name: TPSave.name(), did: TPSave.get('did') });
      playTone('ringback');
      x.ackT = setTimeout(function () { if (c === x && x.state === 'ringing' && !x.acked) { send({ t: 'cancel', why: 'timeout' }); end('unreachable', 'busy'); } }, ACK_MS);
      x.ringT = setTimeout(function () { if (c === x && x.state === 'ringing') { send({ t: 'cancel', why: 'timeout' }); end('noanswer', 'busy'); } }, RING_MS);
      emit();
      return x;
    }, function (e) { if (c === x) end('mic'); throw e; });
  };
  T.answer = function () {
    var x = c;
    if (!x || x.dir !== 'in' || x.state !== 'incoming') return Promise.resolve();
    stopTone(); T.unlock();
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (_) { /* */ } }
    x.state = 'connecting'; emit();
    return mic().then(function (s) {
      if (c !== x || x.state === 'ended') { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      x.stream = s; clearTimeout(x.ringT);
      send({ t: 'answer' });
      x.conT = setTimeout(function () { if (c === x && x.state === 'connecting') { send({ t: 'hang' }); end('failed', 'busy'); } }, CONNECT_MS);
    }, function (e) { if (c === x) { send({ t: 'hang', why: 'mic' }); end('mic'); } throw e; });
  };
  T.decline = function () { if (c && c.dir === 'in' && c.state === 'incoming') { send({ t: 'decline' }); end('declined'); } };
  T.hangup = function () {
    if (!c || c.state === 'ended') return;
    if (c.dir === 'in' && c.state === 'incoming') return T.decline();
    if (c.dir === 'out' && (c.state === 'dialing' || c.state === 'ringing')) { send({ t: 'cancel', why: 'cancelled' }); return end('cancelled'); }
    send({ t: 'hang' }); end('done');
  };
  T.mute = function (on) {
    if (!c || !c.stream) return;
    c.muted = on === undefined ? !c.muted : !!on;
    c.stream.getAudioTracks().forEach(function (t) { t.enabled = !c.muted; });
    if (c.state === 'active') send({ t: 'mute', on: c.muted });
    emit();
  };
  function wire(media) {
    var x = c; x.media = media;
    media.on('stream', function (s) {
      if (c !== x || x.state === 'ended') return;
      var el = x.el || document.createElement('audio');
      el.autoplay = true; el.setAttribute('playsinline', ''); el.volume = TPSave.get('volume'); el.hidden = true;
      el.srcObject = s; if (!el.parentNode) document.body.appendChild(el); x.el = el;
      var sk = TPSave.get('sink'); if (sk && el.setSinkId) el.setSinkId(sk).catch(function () { /* device gone: default */ });
      el.play().catch(function () { fire('blocked', true); });
      if (x.state !== 'active') {
        clearTimeout(x.conT); stopTone();
        x.state = 'active'; x.t0 = Date.now();
        if (x.muted) send({ t: 'mute', on: true });
        x.tickT = setInterval(function () { fire('tick', x); }, 1000);
        emit();
      }
    });
    media.on('close', function () { if (c === x && x.media === media) end(x.state === 'active' ? 'done' : 'failed'); });
    media.on('error', function () { if (c === x && x.media === media) end(x.state === 'active' ? 'lost' : 'failed'); });
  }
  T.incoming = function (media) {
    var m = media.metadata || {};
    if (m.kind === 'phone-video') {   // their camera, receive-only
      var x = c;
      if (!x || x.state !== 'active' || media.peer !== x.peer || m.cid !== x.cid) { try { media.close(); } catch (_) { /* */ } return; }
      dropIn(x);
      x.vin = { media: media, stream: null };
      media.answer();
      media.on('stream', function (st) { if (c === x && x.vin && x.vin.media === media) { x.vin.stream = st; emit(); } });
      media.on('close', function () { if (c === x && x.vin && x.vin.media === media) { x.vin = null; emit(); } });
      media.on('error', function () { if (c === x && x.vin && x.vin.media === media) { x.vin = null; emit(); } });
      emit();
      return;
    }
    if (!c || c.state !== 'connecting' || c.dir !== 'in' || media.peer !== c.peer || m.cid !== c.cid || !c.stream) { try { media.close(); } catch (_) { /* */ } return; }
    media.answer(c.stream);
    wire(media);
  };
  T.signal = function (m, from) {
    if (!m || typeof m !== 'object' || typeof m.cid !== 'string') return;
    if (m.t === 'ring') {
      var num = /^\d{4}$/.test(String(m.num)) ? String(m.num) : '', nm = String(m.name || '').slice(0, 40) || 'Device';
      var did = /^[0-9a-f]{16}$/.test(String(m.did || '')) ? String(m.did) : '';
      if (TPSave.get('dnd')) {
        var ct = TPSave.contact(num, did);
        if (!(ct && ct.fav && TPSave.get('dndFav'))) {   // silent: no ring, no screen; logged as missed (DND)
          TPPeer.sendTo(from, { t: 'dnd', cid: m.cid });
          TPSave.addLog({ dir: 'missed', num: num, name: nm, did: did, why: 'dnd' }); fire('missed', { num: num, name: nm, did: did, why: 'dnd' });
          return;
        }
      }
      if (T.busy()) { TPPeer.sendTo(from, { t: 'busy', cid: m.cid }); TPSave.addLog({ dir: 'missed', num: num, name: nm, did: did, why: 'busy' }); fire('missed', { num: num, name: nm, did: did, why: 'busy' }); return; }
      var x = fresh({ dir: 'in', cid: m.cid, num: num, name: nm, did: did, peer: from, state: 'incoming' });
      TPPeer.sendTo(from, { t: 'ringing', cid: m.cid });
      playTone('ring');
      if (navigator.vibrate) { try { navigator.vibrate([400, 200, 400, 2000, 400, 200, 400]); } catch (_) { /* */ } }
      x.ringT = setTimeout(function () { if (c === x && x.state === 'incoming') end('missed'); }, RING_MS + 2000);
      emit(); idleChanged(); fire('ring', x);
      return;
    }
    if (!c || c.cid !== m.cid || c.peer !== from || c.state === 'ended') return;
    if (m.t === 'ringing' && c.dir === 'out') { c.acked = true; clearTimeout(c.ackT); emit(); }
    else if (m.t === 'busy' && c.dir === 'out') end('busy', 'busy');
    else if (m.t === 'dnd' && c.dir === 'out') end('dnd', 'busy');
    else if (m.t === 'vid') { if (!m.on) dropIn(c); c.rvid = !!m.on; emit(); }
    else if (m.t === 'decline' && c.dir === 'out') end('declined', 'busy');
    else if (m.t === 'answer' && c.dir === 'out' && c.state === 'ringing') {
      var y = c; stopTone(); clearTimeout(y.ringT); clearTimeout(y.ackT);
      y.state = 'connecting'; emit();
      var media = TPPeer.call(y.peer, y.stream, { cid: y.cid });
      if (!media) { send({ t: 'hang' }); end('failed', 'busy'); return; }
      wire(media);
      y.conT = setTimeout(function () { if (c === y && y.state === 'connecting') { send({ t: 'hang' }); end('failed', 'busy'); } }, CONNECT_MS);
    }
    else if (m.t === 'cancel' && c.dir === 'in') end(c.state === 'incoming' ? 'missed' : 'cancelled');
    else if (m.t === 'hang') end(c.state === 'active' ? 'done' : (c.dir === 'in' && c.state === 'incoming' ? 'missed' : 'failed'), c.state === 'active' ? null : 'busy');
    else if (m.t === 'mute') { c.rmuted = !!m.on; emit(); }
  };
  T.roster = function (list) {
    if (c && c.state !== 'ended' && c.peer && !list.some(function (d) { return d.id === c.peer; })) end(c.state === 'active' ? 'lost' : (c.dir === 'in' && c.state === 'incoming' ? 'missed' : 'unreachable'), 'busy');
  };
  T.stop = function () { if (c && c.state !== 'ended') { if (c.peer) T.hangup(); else end('cancelled'); } };
  addEventListener('pagehide', function () { T.stop(); });
  window.TPCall = T;
})();
