/**
 * Hub — chat bubble + group chat relay (release 4). Needs shared/link/link_chat.js.
 * - SharedChat on the Hub's link: Hub messages go to every device; device messages
 *   ({bcast:true}) are re-broadcast by link_core and stored here (history last 200).
 * - Pooh Chat inside the Hub posts {sharedLink:'chat', text}; the Hub sends + stores it,
 *   the iframe repaints from the same localStorage history.
 * - #chat-btn (🐻, before the Gamepad icon): unread badge; tap → drop-down with the last
 *   20 messages, input + Send, "Full chat" (opens Pooh Chat in the Hub). Closes on outside
 *   click / Esc. New message while closed (and Pooh Chat not open) → one quiet toast
 *   (6 s, updates in place, no sound); tapping it opens the panel.
 */
(function () {
  'use strict';
  if (!window.SharedLink || !window.SharedChat) return;
  const btn = document.getElementById('chat-btn');
  const badge = document.getElementById('chat-badge');
  const frame = document.getElementById('app-frame');
  if (!btn) return;
  let unread = 0, toastT = 0, toastN = 0;

  // H19: a joined Hub sends with bcast so the host relays it to the other devices too.
  SharedChat.init((m) => SharedLink.send(SharedLink.role === 'join' ? Object.assign({ bcast: true }, m) : m));
  SharedChat.listen();

  /* ---------- panel ---------- */
  const panel = document.createElement('div');
  panel.id = 'chat-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat');
  const head = document.createElement('div'); head.className = 'cp-head';
  const title = document.createElement('span'); title.textContent = '🍯 Pooh Chat';
  const full = document.createElement('button'); full.type = 'button'; full.textContent = 'Full chat';
  const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Close');
  head.append(title, full, x);
  const log = document.createElement('div'); log.className = 'cp-log';
  const form = document.createElement('form'); form.className = 'cp-form'; form.autocomplete = 'off';
  const input = document.createElement('input'); input.type = 'text'; input.maxLength = 2000; input.placeholder = 'Message everyone…';
  const send = document.createElement('button'); send.type = 'submit'; send.className = 'cp-send'; send.textContent = 'Send';
  form.append(input, send);
  panel.append(head, log, form);
  document.body.appendChild(panel);

  const toast = document.createElement('div');
  toast.id = 'chat-toast'; toast.hidden = true; toast.setAttribute('role', 'status');
  document.body.appendChild(toast);

  function paint() {
    log.textContent = '';
    const list = SharedChat.history().slice(-20);
    if (!list.length) { const e = document.createElement('div'); e.className = 'cp-empty'; e.textContent = 'No messages yet'; log.appendChild(e); }
    list.forEach((m) => {
      const d = document.createElement('div');
      const mine = SharedChat.isMine(m);
      d.className = 'cp-msg' + (mine ? ' me' : '');
      const b = document.createElement('b'); b.textContent = mine ? 'You' : (m.name || 'Device');
      d.append(b, document.createTextNode(m.text));
      log.appendChild(d);
    });
    log.scrollTop = log.scrollHeight;
  }
  function setUnread(n) { unread = n; badge.textContent = n > 99 ? '99+' : String(n); badge.hidden = !n; }
  function poohOpen() { return /pooh-chat/.test(String(frame && frame.src || '')); }

  function open() {
    hideToast(); setUnread(0); paint();
    panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => input.focus(), 30);
  }
  function close() { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  function hideToast() { clearTimeout(toastT); toast.hidden = true; toastN = 0; }

  btn.addEventListener('click', (e) => { e.stopPropagation(); panel.hidden ? open() : close(); });
  x.addEventListener('click', close);
  full.addEventListener('click', () => {
    close();
    if (!(window.__hubOpenApp && window.__hubOpenApp('pooh-chat')) && window.__hubOpenUrl) window.__hubOpenUrl('apps/connectivity/pooh-chat/pooh-chat.html');
  });
  document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) close(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { e.stopPropagation(); close(); } }, true);
  form.addEventListener('submit', (e) => { e.preventDefault(); if (SharedChat.send(input.value)) input.value = ''; });
  toast.addEventListener('click', () => open());

  /* ---------- incoming ---------- */
  SharedChat.on((m) => {
    if (!panel.hidden) { paint(); return; }
    if (!m || m.mine || m.from === 'host') return;   // own / storage repaint
    if (poohOpen()) return;                           // Pooh Chat is showing it
    setUnread(unread + 1);
    toastN++;
    toast.textContent = toastN > 1 ? '🐻 ' + toastN + ' new messages' : '🐻 ' + m.name + ': ' + m.text;
    toast.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(hideToast, 6000);
  });

  /* Pooh Chat inside the Hub sends through here. */
  window.addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (d && d.sharedLink === 'chat' && typeof d.text === 'string') SharedChat.send(d.text);
  });
})();
