/*
 * Hub Sync, part 1 (hub/link/hub_sync.js, H29.1): send this device's Hub profile to a device connected with the
 * Connect Code, and review an incoming one before anything changes. Loaded after hub_link.js (needs SharedLink,
 * HubProfile). Manual only: devices are peers with no server, so nothing is ever sent or applied on its own.
 *
 * Wire (SharedLink.send → {t:'msg', ...}; the host relays 'to'; hub_link.js does not pass 'hubsync…' to app frames):
 *   {type:'hubsync-profile', v:1, id, name, mode, include:{desktop,phone}, profile}   sender → receiver
 *     profile = HubProfile.exportData({ keys: false }) (never API keys, sign-ins, history; "keys" deleted again)
 *   {type:'hubsync-got', id}                                   receiver: received, waiting for review
 *   {type:'hubsync-result', id, state:'applied'|'cancelled'|'bad', applied, kept}
 * Mode groups (HubProfile.groupOf / SYNC_GROUPS in hub_profile.js; unknown = Shared): the sender sends Shared +
 *   Desktop + Phone settings and two ticks (include.desktop / include.phone, both off by default). The RECEIVER
 *   filters (it alone knows its mode): Shared + the group of its own mode (HubMode.mode; a joined phone is always
 *   Phone) + any ticked group. Other groups are dropped before the preview and only counted.
 * Receiver: one pending offer (a new one replaces it) + a notification card 'Profile from <name>' → Review opens
 *   Settings › About › Send profile (#about/sync; H29.2b: Settings › Devices › Send profile, #devices/sync), where the preview lists each changed setting (Keep mine is the
 *   default; settings this device does not have yet default to Use incoming). Apply writes only the chosen
 *   items (HubProfile.applyItems), Cancel drops the offer. Limits: payload <= MAX_CHARS of JSON, plain text only.
 * H29.2 Choose what to send + optional API keys:
 *   include.what = 'hub' (Hub settings) | 'system' (System app settings) | 'everything' (default: Hub settings +
 *   every app setting, the same parts as the H30.3 export file). The sender exports only that part
 *   (HubProfile.exportData({ what })) and the receiver diffs only that part again (diffData({ what })).
 *   include.keys (Send card 'Include API keys', off by default): the key store goes in profile.keys; without the
 *   tick the H29.1 rule stands (exportData({ keys: false }) + delete). The receiver lists keys only when
 *   include.keys is true, in their own 'API keys' group; pending() items carry masked values only
 *   ('••••' + last 4); the full values stay inside this module (pend.profile.keys) until Apply or Cancel and are
 *   never put in a notification, the DOM, lastSend / lastResult or a log. Defaults: same key = counted, not listed;
 *   new key = Add ('incoming'); different key = Keep mine. 'Use all incoming' / 'Keep all mine' leave key rows
 *   alone (Settings), and apply() never takes a key the choices do not name unless it is New (default Add).
 *   No 'Keep both': the Hub key store (H28) holds one value per name.
 *   Path: the offer goes only to the picked device over the existing link (phone → phone is relayed by the PC
 *   host in memory, as every link message is).
 * H29.3 Backup + Undo last sync + profile folder (manual only, like the rest):
 *   apply() passes { backup: { from: <sender name> } } to HubProfile.applyItems, which saves the previous value of
 *   every setting and key it is about to write (only the last sync is kept; Cancel and an Apply that writes nothing
 *   leave the old backup alone). undo() → HubProfile.undoSync() puts them back exactly (new ones removed), repaints
 *   (HubPrefs.apply) and clears the backup. After Apply and after Undo, when this device has a ticked, ready
 *   connected folder (hub/hub-profile/, H30), HubProfile.save() runs at once instead of waiting for 'Save every';
 *   no folder (a phone, or none attached) = skipped quietly. lastResult().folder / lastUndo().folder =
 *   'pending' | 'saved' | 'none' | 'failed'.
 * API window.HubSync:
 *   devices() → [{ id, name }]   connected devices (not this one, no old Gamepads)
 *   peers() → [{ id, name, online, legacy, host, mode }]   H29.2b: every device the link knows (Settings › Devices ›
 *     Connected devices, read-only); mode = 'desktop' | 'phone' once that device sent a profile here, else ''
 *   send(to, { desktop, phone, what, keys }) → { ok, reason?, id }   (H29.2: what + keys)
 *   pending() → null | { id, from, name, mode, at, include, groups, items, same, ignored, skipped }   (diffed now)
 *   apply(choices) → { ok, applied, kept }   choices: { itemId: 'incoming' | 'mine' } (missing = item default)
 *   cancel()
 *   lastSend() → null | { id, to, toName, state: 'sent'|'got'|'applied'|'cancelled'|'bad'|'failed', applied, kept, at }
 *   lastResult() → null | { name, applied, kept, at }   (the receiver's summary after Apply)
 *   mode() → 'desktop' | 'phone'     onChange(fn) → unsubscribe
 *   backup() → null | { at, from, settings, keys }   H29.3 (counts only, never a value)
 *   undo() → { ok, settings, keys, from, at } | { ok: false, reason }   H29.3 (ask the user first; Settings does)
 *   lastUndo() → null | { at, from, settings, keys, folder }   H29.3
 */
