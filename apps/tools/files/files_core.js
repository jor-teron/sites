/*
 * Files core (apps/tools/files/files_core.js) — the shared namespace window.FX for the Files
 * app modules: state, small DOM helpers, status line, progress bar, remembered view prefs.
 *
 * FX.st: driveId, driveName, stack ([{ name, handle }], [0] = drive root), items (current
 *   folder as listed), shown (items after sort + search), sel (Set of names), anchor (for
 *   Shift-click), clip ({ mode:'copy'|'cut', dir, driveId, entries }), view ('grid'|'list'),
 *   sort ('name'|'size'|'modified'), dir (1 | -1), q (search text).
 * Other modules add: FX.drives (files_drives.js), FX.view (files_view.js),
 * FX.act (files_actions.js), FX.viewer (files_viewer.js), FX.menu (files_menu.js).
 */
window.FX = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PREF = 'sites-files.';
  const pref = (k, d) => { try { return localStorage.getItem(PREF + k) || d; } catch (_) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem(PREF + k, v); } catch (_) { /* blocked */ } };

  const st = {
    driveId: '', driveName: '', stack: [], items: [], shown: [], sel: new Set(), anchor: '',
    clip: null, view: pref('view', 'grid') === 'list' ? 'list' : 'grid',
    sort: ['name', 'size', 'modified'].indexOf(pref('sort', 'name')) >= 0 ? pref('sort', 'name') : 'name',
    dir: pref('dir', '1') === '-1' ? -1 : 1, q: ''
  };

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, title, fn) {
    const b = el('button', cls, text); b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    if (fn) b.addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
    return b;
  }
  let sayT = 0;
  function say(text, bad) {
    const m = $('msg');
    clearTimeout(sayT);
    m.hidden = !text; m.textContent = text || ''; m.classList.toggle('bad', !!bad);
    if (text && !bad) sayT = setTimeout(() => { m.hidden = true; }, 4000);
  }
  const fail = (e) => say((e && e.message) || 'Something went wrong', true);
  function size(n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
  }
  const TEXT = /\.(txt|md|markdown|csv|tsv|json|js|mjs|ts|css|html?|xml|svg|log|ini|cfg|conf|ya?ml|m3u8?|srt|vtt|py|sh|c|h|cpp|java|rs|go|sql)$/i;
  const IMG = /\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i;
  /** 'image' | 'text' | '' for a name (+ optional mime type). */
  function kind(name, type) {
    if (IMG.test(name) || /^image\/(?!svg)/.test(type || '')) return 'image';
    if (TEXT.test(name) || /^text\/|json|xml/.test(type || '')) return 'text';
    return '';
  }
  function icon(e) {
    if (e.kind === 'directory') return '\uD83D\uDCC1';
    const k = kind(e.name, e.type);
    if (k === 'image') return '\uD83D\uDDBC\uFE0F';
    if (k === 'text') return '\uD83D\uDCC4';
    if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(e.name)) return '\uD83C\uDFB5';
    if (/\.(mp4|webm|mkv|mov)$/i.test(e.name)) return '\uD83C\uDFAC';
    if (/\.(zip|7z|rar|gz|tar)$/i.test(e.name)) return '\uD83D\uDDDC\uFE0F';
    if (/\.pdf$/i.test(e.name)) return '\uD83D\uDCD5';
    return '\uD83D\uDCE6';
  }
  const cur = () => (st.stack.length ? st.stack[st.stack.length - 1].handle : null);
  const pathText = () => st.stack.map((s) => s.name).join(' / ');
  const selected = () => st.shown.filter((e) => st.sel.has(e.name));

  /** Progress bar for long jobs: p = FX.progress('Copying'); p.total(bytes); p.add(n); p.label(t); p.done(). */
  function progress(title) {
    const box = $('prog'), bar = box.querySelector('i'), txt = box.querySelector('span');
    let total = 0, done = 0, shownAt = 0, cancelled = false;
    const t = setTimeout(() => { box.hidden = false; shownAt = Date.now(); }, 300);   // only for jobs that take a moment
    const cancel = box.querySelector('button');
    cancel.onclick = () => { cancelled = true; txt.textContent = 'Stopping\u2026'; };
    const paint = () => { bar.style.width = (total ? Math.min(100, done / total * 100) : 0) + '%'; };
    txt.textContent = title + '\u2026'; paint();
    return {
      total(n) { total = n; paint(); },
      add(n) { done += n; paint(); },
      label(s) { txt.textContent = title + ' ' + s + (total ? ' \u2014 ' + size(done) + ' of ' + size(total) : ''); },
      get cancelled() { return cancelled; },
      done() { clearTimeout(t); const left = shownAt ? Math.max(0, 400 - (Date.now() - shownAt)) : 0; setTimeout(() => { box.hidden = true; }, left); }
    };
  }
  /** Tell a Hub around us to save its window session (the path is in our hash). */
  function hubSave() { try { if (window.parent !== window) window.parent.postMessage({ type: 'hub-wm-save' }, location.origin); } catch (_) { /* ignore */ } }

  /** Open with a single click? Hub setting 'sites-hub.filesClick' = 'single' (Settings → Windows or
   *  this app's ⋯ / right-click menu); default double-click. Read on every click (live). */
  const CLICK_KEY = 'sites-hub.filesClick';
  function singleClick() { try { return localStorage.getItem(CLICK_KEY) === 'single'; } catch (_) { return false; } }
  function setSingleClick(on) { try { if (on) localStorage.setItem(CLICK_KEY, 'single'); else localStorage.removeItem(CLICK_KEY); } catch (_) { /* blocked */ } }

  return { $, el, btn, say, fail, size, kind, icon, st, cur, pathText, selected, setPref, progress, hubSave, singleClick, setSingleClick };
})();
