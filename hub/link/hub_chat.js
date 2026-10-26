/**
 * Hub — chat bubble + group chat relay (release 4). Needs shared/link/link_chat.js.
 * - SharedChat on the Hub's link: Hub messages go to every device; device messages
 *   ({bcast:true}) are re-broadcast by link_core and stored here (history last 200).
 * - Pooh Chat inside the Hub posts {sharedLink:'chat', text}; the Hub sends + stores it,
 *   the iframe repaints from the same localStorage history.
 * - #chat-btn (🐻, before the Gamepad icon): unread badge; tap → H27 full-height side panel
 *   (hub_panels.css): header (title, this device's name, Full chat, ✕), bubbles (mine right,
 *   others left with name + time; last 100), input bar pinned at the bottom. Closes on outside
 *   click / Esc. New message while closed (and Pooh Chat not open) → one notification card (H26, HubNotify.notice)
 *   (6 s, updates in place, no sound); tapping it opens the panel.
 */
(function () {
  'use strict';
  if (!window.SharedLink || !window.SharedChat) return;
  const btn = document.getElementById('chat-btn');
  const badge = document.getElementById('chat-badge');
  const frame = document.getElementById('app-frame');
  if (!btn) return;
  let unread = 0, toastN = 0;

  // H19: a joined Hub sends with bcast so the host relays it to the other devices too.
  SharedChat.init((m) => SharedLink.send(SharedLink.role === 'join' ? Object.assign({ bcast: true }, m) : m));
  SharedChat.listen();

  /* ---------- panel ---------- */
  const panel = document.createElement('div');
  panel.id = 'chat-panel'; panel.className = 'hub-side-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat');
  const head = document.createElement('div'); head.className = 'cp-head';
  const title = document.createElement('div'); title.className = 'cp-title';
  const tName = document.createElement('strong'); tName.textContent = '🐻 Pooh Chat';
  const me = document.createElement('label'); me.className = 'cp-me'; me.textContent = 'You are ';
  const meIn = document.createElement('input'); meIn.type = 'text'; meIn.maxLength = 40; meIn.setAttribute('aria-label', 'Your device name');
  me.appendChild(meIn);
  title.append(tName, me);
  meIn.addEventListener('change', () => { if (window.SharedLinkDevices) meIn.value = SharedLinkDevices.setName(meIn.value); });
  const full = document.createElement('button'); full.type = 'button'; full.className = 'cp-full'; full.textContent = 'Full chat';
  const x = document.createElement('button'); x.type = 'button'; x.className = 'hp-x'; x.textContent = '✕'; x.setAttribute('aria-label', 'Close');
  head.append(title, full, x);
  const log = document.createElement('div'); log.className = 'cp-log';
  const form = document.createElement('form'); form.className = 'cp-form'; form.autocomplete = 'off';
  const input = document.createElement('input'); input.type = 'text'; input.maxLength = 2000; input.placeholder = 'Message everyone…';
  const send = document.createElement('button'); send.type = 'submit'; send.className = 'cp-send'; send.textContent = 'Send'; send.setAttribute('aria-label', 'Send');
  form.append(input, send);
  panel.append(head, log, form);
  document.body.appendChild(panel);

  let card = null;   // H26: the current chat notice card (HubNotify.notice), updated as messages arrive

  function paint() {
    log.textContent = '';
    const list = SharedChat.history().slice(-100);
    if (!list.length) { const e = document.createElement('div'); e.className = 'cp-empty'; e.textContent = 'No messages yet. Say hi to your devices 👋'; log.appendChild(e); }
    let prev = null;
    list.forEach((m) => {
      const d = document.createElement('div');
      const mine = SharedChat.isMine(m);
      const same = prev && prev.from === m.from && (m.ts - prev.ts) < 120000;
      d.className = 'cp-msg' + (mine ? ' me' : '') + (same ? ' cont' : '');
      if (!mine && !same) { const b = document.createElement('b'); b.className = 'cp-who'; b.textContent = m.name || 'Device'; d.appendChild(b); }
      const t = document.createElement('div'); t.className = 'cp-text'; t.textContent = m.text;
      const tm = document.createElement('time'); tm.className = 'cp-time';
      try { tm.textContent = new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (_) { tm.textContent = ''; }
      d.append(t, tm);
      log.appendChild(d);
      prev = m;
    });
    log.scrollTop = log.scrollHeight;
  }
  function setUnread(n) { unread = n; badge.textContent = n > 99 ? '99+' : String(n); badge.hidden = !n; }
  function poohOpen() { return /pooh-chat/.test(String(frame && frame.src || '')); }

  function open() {
    hideToast(); setUnread(0); paint();
    if (window.SharedLinkDevices && document.activeElement !== meIn) meIn.value = SharedLinkDevices.name();
    panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => input.focus(), 30);
  }
  function close() { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  function hideToast() { if (card) card.close(); card = null; toastN = 0; }

  btn.addEventListener('click', (e) => { e.stopPropagation(); panel.hidden ? open() : close(); });
  x.addEventListener('click', close);
  full.addEventListener('click', () => {
    close();
    if (!(window.__hubOpenApp && window.__hubOpenApp('pooh-chat')) && window.__hubOpenUrl) window.__hubOpenUrl('apps/connectivity/pooh-chat/pooh-chat.html');
  });
  document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) close(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { e.stopPropagation(); close(); } }, true);
  form.addEventListener('submit', (e) => { e.preventDefault(); if (SharedChat.send(input.value)) input.value = ''; });

  /* ---------- incoming ---------- */
  SharedChat.on((m) => {
    if (!panel.hidden) { paint(); return; }
    if (!m || m.mine || m.from === 'host') return;   // own / storage repaint
    if (poohOpen()) return;                           // Pooh Chat is showing it
    setUnread(unread + 1);
    toastN++;
    const text = toastN > 1 ? toastN + ' new messages' : m.text;
    const title = toastN > 1 ? 'Pooh Chat' : (m.name || 'Pooh Chat');
    if (card) card.close();
    const N = window.HubNotify;
    if (N && N.notice) card = N.notice({ icon: '🐻', title: title, text: text, onClick: () => { card = null; toastN = 0; open(); } });
  });

  /* Pooh Chat inside the Hub sends through here. */
  window.addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (d && d.sharedLink === 'chat' && typeof d.text === 'string') SharedChat.send(d.text);
  });
})();
