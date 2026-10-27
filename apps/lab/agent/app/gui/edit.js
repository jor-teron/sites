/* Agent — app/gui/edit.js: Retry / Edit / Copy actions on chat bubbles (AG5). HR.edit.attach(m, bubbleEl, bodyEl).
   Actions stay out of sight: they show on hover (mouse) or after a tap on the bubble (touch; tap again / elsewhere hides).
   User bubble: ✎ Edit -> in-place textarea with Send / Cancel; Send = HR.chat.resend (later turns dropped, re-run).
   Assistant bubble: ↻ Retry only on the latest reply (drops it and its tool steps, re-runs); ⧉ Copy on both.
   Nothing while a reply is running. The chat file follows through HR.msgs.truncate -> HR.chats save. */
HR.edit = (function () {
  function btn(t, lab, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'hb wide act'; b.textContent = t; b.setAttribute('aria-label', lab); b.onclick = function (e) { e.stopPropagation(); fn(); }; return b; }
  function last(m) { var l = HR.msgs.all().filter(function (x) { return x.role === 'assistant' && !x.error; }); return l[l.length - 1] === m; }
  function editIn(m, el, body) {
    var ta = document.createElement('textarea'), row = document.createElement('div');
    ta.className = 'ed-ta'; ta.value = m.content || ''; row.className = 'acts ed-row';
    function cancel() { HR.chat.render(); }
    row.append(btn('Send ➤', 'Send edited message', function () { HR.chat.resend(m, ta.value); }), btn('Cancel', 'Cancel edit', cancel));
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); HR.chat.resend(m, ta.value); } else if (e.key === 'Escape') cancel(); });
    ta.addEventListener('click', function (e) { e.stopPropagation(); });
    body.innerHTML = ''; body.appendChild(ta); el.classList.add('editing'); el.classList.remove('acts-on');
    var old = el.querySelector('.acts:not(.ed-row)'); if (old) old.remove();
    el.appendChild(row); ta.focus(); ta.style.height = Math.min(ta.scrollHeight + 4, 260) + 'px';
  }
  function refresh(m, el, body, row) {
    row.innerHTML = '';
    if (HR.chat.busy() || el.classList.contains('editing') || m.error) return false;
    if (m.role === 'user') row.appendChild(btn('✎ Edit', 'Edit message', function () { editIn(m, el, body); }));
    if (m.role === 'assistant' && last(m)) row.appendChild(btn('↻ Retry', 'Retry this reply', function () { HR.chat.retry(m); }));
    if (m.content && navigator.clipboard) row.appendChild(btn('⧉ Copy', 'Copy text', function () { navigator.clipboard.writeText(m.content).catch(function () {}); }));
    return row.children.length > 0;
  }
  function attach(m, el, body) {
    if (m.role !== 'user' && m.role !== 'assistant') return;
    var row = document.createElement('div'); row.className = 'acts'; el.appendChild(row);
    el.addEventListener('mouseenter', function () { refresh(m, el, body, row); });
    el.addEventListener('click', function (e) {
      if (el.classList.contains('editing') || e.target.closest('details,a,button,pre') || String(getSelection()).length) return;
      var on = !el.classList.contains('acts-on');
      [].forEach.call(document.querySelectorAll('.msg.acts-on'), function (x) { x.classList.remove('acts-on'); });
      if (on && refresh(m, el, body, row)) el.classList.add('acts-on');
    });
  }
  return { attach: attach };
})();
