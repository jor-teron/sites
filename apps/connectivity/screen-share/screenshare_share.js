/* Screen Share SS1 — sharing and watching.
   Sharer: getDisplayMedia (screen/window/tab, optional tab audio) → roster share {on, paused, audio}.
     A viewer sends {t:'watch', name}; the sharer calls it with the screen stream (one MediaConnection per
     viewer, max 4; over that → {t:'full'}). Pause = track.enabled=false + {t:'paused', on}; Stop (or the
     browser's own "Stop sharing", track 'ended') → {t:'stopped'} to every viewer, calls closed.
   Viewer: answers only the call from the sharer it asked to watch (receive only, no camera/mic);
     {t:'leave'} when it closes the viewer. Signals go through the lobby (SSPeer.signal).
   SS2 — viewer approval on Public (code 0000): a watch request from a device that is not trusted is queued and the
     sharer is asked Allow / Deny (fire 'ask'); viewer gets {t:'asking'}; Deny or no answer in 30 s → {t:'denied'}
     ("The sharer declined"). Allowed viewers stay allowed until the share stops. Private codes: no prompt (SS1).
     Trust: on a PRIVATE code each device gives every other device a token {t:'trust', did, name, token} (stored as
     trusted / keys). On 0000 tokens are never sent: the sharer sends {t:'prove', n} and the viewer answers
     {t:'proof', n, mac} = HMAC-SHA256(token, n|sharerId|viewerId), so the lobby owner never sees the token.
     No WebCrypto or no/bad proof in 6 s → the normal Allow / Deny prompt. */
