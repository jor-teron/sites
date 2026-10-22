/*
 * SSH — terminal: xterm.js + fit addon, theme, resize, copy/paste, phone key bar.
 * Copy: selecting text copies it; Ctrl+Shift+C; Copy button. Paste: Ctrl+Shift+V; right-click;
 * long-press on touch; Paste button. If the clipboard can't be read, a paste box opens instead.
 */
SSH.Term = (() => {
  const { $, P } = SSH;
  let term = null, fit = null, sink = null, onSize = null, ctrl = false;

  const colors = () => document.documentElement.classList.contains('dark')
    ? { background: '#0d0f12', foreground: '#e8eaee', cursor: '#e8eaee', selectionBackground: 'rgba(91,147,255,.4)' }
    : { background: '#fbfbfc', foreground: '#1b1d22', cursor: '#1b1d22', selectionBackground: 'rgba(47,111,228,.3)', black: '#1b1d22', brightBlack: '#555', white: '#999', brightWhite: '#444', yellow: '#9a6a00', brightYellow: '#8a5a00' };

  function theme() { if (term) term.options.theme = colors(); }

  async function copy(quiet) {
    if (!term || !term.hasSelection()) { if (!quiet) SSH.toast('Select text first'); return; }
    const s = term.getSelection();
    try { await navigator.clipboard.writeText(s); if (!quiet) SSH.toast('Copied'); }
    catch (_) {
      const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); if (!quiet) SSH.toast('Copied'); } catch (__) { if (!quiet) SSH.toast('Copy blocked by the browser'); }
      ta.remove(); term.focus();
    }
  }

  async function paste() {
    if (!sink) return;
    let s = null;
    try { s = await navigator.clipboard.readText(); } catch (_) { s = null; }
    if (s === null) s = await SSH.ask({ title: 'Paste', text: 'The browser did not allow reading the clipboard. Paste the text here:', yes: 'Send', input: true });
    if (s) term.paste(s);
    term.focus();
  }

  function key(k) {
    if (!sink) return;
    const map = { esc: '\x1b', tab: '\t', up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D' };
    if (k === 'ctrl') { ctrl = !ctrl; $('k-ctrl').classList.toggle('on', ctrl); term.focus(); return; }
    sink(map[k] || k);
    term.focus();
  }

  function create() {
    term = new Terminal({ fontSize: P.font, fontFamily: 'ui-monospace, "Cascadia Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace', cursorBlink: true, scrollback: 5000, theme: colors(), allowProposedApi: false, rightClickSelectsWord: false });
    fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open($('term'));
    term.onData((d) => {
      if (!sink) return;
      if (ctrl && d.length === 1) { const c = d.toUpperCase().charCodeAt(0); if (c >= 64 && c <= 95) d = String.fromCharCode(c - 64); ctrl = false; $('k-ctrl').classList.remove('on'); }
      sink(d);
    });
    term.onResize(({ cols, rows }) => onSize && onSize(cols, rows));
    term.onSelectionChange(() => { if (term.hasSelection()) copy(true); });
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !(e.ctrlKey && e.shiftKey)) return true;
      const k = e.key.toLowerCase();
      if (k === 'c') { e.preventDefault(); copy(); return false; }
      if (k === 'v') { e.preventDefault(); paste(); return false; }
      return true;
    });
    const wrap = $('term-wrap');
    wrap.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); paste(); }, true);
    let lp = null, sx = 0, sy = 0;
    wrap.addEventListener('touchstart', (e) => { if (e.touches.length !== 1) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; lp = setTimeout(() => { lp = null; paste(); }, 600); }, { passive: true });
    wrap.addEventListener('touchmove', (e) => { if (lp && Math.hypot(e.touches[0].clientX - sx, e.touches[0].clientY - sy) > 10) { clearTimeout(lp); lp = null; } }, { passive: true });
    wrap.addEventListener('touchend', () => { if (lp) { clearTimeout(lp); lp = null; } });
    new ResizeObserver(() => refit()).observe(wrap);
    $('keys').addEventListener('pointerdown', (e) => { const b = e.target.closest('button'); if (b) { e.preventDefault(); key(b.dataset.k); } });
  }

  function refit() { if (term && !$('term-wrap').hidden) { try { fit.fit(); } catch (_) {} } }

  /* show(): make the terminal visible and fitted; returns { cols, rows }. */
  function show() {
    $('term-wrap').hidden = false;
    if (!term) create();
    refit();
    return { cols: term.cols, rows: term.rows };
  }

  function attach(write, resize) { sink = write; onSize = resize; if (term) term.focus(); }
  function detach() { sink = null; onSize = null; }
  function reset() { if (term) { term.reset(); term.clear(); } }
  function write(u8) { if (term) term.write(u8); }
  function font(d) {
    P.font = Math.max(9, Math.min(28, P.font + d)); SSH.saveP();
    if (term) { term.options.fontSize = P.font; refit(); }
  }

  return { show, attach, detach, reset, write, copy, paste, font, theme, refit, focus: () => term && term.focus(), get size() { return term ? { cols: term.cols, rows: term.rows } : null; }, get hasSel() { return !!(term && term.hasSelection()); } };
})();
