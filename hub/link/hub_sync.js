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
 *   Settings › About › Send profile (#about/sync), where the preview lists each changed setting (Keep mine is the
 *   default; settings this device does not have yet default to Use incoming). Apply writes only the chosen
 *   items (HubProfile.applyItems), Cancel drops the offer. Limits: payload <= MAX_CHARS of JSON, plain text only.
 * API window.HubSync:
 *   devices() → [{ id, name }]   connected devices (not this one, no old Gamepads)
 *   send(to, { desktop, phone }) → { ok, reason?, id }
 *   pending() → null | { id, from, name, mode, at, include, groups, items, same, ignored, skipped }   (diffed now)
 *   apply(choices) → { ok, applied, kept }   choices: { itemId: 'incoming' | 'mine' } (missing = item default)
 *   cancel()
 *   lastSend() → null | { id, to, toName, state: 'sent'|'got'|'applied'|'cancelled'|'bad'|'failed', applied, kept, at }
 *   lastResult() → null | { name, applied, kept, at }   (the receiver's summary after Apply)
 *   mode() → 'desktop' | 'phone'     onChange(fn) → unsubscribe
 */
(function () {
  'use strict';
  if (!window.SharedLink) return;
  const T_OFFER = 'hubsync-profile', T_GOT = 'hubsync-got', T_RESULT = 'hubsync-result';
  const MAX_CHARS = 200000;   // one WebRTC message (PeerJS json) stays well under Chrome's 256 KiB limit
  const GROUPS = ['shared', 'desktop', 'phone'];
  const HP = () => window.HubProfile;
  const fns = [];
  let pend = null, sent = null, result = null, card = null;

  function emit() { fns.slice().forEach((f) => { try { f(); } catch (_) { /* ignore */ } }); }
  const myName = () => (window.SharedLinkDevices ? SharedLinkDevices.name() : 'Device');
  function mode() {
    if (window.__hubRemote) return 'phone';
    return window.HubMode && window.HubMode.mode === 'desktop' ? 'desktop' : 'phone';
  }
  const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n || 40);

  function devices() {
    const me = SharedLink.id;
    return (SharedLink.devices || []).filter((d) => d && !d.legacy && d.online !== false && d.id && d.id !== me)
      .map((d) => ({ id: String(d.id), name: clean(d.name || 'Device') }));
  }

  function send(to, inc) {
    if (!HP() || !HP().exportData) return { ok: false, reason: 'no-profile' };
    const dev = devices().find((d) => d.id === to);
    if (!dev) return { ok: false, reason: 'no-device' };
    const profile = HP().exportData({ keys: false });
    delete profile.keys;   // belt and braces: keys come with H29.2 only
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const msg = { type: T_OFFER, v: 1, id, name: myName(), mode: mode(),
      include: { desktop: !!(inc && inc.desktop), phone: !!(inc && inc.phone) }, profile };
    if (JSON.stringify(msg).length > MAX_CHARS) return { ok: false, reason: 'too-big' };
    const ok = SharedLink.send(msg, to);
    sent = { id, to, toName: dev.name, state: ok ? 'sent' : 'failed', at: Date.now() };
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
    const d = HP().diffData(pend.profile, { groups });
    if (!d.ok) return null;
    return { id: pend.id, from: pend.from, name: pend.name, mode: pend.mode, at: pend.at, include: Object.assign({}, pend.include),
      groups, items: d.items, same: d.same, ignored: d.ignored, skipped: d.skipped };
  }
  const reply = (to, o) => { try { SharedLink.send(o, to); } catch (_) { /* gone */ } };

  function apply(choices) {
    const p = pending();
    if (!p) return { ok: false, reason: 'nothing' };
    choices = choices || {};
    const take = p.items.filter((it) => (choices[it.id] || (it.isNew ? 'incoming' : 'mine')) === 'incoming');
    const n = HP().applyItems(take);
    const kept = p.items.length - n;
    try { if (window.HubPrefs && window.HubPrefs.apply) window.HubPrefs.apply(); } catch (_) { /* ignore */ }
    reply(pend.from, { type: T_RESULT, id: p.id, state: 'applied', applied: n, kept });
    result = { name: p.name, applied: n, kept, same: p.same, at: Date.now(), labels: take.map((it) => it.label) };
    pend = null; closeCard(); emit();
    return { ok: true, applied: n, kept };
  }
  function cancel() {
    if (!pend) return;
    reply(pend.from, { type: T_RESULT, id: pend.id, state: 'cancelled', applied: 0, kept: 0 });
    pend = null; result = null; closeCard(); emit();
  }
  function closeCard() { if (card) { try { card.close(); } catch (_) { /* gone */ } card = null; } }

  function review() {
    closeCard();
    if (window.__hubOpenApp) window.__hubOpenApp('apps/system/settings/', { hash: 'about/sync' });
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
      pend = { id, from: back, name: clean(m.name || 'Device'), mode: m.mode === 'desktop' ? 'desktop' : 'phone', at: Date.now(),
        include: { desktop: inc.desktop === true, phone: inc.phone === true }, profile: m.profile };
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
    devices, send, pending, apply, cancel, mode, review,
    lastSend: () => (sent ? Object.assign({}, sent) : null),
    lastResult: () => (result ? Object.assign({}, result) : null),
    groupOf: (scope, key) => (HP() && HP().groupOf ? HP().groupOf(scope, key) : 'shared'),
    GROUPS: GROUPS.slice(), MAX_CHARS,
    onChange(fn) { fns.push(fn); return () => { const i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }; },
  };
})();