(function () {
  'use strict';
  var S = {}, cb = {}, MAXV = 4;
  S.MAXV = MAXV;
  S.on = function (n, f) { cb[n] = f; };
  function fire(n, a, b) { if (cb[n]) { try { cb[n](a, b); } catch (e) { console.warn(e); } } }
  var UA = navigator.userAgent || '';
  S.isPhone = function () { return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1); };
  S.canShare = function () { return !S.isPhone() && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia); };

  /* ---------- sharer ---------- */
  var stream = null, viewers = {}, paused = false, hasAudio = false;
  function size() { return SSStore.get('quality') === '720' ? [1280, 720] : [1920, 1080]; }
  function vcons() { var q = size(), f = +SSStore.get('fps') || 15; return { width: { ideal: q[0], max: q[0] }, height: { ideal: q[1], max: q[1] }, frameRate: { ideal: f, max: f } }; }
  function friendly(e) {
    var n = e && e.name, m;
    if (n === 'NotAllowedError' || n === 'AbortError') { m = 'Sharing was cancelled.'; var x = new Error(m); x.quiet = true; return x; }
    if (n === 'NotFoundError') m = 'There is nothing to share on this device.';
    else if (n === 'NotReadableError') m = 'The screen could not be captured. On macOS allow Screen Recording for the browser (System Settings → Privacy & Security), then try again.';
    else if (n === 'SecurityError' || n === 'TypeError') m = 'Screen sharing needs https (or localhost) and a desktop browser.';
    else m = 'Could not start screen sharing' + (e && e.message ? ': ' + e.message : '.');
    return new Error(m);
  }
  function list() { return Object.keys(viewers).map(function (id) { return { id: id, name: viewers[id].name }; }); }
  function pub() { SSPeer.setShare(stream ? { paused: paused, audio: hasAudio } : null); }
  S.start = function () {
    if (stream) return Promise.resolve(stream);
    if (!S.canShare()) return Promise.reject(new Error(S.isPhone() ? 'phone' : 'Screen sharing is not available in this browser.'));
    var opt = { video: vcons(), audio: SSStore.get('audio') === 'on' };
    if (opt.audio) { opt.systemAudio = 'include'; }
    opt.selfBrowserSurface = 'exclude'; opt.surfaceSwitching = 'include';
    return navigator.mediaDevices.getDisplayMedia(opt).catch(function (e) { throw friendly(e); }).then(function (s) {
      stream = s; paused = false; clearAsks(); hasAudio = s.getAudioTracks().length > 0;
      var t = s.getVideoTracks()[0];
      if (t) { try { t.contentHint = 'detail'; } catch (_) { /* */ } t.addEventListener('ended', function () { if (stream === s) S.stop('The browser stopped the share'); }); }
      pub(); fire('sharing', s); fire('viewers', list());
      return s;
    });
  };
  S.stop = function (why) {
    if (!stream) return;
    var s = stream; stream = null; paused = false;
    Object.keys(viewers).forEach(function (id) { SSPeer.signal(id, { t: 'stopped' }); var c = viewers[id].call; setTimeout(function () { try { c.close(); } catch (_) { /* */ } }, 300); });
    viewers = {}; clearAsks();   // SS2: approvals last one share session
    s.getTracks().forEach(function (t) { t.stop(); });
    pub(); fire('viewers', []); fire('stopped', why || 'Sharing stopped');
  };
  S.pause = function () {
    if (!stream) return false;
    paused = !paused;
    stream.getTracks().forEach(function (t) { t.enabled = !paused; });
    Object.keys(viewers).forEach(function (id) { SSPeer.signal(id, { t: 'paused', on: paused }); });
    pub(); fire('paused', paused);
    return paused;
  };
  S.applyQuality = function () {
    var t = stream && stream.getVideoTracks()[0];
    if (t && t.applyConstraints) t.applyConstraints(vcons()).catch(function () { /* keep current */ });
  };
  S.sharing = function () { return !!stream; };
  S.isPaused = function () { return paused; };
  S.stream = function () { return stream; };
  S.viewers = list;
  function dropViewer(id, c, why) {
    var v = viewers[id]; if (!v || (c && v.call !== c)) return;
    delete viewers[id]; try { v.call.close(); } catch (_) { /* */ }
    fire('viewers', list()); fire('viewerLeft', v.name, why);
  }
  /* SS2: approval on Public */
  var ASK_MS = 30000, PROVE_MS = 6000, allowed = {}, asks = {}, proves = {};
  function subtle() { try { return (window.crypto && crypto.subtle && crypto.subtle.importKey) ? crypto.subtle : null; } catch (_) { return null; } }
  function hex(b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  function mac(tok, msg) {
    var c = subtle(), te = new TextEncoder(); if (!c) return Promise.reject(new Error('no crypto'));
    return c.importKey('raw', te.encode(tok), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']).then(function (k) { return c.sign('HMAC', k, te.encode(msg)); }).then(hex);
  }
  function devOf(id) { return lastRL.filter(function (d) { return d.id === id; })[0]; }
  function onWatch(from, name, did) {
    if (!stream) { SSPeer.signal(from, { t: 'stopped' }); return; }
    if (SSPeer.open() && !allowed[from]) {
      if (asks[from] || proves[from]) return;   // already being decided
      if (!viewers[from] && Object.keys(viewers).length >= MAXV) { SSPeer.signal(from, { t: 'full', max: MAXV }); fire('full', name); return; }
      var tr = did && (SSStore.get('trusted') || {})[did];
      if (tr && tr.token && subtle()) {
        var n = SSStore.token(16), me = SSPeer.id();
        proves[from] = { n: n, name: name, did: did, tok: tr.token, me: me, t: setTimeout(function () { if (proves[from] && proves[from].n === n) { delete proves[from]; ask(from, name); } }, PROVE_MS) };
        SSPeer.signal(from, { t: 'prove', n: n });
        return;
      }
      return ask(from, name);
    }
    admit(from, name);
  }
  function onProof(from, m) {
    var p = proves[from]; if (!p || m.n !== p.n) return;
    mac(p.tok, p.n + '|' + p.me + '|' + from).then(function (want) {
      if (proves[from] !== p) return;
      clearTimeout(p.t); delete proves[from];
      if (want === String(m.mac || '')) { allowed[from] = 1; admit(from, p.name); } else ask(from, p.name);
    }, function () { if (proves[from] === p) { clearTimeout(p.t); delete proves[from]; ask(from, p.name); } });
  }
  function ask(from, name) {
    if (!stream || asks[from]) return;
    asks[from] = { name: name || 'Someone', t: setTimeout(function () { S.decide(from, false, 'timeout'); }, ASK_MS) };
    SSPeer.signal(from, { t: 'asking' });
    fire('ask', { id: from, name: asks[from].name });
  }
  S.decide = function (from, ok, why) {   // the app's Allow / Deny (or the 30 s timeout)
    var a = asks[from]; if (!a) return;
    clearTimeout(a.t); delete asks[from];
    if (ok && stream) { allowed[from] = 1; admit(from, a.name); }
    else { SSPeer.signal(from, { t: 'denied' }); fire('decided', from, why || 'deny'); }
  };
  S.asking = function () { return Object.keys(asks); };
  function clearAsks() {
    Object.keys(asks).forEach(function (id) { clearTimeout(asks[id].t); fire('decided', id, 'gone'); });
    Object.keys(proves).forEach(function (id) { clearTimeout(proves[id].t); });
    asks = {}; proves = {}; allowed = {};
  }
  /* SS1: function onWatch(from, name) { if (!stream) {...stopped} ...then the body of admit() below } */
  function admit(from, name) {
    if (viewers[from]) dropViewer(from, null, 'again');
    if (Object.keys(viewers).length >= MAXV) { SSPeer.signal(from, { t: 'full', max: MAXV }); fire('full', name); return; }
    var c = SSPeer.call(from, stream);
    if (!c) return;
    viewers[from] = { call: c, name: name || 'Someone' };
    c.on('close', function () { dropViewer(from, c); });
    c.on('error', function () { dropViewer(from, c, 'lost'); });
    var w = setInterval(function () {
      if (!viewers[from] || viewers[from].call !== c) return clearInterval(w);
      var pc = c.peerConnection; if (pc && pc.iceConnectionState === 'failed') { clearInterval(w); dropViewer(from, c, 'failed'); }
    }, 1000);
    if (paused) setTimeout(function () { SSPeer.signal(from, { t: 'paused', on: true }); }, 400);
    fire('viewers', list()); fire('viewerJoined', viewers[from].name);
  }

  /* ---------- viewer ---------- */
  var watching = null, wTimer = 0;
  S.watch = function (id, name) {
    if (watching) S.leave(true);
    watching = { id: id, name: name || 'Device', call: null, paused: false };
    fire('watching', watching.name); fire('wstate', 'Connecting…');
    SSPeer.signal(id, { t: 'watch', name: SSStore.name(), did: SSStore.get('did') });   // SS1: { t: 'watch', name }
    var me = watching; clearTimeout(wTimer);
    wTimer = setTimeout(function () { if (watching === me && !me.got) endWatch(me.name + ' did not answer. Try again.'); }, 20000);
  };
  S.incoming = function (call) {
    var w = watching;
    if (!w || call.peer !== w.id || w.call) { setTimeout(function () { try { call.close(); } catch (_) { /* */ } }, 200); return; }
    w.call = call;
    call.answer();   // receive only
    call.on('stream', function (s) { if (watching !== w) return; w.got = true; fire('remote', s); fire('wstate', w.paused ? 'Paused' : 'Live'); });
    call.on('close', function () { if (watching === w && w.call === call) endWatch(w.name + ' stopped sharing'); });
    call.on('error', function () { if (watching === w) endWatch('The connection was lost'); });
    var iv = setInterval(function () {
      if (watching !== w || w.call !== call) return clearInterval(iv);
      var pc = call.peerConnection, st = pc && pc.iceConnectionState;
      if (st === 'disconnected') fire('wstate', 'Reconnecting…');
      else if (st === 'failed') { clearInterval(iv); endWatch('The connection failed (network blocked?)'); }
      else if ((st === 'connected' || st === 'completed') && w.got) fire('wstate', w.paused ? 'Paused' : 'Live');
    }, 1000);
  };
  function endWatch(why, quiet) {
    var w = watching; if (!w) return;
    watching = null; clearTimeout(wTimer);
    try { w.call && w.call.close(); } catch (_) { /* */ }
    fire('left', why, quiet);
  }
  S.leave = function (quiet) { if (!watching) return; SSPeer.signal(watching.id, { t: 'leave' }); endWatch('Stopped watching', true); };
  S.watchingId = function () { return watching && watching.id; };

  /* ---------- signals + roster ---------- */
  S.signal = function (m, from) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'watch') return onWatch(from, String(m.name || '').slice(0, 40), String(m.did || '').slice(0, 32));   // SS1: onWatch(from, name)
    if (m.t === 'leave') { if (asks[from]) { clearTimeout(asks[from].t); delete asks[from]; fire('decided', from, 'gone'); } return dropViewer(from, null, 'left'); }
    if (m.t === 'proof') return onProof(from, m);
    if (m.t === 'trust') {   // SS2: only accepted on a private code
      if (SSPeer.open()) return;
      var dv = devOf(from), did = String(m.did || ''), tok = String(m.token || '');
      if (!/^[0-9a-f]{12,32}$/.test(did) || !/^[0-9a-f]{16,64}$/.test(tok) || (dv && dv.did && dv.did !== did)) return;
      var k = Object.assign({}, SSStore.get('keys')); k[did] = { name: String(m.name || (dv && dv.name) || 'Device').slice(0, 40), token: tok }; SSStore.set('keys', k);
      return;
    }
    if (!watching || from !== watching.id) return;
    if (m.t === 'paused') { watching.paused = !!m.on; fire('wpaused', watching.paused); fire('wstate', watching.paused ? 'Paused' : 'Live'); }
    else if (m.t === 'stopped') endWatch(watching.name + ' stopped sharing');
    else if (m.t === 'asking') { fire('wstate', 'Waiting for ' + watching.name + ' to allow…'); var me = watching; clearTimeout(wTimer); wTimer = setTimeout(function () { if (watching === me && !me.got) endWatch('The sharer declined'); }, ASK_MS + 10000); }
    else if (m.t === 'denied') endWatch('The sharer declined');
    else if (m.t === 'prove') {
      var sd = devOf(from), key = sd && sd.did && (SSStore.get('keys') || {})[sd.did], myId = SSPeer.id(), n = String(m.n || '');
      if (key && key.token && n) mac(key.token, n + '|' + from + '|' + myId).then(function (x) { SSPeer.signal(from, { t: 'proof', n: n, mac: x }); }, function () { /* sharer falls back to asking */ });
    }
    else if (m.t === 'full') endWatch(watching.name + ' already has ' + (m.max || MAXV) + ' viewers. Try again later.');
  };
  var lastRL = [], trustSent = {};
  S.roster = function (rl) {
    lastRL = rl || [];
    if (!SSPeer.open()) (rl || []).forEach(function (d) {   // SS2: tokens only on a private code
      if (!d.did || !/^[0-9a-f]{12,32}$/.test(d.did) || trustSent[d.id] || d.did === SSStore.get('did')) return;
      var tr = Object.assign({}, SSStore.get('trusted'));
      if (!tr[d.did]) { tr[d.did] = { name: String(d.name || 'Device').slice(0, 40), token: SSStore.token(16) }; SSStore.set('trusted', tr); }
      trustSent[d.id] = 1; SSPeer.signal(d.id, { t: 'trust', did: SSStore.get('did'), name: SSStore.name(), token: tr[d.did].token });
    });
    Object.keys(trustSent).forEach(function (id) { if (!(rl || []).some(function (d) { return d.id === id; })) delete trustSent[id]; });
    Object.keys(asks).forEach(function (id) { if (!(rl || []).some(function (d) { return d.id === id; })) { clearTimeout(asks[id].t); delete asks[id]; fire('decided', id, 'gone'); } });
    var has = function (id) { return rl.some(function (d) { return d.id === id; }); };
    Object.keys(viewers).forEach(function (id) {
      if (!has(id)) setTimeout(function () { if (viewers[id] && !lastRL.some(function (d) { return d.id === id; })) dropViewer(id, null, 'gone'); }, 4000);
    });
    if (watching) {
      var w = watching, d = rl.filter(function (x) { return x.id === w.id; })[0];
      if (d && d.share && d.share.paused !== w.paused && w.got) { w.paused = d.share.paused; fire('wpaused', w.paused); }
      if (!d || !d.share) setTimeout(function () {
        if (watching !== w) return;
        var e = lastRL.filter(function (x) { return x.id === w.id; })[0];
        if (!e) endWatch(w.name + ' left'); else if (!e.share) endWatch(w.name + ' stopped sharing');
      }, 4000);
    }
  };
  addEventListener('pagehide', function () { S.stop(); S.leave(true); });
  window.SSShare = S;
})();