(function () {
  'use strict';
  if (!window.SharedLink) return;
  const T_OFFER = 'hubsync-profile', T_GOT = 'hubsync-got', T_RESULT = 'hubsync-result';
  const MAX_CHARS = 200000;   // one WebRTC message (PeerJS json) stays well under Chrome's 256 KiB limit
  // const GROUPS = ['shared', 'desktop', 'phone'];   // (H29.1)
  const GROUPS = ['shared', 'desktop', 'phone', 'keys'];   // H29.2: + API keys
  const WHAT = ['hub', 'system', 'everything'];             // H29.2
  const whatOf = (w) => (WHAT.indexOf(w) >= 0 ? w : 'everything');
  const HP = () => window.HubProfile;
  const fns = [];
  let pend = null, sent = null, result = null, card = null;
  let undone = null;   // H29.3: the last Undo's summary

  function emit() { fns.slice().forEach((f) => { try { f(); } catch (_) { /* ignore */ } }); }
  const myName = () => (window.SharedLinkDevices ? SharedLinkDevices.name() : 'Device');
  function mode() {
    // if (window.__hubRemote) return 'phone';   // (before H53: a joined device was always Phone)
    return window.HubMode && window.HubMode.mode === 'desktop' ? 'desktop' : 'phone';
  }
  const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n || 40);

  function devices() {
    const me = SharedLink.id;
    return (SharedLink.devices || []).filter((d) => d && !d.legacy && d.online !== false && d.id && d.id !== me)
      .map((d) => ({ id: String(d.id), name: clean(d.name || 'Device') }));
  }
  /* H29.2b: read-only list for Settings › Devices (offline devices too; an old Gamepad only while online) */
  const seenMode = {};
  function peers() {
    const me = SharedLink.id;
    return (SharedLink.devices || []).filter((d) => d && d.id && d.id !== me && !(d.legacy && d.online === false))
      .map((d) => ({ id: String(d.id), name: clean(d.name || (d.legacy ? 'Gamepad' : 'Device')), online: d.online !== false,
        legacy: !!d.legacy, host: d.id === 'host', mode: seenMode[String(d.id)] || '' }));
  }

  function send(to, inc) {
    if (!HP() || !HP().exportData) return { ok: false, reason: 'no-profile' };
    const dev = devices().find((d) => d.id === to);
    if (!dev) return { ok: false, reason: 'no-device' };
    inc = inc || {};
    const what = whatOf(inc.what), withKeys = inc.keys === true;   // H29.2
    // const profile = HP().exportData({ keys: false });   // (H29.1)
    // delete profile.keys;   // belt and braces: keys come with H29.2 only   (H29.1)
    const profile = HP().exportData({ what, keys: withKeys });
    if (!withKeys) delete profile.keys;   // H29.2: still forced off unless 'Include API keys' is ticked
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    // const msg = { type: T_OFFER, v: 1, id, name: myName(), mode: mode(),
    //   include: { desktop: !!(inc && inc.desktop), phone: !!(inc && inc.phone) }, profile };   // (H29.1)
    const msg = { type: T_OFFER, v: 1, id, name: myName(), mode: mode(),
      include: { desktop: !!inc.desktop, phone: !!inc.phone, what, keys: withKeys && !!profile.keys }, profile };
    if (JSON.stringify(msg).length > MAX_CHARS) return { ok: false, reason: 'too-big' };
    const ok = SharedLink.send(msg, to);
    sent = { id, to, toName: dev.name, state: ok ? 'sent' : 'failed', at: Date.now(), what, keys: msg.include.keys,
      keyCount: profile.keys ? Object.keys(profile.keys).length : 0 };   // H29.2: names / values of keys never kept here
    emit();
    return ok ? { ok: true, id } : { ok: false, reason: 'not-sent' };
  }

  function groupsFor(include) {
    const g = ['shared', mode()];
    if (include.desktop && g.indexOf('desktop') < 0) g.push('desktop');
    if (include.phone && g.indexOf('phone') < 0) g.push('phone');
    return g;
  }
  function pending() {
    if (!pend || !HP() || !HP().diffData) return null;
    const groups = groupsFor(pend.include);
    // const d = HP().diffData(pend.profile, { groups });   // (H29.1)
    const d = HP().diffData(pend.profile, { groups, what: pend.include.what, keys: pend.include.keys === true });   // H29.2
    if (!d.ok) return null;
    if (pend.include.keys) groups.push('keys');
    return { id: pend.id, from: pend.from, name: pend.name, mode: pend.mode, at: pend.at, include: Object.assign({}, pend.include),
      groups, items: d.items, same: d.same, ignored: d.ignored, skipped: d.skipped, keysSame: d.keysSame || 0 };
  }
  const reply = (to, o) => { try { SharedLink.send(o, to); } catch (_) { /* gone */ } };

  function apply(choices) {
    const p = pending();
    if (!p) return { ok: false, reason: 'nothing' };
    choices = choices || {};
    const take = p.items.filter((it) => (choices[it.id] || (it.isNew ? 'incoming' : 'mine')) === 'incoming');
    // H29.2: a chosen key gets its real value from the offer held here (pending() only ever has masked text)
    const real = pend.profile && pend.profile.keys && typeof pend.profile.keys === 'object' ? pend.profile.keys : {};
    // const n = HP().applyItems(take.map((it) => (it.scope === 'key' ? { scope: 'key', key: it.key, value: real[it.key] } : it)));   // (H29.2)
    const n = HP().applyItems(take.map((it) => (it.scope === 'key' ? { scope: 'key', key: it.key, value: real[it.key] } : it)),
      { backup: { from: p.name } });   // H29.3: the Undo last sync backup is saved first
    const kept = p.items.length - n;
    try { if (window.HubPrefs && window.HubPrefs.apply) window.HubPrefs.apply(); } catch (_) { /* ignore */ }
    reply(pend.from, { type: T_RESULT, id: p.id, state: 'applied', applied: n, kept });
    // result = { name: p.name, applied: n, kept, same: p.same, at: Date.now(), labels: take.map((it) => it.label) };   // (H29.1)
    // result = { name: p.name, applied: n, kept, same: p.same, at: Date.now(),
    //   labels: take.map((it) => (it.scope === 'key' ? 'API key ' + it.key : it.label)) };   // H29.2: key names only
    result = { name: p.name, applied: n, kept, same: p.same, at: Date.now(),
      labels: take.map((it) => (it.scope === 'key' ? 'API key ' + it.key : it.label)),   // H29.2: key names only
      undo: n > 0 && !!backup(), folder: n > 0 ? 'pending' : 'none' };   // H29.3
    undone = null;
    pend = null; closeCard(); emit();
    if (n > 0) { const r = result; saveFolder().then((f) => { r.folder = f; emit(); }); }   // H29.3
    return { ok: true, applied: n, kept };
  }
  /* H29.3: Undo last sync + the immediate profile folder save */
  function backup() { try { return HP() && HP().syncBackup ? HP().syncBackup() : null; } catch (_) { return null; } }
  function undo() {
    if (!HP() || !HP().undoSync) return { ok: false, reason: 'no-profile' };
    const r = HP().undoSync();
    if (!r.ok) return r;
    try { if (window.HubPrefs && window.HubPrefs.apply) window.HubPrefs.apply(); } catch (_) { /* ignore */ }
    const u = undone = { at: Date.now(), from: r.from, settings: r.settings, keys: r.keys, folder: 'pending' };
    result = null;
    emit();
    saveFolder().then((f) => { u.folder = f; emit(); });
    return r;
  }
  /** a ticked + ready connected folder → HubProfile.save() now (the H30 save, all ticked places); else 'none' */
  async function saveFolder() {
    const H = HP();
    if (!H || !H.status || !H.save) return 'none';
    try {
      const st = await H.status();
      const has = (st.targets || []).some((t) => t.kind === 'folder' && t.ticked && t.state === 'ready');
      if (!has) return 'none';
      const r = await H.save();
      return r && r.ok ? 'saved' : 'failed';
    } catch (_) { return 'failed'; }
  }
  function cancel() {
    if (!pend) return;
    reply(pend.from, { type: T_RESULT, id: pend.id, state: 'cancelled', applied: 0, kept: 0 });
    pend = null; result = null; closeCard(); emit();
  }
  function closeCard() { if (card) { try { card.close(); } catch (_) { /* gone */ } card = null; } }

  function review() {
    closeCard();
    // if (window.__hubOpenApp) window.__hubOpenApp('apps/system/settings/', { hash: 'about/sync' });   // (before H29.2b)
    if (window.__hubOpenApp) window.__hubOpenApp('apps/system/settings/', { hash: 'devices/sync' });   // H29.2b: Devices section
  }
  function showCard(p) {
    const N = window.HubNotify;
    if (!N || !N.notice) return;
    closeCard();
    const n = p ? p.items.length : 0;
    card = N.notice({
      icon: '\uD83D\uDD04', title: 'Profile from ' + pend.name,
      text: n ? n + ' setting' + (n === 1 ? '' : 's') + ' differ. Nothing changes until you press Apply.' : 'Nothing differs from this device.',
      timeoutMs: 0, onClick: review,
    });
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'hs-review'; b.textContent = 'Review';
    b.style.cssText = 'margin-top:8px;padding:5px 14px;border:0;border-radius:8px;font:600 12.5px system-ui,sans-serif;' +
      'background:var(--accent,#6ea8fe);color:#0b1220;cursor:pointer';
    b.addEventListener('click', (e) => { e.stopPropagation(); review(); });
    const body = card && card.node && card.node.querySelector('.hn-body');
    if (body) body.appendChild(b);
  }

  SharedLink.on('message', (m, from) => {
    if (!m || typeof m !== 'object' || typeof m.type !== 'string' || m.type.indexOf('hubsync') !== 0) return;
    const back = m.from || (SharedLink.role === 'join' ? 'host' : from);   // the host relays with 'from'
    if (m.type === T_OFFER) {
      let size = MAX_CHARS + 1;
      try { size = JSON.stringify(m).length; } catch (_) { /* cyclic: never from JSON */ }
      const id = clean(m.id, 24);
      if (size > MAX_CHARS || m.v !== 1 || !m.profile || typeof m.profile !== 'object') { reply(back, { type: T_RESULT, id, state: 'bad' }); return; }
      const inc = m.include && typeof m.include === 'object' ? m.include : {};
      // pend = { id, from: back, name: clean(m.name || 'Device'), mode: m.mode === 'desktop' ? 'desktop' : 'phone', at: Date.now(),
      //   include: { desktop: inc.desktop === true, phone: inc.phone === true }, profile: m.profile };   // (H29.1)
      pend = { id, from: back, name: clean(m.name || 'Device'), mode: m.mode === 'desktop' ? 'desktop' : 'phone', at: Date.now(),
        include: { desktop: inc.desktop === true, phone: inc.phone === true, what: whatOf(inc.what), keys: inc.keys === true }, profile: m.profile };
      seenMode[String(back)] = pend.mode;   // H29.2b: shown in Settings › Devices › Connected devices
      const p = pending();
      if (!p) { pend = null; reply(back, { type: T_RESULT, id, state: 'bad' }); return; }
      result = null;
      reply(back, { type: T_GOT, id });
      showCard(p);
      emit();
    } else if ((m.type === T_GOT || m.type === T_RESULT) && sent && m.id === sent.id) {
      sent.state = m.type === T_GOT ? 'got' : (['applied', 'cancelled', 'bad'].indexOf(m.state) >= 0 ? m.state : 'bad');
      if (m.type === T_RESULT) { sent.applied = +m.applied || 0; sent.kept = +m.kept || 0; }
      if (m.type === T_RESULT && window.HubNotify && HubNotify.notice) {
        HubNotify.notice({ icon: '\uD83D\uDD04', title: 'Profile sent to ' + sent.toName,
          text: sent.state === 'applied' ? sent.applied + ' setting' + (sent.applied === 1 ? '' : 's') + ' used, ' + sent.kept + ' kept as they were'
            : sent.state === 'cancelled' ? 'Cancelled on that device. Nothing changed.' : 'That device could not read it.' });
      }
      emit();
    }
  });
  SharedLink.on('devices', emit);

  window.HubSync = {
    devices, peers, send, pending, apply, cancel, mode, review,   // H29.2b: + peers
    backup, undo, lastUndo: () => (undone ? Object.assign({}, undone) : null),   // H29.3
    lastSend: () => (sent ? Object.assign({}, sent) : null),
    lastResult: () => (result ? Object.assign({}, result) : null),
    groupOf: (scope, key) => (HP() && HP().groupOf ? HP().groupOf(scope, key) : 'shared'),
    GROUPS: GROUPS.slice(), WHAT: WHAT.slice(), MAX_CHARS,
    onChange(fn) { fns.push(fn); return () => { const i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }; },
  };
})();
