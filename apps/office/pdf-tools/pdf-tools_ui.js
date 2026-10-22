/*
 * PDF Tools — core UI: shared state, settings + theme, small menu, own dialog, toast, events.
 * PT.S.pages is the edit list: [{ id, src (0-based page in the opened file), rot (extra 0/90/180/270) }].
 */
const PT = (() => {
  const $ = (id) => document.getElementById(id);
  const SKEY = 'pdf-tools-settings-v1';
  const P = Object.assign({ theme: 'dark' }, (() => { try { return JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch (_) { return {}; } })());
  const S = { doc: null, pages: [], sel: new Set(), anchor: null, nextId: 1 };
  const hooks = {};
  const on = (k, f) => (hooks[k] = hooks[k] || []).push(f);
  const emit = (k, a) => (hooks[k] || []).forEach((f) => f(a));
  const saveP = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) { /* private mode */ } };

  function theme() {
    const t = localStorage.getItem('sites-hub.theme');
    const dark = P.theme === 'dark' || (P.theme === 'system' && (t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)));
    document.documentElement.classList.toggle('dark', dark);
    document.querySelectorAll('#theme-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === P.theme));
  }

  let tt;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove('on'), ms || 2200);
  }

  /* Own confirm / alert. ask({ title, text, yes, no, danger }) -> Promise<boolean>. no:false = alert. */
  let pending = null;
  function ask(o) {
    if (pending) pending(false);
    $('dlg-title').textContent = o.title || '';
    $('dlg-text').textContent = o.text || '';
    const yes = $('dlg-yes'), no = $('dlg-no');
    yes.textContent = o.yes || 'OK';
    yes.classList.toggle('danger', !!o.danger);
    no.hidden = o.no === false;
    no.textContent = o.no || 'Cancel';
    $('dlg').hidden = false;
    setTimeout(() => yes.focus(), 0);
    return new Promise((res) => { pending = (v) => { pending = null; $('dlg').hidden = true; res(v); }; });
  }

  function menu(open) {
    const m = $('menu');
    const show = open === undefined ? m.hidden : open;
    m.hidden = !show;
    $('b-menu').setAttribute('aria-expanded', String(show));
  }

  /* Enable / disable rail buttons, update the header. Called after every change. */
  function refresh() {
    const has = !!S.doc, nsel = S.sel.size;
    document.querySelectorAll('[data-need]').forEach((b) => { b.disabled = !has || (b.dataset.need === 'sel' && !nsel); });
    $('b-undo').disabled = !PT.Edit || !PT.Edit.canUndo();
    $('b-redo').disabled = !PT.Edit || !PT.Edit.canRedo();
    $('fname').textContent = has ? S.doc.name : 'PDF Tools';
    $('count').textContent = has ? (nsel ? nsel + ' of ' : '') + S.pages.length + (S.pages.length === 1 ? ' page' : ' pages') : '';
    $('empty').hidden = has;
    $('grid').hidden = !has;
  }

  function busy(text) {
    $('busy').hidden = !text;
    if (text) $('busy-text').textContent = text;
  }

  function init() {
    theme();
    $('theme-seg').addEventListener('click', (e) => {
      const v = e.target.dataset && e.target.dataset.v;
      if (!v) return;
      P.theme = v; saveP(); theme();
    });
    $('b-menu').addEventListener('click', (e) => { e.stopPropagation(); menu(); });
    document.addEventListener('pointerdown', (e) => { if (!$('menu').hidden && !e.target.closest('#menu, #b-menu')) menu(false); });
    $('dlg-yes').addEventListener('click', () => pending && pending(true));
    $('dlg-no').addEventListener('click', () => pending && pending(false));
    $('dlg').addEventListener('click', (e) => { if (e.target === $('dlg') && pending) pending(false); });
    $('m-about').addEventListener('click', () => {
      menu(false);
      ask({ title: 'PDF Tools 1.0', no: false, text: 'Page organiser (P1): reorder, rotate and delete pages, then save a new copy.\nEverything happens on this device; files are never uploaded.\npdf.js (Apache-2.0) and pdf-lib 1.17.1 (MIT).' });
    });
    addEventListener('storage', (e) => { if (e.key === 'sites-hub.theme') theme(); });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
  }

  return { $, P, S, on, emit, toast, ask, menu, refresh, busy, init, get dialogOpen() { return !!pending; } };
})();
