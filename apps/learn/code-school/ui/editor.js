/* Code School CS1a — code editor widget: a transparent textarea on top of a coloured <pre> (CS.highlight), with line
   numbers, Tab = 2 spaces (Shift+Tab takes them away, works on many lines), auto-indent on Enter (one step more after
   { ( [ or an opening tag), optional auto-close of tags when you type ">", and a key bar for phone keyboards.
   Edits go through execCommand('insertText') so Undo keeps working; setRangeText is the fallback.
   CS.editor(host, {autoClose: () => bool, onChange: fn}) -> {get value, set value, insert, focus} */
window.CS = window.CS || {};
(() => {
  const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr|!doctype)$/i;
  const KEYS = ['Tab', '<', '>', '/', '=', '"', "'", '{', '}', '(', ')', ';', ':', '#', '.'];
  window.CS.editor = function (host, opt) {
    const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
    const box = el('div', 'ed'), gut = el('div', 'ed-gut'), nums = el('div', 'ed-nums'), area = el('div', 'ed-box');
    const pre = el('pre', 'ed-hl'), code = el('code'), ta = el('textarea', 'ed-ta'), bar = el('div', 'ed-keys');
    pre.setAttribute('aria-hidden', 'true'); pre.append(code); gut.append(nums); area.append(pre, ta); box.append(gut, area);
    Object.entries({ spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', wrap: 'off', 'aria-label': 'Your code' }).forEach(([k, v]) => ta.setAttribute(k, v));
    bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Code keys');
    KEYS.forEach(k => { const b = el('button'); b.type = 'button'; b.textContent = k === 'Tab' ? '\u21E5' : k; b.title = k === 'Tab' ? 'Tab (2 spaces)' : k;
      b.addEventListener('pointerdown', e => e.preventDefault());          // keep the phone keyboard open
      b.addEventListener('click', () => { if (k === 'Tab') indent(false); else { insert(k); if (k === '>') autoClose(); } });
      bar.append(b); });
    host.append(box, bar);
    let lines = 0, raf = 0, busy = false;
    function paint() {
      raf = 0; code.innerHTML = CS.highlight(ta.value) + '\n';
      const n = ta.value.split('\n').length;
      if (n !== lines) { lines = n; nums.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
      sync();
    }
    function sync() { pre.style.transform = 'translate(' + -ta.scrollLeft + 'px,' + -ta.scrollTop + 'px)'; nums.style.transform = 'translateY(' + -ta.scrollTop + 'px)'; }
    const later = () => { raf = raf || requestAnimationFrame(paint); };
    function insert(text, a = ta.selectionStart, b = ta.selectionEnd) {
      busy = true; ta.focus(); ta.setSelectionRange(a, b);
      let ok = false; try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
      if (!ok) { ta.setRangeText(text, a, b, 'end'); ta.dispatchEvent(new Event('input')); }
      busy = false; later(); opt.onChange && opt.onChange();          // our own edits count as a change too
    }
    function indent(out) {
      const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
      if (!out && !v.slice(s, e).includes('\n')) return insert('  ');
      const ls = v.lastIndexOf('\n', s - 1) + 1, block = v.slice(ls, e);
      const nb = block.split('\n').map(l => out ? l.replace(/^ {1,2}/, '') : '  ' + l).join('\n');
      insert(nb, ls, e); ta.setSelectionRange(ls, ls + nb.length);
    }
    function enter() {
      const v = ta.value, s = ta.selectionStart, line = v.slice(v.lastIndexOf('\n', s - 1) + 1, s);
      const ind = line.match(/^\s*/)[0], before = line.trimEnd().slice(-1), after = v.slice(ta.selectionEnd);
      const tag = line.match(/<([A-Za-z][\w-]*)[^<>]*>\s*$/), openTag = before === '>' && tag && !VOID.test(tag[1]) && !/\/>\s*$/.test(line) && !line.includes('</' + tag[1]);
      const more = '([{'.includes(before) && before !== '' || openTag;
      const split = more && (/^\s*[)\]}]/.test(after) || (openTag && /^\s*<\//.test(after)));
      insert('\n' + ind + (more ? '  ' : '') + (split ? '\n' + ind : ''));
      if (split) { const p = s + 1 + ind.length + 2; ta.setSelectionRange(p, p); }
    }
    function autoClose() {
      if (!opt.autoClose()) return;
      const v = ta.value, s = ta.selectionStart, upto = v.slice(0, s), low = upto.toLowerCase();
      if (low.lastIndexOf('<script') > low.lastIndexOf('</script') || low.lastIndexOf('<style') > low.lastIndexOf('</style')) return;
      const m = upto.match(/<([A-Za-z][\w-]*)(?:\s[^<>]*)?>$/);
      if (!m || VOID.test(m[1]) || /\/>$/.test(upto)) return;
      insert('</' + m[1] + '>', s, s); ta.setSelectionRange(s, s);
    }
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); indent(e.shiftKey); }
      else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); enter(); }
    });
    ta.addEventListener('input', e => {
      later(); if (busy) return;
      if (e.inputType === 'insertText' && e.data === '>') autoClose();
      opt.onChange && opt.onChange();
    });
    ta.addEventListener('scroll', sync);
    return {
      get value() { return ta.value; },
      set value(v) { ta.value = v; ta.scrollTop = ta.scrollLeft = 0; paint(); },
      insert: t => insert(t), focus: () => ta.focus(), textarea: ta
    };
  };
})();
