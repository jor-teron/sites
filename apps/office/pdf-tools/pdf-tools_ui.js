/*
 * PDF Tools — core UI: shared state, settings + theme, small menu, own dialog, toast, events.
 * PT.S.sources holds opened PDFs (and later images / blank pages).
 * PT.S.pages is the edit list: [{ id, srcId, src (0-based in that source), rot (extra 0/90/180/270) }].
 * PT.S.doc is the session ({ name }) while anything is open.
 */
const RELEASE = 'P3';
const PT = (() => {
  const $ = (id) => document.getElementById(id);
  const SKEY = 'pdf-tools-settings-v1';
  const P = Object.assign({ theme: 'dark', paper: 'a4', marginMm: 10, landscape: false, exportFmt: 'png' }, (() => { try { return JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch (_) { return {}; } })());
  const S = { doc: null, sources: [], pages: [], sel: new Set(), anchor: null, nextId: 1, nextSrc: 1 };
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

  /* messages: shared Office notification cards (../shared/office-notify.js, SH7) */
  function toast(msg, ms) { if (window.OfficeNotify) return OfficeNotify.show(msg, ms); }

  const sourceOf = (p) => PTUtil.sourceOf(S.sources, p);
  const usedSources = () => {
    const ids = new Set(S.pages.map((p) => p.srcId));
    return S.sources.filter((s) => ids.has(s.id));
  };

  /* Own confirm / alert / form. ask({ title, text, yes, no, danger }) -> Promise<boolean>. no:false = alert.
     form({ title, text, fields, yes, no, validate, watch }) -> Promise<object|null>. */
  let pending = null, dlgMode = 'ask';
  function showDlg(o) {
    if (pending) pending(dlgMode === 'form' ? null : false);
    $('dlg-title').textContent = o.title || '';
    $('dlg-text').textContent = o.text || '';
    $('dlg-text').hidden = !o.text;
    const yes = $('dlg-yes'), no = $('dlg-no');
    yes.textContent = o.yes || 'OK';
    yes.classList.toggle('danger', !!o.danger);
    no.hidden = o.no === false;
    no.textContent = o.no || 'Cancel';
    $('dlg-err').textContent = '';
    $('dlg').classList.toggle('wide', !!(o.fields && o.fields.length));
    renderFields(o.fields || []);
    $('dlg').hidden = false;
    setTimeout(() => {
      const first = $('dlg-fields').querySelector('input:not([type=hidden]), select, textarea');
      (first || yes).focus();
    }, 0);
  }

  function renderFields(fields) {
    const box = $('dlg-fields');
    box.innerHTML = '';
    box.hidden = !fields.length;
    if (!fields.length) { $('dlg-hint').hidden = true; $('dlg-hint').textContent = ''; return; }
    fields.forEach((f) => {
      const wrap = document.createElement('div');
      wrap.className = 'frow' + (f.type === 'radio' ? ' radios' : '');
      wrap.dataset.name = f.name;
      if (f.type === 'radio') {
        const lab = document.createElement('span');
        lab.textContent = f.label || '';
        if (f.label) wrap.appendChild(lab);
        (f.options || []).forEach((opt) => {
          const v = Array.isArray(opt) ? opt[0] : opt;
          const t = Array.isArray(opt) ? opt[1] : opt;
          const l = document.createElement('label');
          const inp = document.createElement('input');
          inp.type = 'radio'; inp.name = f.name; inp.value = v;
          if (String(f.value) === String(v)) inp.checked = true;
          l.appendChild(inp);
          l.appendChild(document.createTextNode(' ' + t));
          wrap.appendChild(l);
        });
        if (!(f.options || []).some((opt) => String(Array.isArray(opt) ? opt[0] : opt) === String(f.value)) && wrap.querySelector('input')) {
          wrap.querySelector('input').checked = true;
        }
      } else if (f.type === 'select') {
        const lab = document.createElement('span');
        lab.textContent = f.label || '';
        wrap.appendChild(lab);
        const sel = document.createElement('select');
        sel.name = f.name;
        (f.options || []).forEach((opt) => {
          const v = Array.isArray(opt) ? opt[0] : opt;
          const t = Array.isArray(opt) ? opt[1] : opt;
          const o = document.createElement('option');
          o.value = v; o.textContent = t;
          if (String(f.value) === String(v)) o.selected = true;
          sel.appendChild(o);
        });
        wrap.appendChild(sel);
      } else if (f.type === 'check') {
        const l = document.createElement('label');
        const inp = document.createElement('input');
        inp.type = 'checkbox'; inp.name = f.name; inp.checked = !!f.value;
        l.appendChild(inp);
        l.appendChild(document.createTextNode(' ' + (f.label || '')));
        wrap.appendChild(l);
      } else {
        const lab = document.createElement('span');
        lab.textContent = f.label || '';
        wrap.appendChild(lab);
        const inp = document.createElement('input');
        inp.type = f.type || 'text';
        inp.name = f.name;
        if (f.value != null) inp.value = f.value;
        if (f.placeholder) inp.placeholder = f.placeholder;
        if (f.min != null) inp.min = f.min;
        if (f.max != null) inp.max = f.max;
        if (f.step != null) inp.step = f.step;
        wrap.appendChild(inp);
      }
      if (f.hint) {
        const h = document.createElement('i');
        h.className = 'fhint';
        h.textContent = f.hint;
        wrap.appendChild(h);
      }
      box.appendChild(wrap);
    });
    box.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('input', onFieldChange);
      el.addEventListener('change', onFieldChange);
    });
    box._fields = fields;
    onFieldChange();
  }

  function collectFields() {
    const box = $('dlg-fields');
    const values = {};
    box.querySelectorAll('[name]').forEach((el) => {
      if (el.type === 'radio' && !el.checked) return;
      if (el.type === 'checkbox') values[el.name] = el.checked;
      else if (el.type === 'number') values[el.name] = el.value === '' ? null : Number(el.value);
      else values[el.name] = el.value;
    });
    return values;
  }

  function onFieldChange() {
    const box = $('dlg-fields');
    const fields = box._fields || [];
    const values = collectFields();
    fields.forEach((f) => {
      const row = box.querySelector('[data-name="' + f.name + '"]');
      if (!row) return;
      row.hidden = !!(f.when && !f.when(values));
    });
    const hint = $('dlg-hint');
    if (box._watch) {
      const msg = box._watch(values) || '';
      hint.textContent = msg;
      hint.hidden = !msg;
    } else hint.hidden = true;
    $('dlg-err').textContent = '';
  }

  function ask(o) {
    o = Object.assign({}, o);
    dlgMode = 'ask';
    showDlg(o);
    $('dlg-fields')._watch = null;
    $('dlg-fields')._validate = null;
    return new Promise((res) => { pending = (v) => { pending = null; $('dlg').hidden = true; res(!!v); }; });
  }

  function form(o) {
    o = Object.assign({}, o);
    dlgMode = 'form';
    showDlg(o);
    const box = $('dlg-fields');
    box._watch = o.watch || null;
    box._validate = o.validate || null;
    onFieldChange();
    return new Promise((res) => {
      pending = (v) => {
        if (v === null || v === false) { pending = null; $('dlg').hidden = true; res(null); return; }
        const values = collectFields();
        if (box._validate) {
          const err = box._validate(values);
          if (err) { $('dlg-err').textContent = err; return; }
        }
        pending = null; $('dlg').hidden = true; res(values);
      };
    });
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
    const used = usedSources();
    if (!has) $('fname').textContent = 'PDF Tools';
    else if (used.length <= 1) $('fname').textContent = S.doc.name;
    else $('fname').textContent = used[0].name + ' + ' + (used.length - 1) + (used.length === 2 ? ' file' : ' files');
    $('count').textContent = has ? (nsel ? nsel + ' of ' : '') + S.pages.length + (S.pages.length === 1 ? ' page' : ' pages') : '';
    $('empty').hidden = has;
    $('grid').hidden = !has;
    const drop = $('drop');
    if (drop) drop.textContent = has ? 'Drop PDF or images to add' : 'Drop PDF or images to open';
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
    $('dlg').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON')) return;
      e.preventDefault();
      $('dlg-yes').click();
    });
    $('dlg-no').addEventListener('click', () => pending && pending(dlgMode === 'form' ? null : false));
    $('dlg').addEventListener('click', (e) => {
      if (e.target === $('dlg') && pending) pending(dlgMode === 'form' ? null : false);
    });
    $('m-about').addEventListener('click', () => {
      menu(false);
      ask({
        title: 'PDF Tools ' + RELEASE,
        no: false,
        text: 'Page organiser (' + RELEASE + '): reorder, rotate, delete, merge, split, extract, duplicate, insert blank pages, add JPG/PNG images, export pages as images, and preview a page with a double-click.\nEverything happens on this device; files are never uploaded.\npdf.js (Apache-2.0) and pdf-lib 1.17.1 (MIT).',
      });
    });
    addEventListener('storage', (e) => { if (e.key === 'sites-hub.theme') theme(); });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
  }

  return {
    $, P, S, RELEASE, on, emit, toast, ask, form, menu, refresh, busy, init,
    sourceOf, usedSources,
    get dialogOpen() { return !!pending; },
  };
})();
