/*
  Project: sites (shared)
  File: shared/link/hub_mesh.js
  Role: H50 Hub mesh core: ONE shared PeerJS connection per Connect Code that every Hub device joins, so
  devices find each other once and apps (later, H50b+) talk over named channels instead of running their
  own lobbies. Plain JS, no build. Needs SharedLink.loadPeer() (link_core.js, the one pinned PeerJS) and
  SharedLinkDevices.id() (link_devices.js, H50a id 'hub-xxxxxxxx-xxx').

  Peer ids (one mesh per Connect Code, prefix 'jtsites-'):
    lobby   jtsites-<code>-mesh-0            held by whoever claimed it first (by default the PC running
                                             hub.html in Desktop mode, opts.preferLobby)
    device  jtsites-<code>-mesh-<deviceId>   every device, always (also the lobby device: it holds both)
  Lobby: keeps the roster [{deviceId, name, mode, apps:{}, joinOrder, lastSeen, online, lobby, relay}]
    (max MAX_ROSTER), introduces peers (roster broadcast) and relays. Peers connect directly to each other
    (full mesh) while the online count is <= MAX_DIRECT (8): the first 8 online devices by joinOrder (the
    lobby device always) are 'direct'; any later one is 'relay' and talks only through the lobby.
    Of two direct devices the one with the smaller deviceId dials (no double connections).
  Liveness: heartbeat every HB_MS (2 s) on every connection; nothing for DEAD_MS (6 s) = dead.
  Takeover: lobby dead → every living device ranks the living devices it knows (itself + direct peers
    heard from within DEAD_MS, old lobby excluded) by joinOrder; rank r waits r × RANK_MS + random
    0–1.5 s, and if there is still no lobby it claims -0. PeerJS 'unavailable-id' = someone else won →
    it joins that lobby. The broker allows one holder of an id, so there is one winner. The new lobby's
    term = highest term seen + 1; envelopes from an older term are ignored. A returning device (also the
    original PC) first tries to JOIN the lobby; it claims only when no lobby answers (no flapping).
  Envelope (every message, JSON): {v:1, ch, from, to, t, term, id, data}
    ch   'hub', an app name (/^[a-z][a-z0-9-]{0,31}$/) or '_mesh' (internal control: hello, welcome,
         roster, hb, info, bye)
    from sender deviceId (must match the connection it came on; the lobby checks relayed ones)
    to   deviceId or '*'; t = send time (ms); term = sender's lobby term; id = for de-duplication
  Limits: envelope <= MAX_BYTES (240 KiB of UTF-8, under Chrome's 256 KiB data-channel limit), checked on
    send (returns {ok:false, reason:'size'}) and on receive (dropped); per-sender incoming rate RATE_PER_S
    (burst RATE_BURST) and own outgoing rate, over = dropped; shape validated; app identity <= 2 KB of
    JSON; this file never renders anything (Settings shows the roster with textContent only).
  Security (H50 = core only; Jor and Team 2 design security next): any page that knows the Connect Code can
    join and claim any free device id on the PeerJS broker. Hooks for that work: HubMesh.hooks =
    { approveJoin(hello, peerId) → bool (lobby, before a device enters the roster),
      sign(env) → env (before send), verify(env, peerId) → bool (after shape / size / rate checks) }.
    Defaults allow everything. Open risks are listed in hub/docs/README_technical_team2.txt (H50).
  API window.HubMesh:
    start(code, { preferLobby, name, mode }) / stop()     restart with another code = stop + start
    me() → { deviceId, name, mode, apps, lobby, relay, term, state, code }
    peers() → online roster entries except this device;  roster() → every entry (offline ones too)
    on('peers' | 'lobby' | 'roster' | 'status', fn) → fn; off(ev, fn)
    channel(name) → { send(to, data), broadcast(data), on(fn(data, from, env)) → unsubscribe, peers() }
    setAppIdentity(app, obj | null)   saved in localStorage 'hub-mesh-id-<app>', advertised in the roster
    appIdentity(app); refresh() (name / mode changed); isLobby(); term(); lobbyId(); state(); stats()
    lobbyInfo() → { dev, name, site, self } | null   (H77: who holds the lobby; site = location.host, 'file' on file://)
  H55 public mesh: code PUBLIC_CODE '0000' (or start(code, { public: true })) = the public mesh every Hub without a
    private mesh joins (hub_meshlink.js decides). S.pub is enforced HERE, not just in the UI:
      - only '_mesh' control (hello / welcome / roster / hb / info / bye = presence) and the 'invite' channel pass,
        on send (channel().send / broadcast → {ok:false, reason:'public'}) and on receive (accept(): dropped,
        stats.dropPublic), so a lobby relaying on 0000 (overflow past MAX_DIRECT) only ever relays presence /
        invites; sync, keys, profile and every app channel are refused both ways;
      - names trimmed to PUB_NAME (16) characters, app identities never advertised (apps = {}) in or out;
      - roster capped at PUB_ROSTER (20): the lobby says bye 'full' to the 21st (after pruning offline ones);
      - invite: HubMesh.invite(toDeviceId, code) → envelope ch 'invite' data {k:'invite', code, name}; one device
        only (no '*'), code 4 digits and never 0000, at most 1 per INVITE_GAP_MS per sender both ways; a valid
        one fires on('invite', {from, name, code, at}). 'invite' is reserved: channel('invite') throws.
    API: isPublic(), PUBLIC_CODE, invite(to, code), on('invite', fn); me().public.
  H55b join wait (public 0000 AND private meshes, one set of constants): a join gets JOIN_WAIT_MS (60 s) for the
    PeerJS connection to open AND the lobby's 'welcome' to arrive (H50 closed it after 5 s, so on slow real links
    (Jio carrier NAT, Tailscale, TURN) devices looped claim / rejoin every ~9 s and never linked). 'hello' is resent
    every HELLO_MS (2.5 s) until 'welcome' (as link_core.js does); a PeerJS close / error ends the wait early, and
    peer-unavailable (-0 really free) goes straight to the takeover. The heartbeat takeover (tick) never fires on a
    join that is still inside its wait. A failed join (no welcome) counts as a join failure: the device checks -0
    (claim); if someone holds it, it waits RETRY_MS (a flat 5 s) and joins again ('retrying', retryAt). Retries stop
    GIVEUP_MS (5 min) after the first failure of the current run ('gaveup' = "Not linked: tap to retry"); a fresh
    run starts with HubMesh.retry() (Settings › Devices Retry), the tab becoming visible, the network coming back
    ('online') or a Connect link opening / closing (hub_meshlink.js). Success (welcome, or becoming the lobby)
    resets the run. window.HUB_MESH_JOIN_WAIT_MS / HUB_MESH_RETRY_MS / HUB_MESH_GIVEUP_MS override them (tests,
    as H25's HUB_REMOTE_GIVEUP_MS). me(): + joinState ('linking' | 'linked' | 'lobby' | 'retrying' | 'refused' |
    'gaveup' | ''), joinSince, retryAt, joinWaitMs; stats(): + joinFails, lastJoinMs, joinState, joinGaveUp.
  H84 group chat: channel 'chat' (CHAT_CH) is allowed on the public mesh (00000 = public room, a private code =
    private room, no extra encryption) with a checked shape (chatOk: broadcast only, data.type 'chat', data.from =
    sender, text <= 2000, id <= 80, name <= 40), on send and receive, private meshes too. API for app bots:
    HubMesh.broadcast({t:'<channel>', ...data}) → {ok, via|reason} (t is the channel; on 00000 only 'chat' passes),
    HubMesh.onMsg('<channel>', fn(data, fromDeviceId, env)) → unsubscribe, HubMesh.room() → current code,
    HubMesh.linked() → in a mesh (lobby or welcomed). Relayed + direct copies are de-duplicated by envelope id.
  Not here (later releases): postMessage bridge for app frames (H50b), media calls (H50c), removing the
  per-app lobbies (H50d). Existing SharedLink behaviour (controller, H29 sync, Pooh Chat) is unchanged.
*/
(function () {
  'use strict';
  if (window.HubMesh) return;

  var PREFIX = 'jtsites-';
  var HB_MS = 2000, DEAD_MS = 6000, CLAIM_JITTER_MS = 1500, RANK_MS = 3000;
  var MAX_DIRECT = 8, MAX_ROSTER = 32, OFFLINE_KEEP_MS = 10 * 60 * 1000;
  var MAX_BYTES = 240 * 1024, MAX_IDENTITY = 2048;
  var RATE_PER_S = 60, RATE_BURST = 120;
  var ID_RETRY_MS = [1000, 2000, 3000, 5000, 5000, 8000, 10000, 15000];
  var CH_RE = /^[a-z][a-z0-9-]{0,31}$/, CTRL = '_mesh';
  var DEV_RE = /^hub-[a-z0-9]{8}-[a-z0-9]{3}$/;
  var CODE_RE = /^[A-Za-z0-9]{3,12}$/;
  var IDK = 'hub-mesh-id-';
  /* H55: public mesh */
  // var PUBLIC_CODE = '0000', ...   (before H83)
  var PUBLIC_CODE = '00000', PUB_NAME = 16, PUB_ROSTER = 20, INVITE_CH = 'invite', INVITE_GAP_MS = 3000;
  // var INV_CODE_RE = /^\d{4}$/;   (before H83)
  var INV_CODE_RE = /^\d{5}$/;   // H83
  /* H84: group chat over the mesh. Channel 'chat', broadcast only, data = SharedChat row
     {type:'chat', id, from, name, text, ts, room}; from must be the sending device; text <= 2000. Allowed on the
     public mesh too (00000 = the public room, Jor: no extra encryption), checked here both ways. */
  var CHAT_CH = 'chat', CHAT_TEXT = 2000;
  function chatOk(e) {
    var d = e.data;
    if (e.to !== '*' || !d || typeof d !== 'object' || Array.isArray(d) || d.type !== 'chat') return false;
    if (typeof d.text !== 'string' || !d.text || d.text.length > CHAT_TEXT) return false;
    if (typeof d.id !== 'string' || !d.id || d.id.length > 80 || d.from !== e.from) return false;
    if (typeof d.name !== 'string' || d.name.length > 40) return false;
    return true;
  }
  /* H55b: join wait / retry / give up (one set for 0000 and private meshes) */
  function tune(k, d) { var v = +window[k]; return v > 0 ? v : d; }
  var JOIN_WAIT_MS = tune('HUB_MESH_JOIN_WAIT_MS', 60000), HELLO_MS = 2500;
  var RETRY_MS = tune('HUB_MESH_RETRY_MS', 5000), GIVEUP_MS = tune('HUB_MESH_GIVEUP_MS', 5 * 60 * 1000);
  function pub() { return !!(S && S.pub); }
  function rosterCap() { return pub() ? PUB_ROSTER : MAX_ROSTER; }
  function nameCap() { return pub() ? PUB_NAME : 40; }
  /** H55: may this envelope travel on the public mesh? (presence + a well-formed one-to-one invite only) */
  function pubAllowed(e) {
    if (e.ch === CTRL) return true;
    if (e.ch === CHAT_CH) return chatOk(e);   // H84: group chat is the public room's one app channel
    if (e.ch !== INVITE_CH || e.to === '*') return false;
    var d = e.data;
    return !!(d && typeof d === 'object' && d.k === 'invite' && INV_CODE_RE.test(String(d.code)) && d.code !== PUBLIC_CODE);
  }

  var enc = window.TextEncoder ? new TextEncoder() : null;
  function bytes(s) { return enc ? enc.encode(s).length : s.length * 3; }

  /* ---------- events ---------- */
  var L = {};
  function on(ev, fn) { (L[ev] = L[ev] || []).push(fn); return fn; }
  function off(ev, fn) { var l = L[ev] || []; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
  function emit(ev, a, b, c) { (L[ev] || []).slice().forEach(function (f) { try { f(a, b, c); } catch (e) { console.warn('HubMesh ' + ev, e); } }); }

  var hooks = {
    approveJoin: function () { return true; },   // TODO(security, after H50): join approval / allow-list
    sign: function (env) { return env; },        // TODO(security): sign envelopes (device key pair)
    verify: function () { return true; }         // TODO(security): verify signatures / pinned keys
  };

  /* ---------- state ---------- */
  var S = null;   // null = stopped
  function fresh(code, opts) {
    return {
      code: code, opts: opts || {}, dev: '', peer: null, lobbyPeer: null,
      state: 'starting', term: 0, isLobby: false, lobbyDev: '',
      lobbyConn: null, lobbyLast: 0, lobbyAsk: 0, joinTimer: 0, claimTimer: 0, everLobby: false,
      direct: new Map(),      // deviceId -> { conn, last }
      members: new Map(),     // lobby only: deviceId -> { conn, last }
      roster: new Map(),      // deviceId -> entry
      rv: 0, idRetry: 0, seen: [], seenSet: new Set(), buckets: new Map(), out: { tokens: RATE_BURST, at: Date.now() },
      stats: { sent: 0, recv: 0, dropSize: 0, dropRate: 0, dropShape: 0, dropTerm: 0, dropSpoof: 0, relayed: 0, dropPublic: 0, joinGaveUp: 0 },   // H55b: + joinGaveUp (times)
      hb: 0, seq: 0,
      pub: code === PUBLIC_CODE || !!(opts && opts.public), invOut: 0, invIn: new Map(),   // H55
      // H55b: join wait / retries
      joining: null, joinStart: 0, helloTimer: 0, joinState: '', joinFails: 0, lastJoinMs: 0, failStart: 0,
      retryTimer: 0, retryAt: 0, gaveUp: false,
      holder: null            // H77: { dev, name, site } the lobby says about itself (roster / welcome / bye)
    };
  }
  function lobbyPeerId() { return PREFIX + S.code + '-mesh-0'; }
  function devPeerId(d) { return PREFIX + S.code + '-mesh-' + d; }
  function devOfPeer(pid) {
    var pre = PREFIX + S.code + '-mesh-';
    if (typeof pid !== 'string' || pid.indexOf(pre) !== 0) return '';
    var d = pid.slice(pre.length);
    return DEV_RE.test(d) ? d : '';
  }
  function safeSend(conn, obj) { try { if (conn && conn.open) { conn.send(obj); return true; } } catch (_) { /* gone */ } return false; }
  function status(st) { if (S) { S.state = st; emit('status', st); } }

  /* ---------- identity ---------- */
  // function myMode() { return S && S.opts.mode ? S.opts.mode : (window.__hubRemote ? 'phone' : (window.HubMode && window.HubMode.mode === 'desktop' ? 'desktop' : 'phone')); }   // (before H53)
  function myMode() { return S && S.opts.mode ? S.opts.mode : (window.HubMode && window.HubMode.mode === 'desktop' ? 'desktop' : 'phone'); }   // H53: a joined device reports its real mode
  // function myName() { var D = window.SharedLinkDevices; return String((S && S.opts.name) || (D ? D.name() : 'Device')).slice(0, 40); }   // (before H55)
  function myName() { var D = window.SharedLinkDevices; return String((S && S.opts.name) || (D ? D.name() : 'Device')).slice(0, nameCap()); }   // H55: 16 on 0000
  function cleanIdentity(o) {
    if (o == null) return null;
    var s;
    try { s = JSON.stringify(o); } catch (_) { return undefined; }
    if (!s || s.length > MAX_IDENTITY || typeof o !== 'object' || Array.isArray(o)) return undefined;
    return JSON.parse(s);
  }
  function myApps() {
    var out = {};
    if (pub()) return out;   // H55: no app identities on the public mesh
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(IDK) !== 0) continue;
        var app = k.slice(IDK.length);
        if (!CH_RE.test(app)) continue;
        var v = cleanIdentity(JSON.parse(localStorage.getItem(k) || 'null'));
        if (v) out[app] = v;
      }
    } catch (_) { /* blocked */ }
    return out;
  }
  // H77: who holds the lobby: the lobby adds { dev, name, site } to welcome / roster / bye; members keep it
  function holderSelf() { return { dev: S.dev, name: myName(), site: location.protocol === 'file:' ? 'file' : String(location.host).slice(0, 64) }; }
  function keepHolder(x) { var h = x.data && x.data.lobby; S.holder = h && typeof h === 'object' ? { dev: x.from, name: String(h.name || '').slice(0, nameCap()), site: String(h.site || '').slice(0, 64) } : null; }
  function selfInfo() { return { deviceId: S.dev, name: myName(), mode: myMode(), apps: myApps() }; }

  /* ---------- envelopes ---------- */
  function envelope(ch, to, data) {
    return hooks.sign({ v: 1, ch: ch, from: S.dev, to: to, t: Date.now(), term: S.term, id: S.dev + '.' + (++S.seq).toString(36) + Math.random().toString(36).slice(2, 6), data: data === undefined ? null : data });
  }
  /** shape check; returns '' when fine, else a reason */
  function badShape(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return 'shape';
    if (e.v !== 1 || typeof e.ch !== 'string' || !(e.ch === CTRL || CH_RE.test(e.ch))) return 'shape';
    if (!DEV_RE.test(String(e.from)) || !(e.to === '*' || DEV_RE.test(String(e.to)))) return 'shape';
    if (typeof e.t !== 'number' || typeof e.term !== 'number' || e.term < 0 || e.term % 1 || typeof e.id !== 'string' || e.id.length > 64) return 'shape';
    return '';
  }
  function sizeOf(e) { try { return bytes(JSON.stringify(e)); } catch (_) { return Infinity; } }
  function rateOk(from) {
    var now = Date.now(), b = S.buckets.get(from);
    if (!b) { b = { tokens: RATE_BURST, at: now }; S.buckets.set(from, b); }
    b.tokens = Math.min(RATE_BURST, b.tokens + (now - b.at) * RATE_PER_S / 1000); b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1; return true;
  }
  function outRateOk() {
    var now = Date.now(), b = S.out;
    b.tokens = Math.min(RATE_BURST, b.tokens + (now - b.at) * RATE_PER_S / 1000); b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1; return true;
  }
  function dup(id) {
    if (S.seenSet.has(id)) return true;
    S.seenSet.add(id); S.seen.push(id);
    if (S.seen.length > 600) S.seenSet.delete(S.seen.shift());
    return false;
  }

  /** every incoming envelope: via = 'direct' (from a device peer) | 'lobby' (from the lobby, members) |
   *  'member' (lobby: from a member) | 'local' (lobby device ↔ its own lobby) */
  function accept(e, via, connDev) {
    if (!S) return false;
    var why = badShape(e);
    if (why) { S.stats.dropShape++; return false; }
    if (sizeOf(e) > MAX_BYTES) { S.stats.dropSize++; return false; }
    if ((via === 'direct' || via === 'member') && e.from !== connDev) { S.stats.dropSpoof++; return false; }   // spoofed sender
    if (via !== 'local' && !rateOk(via === 'lobby' ? 'lobby:' + e.from : e.from)) { S.stats.dropRate++; return false; }
    if (!hooks.verify(e, connDev)) { S.stats.dropSpoof++; return false; }
    if (e.term < S.term) { S.stats.dropTerm++; return false; }   // older lobby term: ignore
    if (S.pub && !pubAllowed(e)) { S.stats.dropPublic++; return false; }   // H55: presence + invites only on 0000 (H84: + chat)
    if (e.ch === CHAT_CH && !chatOk(e)) { S.stats.dropShape++; return false; }   // H84
    return true;
  }

  /* ---------- delivering to this device ---------- */
  var chans = {};   // name -> [fn]
  function deliver(e) {
    if (e.to !== '*' && e.to !== S.dev) return;
    if (e.from === S.dev) return;
    if (dup(e.id)) return;
    if (e.term > S.term && e.ch !== CTRL) S.term = e.term;   // gossip: a newer term seen on data
    S.stats.recv++;
    if (e.ch === INVITE_CH) { gotInvite(e); return; }   // H55
    (chans[e.ch] || []).slice().forEach(function (f) { try { f(e.data, e.from, e); } catch (err) { console.warn('HubMesh channel ' + e.ch, err); } });
  }

  /* ---------- roster ---------- */
  function rosterList() {
    var out = [];
    S.roster.forEach(function (r) { out.push(Object.assign({}, r, { apps: Object.assign({}, r.apps) })); });
    out.sort(function (a, b) { return a.joinOrder - b.joinOrder; });
    return out;
  }
  function onlineSorted() { return rosterList().filter(function (r) { return r.online; }); }
  function amDirect() { var me = S.roster.get(S.dev); return !me || !me.relay; }
  function setRoster(list, term, lobbyDev) {
    var before = peersKey();
    S.roster = new Map();
    // (list || []).slice(0, MAX_ROSTER).forEach(function (r) {   (before H55)
    (list || []).slice(0, rosterCap()).forEach(function (r) {   // H55: 20 on 0000
      if (!r || !DEV_RE.test(String(r.deviceId))) return;
      S.roster.set(r.deviceId, {
        // deviceId: r.deviceId, name: String(r.name || 'Device').slice(0, 40), ...   (before H55)
        deviceId: r.deviceId, name: String(r.name || 'Device').slice(0, nameCap()), mode: r.mode === 'desktop' ? 'desktop' : r.mode === 'phone' ? 'phone' : '',
        apps: !S.pub && r.apps && typeof r.apps === 'object' && !Array.isArray(r.apps) ? r.apps : {}, joinOrder: Number(r.joinOrder) || 0,   // H55: no apps on 0000
        lastSeen: Number(r.lastSeen) || 0, online: !!r.online, lobby: r.deviceId === lobbyDev, relay: !!r.relay
      });
    });
    S.rv++;
    emit('roster', rosterList());
    if (peersKey() !== before) emit('peers', peers());
    linkDirect();
  }
  function peersKey() { return peers().map(function (p) { return p.deviceId + (p.relay ? 'r' : ''); }).join(','); }
  function peers() { return S ? rosterList().filter(function (r) { return r.online && r.deviceId !== S.dev; }) : []; }

  /* full mesh between direct devices (smaller deviceId dials) */
  function linkDirect() {
    if (!S || !S.peer || !S.peer.open) return;
    var mineDirect = amDirect();
    S.roster.forEach(function (r, d) {
      if (d === S.dev) return;
      var want = mineDirect && r.online && !r.relay;
      var have = S.direct.get(d);
      if (!want) { if (have) { closeDirect(d); } return; }
      if (have || S.dev > d) return;   // the other side dials
      dialDirect(d);
    });
  }
  function dialDirect(d) {
    var conn = S.peer.connect(devPeerId(d), { reliable: true, serialization: 'json', metadata: { kind: 'mesh-peer', v: 1, dev: S.dev } });
    attachDirect(conn, d);
  }
  function attachDirect(conn, d) {
    var old = S.direct.get(d);
    if (old && old.conn !== conn) { try { old.conn.close(); } catch (_) { /* gone */ } }
    var rec = { conn: conn, last: Date.now() };
    S.direct.set(d, rec);
    conn.on('data', function (x) {
      if (!S || S.direct.get(d) !== rec) return;
      rec.last = Date.now();
      if (!accept(x, 'direct', d)) return;
      if (x.ch === CTRL) return;   // direct conns carry only hb pings (ch _mesh) and data
      deliver(x);
    });
    conn.on('close', function () { if (S && S.direct.get(d) === rec) { S.direct.delete(d); } });
    conn.on('error', function () { /* close follows */ });
  }
  function closeDirect(d) { var r = S.direct.get(d); S.direct.delete(d); try { if (r) r.conn.close(); } catch (_) { /* gone */ } }

  /* ---------- the device peer ---------- */
  function startPeer() {
    if (!S) return;
    var me = S;
    var p = me.peer = new window.Peer(devPeerId(me.dev), { debug: 0 });
    p.on('open', function () {
      if (S !== me || me.peer !== p) return;
      me.idRetry = 0;
      if (me.opts.preferLobby) claimLobby('prefer'); else joinLobby();
    });
    p.on('connection', function (conn) {
      if (S !== me || me.peer !== p) return;
      var md = conn.metadata || {};
      var d = devOfPeer(conn.peer);
      if (md.kind !== 'mesh-peer' || !d || md.dev !== d || d === me.dev) { conn.on('open', function () { try { conn.close(); } catch (_) { /* gone */ } }); return; }
      attachDirect(conn, d);
    });
    p.on('error', function (err) {
      if (S !== me || me.peer !== p) return;
      var type = err && err.type, msg = String((err && err.message) || '');
      if (type === 'unavailable-id') {   // our device id is still registered (reload) or another tab of this browser
        var dly = ID_RETRY_MS[Math.min(me.idRetry++, ID_RETRY_MS.length - 1)];
        status(me.idRetry > 4 ? 'duplicate' : 'retry');
        try { p.destroy(); } catch (_) { /* gone */ }
        me.peer = null;
        setTimeout(function () { if (S === me && !me.peer) startPeer(); }, dly);
      } else if (type === 'peer-unavailable') {
        if (msg.indexOf(lobbyPeerId()) >= 0) lobbyMissing();
        // a direct peer that is gone: its conn closes, the roster will say offline
      } else if (/^(network|server-error|socket-error|socket-closed|disconnected)$/.test(type)) {
        status('retry');
        setTimeout(function () { if (S === me && me.peer === p && !p.destroyed) { try { p.reconnect(); } catch (_) { /* restart below */ } } }, 3000);
      }
    });
    p.on('disconnected', function () {
      if (S !== me || me.peer !== p || p.destroyed) return;
      setTimeout(function () { if (S === me && me.peer === p && !p.destroyed && p.disconnected) { try { p.reconnect(); } catch (_) { /* gone */ } } }, 2000);
    });
  }

  /* ---------- member side: joining the lobby ---------- */
  // (before H55b: a 5 s deadline for the welcome and one 'hello')
  // function joinLobby() {
  //   if (!S || S.isLobby || !S.peer || !S.peer.open) return;
  //   clearTimeout(S.joinTimer);
  //   var me = S;
  //   status('joining');
  //   var conn = me.peer.connect(lobbyPeerId(), { reliable: true, serialization: 'json', metadata: { kind: 'mesh', v: 1, dev: me.dev } });
  //   me.lobbyConn = conn; me.lobbyLast = Date.now(); me.lobbyAsk = Date.now();
  //   var welcomed = false;
  //   conn.on('open', function () {
  //     if (S !== me || me.lobbyConn !== conn) return;
  //     safeSend(conn, envelope(CTRL, '*', Object.assign({ k: 'hello', site: location.host }, selfInfo())));
  //   });
  //   conn.on('data', function (x) {
  //     if (S !== me || me.lobbyConn !== conn) return;
  //     if (!x || badShape(x)) { me.stats.dropShape++; return; }
  //     if (x.ch === CTRL && x.data && x.data.k === 'welcome') {
  //       if (x.term < me.term) { me.stats.dropTerm++; try { conn.close(); } catch (_) { /* stale lobby */ } return; }
  //       welcomed = true;
  //       me.term = x.term; me.lobbyDev = x.from; me.lobbyLast = Date.now();
  //       clearTimeout(me.claimTimer); me.claimTimer = 0;
  //       status('linked');
  //       setRoster(x.data.roster, x.term, x.from);
  //       emit('lobby', lobbyInfo());
  //       return;
  //     }
  //     if (!accept(x, 'lobby', '')) return;
  //     me.lobbyLast = Date.now();
  //     if (x.ch === CTRL) { ctrlFromLobby(x); return; }
  //     deliver(x);
  //   });
  //   conn.on('close', function () { if (S === me && me.lobbyConn === conn && !me.refused) lobbyLost(welcomed ? 'closed' : 'no-answer'); });
  //   conn.on('error', function () { /* close follows */ });
  //   // no welcome in time = treat as missing
  //   setTimeout(function () { if (S === me && me.lobbyConn === conn && !welcomed) { try { conn.close(); } catch (_) { /* gone */ } lobbyLost('no-answer'); } }, 5000);
  // }

  /** H55b: join the lobby, waiting up to JOIN_WAIT_MS for open + welcome; 'hello' every HELLO_MS until welcome */
  function joinLobby() {
    if (!S || S.isLobby || !S.peer || !S.peer.open || S.gaveUp) return;
    clearTimeout(S.joinTimer); clearTimeout(S.retryTimer); S.retryTimer = 0; S.retryAt = 0;
    var me = S;
    status('joining');
    var conn = me.peer.connect(lobbyPeerId(), { reliable: true, serialization: 'json', metadata: { kind: 'mesh', v: 1, dev: me.dev } });
    me.lobbyConn = conn; me.lobbyLast = Date.now(); me.lobbyAsk = Date.now();
    me.joining = conn; me.joinStart = Date.now(); me.joinState = 'linking';
    var welcomed = false;
    function hello() { if (S === me && me.lobbyConn === conn && !welcomed) safeSend(conn, envelope(CTRL, '*', Object.assign({ k: 'hello', site: location.host }, selfInfo()))); }
    function endWait() { clearInterval(me.helloTimer); me.helloTimer = 0; clearTimeout(me.joinTimer); me.joinTimer = 0; if (me.joining === conn) me.joining = null; }
    conn.on('open', function () {
      if (S !== me || me.lobbyConn !== conn) return;
      me.lobbyLast = Date.now();
      hello();
      clearInterval(me.helloTimer);
      me.helloTimer = setInterval(function () { if (S !== me || me.lobbyConn !== conn || welcomed) { clearInterval(me.helloTimer); return; } hello(); }, HELLO_MS);
    });
    conn.on('data', function (x) {
      if (S !== me || me.lobbyConn !== conn) return;
      if (!x || badShape(x)) { me.stats.dropShape++; return; }
      if (x.ch === CTRL && x.data && x.data.k === 'welcome') {
        if (welcomed) return;   // H55b: one welcome per join (hello may have been resent)
        if (x.term < me.term) { me.stats.dropTerm++; try { conn.close(); } catch (_) { /* stale lobby */ } return; }
        welcomed = true;
        endWait();
        me.lastJoinMs = Date.now() - me.joinStart; me.joinState = 'linked'; joinOk();
        me.term = x.term; me.lobbyDev = x.from; me.lobbyLast = Date.now();
        clearTimeout(me.claimTimer); me.claimTimer = 0;
        status('linked');
        keepHolder(x);   // H77
        setRoster(x.data.roster, x.term, x.from);
        emit('lobby', lobbyInfo());
        return;
      }
      if (!accept(x, 'lobby', '')) return;
      me.lobbyLast = Date.now();
      if (x.ch === CTRL) { ctrlFromLobby(x); return; }
      deliver(x);
    });
    conn.on('close', function () {
      if (S !== me) return;
      if (!welcomed) endWait();
      if (me.lobbyConn === conn && !me.refused) { if (welcomed) lobbyLost('closed'); else joinFailed('closed'); }   // H50: lobbyLost(welcomed ? 'closed' : 'no-answer')
    });
    conn.on('error', function () { /* close follows */ });
    // no welcome within JOIN_WAIT_MS = a failed join (H50: 5 s)
    me.joinTimer = setTimeout(function () {
      if (S !== me || me.lobbyConn !== conn || welcomed) return;
      endWait();
      me.lobbyConn = null;
      try { conn.close(); } catch (_) { /* gone */ }
      joinFailed('timeout');   // H50: lobbyLost('no-answer')
    }, JOIN_WAIT_MS);
  }
  /* H55b: join bookkeeping */
  function joinOk() { var me = S; me.joinFails = 0; me.failStart = 0; me.gaveUp = false; clearTimeout(me.retryTimer); me.retryTimer = 0; me.retryAt = 0; }
  /** a join ended without a welcome (wait over, or PeerJS closed it): check -0 at once (free = take it, held =
   *  scheduleRetry via the claim's unavailable-id), or give up when the run is past GIVEUP_MS */
  function joinFailed(why) {
    var me = S;
    me.lobbyConn = null;
    me.joinFails++;
    if (!me.failStart) me.failStart = me.joinStart || Date.now();
    me.joinState = 'retrying'; me.lastFail = why;
    if (overBudget()) { giveUp(); return; }
    clearTimeout(me.claimTimer); me.claimTimer = 0;
    status('retrying');
    claimLobby('probe');
  }
  function overBudget() { return !!(S.failStart && Date.now() - S.failStart >= GIVEUP_MS); }
  function giveUp() {
    var me = S;
    if (me.gaveUp) return;
    me.gaveUp = true; me.joinState = 'gaveup'; me.stats.joinGaveUp++;
    clearTimeout(me.retryTimer); me.retryTimer = 0; me.retryAt = 0;
    clearTimeout(me.claimTimer); me.claimTimer = 0;
    if (me.lobbyConn) { var c = me.lobbyConn; me.lobbyConn = null; try { c.close(); } catch (_) { /* gone */ } }
    status('gaveup');
  }
  /** -0 is held by someone who did not answer: wait RETRY_MS, then join again (or give up after GIVEUP_MS) */
  function scheduleRetry() {
    var me = S;
    if (overBudget()) { giveUp(); return; }
    me.joinState = 'retrying'; me.retryAt = Date.now() + RETRY_MS;
    clearTimeout(me.retryTimer);
    me.retryTimer = setTimeout(function () { if (S !== me) return; me.retryTimer = 0; me.retryAt = 0; if (!me.isLobby && !me.lobbyConn) joinLobby(); }, RETRY_MS);
    status('retrying');
  }
  /** a fresh run: Settings Retry, tab visible, back online, a Connect link opened / closed */
  function retry(why) {
    if (!S || S.isLobby || S.refused) return false;
    var me = S;
    if (!me.gaveUp && why !== 'manual') return false;   // automatic triggers only restart a run that gave up
    me.gaveUp = false; me.failStart = 0;
    clearTimeout(me.retryTimer); me.retryTimer = 0; me.retryAt = 0;
    clearTimeout(me.claimTimer); me.claimTimer = 0;
    if (me.lobbyConn && me.joining !== me.lobbyConn) return true;   // already linked
    if (me.joining) return true;   // a join is in its wait already
    if (me.peer && me.peer.open) joinLobby(); else if (!me.peer) startPeer();
    return true;
  }
  function ctrlFromLobby(x) {
    var k = x.data && x.data.k;
    if (k === 'roster') { if (x.from !== S.lobbyDev) return; if (x.term > S.term) S.term = x.term; keepHolder(x); setRoster(x.data.roster, x.term, x.from); }
    else if (k === 'bye') {   // the lobby refused us (site / denied / full): stop asking until start() again
      S.refused = String(x.data.reason || 'refused').slice(0, 20);
      keepHolder(x);   // H77: who refused us (older lobbies send nothing)
      var c = S.lobbyConn; S.lobbyConn = null; try { if (c) c.close(); } catch (_) { /* gone */ }
      S.joinState = 'refused'; S.joining = null; clearInterval(S.helloTimer); clearTimeout(S.joinTimer);   // H55b
      status('refused');
    }
    else if (k === 'hb') { /* lobbyLast already updated */ }
  }
  function lobbyMissing() { if (S && !S.isLobby && S.lobbyConn) { var c = S.lobbyConn; S.lobbyConn = null; S.joining = null; clearInterval(S.helloTimer); clearTimeout(S.joinTimer);   /* H55b: -0 is free: end the join wait */ try { c.close(); } catch (_) { /* gone */ } lobbyLost('missing'); } }

  /** lobby gone or never there: rank the living devices, the first claims after a random delay */
  function lobbyLost(why) {
    // if (!S || S.isLobby || S.refused) return;   (before H55b)
    if (!S || S.isLobby || S.refused || S.gaveUp) return;   // H55b: given up = wait for retry()
    var me = S;
    me.lobbyConn = null;
    if (me.failStart && overBudget()) { giveUp(); return; }   // H55b
    var oldLobby = me.lobbyDev;
    me.holder = null;   // H77
    if (oldLobby) {
      me.lobbyDev = '';
      var r = me.roster.get(oldLobby);
      if (r) { r.online = false; r.lobby = false; emit('roster', rosterList()); emit('peers', peers()); }
      emit('lobby', lobbyInfo());
    }
    status('takeover');
    if (me.claimTimer) return;
    var now = Date.now();
    var living = rosterList().filter(function (x) {
      if (x.deviceId === me.dev) return true;
      if (x.deviceId === oldLobby) return false;
      var d = me.direct.get(x.deviceId);
      return !!(d && d.conn.open && now - d.last < DEAD_MS);
    });
    if (!living.some(function (x) { return x.deviceId === me.dev; })) living.push({ deviceId: me.dev, joinOrder: Infinity });
    living.sort(function (a, b) { return (a.joinOrder || Infinity) - (b.joinOrder || Infinity) || (a.deviceId < b.deviceId ? -1 : 1); });
    var rank = living.findIndex(function (x) { return x.deviceId === me.dev; });
    // never had a roster (first start, no lobby yet): non-preferred devices give the PC a head start
    if (!me.roster.size) rank = Math.max(rank, 1);
    var wait = rank * RANK_MS + Math.random() * CLAIM_JITTER_MS;
    me.claimTimer = setTimeout(function () {
      if (S !== me) return;
      me.claimTimer = 0;
      if (me.lobbyConn || me.isLobby) return;
      // before claiming, one more look: maybe someone already won
      probeThenClaim();
    }, wait);
  }
  function probeThenClaim() { claimLobby('takeover'); }   // hook: a later release may probe -0 first

  /* ---------- lobby side ---------- */
  function claimLobby(why) {
    if (!S || S.isLobby || S.lobbyPeer) return;
    var me = S;
    status('claiming');
    var lp = me.lobbyPeer = new window.Peer(lobbyPeerId(), { debug: 0 });
    lp.on('open', function () {
      if (S !== me || me.lobbyPeer !== lp) return;
      becomeLobby();
    });
    lp.on('connection', function (conn) { if (S === me && me.lobbyPeer === lp) memberConn(conn); });
    lp.on('error', function (err) {
      if (S !== me || me.lobbyPeer !== lp) return;
      var type = err && err.type;
      if (me.isLobby) {
        if (/^(network|server-error|socket-error|socket-closed|disconnected)$/.test(type)) setTimeout(function () { if (S === me && me.lobbyPeer === lp && !lp.destroyed) { try { lp.reconnect(); } catch (_) { /* gone */ } } }, 3000);
        return;
      }
      // 'unavailable-id' = someone else holds -0 (won): join it. Anything else: try joining too.
      try { lp.destroy(); } catch (_) { /* gone */ }
      me.lobbyPeer = null;
      // setTimeout(function () { if (S === me && !me.isLobby) joinLobby(); }, type === 'unavailable-id' ? 200 : 2000);   (before H55b)
      // H55b: after a failed join, -0 held = a flat RETRY_MS wait (no 9 s claim / rejoin loop); first race = 200 ms as before
      if (me.joinFails > 0) { scheduleRetry(); return; }
      setTimeout(function () { if (S === me && !me.isLobby) joinLobby(); }, type === 'unavailable-id' ? 200 : 2000);
    });
  }
  function becomeLobby() {
    var me = S;
    me.isLobby = true; me.everLobby = true;
    joinOk(); me.joinState = 'lobby'; me.joining = null; clearInterval(me.helloTimer); clearTimeout(me.joinTimer);   // H55b
    clearTimeout(me.claimTimer); me.claimTimer = 0;
    if (me.lobbyConn) { try { me.lobbyConn.close(); } catch (_) { /* gone */ } me.lobbyConn = null; }
    me.term = me.term + 1;
    me.lobbyDev = me.dev;
    var now = Date.now();
    // keep everyone's joinOrder; everyone but me is offline until they say hello to this lobby
    var info = selfInfo();
    var list = rosterList().map(function (r) { return Object.assign(r, { online: false, lobby: false }); });
    var mine = list.find(function (r) { return r.deviceId === me.dev; });
    if (!mine) { mine = { deviceId: me.dev, joinOrder: nextOrder(list) }; list.push(mine); }
    Object.assign(mine, info, { online: true, lastSeen: now, lobby: true, relay: false });
    me.roster = new Map(list.map(function (r) { return [r.deviceId, r]; }));
    computeRelay();
    status('lobby');
    emit('lobby', lobbyInfo());
    emit('roster', rosterList());
    emit('peers', peers());
  }
  function nextOrder(list) { var m = 0; (list || rosterList()).forEach(function (r) { if (r.joinOrder > m) m = r.joinOrder; }); return m + 1; }
  function computeRelay() {
    var n = 0;
    var on = rosterList().filter(function (r) { return r.online; });
    on.sort(function (a, b) { return (b.deviceId === S.dev) - (a.deviceId === S.dev) || a.joinOrder - b.joinOrder; });   // the lobby device always direct
    on.forEach(function (r) { var x = S.roster.get(r.deviceId); x.relay = n++ >= MAX_DIRECT; });
  }
  function memberConn(conn) {
    var me = S;
    var d = devOfPeer(conn.peer), md = conn.metadata || {};
    if (md.kind !== 'mesh' || !d || md.dev !== d || d === me.dev) { conn.on('open', function () { try { conn.close(); } catch (_) { /* gone */ } }); return; }
    var rec = { conn: conn, last: Date.now(), hello: false };
    conn.on('data', function (x) {
      if (S !== me || !me.isLobby) return;
      rec.last = Date.now();
      if (!rec.hello) {
        if (badShape(x) || x.ch !== CTRL || !x.data || x.data.k !== 'hello' || x.from !== d) return;
        if (x.data.site && x.data.site !== location.host) { safeSend(conn, envelope(CTRL, d, { k: 'bye', reason: 'site', lobby: holderSelf() })); return; }   // same site only (weak: can be faked)
        if (!hooks.approveJoin(x.data, conn.peer)) { safeSend(conn, envelope(CTRL, d, { k: 'bye', reason: 'denied' })); return; }
        // if (!me.roster.has(d) && me.roster.size >= MAX_ROSTER) { pruneOffline(true); if (me.roster.size >= MAX_ROSTER) {   (before H55)
        if (!me.roster.has(d) && me.roster.size >= rosterCap()) { pruneOffline(true); if (me.roster.size >= rosterCap()) { safeSend(conn, envelope(CTRL, d, { k: 'bye', reason: 'full' })); return; } }
        rec.hello = true;
        var old = me.members.get(d);
        if (old && old.conn !== conn) { try { old.conn.close(); } catch (_) { /* gone */ } }
        me.members.set(d, rec);
        if (x.term > me.term) { me.term = x.term + 1; }   // a member knew a newer term: stay above it
        var r = me.roster.get(d) || { deviceId: d, joinOrder: nextOrder() };
        Object.assign(r, info(x.data), { online: true, lastSeen: Date.now(), lobby: false });
        me.roster.set(d, r);
        computeRelay();
        safeSend(conn, envelope(CTRL, d, { k: 'welcome', roster: rosterList(), lobby: holderSelf() }));
        broadcastRoster(d);
        emit('roster', rosterList()); emit('peers', peers());
        return;
      }
      if (!accept(x, 'member', d)) return;
      var rr = me.roster.get(d); if (rr) rr.lastSeen = Date.now();
      if (x.ch === CTRL) {
        if (x.data && x.data.k === 'info') { var r2 = me.roster.get(d); if (r2) { Object.assign(r2, info(Object.assign({}, r2, x.data))); broadcastRoster(); emit('roster', rosterList()); } }
        return;
      }
      route(x);
    });
    conn.on('close', function () {
      if (S !== me || me.members.get(d) !== rec) return;
      me.members.delete(d);
      memberGone(d);
    });
    conn.on('error', function () { /* close follows */ });
  }
  function info(o) {
    var apps = {};
    if (!pub() && o.apps && typeof o.apps === 'object' && !Array.isArray(o.apps)) Object.keys(o.apps).slice(0, 32).forEach(function (a) { if (CH_RE.test(a)) { var v = cleanIdentity(o.apps[a]); if (v) apps[a] = v; } });
    return { name: String(o.name || 'Device').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, nameCap()), mode: o.mode === 'desktop' ? 'desktop' : o.mode === 'phone' ? 'phone' : '', apps: apps };
  }
  function memberGone(d) {
    var r = S.roster.get(d);
    if (r && r.online) { r.online = false; computeRelay(); broadcastRoster(); emit('roster', rosterList()); emit('peers', peers()); }
  }
  function broadcastRoster() {
    var list = rosterList();
    S.members.forEach(function (m, d) { safeSend(m.conn, envelope(CTRL, d, { k: 'roster', roster: list, lobby: holderSelf() })); });
    linkDirect();
  }
  function pruneOffline(force) {
    var now = Date.now(), changed = false;
    S.roster.forEach(function (r, d) { if (!r.online && d !== S.dev && (force || now - (r.lastSeen || 0) > OFFLINE_KEEP_MS)) { S.roster.delete(d); changed = true; } });
    if (changed) { broadcastRoster(); emit('roster', rosterList()); }
  }
  /** lobby: forward an envelope from a member (or this device) to its target(s) */
  function route(e) {
    var skipList = Array.isArray(e.skip) ? e.skip : [];
    if (e.to === '*') {
      S.members.forEach(function (m, d) { if (d !== e.from && skipList.indexOf(d) < 0) { safeSend(m.conn, strip(e)); S.stats.relayed++; } });
      if (e.from !== S.dev && skipList.indexOf(S.dev) < 0) deliver(strip(e));
    } else if (e.to === S.dev) {
      deliver(strip(e));
    } else {
      var m = S.members.get(e.to);
      if (m) { safeSend(m.conn, strip(e)); S.stats.relayed++; }
    }
  }
  function strip(e) { if (!e.skip) return e; var c = Object.assign({}, e); delete c.skip; return c; }

  /* ---------- heartbeat + liveness ---------- */
  function tick() {
    if (!S) return;
    var now = Date.now();
    // direct conns: ping, drop dead ones
    S.direct.forEach(function (r, d) {
      if (r.conn.open && now - r.last > DEAD_MS) { closeDirect(d); return; }
      if (r.conn.open) safeSend(r.conn, envelope(CTRL, d, { k: 'hb' }));
    });
    if (S.isLobby) {
      S.members.forEach(function (m, d) {
        if (now - m.last > DEAD_MS) { S.members.delete(d); try { m.conn.close(); } catch (_) { /* gone */ } memberGone(d); return; }
        safeSend(m.conn, envelope(CTRL, d, { k: 'hb' }));
      });
      var me = S.roster.get(S.dev); if (me) me.lastSeen = now;
      if (++S.hb % 5 === 0) { pruneOffline(false); broadcastRoster(); }   // every 10 s: lastSeen refresh
    } else if (S.joining && S.lobbyConn === S.joining) {
      /* H55b: a join inside its JOIN_WAIT_MS: no heartbeat takeover (its own deadline decides) */
    } else if (S.lobbyConn && S.lobbyConn.open) {
      if (now - S.lobbyLast > DEAD_MS) { var c = S.lobbyConn; S.lobbyConn = null; try { c.close(); } catch (_) { /* gone */ } lobbyLost('dead'); return; }
      safeSend(S.lobbyConn, envelope(CTRL, S.lobbyDev || '*', { k: 'hb' }));
    // } else if (!S.lobbyConn && !S.claimTimer && !S.lobbyPeer && S.peer && S.peer.open && S.state !== 'lobby') {   (before H55b)
    } else if (!S.lobbyConn && !S.claimTimer && !S.lobbyPeer && !S.retryTimer && !S.gaveUp && !S.refused && S.peer && S.peer.open && S.state !== 'lobby') {   // H55b: not while waiting to retry / given up
      lobbyLost('idle');   // nothing pending: try again
    }
  }

  /* ---------- sending ---------- */
  function sendEnv(e) {
    if (!S || !S.dev) return { ok: false, reason: 'stopped' };
    if (S.pub && !pubAllowed(e)) { S.stats.dropPublic++; return { ok: false, reason: 'public' }; }   // H55
    if (e.ch === CHAT_CH && !chatOk(e)) { S.stats.dropShape++; return { ok: false, reason: 'shape' }; }   // H84
    if (sizeOf(e) > MAX_BYTES) { S.stats.dropSize++; return { ok: false, reason: 'size' }; }
    if (!outRateOk()) { S.stats.dropRate++; return { ok: false, reason: 'rate' }; }
    S.stats.sent++;
    var direct = S.direct, sentTo = [];
    if (e.to !== '*') {
      var r = direct.get(e.to);
      if (r && r.conn.open && safeSend(r.conn, e)) return { ok: true, via: 'direct' };
      return viaLobby(e) ? { ok: true, via: 'lobby' } : { ok: false, reason: 'offline' };
    }
    direct.forEach(function (x, d) { if (x.conn.open && safeSend(x.conn, e)) sentTo.push(d); });
    // the rest (relayed devices, not-yet-linked ones) through the lobby, skipping those already reached
    var everyone = peers().map(function (p) { return p.deviceId; });
    var missing = everyone.filter(function (d) { return sentTo.indexOf(d) < 0; });
    if (missing.length) viaLobby(Object.assign({}, e, { skip: sentTo }));
    return { ok: true, via: missing.length ? 'mixed' : 'direct' };
  }
  function viaLobby(e) {
    if (S.isLobby) { route(e); return true; }
    return safeSend(S.lobbyConn, e);
  }
  function channel(name) {
    name = String(name || '');
    if (!CH_RE.test(name)) throw new Error('HubMesh: bad channel name');
    if (name === INVITE_CH) throw new Error('HubMesh: reserved channel');   // H55: use HubMesh.invite()
    return {
      name: name,
      send: function (to, data) { if (!S) return { ok: false, reason: 'stopped' }; if (!DEV_RE.test(String(to))) return { ok: false, reason: 'to' }; return sendEnv(envelope(name, to, data)); },
      broadcast: function (data) { if (!S) return { ok: false, reason: 'stopped' }; return sendEnv(envelope(name, '*', data)); },
      on: function (fn) { (chans[name] = chans[name] || []).push(fn); return function () { var l = chans[name] || []; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; },
      peers: peers
    };
  }

  /* ---------- H84: app message broadcast ----------
   * broadcast({t:'chat', ...}) → sendEnv on channel t (CH_RE name) to '*'; onMsg(t, fn(data, from, env)) → unsubscribe.
   * Thin wrapper over channel(t), so the same lobby relay + direct peers + dup(id) path is used. */
  function broadcastMsg(obj) {
    if (!S) return { ok: false, reason: 'stopped' };
    var t = obj && obj.t;
    if (!CH_RE.test(String(t || '')) || t === INVITE_CH) return { ok: false, reason: 'type' };
    var data = Object.assign({}, obj); delete data.t;
    return sendEnv(envelope(t, '*', data));
  }
  function onMsg(t, fn) { return channel(t).on(fn); }

  /* ---------- H55: invites (the only message besides presence on the public mesh) ---------- */
  function invite(to, code) {
    if (!S) return { ok: false, reason: 'stopped' };
    code = String(code || '');
    if (!DEV_RE.test(String(to)) || to === S.dev) return { ok: false, reason: 'to' };
    if (!INV_CODE_RE.test(code) || code === PUBLIC_CODE || code === S.code) return { ok: false, reason: 'code' };
    var now = Date.now();
    if (now - S.invOut < INVITE_GAP_MS) return { ok: false, reason: 'rate' };
    S.invOut = now;
    return sendEnv(envelope(INVITE_CH, to, { k: 'invite', code: code, name: myName() }));
  }
  function gotInvite(e) {
    if (e.to !== S.dev || !pubAllowed(e)) return;
    var now = Date.now(), last = S.invIn.get(e.from) || 0;
    if (now - last < INVITE_GAP_MS) { S.stats.dropRate++; return; }
    S.invIn.set(e.from, now);
    var r = S.roster.get(e.from);
    var nm = String((r && r.name) || e.data.name || 'Device').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, PUB_NAME);
    emit('invite', { from: e.from, name: nm, code: String(e.data.code), at: now });
  }

  /* ---------- app identity ---------- */
  function setAppIdentity(app, obj) {
    if (!CH_RE.test(String(app || ''))) return false;
    var v = cleanIdentity(obj);
    if (v === undefined) return false;
    try { if (v === null) localStorage.removeItem(IDK + app); else localStorage.setItem(IDK + app, JSON.stringify(v)); } catch (_) { return false; }
    refresh();
    return true;
  }
  /** name / mode / apps changed on this device: tell the lobby (roster) */
  function refresh() {
    if (!S || !S.dev) return false;
    var i = selfInfo(), me = S.roster.get(S.dev);
    if (me) Object.assign(me, i);
    if (S.isLobby) { broadcastRoster(); emit('roster', rosterList()); return true; }
    return safeSend(S.lobbyConn, envelope(CTRL, S.lobbyDev || '*', Object.assign({ k: 'info' }, i)));
  }
  function appIdentity(app) { try { return JSON.parse(localStorage.getItem(IDK + app) || 'null'); } catch (_) { return null; } }

  /* ---------- start / stop ---------- */
  var timer = 0;
  function lobbyInfo() { return S ? { deviceId: S.lobbyDev, term: S.term, me: S.isLobby } : { deviceId: '', term: 0, me: false }; }
  function start(code, opts) {
    code = String(code || '');
    if (!CODE_RE.test(code)) return Promise.reject(new Error('HubMesh: bad code'));
    if (S && S.code === code) { if (opts) Object.assign(S.opts, opts); return Promise.resolve(me()); }
    stop();
    if (!window.SharedLinkDevices || !window.SharedLink) return Promise.reject(new Error('HubMesh: SharedLink missing'));
    S = fresh(code, opts);
    var my = S;
    S.dev = SharedLinkDevices.id();
    if (!DEV_RE.test(S.dev)) { S = null; return Promise.reject(new Error('HubMesh: no device id')); }
    S.roster = new Map();
    if (!timer) timer = setInterval(tick, HB_MS);
    status('starting');
    return SharedLink.loadPeer().then(function () { if (S === my) startPeer(); return me(); },
      function (err) { if (S === my) status('error'); throw err; });
  }
  function stop() {
    if (!S) return;
    var old = S; S = null;
    clearTimeout(old.claimTimer); clearTimeout(old.joinTimer); clearTimeout(old.retryTimer); clearInterval(old.helloTimer);   // H55b: + retry / hello
    try { if (old.lobbyConn) old.lobbyConn.close(); } catch (_) { /* gone */ }
    old.direct.forEach(function (r) { try { r.conn.close(); } catch (_) { /* gone */ } });
    old.members.forEach(function (m) { try { m.conn.close(); } catch (_) { /* gone */ } });
    [old.lobbyPeer, old.peer].forEach(function (p) { try { if (p) p.destroy(); } catch (_) { /* gone */ } });
    if (timer) { clearInterval(timer); timer = 0; }
    emit('status', 'stopped'); emit('peers', []); emit('roster', []); emit('lobby', lobbyInfo());
  }
  function me() {
    if (!S) return null;
    var r = S.roster.get(S.dev) || {};
    return { deviceId: S.dev, name: myName(), mode: myMode(), apps: myApps(), lobby: S.isLobby, relay: !!r.relay, term: S.term, state: S.state, code: S.code, joinOrder: r.joinOrder || 0, refused: S.refused || '', public: !!S.pub,   // H55: + public
      joinState: S.joinState, joinSince: S.joining ? S.joinStart : 0, retryAt: S.retryAt, joinWaitMs: JOIN_WAIT_MS, gaveUp: S.gaveUp };   // H55b
  }

  window.addEventListener('pagehide', function (e) { if (!e.persisted) stop(); });
  // H55b: a run that gave up starts again once on its own when the tab is visible again or the network is back
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') retry('visible'); });
  window.addEventListener('online', function () { retry('online'); });

  window.HubMesh = {
    start: start, stop: stop, me: me,
    peers: peers, roster: function () { return S ? rosterList() : []; },
    on: on, off: off, channel: channel,
    setAppIdentity: setAppIdentity, appIdentity: appIdentity, refresh: refresh,
    isLobby: function () { return !!(S && S.isLobby); },
    term: function () { return S ? S.term : 0; },
    lobbyId: function () { return S ? S.lobbyDev : ''; },
    // H77: { dev, name, site, self } of the lobby holder, or null (not known yet / older lobby)
    lobbyInfo: function () {
      if (!S) return null;
      if (S.isLobby) return Object.assign(holderSelf(), { self: true });
      var h = S.holder;
      return h && (h.dev === S.lobbyDev || S.refused) ? { dev: h.dev, name: h.name, site: h.site, self: false } : null;
    },
    state: function () { return S ? S.state : 'stopped'; },
    // stats: function () { return S ? Object.assign({ direct: Array.from(S.direct.keys()).filter(function (d) { return S.direct.get(d).conn.open; }) }, S.stats) : null; },   (before H55b)
    stats: function () { return S ? Object.assign({ direct: Array.from(S.direct.keys()).filter(function (d) { return S.direct.get(d).conn.open; }) }, S.stats, { joinFails: S.joinFails, lastJoinMs: S.lastJoinMs, joinState: S.joinState }) : null; },   // H55b
    retry: function () { return retry('manual'); },   // H55b: Settings › Devices Retry (a fresh 5-minute run)
    hooks: hooks,
    // LIMITS: { HB_MS: HB_MS, DEAD_MS: DEAD_MS, MAX_DIRECT: MAX_DIRECT, MAX_ROSTER: MAX_ROSTER, MAX_BYTES: MAX_BYTES, RATE_PER_S: RATE_PER_S, RATE_BURST: RATE_BURST },   (before H55)
    LIMITS: { HB_MS: HB_MS, DEAD_MS: DEAD_MS, MAX_DIRECT: MAX_DIRECT, MAX_ROSTER: MAX_ROSTER, MAX_BYTES: MAX_BYTES, RATE_PER_S: RATE_PER_S, RATE_BURST: RATE_BURST, PUB_ROSTER: PUB_ROSTER, PUB_NAME: PUB_NAME, INVITE_GAP_MS: INVITE_GAP_MS,
      JOIN_WAIT_MS: JOIN_WAIT_MS, HELLO_MS: HELLO_MS, RETRY_MS: RETRY_MS, GIVEUP_MS: GIVEUP_MS },   // H55b
    // H55: public mesh
    PUBLIC_CODE: PUBLIC_CODE, isPublic: pub, invite: invite,
    // H84: app messages to every device on the current mesh (relay + direct, de-duplicated by envelope id)
    broadcast: broadcastMsg, onMsg: onMsg, room: function () { return S ? S.code : ''; },
    linked: function () { return !!(S && (S.isLobby || (S.lobbyConn && S.lobbyConn.open && S.joinState === 'linked'))); },
    // tests only: put a raw envelope on the wire to one device (no checks on this side)
    _raw: function (to, env) { if (!S) return false; var r = S.direct.get(to); if (r && r.conn.open) return safeSend(r.conn, env); return viaLobby(env); },
    _env: function (ch, to, data) { return S ? envelope(ch, to, data) : null; }
  };
})();
