/* Password Manager PW2 — screens, list, detail, settings, clipboard, backup, health, tags. */
(function (root) {
  'use strict';

  var TYPES = ['login', 'card', 'note', 'wifi'];
  var FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'fav', label: 'Favourites' },
    { id: 'login', label: 'Login' },
    { id: 'card', label: 'Card' },
    { id: 'note', label: 'Note' },
    { id: 'wifi', label: 'Wi-Fi' }
  ];

  var state = {
    rec: null,
    key: null,
    vault: null,
    filter: 'all',
    query: '',
    tagFilter: '',
    selectedId: null,
    dirty: false,
    busy: false,
    countdownTimer: null,
    clipTimer: null,
    clipText: ''
  };

  function $(id) { return document.getElementById(id); }
  function U() { return root.PMUtil; }

  function settings() {
    var s = (state.vault && state.vault.settings) || {};
    var auto = Number(s.autoLockMin);
    if (auto !== 1 && auto !== 5 && auto !== 15 && auto !== 30) auto = 5;
    var hid = Number(s.lockHiddenMin);
    if (hid !== 1 && hid !== 5) hid = 0;
    var clip = Number(s.clipboardSec);
    if (clip !== 10 && clip !== 30 && clip !== 60 && clip !== 0) clip = 30;
    return { autoLockMin: auto, lockHiddenMin: hid, clipboardSec: clip };
  }

  function setScreen(name) {
    ['screenSetup', 'screenUnlock', 'screenApp'].forEach(function (id) {
      var el = $(id);
      if (el) el.hidden = (id !== name);
    });
  }

  function setBusy(on, label) {
    state.busy = !!on;
    ['setupGo', 'unlockGo'].forEach(function (id) {
      var b = $(id);
      if (b) b.disabled = !!on || b.getAttribute('data-wait') === '1';
    });
    var st = $('unlockStatus');
    if (st && label) st.textContent = label;
    var ss = $('setupStatus');
    if (ss && label) ss.textContent = label;
  }

  function wipeMemory() {
    if (root.PMLock) PMLock.stop();
    if (state.vault && Array.isArray(state.vault.entries)) {
      state.vault.entries.forEach(function (e) {
        Object.keys(e).forEach(function (k) {
          if (typeof e[k] === 'string') e[k] = '';
        });
      });
      state.vault.entries.length = 0;
    }
    state.vault = null;
    state.key = null;
    state.selectedId = null;
    state.dirty = false;
    state.filter = 'all';
    state.tagFilter = '';
    state.query = '';
    var detail = $('detailPane');
    if (detail) detail.innerHTML = '';
    var list = $('entryList');
    if (list) list.innerHTML = '';
    var search = $('searchBox');
    if (search) search.value = '';
    document.querySelectorAll('input, textarea').forEach(function (el) {
      if (el.id === 'unlockPw' || el.id === 'setupPw' || el.id === 'setupPw2' || el.id === 'setupHint') return;
      if (el.type === 'password' || el.getAttribute('data-secret') === '1' || el.name) {
        try { el.value = ''; } catch (_) { /* ok */ }
      }
    });
  }

  function showHint() {
    var rec = state.rec;
    var el = $('unlockHint');
    if (!el) return;
    var hint = rec && rec.hint ? String(rec.hint) : '';
    el.hidden = !hint;
    el.textContent = hint ? ('Hint: ' + hint) : '';
  }

  function onLocked() {
    tryClearClipboard(true);
    wipeMemory();
    setScreen('screenUnlock');
    showHint();
    var pw = $('unlockPw');
    if (pw) { pw.value = ''; pw.focus(); }
    var st = $('unlockStatus');
    if (st) st.textContent = 'Locked.';
    startCountdownWatch();
  }

  function enterApp() {
    setScreen('screenApp');
    if (root.PMLock) {
      PMLock.start({
        getSettings: settings,
        onLock: onLocked
      });
    }
    renderFilters();
    renderList();
    renderDetail();
  }

  function saveEncrypted(extra) {
    if (!state.key || !state.vault) return Promise.reject(new Error('Vault is locked'));
    var salt = PMCrypto.b64dec(state.rec.salt);
    var iter = state.rec.iter || PMCrypto.ITER_DEFAULT;
    return PMCrypto.encryptVault(state.vault, state.key, salt, iter).then(function (header) {
      var rec = PMStore.mergeHeader(state.rec, header, extra || {});
      return PMStore.saveRecord(rec).then(function (saved) {
        state.rec = saved;
        return saved;
      });
    });
  }

  /* ---------- clipboard ---------- */

  function tryClearClipboard(forceEmpty) {
    if (state.clipTimer) { clearTimeout(state.clipTimer); state.clipTimer = null; }
    var text = state.clipText;
    state.clipText = '';
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    function writeEmpty() {
      return navigator.clipboard.writeText('').catch(function () { /* blocked */ });
    }
    if (forceEmpty) {
      writeEmpty();
      return;
    }
    if (navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (cur) {
        if (cur === text) return writeEmpty();
        // User copied something else — leave it.
      }).catch(function () { writeEmpty(); });
    } else {
      writeEmpty();
    }
  }

  function copyText(text, btn) {
    text = String(text || '');
    var sec = settings().clipboardSec;
    function mark(ok) {
      if (!btn) return;
      var old = btn.getAttribute('data-label') || btn.textContent;
      btn.setAttribute('data-label', old);
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(function () { if (btn) btn.textContent = old; }, 1200);
    }
    if (!text) { mark(false); return; }
    if (!navigator.clipboard || !navigator.clipboard.writeText) { mark(false); return; }
    navigator.clipboard.writeText(text).then(function () {
      mark(true);
      if (state.clipTimer) clearTimeout(state.clipTimer);
      state.clipText = text;
      if (sec > 0) {
        state.clipTimer = setTimeout(function () {
          state.clipTimer = null;
          tryClearClipboard(false);
        }, sec * 1000);
      }
    }, function () { mark(false); });
  }

  /* ---------- list / filter ---------- */

  function matches(e) {
    if (!e || e.deleted) return false;
    if (state.filter === 'fav' && !e.favourite) return false;
    if (state.filter !== 'all' && state.filter !== 'fav' && e.type !== state.filter) return false;
    if (state.tagFilter) {
      var tags = Array.isArray(e.tags) ? e.tags : [];
      var want = state.tagFilter.toLowerCase();
      if (!tags.some(function (t) { return String(t).toLowerCase() === want; })) return false;
    }
    var q = state.query.trim().toLowerCase();
    if (!q) return true;
    var hay = [e.title, e.username, e.url, e.notes, e.ssid, e.cardholder].join('\n').toLowerCase();
    if (Array.isArray(e.tags)) hay += '\n' + e.tags.join('\n').toLowerCase();
    if (Array.isArray(e.fields)) {
      e.fields.forEach(function (f) {
        if (!f) return;
        hay += '\n' + String(f.name || '').toLowerCase();
        if (!f.hidden) hay += '\n' + String(f.value || '').toLowerCase();
      });
    }
    return hay.indexOf(q) !== -1;
  }

  function sortedEntries() {
    var list = (state.vault && state.vault.entries) || [];
    return list.filter(matches).slice().sort(function (a, b) {
      if (!!b.favourite !== !!a.favourite) return b.favourite ? 1 : -1;
      var ta = U().entryTitle(a).toLowerCase();
      var tb = U().entryTitle(b).toLowerCase();
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return 0;
    });
  }

  function allTags() {
    var seen = Object.create(null);
    var list = [];
    ((state.vault && state.vault.entries) || []).forEach(function (e) {
      if (!e || e.deleted || !Array.isArray(e.tags)) return;
      e.tags.forEach(function (t) {
        t = String(t || '').trim();
        if (!t) return;
        var k = t.toLowerCase();
        if (seen[k]) return;
        seen[k] = true;
        list.push(t);
      });
    });
    list.sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
    return list;
  }

  function renderFilters() {
    var bar = $('filterBar');
    if (!bar) return;
    var html = FILTERS.map(function (f) {
      return '<button type="button" class="chip' + (state.filter === f.id ? ' on' : '') +
        '" data-filter="' + f.id + '">' + U().escapeHtml(f.label) + '</button>';
    }).join('');
    var tags = allTags();
    if (tags.length) {
      html += '<span class="filter-gap" aria-hidden="true"></span>';
      html += '<button type="button" class="chip' + (!state.tagFilter ? ' on' : '') +
        '" data-tag="">All tags</button>';
      html += tags.map(function (t) {
        var on = state.tagFilter.toLowerCase() === t.toLowerCase();
        return '<button type="button" class="chip' + (on ? ' on' : '') +
          '" data-tag="' + U().escapeHtml(t) + '">#' + U().escapeHtml(t) + '</button>';
      }).join('');
    } else {
      state.tagFilter = '';
    }
    bar.innerHTML = html;
  }

  function renderList() {
    var box = $('entryList');
    var count = $('listCount');
    if (!box) return;
    var rows = sortedEntries();
    if (count) count.textContent = rows.length === 1 ? '1 entry' : (rows.length + ' entries');
    if (!rows.length) {
      var empty = state.query || state.filter !== 'all'
        ? 'No entries match this search.'
        : 'No entries yet. Tap Add to create one.';
      box.innerHTML = '<p class="empty">' + U().escapeHtml(empty) + '</p>';
      return;
    }
    box.innerHTML = rows.map(function (e) {
      var on = e.id === state.selectedId ? ' on' : '';
      var star = e.favourite ? '<span class="star" aria-label="Favourite">★</span>' : '';
      return '<button type="button" class="entry' + on + '" data-id="' + U().escapeHtml(e.id) + '">' +
        '<span class="entry-top">' +
          '<span class="badge">' + U().escapeHtml(U().typeLabel(e.type)) + '</span>' +
          star +
        '</span>' +
        '<span class="entry-title">' + U().escapeHtml(U().entryTitle(e)) + '</span>' +
        '<span class="entry-sub">' + U().escapeHtml(U().entrySub(e)) + '</span>' +
        (Array.isArray(e.tags) && e.tags.length
          ? '<span class="entry-tags">' + U().escapeHtml(e.tags.map(function (t) { return '#' + t; }).join(' ')) + '</span>'
          : '') +
      '</button>';
    }).join('');
  }

  /* ---------- detail form ---------- */

  function findEntry(id) {
    var list = (state.vault && state.vault.entries) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function parseTags(raw) {
    var seen = Object.create(null);
    var out = [];
    String(raw || '').split(',').forEach(function (t) {
      t = t.replace(/^#/, '').trim();
      if (!t) return;
      var k = t.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(t);
    });
    return out;
  }

  function readCustomFields(form) {
    var rows = form.querySelectorAll('[data-custom-field]');
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var nameEl = row.querySelector('[data-cf="name"]');
      var valEl = row.querySelector('[data-cf="value"]');
      var hidEl = row.querySelector('[data-cf="hidden"]');
      var name = nameEl ? nameEl.value.trim() : '';
      var value = valEl ? valEl.value : '';
      if (!name && !value) continue;
      out.push({
        id: row.getAttribute('data-id') || U().uid(),
        name: name || 'Field',
        value: value,
        hidden: !!(hidEl && hidEl.checked)
      });
    }
    return out;
  }

  function customFieldsHtml(fields) {
    fields = Array.isArray(fields) ? fields : [];
    var rows = fields.map(function (f) {
      f = f || {};
      var id = U().escapeHtml(f.id || U().uid());
      var hidden = !!f.hidden;
      return '<div class="custom-field" data-custom-field data-id="' + id + '">' +
        '<input data-cf="name" type="text" autocomplete="off" spellcheck="false" placeholder="Field name" value="' +
          U().escapeHtml(f.name || '') + '">' +
        '<span class="field-row">' +
          '<input data-cf="value" type="' + (hidden ? 'password' : 'text') + '"' +
            (hidden ? ' data-secret="1"' : '') +
            ' autocomplete="off" spellcheck="false" placeholder="Value" value="' +
            U().escapeHtml(f.value || '') + '">' +
          (hidden ? '<button type="button" class="btn secondary-btn slim-btn" data-act="toggle-vis">Show</button>' : '') +
          '<button type="button" class="btn secondary-btn slim-btn" data-act="copy-cf">Copy</button>' +
        '</span>' +
        '<label class="fav-check"><input data-cf="hidden" type="checkbox"' + (hidden ? ' checked' : '') + '> Hidden</label>' +
        '<button type="button" class="btn secondary-btn slim-btn" data-act="remove-field">Remove</button>' +
      '</div>';
    }).join('');
    return '<div class="custom-fields" id="customFields">' +
      '<span class="field-label">Custom fields</span>' +
      '<div id="customFieldList">' + rows + '</div>' +
      '<button type="button" class="btn secondary-btn slim-btn" data-act="add-field">Add field</button>' +
    '</div>';
  }

  function readForm() {
    var form = $('entryForm');
    if (!form) return null;
    var type = form.getAttribute('data-type') || 'login';
    var get = function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? el.value : '';
    };
    var fav = form.querySelector('[name="favourite"]');
    var ev = {
      id: form.getAttribute('data-id'),
      type: type,
      title: get('title').trim(),
      favourite: !!(fav && fav.checked),
      notes: get('notes'),
      tags: parseTags(get('tags')),
      fields: readCustomFields(form),
      created: form.getAttribute('data-created') || U().nowIso(),
      updated: U().nowIso()
    };
    var totpEl = form.querySelector('[name="totp"]');
    if (totpEl && totpEl.value.trim()) ev.totp = totpEl.value.trim();
    if (type === 'login') {
      ev.username = get('username');
      ev.password = get('password');
      ev.url = get('url');
    } else if (type === 'card') {
      ev.cardholder = get('cardholder');
      ev.number = get('number');
      ev.expiry = get('expiry');
      ev.cvv = get('cvv');
    } else if (type === 'note') {
      ev.text = get('text');
    } else if (type === 'wifi') {
      ev.ssid = get('ssid');
      ev.password = get('password');
      ev.security = get('security');
    }
    return ev;
  }

  function markDirty() { state.dirty = true; var b = $('saveEntryBtn'); if (b) b.disabled = false; }

  function field(opts) {
    var name = opts.name;
    var label = opts.label;
    var type = opts.type || 'text';
    var value = opts.value == null ? '' : opts.value;
    var ac = opts.ac || 'off';
    var extra = opts.extra || '';
    var secret = !!opts.secret;
    var gen = !!opts.gen;
    var copy = opts.copy !== false;
    var ph = opts.placeholder ? ' placeholder="' + U().escapeHtml(opts.placeholder) + '"' : '';
    var input;
    if (type === 'textarea') {
      input = '<textarea name="' + name + '" rows="' + (opts.rows || 5) +
        '" autocomplete="off"' + ph + '>' + U().escapeHtml(value) + '</textarea>';
    } else if (type === 'select') {
      input = '<select name="' + name + '">' + (opts.options || []).map(function (o) {
        var sel = o === value ? ' selected' : '';
        return '<option value="' + U().escapeHtml(o) + '"' + sel + '>' + U().escapeHtml(o) + '</option>';
      }).join('') + '</select>';
    } else {
      input = '<input name="' + name + '" type="' + (secret ? 'password' : type) + '"' +
        (secret ? ' data-secret="1"' : '') +
        ' autocomplete="' + ac + '" spellcheck="false"' + ph +
        ' value="' + U().escapeHtml(value) + '">';
    }
    var tools = '';
    if (secret) {
      tools += '<button type="button" class="btn secondary-btn slim-btn" data-act="toggle-vis">Show</button>';
    }
    if (copy && type !== 'select') {
      tools += '<button type="button" class="btn secondary-btn slim-btn" data-act="copy-field" data-name="' +
        name + '">Copy</button>';
    }
    if (gen) {
      tools += '<button type="button" class="btn secondary-btn slim-btn" data-act="generate">Generate</button>';
    }
    return '<label class="field">' +
      '<span class="field-label">' + U().escapeHtml(label) + '</span>' +
      '<span class="field-row">' + input + tools + '</span>' + extra +
    '</label>';
  }

  function formHtml(e, isNew) {
    var type = e.type || 'login';
    var html = '<form id="entryForm" data-type="' + type + '" data-id="' + U().escapeHtml(e.id) +
      '" data-created="' + U().escapeHtml(e.created || '') + '" autocomplete="off">' +
      '<div class="detail-head">' +
        '<h2>' + (isNew ? 'New ' : '') + U().escapeHtml(U().typeLabel(type)) + '</h2>' +
        '<label class="fav-check"><input type="checkbox" name="favourite"' +
          (e.favourite ? ' checked' : '') + '> Favourite</label>' +
      '</div>' +
      field({ name: 'title', label: 'Title', value: e.title || '', placeholder: 'A name you will recognise' });

    if (type === 'login') {
      html += field({ name: 'username', label: 'Username', value: e.username || '' });
      html += field({ name: 'password', label: 'Password', value: e.password || '', secret: true, gen: true, ac: 'new-password' });
      html += field({ name: 'url', label: 'Website', value: e.url || '', placeholder: 'https://', type: 'url' });
      html += field({ name: 'notes', label: 'Notes', value: e.notes || '', type: 'textarea', rows: 3 });
    } else if (type === 'card') {
      html += field({ name: 'cardholder', label: 'Cardholder', value: e.cardholder || '' });
      html += field({ name: 'number', label: 'Card number', value: e.number || '', secret: true, ac: 'off' });
      html += field({ name: 'expiry', label: 'Expiry', value: e.expiry || '', placeholder: 'MM/YY', copy: true });
      html += field({ name: 'cvv', label: 'CVV', value: e.cvv || '', secret: true, ac: 'off' });
      html += field({ name: 'notes', label: 'Notes', value: e.notes || '', type: 'textarea', rows: 3 });
    } else if (type === 'note') {
      html += field({ name: 'text', label: 'Note', value: e.text || '', type: 'textarea', rows: 10 });
    } else if (type === 'wifi') {
      html += field({ name: 'ssid', label: 'Network name (SSID)', value: e.ssid || '' });
      html += field({ name: 'password', label: 'Password', value: e.password || '', secret: true, gen: true, ac: 'new-password' });
      html += field({
        name: 'security', label: 'Security', value: e.security || 'WPA2', type: 'select',
        options: ['WPA3', 'WPA2', 'WPA', 'WEP', 'Open'], copy: false
      });
      html += field({ name: 'notes', label: 'Notes', value: e.notes || '', type: 'textarea', rows: 3 });
    }

    html += field({
      name: 'tags',
      label: 'Tags',
      value: Array.isArray(e.tags) ? e.tags.join(', ') : '',
      placeholder: 'work, banking — comma-separated',
      copy: false
    });
    html += customFieldsHtml(e.fields);

    var openBtn = '';
    if (type === 'login') {
      openBtn = '<button type="button" class="btn secondary-btn" id="openSiteBtn">Open site</button>';
    }
    html += '<div class="detail-meta">';
    if (e.created) html += '<span>Created ' + U().escapeHtml(U().fmtWhen(e.created)) + '</span>';
    if (e.updated) html += '<span>Updated ' + U().escapeHtml(U().fmtWhen(e.updated)) + '</span>';
    html += '</div>';
    html += '<div class="detail-acts">' +
      '<button type="button" class="btn primary-btn" id="saveEntryBtn"' + (isNew ? '' : ' disabled') + '>Save</button>' +
      openBtn +
      '<button type="button" class="btn secondary-btn" id="dupEntryBtn"' + (isNew ? ' hidden' : '') + '>Duplicate</button>' +
      '<button type="button" class="btn danger-btn" id="delEntryBtn"' + (isNew ? ' hidden' : '') + '>Delete</button>' +
    '</div></form>';
    return html;
  }

  function bindForm() {
    var form = $('entryForm');
    if (!form) return;
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
    form.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('button');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'toggle-vis') {
        var row = btn.closest('.field-row');
        var inp = row && row.querySelector('input');
        if (!inp) return;
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.textContent = show ? 'Hide' : 'Show';
      } else if (act === 'copy-field') {
        var name = btn.getAttribute('data-name');
        var el = form.querySelector('[name="' + name + '"]');
        copyText(el ? el.value : '', btn);
      } else if (act === 'generate') {
        openGenerator(btn);
      } else if (act === 'add-field') {
        var list = $('customFieldList');
        if (list) {
          var wrap = document.createElement('div');
          wrap.innerHTML = customFieldsHtml([{ id: U().uid(), name: '', value: '', hidden: false }]);
          var row = wrap.querySelector('[data-custom-field]');
          if (row) list.appendChild(row);
          markDirty();
        }
      } else if (act === 'remove-field') {
        var cf = btn.closest('[data-custom-field]');
        if (cf && cf.parentNode) cf.parentNode.removeChild(cf);
        markDirty();
      } else if (act === 'copy-cf') {
        var row = btn.closest('[data-custom-field]');
        var val = row && row.querySelector('[data-cf="value"]');
        copyText(val ? val.value : '', btn);
      }
    });
    form.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.getAttribute('data-cf') !== 'hidden') return;
      var row = t.closest('[data-custom-field]');
      var inp = row && row.querySelector('[data-cf="value"]');
      if (!inp) return;
      inp.type = t.checked ? 'password' : 'text';
      if (t.checked) inp.setAttribute('data-secret', '1');
      else inp.removeAttribute('data-secret');
    });
    var save = $('saveEntryBtn');
    if (save) save.addEventListener('click', function () { saveEntry(false); });
    var del = $('delEntryBtn');
    if (del) del.addEventListener('click', deleteEntry);
    var dup = $('dupEntryBtn');
    if (dup) dup.addEventListener('click', duplicateEntry);
    var open = $('openSiteBtn');
    if (open) open.addEventListener('click', openSite);
  }

  function renderDetail() {
    var pane = $('detailPane');
    var work = $('workspace');
    if (!pane) return;
    if (!state.selectedId) {
      pane.innerHTML = '<div class="empty-detail"><p>Select an entry, or tap Add to create one.</p></div>';
      if (work) work.classList.remove('show-detail');
      return;
    }
    if (work) work.classList.add('show-detail');
    if (state.selectedId === '__new__') {
      var type = pane.getAttribute('data-new-type') || 'login';
      var draft = { id: U().uid(), type: type, title: '', favourite: false, created: U().nowIso(), updated: U().nowIso() };
      pane.innerHTML = '<button type="button" class="back-btn" id="backListBtn">Back to list</button>' + formHtml(draft, true);
      bindForm();
      state.dirty = true;
      bindBack();
      return;
    }
    var e = findEntry(state.selectedId);
    if (!e) {
      state.selectedId = null;
      renderDetail();
      return;
    }
    pane.innerHTML = '<button type="button" class="back-btn" id="backListBtn">Back to list</button>' + formHtml(e, false);
    bindForm();
    state.dirty = false;
    bindBack();
  }

  function bindBack() {
    var b = $('backListBtn');
    if (!b) return;
    b.addEventListener('click', function () {
      maybeLeave().then(function (ok) {
        if (!ok) return;
        state.selectedId = null;
        renderList();
        renderDetail();
      });
    });
  }

  function maybeLeave() {
    if (!state.dirty) return Promise.resolve(true);
    return new Promise(function (resolve) {
      PMDlg.open({
        title: 'Unsaved changes',
        text: 'This entry has unsaved changes.',
        actions: [
          { label: 'Cancel', cls: 'secondary-btn', fn: function () { resolve(false); } },
          { label: 'Discard', cls: 'danger-btn', fn: function () { state.dirty = false; resolve(true); } },
          { label: 'Save', cls: 'primary-btn', fn: function () {
            saveEntry(true).then(function (ok) {
              if (ok) { PMDlg.close(); resolve(true); }
              else resolve(false);
            });
            return false;
          } }
        ]
      });
    });
  }

  function saveEntry(silent) {
    var ev = readForm();
    if (!ev) return Promise.resolve(false);
    if (!ev.title) {
      if (!silent) PMDlg.message('Title needed', 'Please enter a title for this entry.');
      return Promise.resolve(false);
    }
    if (!state.vault.entries) state.vault.entries = [];
    var i, found = -1;
    for (i = 0; i < state.vault.entries.length; i++) {
      if (state.vault.entries[i].id === ev.id) { found = i; break; }
    }
    ev.updated = U().nowIso();
    if (found >= 0) {
      var prev = state.vault.entries[found];
      ev.created = prev.created || ev.created;
      if (!ev.totp && prev.totp) ev.totp = prev.totp;
      if ((prev.password || '') === (ev.password || '')) {
        ev.passwordChanged = prev.passwordChanged || prev.created || ev.created;
      } else {
        ev.passwordChanged = ev.updated;
      }
      state.vault.entries[found] = ev;
    } else {
      ev.created = ev.created || U().nowIso();
      ev.passwordChanged = ev.passwordChanged || ev.updated;
      state.vault.entries.push(ev);
    }
    return saveEncrypted().then(function () {
      state.selectedId = ev.id;
      state.dirty = false;
      renderList();
      renderDetail();
      if (!silent) {
        var b = $('saveEntryBtn');
        if (b) {
          b.textContent = 'Saved';
          b.disabled = true;
          setTimeout(function () { if (b) b.textContent = 'Save'; }, 1200);
        }
      }
      return true;
    }).catch(function (err) {
      PMDlg.message('Could not save', (err && err.message) || 'The vault could not be written.');
      return false;
    });
  }

  function deleteEntry() {
    var ev = readForm();
    if (!ev || ev.id && ev.id && !findEntry(ev.id) && state.selectedId === '__new__') {
      state.selectedId = null;
      state.dirty = false;
      renderList();
      renderDetail();
      return;
    }
    PMDlg.confirm(
      'Delete this entry?',
      '“' + U().entryTitle(ev || findEntry(state.selectedId) || {}) + '” will be removed from the vault. This cannot be undone.',
      'Delete',
      'danger-btn'
    ).then(function (ok) {
      if (!ok) return;
      var id = ev && ev.id || state.selectedId;
      state.vault.entries = (state.vault.entries || []).filter(function (e) { return e.id !== id; });
      state.vault.tombstones = (state.vault.tombstones || []).filter(function (t) { return t.id !== id; });
      state.vault.tombstones.push({ id: id, updated: U().nowIso(), deleted: true });
      if (root.PMMerge && PMMerge.collectTombstones) {
        state.vault.tombstones = PMMerge.collectTombstones(state.vault.tombstones, []);
      }
      return saveEncrypted().then(function () {
        state.selectedId = null;
        state.dirty = false;
        renderList();
        renderDetail();
      });
    }).catch(function (err) {
      PMDlg.message('Could not delete', (err && err.message) || 'The vault could not be written.');
    });
  }

  function duplicateEntry() {
    maybeLeave().then(function (ok) {
      if (!ok) return;
      var src = findEntry(state.selectedId);
      if (!src) return;
      var copy = JSON.parse(JSON.stringify(src));
      copy.id = U().uid();
      copy.title = U().entryTitle(src) + ' (copy)';
      copy.created = U().nowIso();
      copy.updated = copy.created;
      copy.favourite = false;
      state.vault.entries.push(copy);
      return saveEncrypted().then(function () {
        state.selectedId = copy.id;
        renderList();
        renderDetail();
      });
    }).catch(function (err) {
      PMDlg.message('Could not duplicate', (err && err.message) || 'The vault could not be written.');
    });
  }

  function openSite() {
    var ev = readForm();
    var url = U().safeUrl(ev && ev.url);
    if (!url) {
      PMDlg.message('No website', 'Add an http or https address first.');
      return;
    }
    var w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) try { w.opener = null; } catch (_) { /* ok */ }
  }

  function openGenerator(fromBtn) {
    var html =
      '<div class="gen-box" id="genBox">' +
        '<div class="field-row"><input id="genOut" type="text" readonly autocomplete="off" spellcheck="false"></div>' +
        '<p class="meter" id="genMeter"></p>' +
        '<label class="field-row gen-len"><span>Length <strong id="genLenVal">16</strong></span>' +
          '<input id="genLen" type="range" min="8" max="64" value="16"></label>' +
        '<div class="gen-checks">' +
          '<label><input type="checkbox" id="genLower" checked> a-z</label>' +
          '<label><input type="checkbox" id="genUpper" checked> A-Z</label>' +
          '<label><input type="checkbox" id="genDigit" checked> 0-9</label>' +
          '<label><input type="checkbox" id="genSymbol" checked> Symbols</label>' +
          '<label><input type="checkbox" id="genAvoid"> Avoid look-alikes (0/O, 1/l)</label>' +
        '</div>' +
      '</div>';

    function opts() {
      return {
        length: parseInt($('genLen').value, 10) || 16,
        lower: $('genLower').checked,
        upper: $('genUpper').checked,
        digit: $('genDigit').checked,
        symbol: $('genSymbol').checked,
        avoid: $('genAvoid').checked
      };
    }
    function refresh(makeNew) {
      var o = opts();
      if (!o.lower && !o.upper && !o.digit && !o.symbol) {
        $('genLower').checked = true;
        o.lower = true;
      }
      var out = $('genOut');
      if (makeNew && out) out.value = PMGen.generate(o);
      var st = PMGen.strength(out ? out.value : '');
      var m = $('genMeter');
      if (m) {
        m.className = 'meter ' + st.cls;
        m.textContent = (st.label ? 'Strength: ' + st.label : '') + (st.bitsLabel ? ' (' + st.bitsLabel + ')' : '');
      }
      var lv = $('genLenVal');
      if (lv) lv.textContent = o.length;
    }

    PMDlg.open({
      title: 'Generate a password',
      html: html,
      wide: true,
      actions: [
        { label: 'Close', cls: 'secondary-btn' },
        { label: 'New password', cls: 'secondary-btn', fn: function () { refresh(true); return false; } },
        { label: 'Use this', cls: 'primary-btn', fn: function () {
          var out = $('genOut');
          var row = fromBtn && fromBtn.closest && fromBtn.closest('.field-row');
          var inp = row && row.querySelector('input');
          if (inp && out) {
            inp.value = out.value;
            markDirty();
          }
        } }
      ],
      onOpen: function () {
        refresh(true);
        var box = $('genBox');
        if (box) box.addEventListener('input', function () { refresh(false); });
        if (box) box.addEventListener('change', function () { refresh(true); });
      }
    });
  }

  /* ---------- add / select / settings ---------- */

  function addEntry() {
    maybeLeave().then(function (ok) {
      if (!ok) return;
      PMDlg.open({
        title: 'New entry',
        text: 'What would you like to add?',
        actions: [
          { label: 'Login', cls: 'primary-btn', fn: function () { startNew('login'); } },
          { label: 'Card', cls: 'secondary-btn', fn: function () { startNew('card'); } },
          { label: 'Note', cls: 'secondary-btn', fn: function () { startNew('note'); } },
          { label: 'Wi-Fi', cls: 'secondary-btn', fn: function () { startNew('wifi'); } }
        ]
      });
    });
  }

  function startNew(type) {
    state.selectedId = '__new__';
    var pane = $('detailPane');
    if (pane) pane.setAttribute('data-new-type', type);
    renderList();
    renderDetail();
  }

  function selectEntry(id) {
    if (id === state.selectedId) {
      var work = $('workspace');
      if (work) work.classList.add('show-detail');
      return;
    }
    maybeLeave().then(function (ok) {
      if (!ok) return;
      state.selectedId = id;
      renderList();
      renderDetail();
    });
  }

  function pickFile(accept) {
    return new Promise(function (resolve) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = accept || '*/*';
      inp.style.position = 'fixed';
      inp.style.left = '-9999px';
      document.body.appendChild(inp);
      var done = false;
      function finish(file) {
        if (done) return;
        done = true;
        try { document.body.removeChild(inp); } catch (_) { /* */ }
        resolve(file || null);
      }
      inp.addEventListener('change', function () { finish(inp.files && inp.files[0]); });
      window.addEventListener('focus', function () {
        setTimeout(function () { if (!done && (!inp.files || !inp.files.length)) finish(null); }, 600);
      }, { once: true });
      inp.click();
    });
  }

  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('No file selected')); return; }
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(new Error('Could not read that file')); };
      r.readAsText(file);
    });
  }

  function downloadText(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var a = document.createElement('a');
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { document.body.removeChild(a); } catch (_) { /* */ }
      URL.revokeObjectURL(url);
    }, 0);
  }

  function exportBackup() {
    if (!state.rec || !PMStore.hasVault(state.rec)) {
      PMDlg.message('Nothing to export', 'Unlock the vault first.');
      return;
    }
    try {
      var backup = PMCrypto.packBackup(PMStore.cryptoHeader(state.rec), {
        hint: state.rec.hint || '',
        exported: U().nowIso()
      });
      var day = (backup.exported || '').slice(0, 10) || 'vault';
      downloadText('password-manager-backup-' + day + '.pwvault', PMCrypto.backupToText(backup), 'application/json');
      PMDlg.message(
        'Backup saved',
        'The file is still encrypted with your master password. Keep it somewhere safe. Anyone who has both the file and the password can read the vault.'
      );
    } catch (err) {
      PMDlg.message('Could not export', (err && err.message) || '');
    }
  }

  function applyIncomingVault(incoming, mode, title) {
    if (!root.PMMerge) return Promise.reject(new Error('Merge helper is missing'));
    var result = PMMerge.mergeVaults(state.vault, incoming, mode);
    state.vault = PMCrypto.migrateVault(result.vault);
    return saveEncrypted().then(function () {
      state.selectedId = null;
      state.dirty = false;
      renderFilters();
      renderList();
      renderDetail();
      PMDlg.message(title || 'Import finished', PMMerge.summaryText(result.summary));
      return result.summary;
    });
  }

  function importBackup() {
    if (!state.vault || !state.key) {
      PMDlg.message('Unlock first', 'Unlock the vault before importing a backup.');
      return;
    }
    pickFile('.pwvault,application/json,.json').then(function (file) {
      if (!file) return null;
      return readFileText(file).then(function (text) {
        var parsed;
        try { parsed = PMCrypto.parseBackup(text); }
        catch (err) {
          PMDlg.message('Could not open backup', (err && err.message) || '');
          return null;
        }
        var hintLine = parsed.hint ? ('Hint: ' + parsed.hint + '\n\n') : '';
        var html = '<p>' + U().escapeHtml(hintLine) +
          'This file is encrypted. Enter the master password that was used when it was exported.</p>' +
          '<label class="field"><span class="field-label">Backup password</span>' +
          '<input id="backupPw" type="password" autocomplete="off" spellcheck="false"></label>' +
          '<p class="dlg-note">Merge keeps your current entries and takes the newer one when both sides have the same item. Replace throws away the entries now in this vault.</p>';
        PMDlg.open({
          title: 'Import encrypted backup',
          html: html,
          wide: true,
          actions: [
            { label: 'Cancel', cls: 'secondary-btn' },
            { label: 'Merge', cls: 'secondary-btn', fn: function () { runBackupImport(parsed, 'merge'); return false; } },
            { label: 'Replace', cls: 'danger-btn', fn: function () { confirmReplace(parsed); return false; } }
          ],
          onOpen: function () { var el = $('backupPw'); if (el) el.focus(); }
        });
      });
    }).catch(function (err) {
      PMDlg.message('Could not import', (err && err.message) || '');
    });
  }

  function confirmReplace(parsed) {
    PMDlg.confirm(
      'Replace the whole vault?',
      'Every entry now in this vault will be removed and replaced by the backup. This cannot be undone. The master password on this device stays the same.',
      'Replace',
      'danger-btn'
    ).then(function (ok) {
      if (ok) runBackupImport(parsed, 'replace');
      else importBackupRedo(parsed);
    });
  }

  function importBackupRedo(parsed) {
    // After cancelling replace, just tell the user to start again if needed — keep it simple.
  }

  function runBackupImport(parsed, mode) {
    var pw = ($('backupPw') && $('backupPw').value) || '';
    if (!pw) {
      PMDlg.message('Password needed', 'Enter the password for this backup file.');
      return;
    }
    PMDlg.close();
    setBusy(true, '');
    PMCrypto.decryptWithPassword(parsed.header, pw).then(function (res) {
      var incoming = PMCrypto.migrateVault(res.vault);
      pw = '';
      setBusy(false, '');
      return applyIncomingVault(incoming, mode, mode === 'replace' ? 'Vault replaced' : 'Backup merged');
    }).catch(function (err) {
      setBusy(false, '');
      PMDlg.message('Could not decrypt backup', (err && err.message) || 'Wrong password, or the file is damaged.');
    });
  }

  function importCsv() {
    if (!state.vault || !state.key) {
      PMDlg.message('Unlock first', 'Unlock the vault before importing a CSV file.');
      return;
    }
    pickFile('.csv,text/csv,text/plain').then(function (file) {
      if (!file) return;
      return readFileText(file).then(function (text) {
        var result = PMCsv.importCsv(text);
        if (!result.entries.length) {
          PMDlg.message('No entries found', (result.warnings && result.warnings[0]) || 'This does not look like a Chrome, Firefox or Bitwarden CSV export.');
          return;
        }
        var warn = 'This CSV file is not encrypted. Delete the file after a successful import so the passwords are not left in plain text.';
        var extra = result.warnings && result.warnings.length ? '\n\n' + result.warnings.join('\n') : '';
        var msg = 'Found ' + result.entries.length + ' entries in a ' + result.format + ' export' +
          (result.skipped ? (' (' + result.skipped + ' rows skipped)') : '') + '. ' + warn + extra;
        PMDlg.open({
          title: 'Import CSV',
          text: msg,
          wide: true,
          actions: [
            { label: 'Cancel', cls: 'secondary-btn' },
            { label: 'Import', cls: 'primary-btn', fn: function () {
              var incoming = { version: 2, settings: state.vault.settings, entries: result.entries, tombstones: [] };
              applyIncomingVault(incoming, 'merge', 'CSV imported');
            } }
          ]
        });
      });
    }).catch(function (err) {
      PMDlg.message('Could not import CSV', (err && err.message) || '');
    });
  }

  function openHealth() {
    if (!state.vault) return;
    var report = PMHealth.check(state.vault.entries || []);
    var c = report.counts;
    function section(title, items, fmt) {
      if (!items.length) return '';
      return '<h3 class="health-h">' + U().escapeHtml(title) + ' (' + items.length + ')</h3><ul class="health-list">' +
        items.map(function (it) {
          return '<li><button type="button" class="linkish" data-open="' + U().escapeHtml(it.id) + '">' +
            U().escapeHtml(fmt(it)) + '</button></li>';
        }).join('') + '</ul>';
    }
    var html = '<p class="dlg-note">Weak means under about 40 bits of entropy. Old means the password was last changed more than a year ago.</p>';
    if (!c.weak && !c.reused && !c.old) {
      html += '<p>No problems found in ' + c.checked + ' entries.</p>';
    } else {
      html += section('Weak or empty passwords', report.weak, function (it) {
        return it.title + (it.reason === 'empty' ? ' — no password' : (' — ~' + it.bits + ' bits'));
      });
      html += section('Reused passwords', report.reused, function (it) {
        return it.title + (it.also && it.also.length ? (' — also used in ' + it.also.join(', ')) : '');
      });
      html += section('Old passwords', report.old, function (it) {
        return it.title + ' — ' + it.ageDays + ' days';
      });
    }
    PMDlg.open({
      title: 'Vault health',
      html: html,
      wide: true,
      actions: [{ label: 'Close', cls: 'primary-btn' }],
      onOpen: function () {
        var body = $('dlgBody');
        if (!body) return;
        body.addEventListener('click', function (e) {
          var b = e.target && e.target.closest && e.target.closest('[data-open]');
          if (!b) return;
          var id = b.getAttribute('data-open');
          PMDlg.close();
          state.selectedId = id;
          renderList();
          renderDetail();
        });
      }
    });
  }

  function openChangeMaster() {
    if (!state.vault || !state.key || !state.rec) return;
    var html =
      '<p class="dlg-note">The vault is re-encrypted with the new password. If this is interrupted, either the old or the new password will still unlock it. The master password stays the only key; there is no recovery if both are forgotten.</p>' +
      '<label class="field"><span class="field-label">Current master password</span>' +
        '<input id="chgOld" type="password" autocomplete="off" spellcheck="false"></label>' +
      '<label class="field"><span class="field-label">New master password</span>' +
        '<input id="chgNew" type="password" autocomplete="new-password" spellcheck="false" minlength="8"></label>' +
      '<p class="meter" id="chgMeter"></p>' +
      '<label class="field"><span class="field-label">Confirm new master password</span>' +
        '<input id="chgNew2" type="password" autocomplete="new-password" spellcheck="false" minlength="8"></label>' +
      '<label class="field"><span class="field-label">Optional hint (stored in plain text)</span>' +
        '<input id="chgHint" type="text" autocomplete="off" spellcheck="false" value="' +
          U().escapeHtml((state.rec && state.rec.hint) || '') + '"></label>';
    PMDlg.open({
      title: 'Change master password',
      html: html,
      wide: true,
      actions: [
        { label: 'Cancel', cls: 'secondary-btn' },
        { label: 'Change password', cls: 'primary-btn', fn: function () { runChangeMaster(); return false; } }
      ],
      onOpen: function () {
        var inp = $('chgNew');
        var m = $('chgMeter');
        if (inp) inp.addEventListener('input', function () {
          if (!m) return;
          var st = PMGen.strength(inp.value);
          m.className = 'meter ' + st.cls;
          if (!inp.value) { m.textContent = ''; return; }
          var extra = inp.value.length < 8 ? ' (use at least 8 characters)' : '';
          m.textContent = 'Strength: ' + st.label + (st.bitsLabel ? ' (' + st.bitsLabel + ')' : '') + extra;
        });
        var old = $('chgOld');
        if (old) old.focus();
      }
    });
  }

  function runChangeMaster() {
    var oldPw = ($('chgOld') && $('chgOld').value) || '';
    var newPw = ($('chgNew') && $('chgNew').value) || '';
    var new2 = ($('chgNew2') && $('chgNew2').value) || '';
    var hint = ($('chgHint') && $('chgHint').value) || '';
    if (!oldPw) { PMDlg.message('Current password needed', 'Enter the current master password.'); return; }
    if (newPw.length < 8) { PMDlg.message('Too short', 'Use at least 8 characters for the new master password.'); return; }
    if (newPw !== new2) { PMDlg.message('Passwords do not match', 'The two new passwords are not the same.'); return; }
    if (hint && hint.toLowerCase().indexOf(newPw.toLowerCase()) !== -1) {
      PMDlg.message('Hint not allowed', 'The hint must not contain the new master password.');
      return;
    }
    var iter = (state.rec && state.rec.iter) || PMCrypto.ITER_DEFAULT;
    var prevHeader = PMStore.cryptoHeader(state.rec);
    PMDlg.close();
    setBusy(true, '');
    PMCrypto.decryptWithPassword(prevHeader, oldPw).then(function () {
      return PMCrypto.encryptWithPassword(state.vault, newPw, iter);
    }).then(function (packed) {
      var rec1 = PMStore.mergeHeader(state.rec, packed.header, {
        hint: hint,
        fails: 0,
        delayUntil: 0,
        prev: prevHeader
      });
      return PMStore.saveRecord(rec1).then(function () {
        return PMCrypto.decryptWithPassword(PMStore.cryptoHeader(rec1), newPw).then(function () {
          var rec2 = PMStore.mergeHeader(rec1, packed.header, {
            hint: hint,
            fails: 0,
            delayUntil: 0,
            dropPrev: true
          });
          return PMStore.saveRecord(rec2).then(function (saved) {
            state.rec = saved;
            state.key = packed.key;
            oldPw = newPw = new2 = '';
            setBusy(false, '');
            PMDlg.message('Master password changed', 'The vault is now encrypted with the new master password.');
          });
        });
      });
    }).catch(function (err) {
      setBusy(false, '');
      var msg = (err && err.message) || '';
      if (/operation-specific|decrypt|OperationError|bad/i.test(String(err && (err.name || err.message) || err))) {
        msg = 'The current master password is wrong.';
      }
      PMDlg.message('Could not change password', msg || 'The vault was left as it was.');
    });
  }

  function openSettings() {
    var s = settings();
    var html =
      '<label class="field"><span class="field-label">Auto-lock after idle</span>' +
        '<select id="setAutoLock">' +
          [1, 5, 15, 30].map(function (n) {
            return '<option value="' + n + '"' + (s.autoLockMin === n ? ' selected' : '') + '>' +
              n + (n === 1 ? ' minute' : ' minutes') + '</option>';
          }).join('') +
        '</select></label>' +
      '<label class="field"><span class="field-label">Lock when the tab is hidden</span>' +
        '<select id="setHidden">' +
          '<option value="0"' + (s.lockHiddenMin === 0 ? ' selected' : '') + '>Off</option>' +
          '<option value="1"' + (s.lockHiddenMin === 1 ? ' selected' : '') + '>After 1 minute</option>' +
          '<option value="5"' + (s.lockHiddenMin === 5 ? ' selected' : '') + '>After 5 minutes</option>' +
        '</select></label>' +
      '<label class="field"><span class="field-label">Clear copied text after</span>' +
        '<select id="setClip">' +
          '<option value="10"' + (s.clipboardSec === 10 ? ' selected' : '') + '>10 seconds</option>' +
          '<option value="30"' + (s.clipboardSec === 30 ? ' selected' : '') + '>30 seconds</option>' +
          '<option value="60"' + (s.clipboardSec === 60 ? ' selected' : '') + '>60 seconds</option>' +
          '<option value="0"' + (s.clipboardSec === 0 ? ' selected' : '') + '>Don\'t clear</option>' +
        '</select></label>' +
      '<p class="field-label">Theme</p>' +
      '<div class="seg" id="themeSegDlg" role="group" aria-label="Theme">' +
        '<button type="button" data-v="auto">Auto</button>' +
        '<button type="button" data-v="light">Light</button>' +
        '<button type="button" data-v="dark">Dark</button>' +
      '</div>' +
      '<div class="set-actions">' +
        '<button type="button" class="btn secondary-btn" id="setHealth">Vault health</button>' +
        '<button type="button" class="btn secondary-btn" id="setExport">Export encrypted backup</button>' +
        '<button type="button" class="btn secondary-btn" id="setImport">Import encrypted backup</button>' +
        '<button type="button" class="btn secondary-btn" id="setCsv">Import Chrome / Firefox / Bitwarden CSV</button>' +
        '<button type="button" class="btn secondary-btn" id="setMaster">Change master password</button>' +
      '</div>' +
      '<p class="dlg-note">Auto follows the Hub theme. A forgotten master password cannot be recovered. An encrypted backup is the only way to restore a vault onto another device or browser.</p>';

    PMDlg.open({
      title: 'Settings',
      html: html,
      wide: true,
      actions: [
        { label: 'Close', cls: 'secondary-btn' },
        { label: 'Save', cls: 'primary-btn', fn: function () {
          if (!state.vault) return;
          state.vault.settings = state.vault.settings || {};
          state.vault.settings.autoLockMin = parseInt($('setAutoLock').value, 10) || 5;
          state.vault.settings.lockHiddenMin = parseInt($('setHidden').value, 10) || 0;
          state.vault.settings.clipboardSec = parseInt($('setClip').value, 10);
          if (isNaN(state.vault.settings.clipboardSec)) state.vault.settings.clipboardSec = 30;
          saveEncrypted().catch(function (err) {
            PMDlg.message('Could not save settings', (err && err.message) || '');
          });
        } }
      ],
      onOpen: function () {
        var seg = $('themeSegDlg');
        if (seg && root.PMTheme) {
          function paint() {
            var mode = PMTheme.getMode();
            var buttons = seg.querySelectorAll('button');
            for (var i = 0; i < buttons.length; i++) {
              buttons[i].classList.toggle('on', buttons[i].getAttribute('data-v') === mode);
            }
          }
          paint();
          seg.addEventListener('click', function (e) {
            var b = e.target && e.target.closest && e.target.closest('button');
            if (!b) return;
            PMTheme.setMode(b.getAttribute('data-v'));
            paint();
            var main = $('themeSeg');
            if (main) {
              var bs = main.querySelectorAll('button');
              for (var j = 0; j < bs.length; j++) {
                bs[j].classList.toggle('on', bs[j].getAttribute('data-v') === PMTheme.getMode());
              }
            }
          });
        }
        function bind(id, fn) {
          var b = $(id);
          if (b) b.addEventListener('click', function () { PMDlg.close(); fn(); });
        }
        bind('setHealth', openHealth);
        bind('setExport', exportBackup);
        bind('setImport', importBackup);
        bind('setCsv', importCsv);
        bind('setMaster', openChangeMaster);
      }
    });
  }

  /* ---------- setup / unlock ---------- */

  function paintSetupMeter() {
    var pw = $('setupPw');
    var m = $('setupMeter');
    if (!pw || !m) return;
    var st = PMGen.strength(pw.value);
    m.className = 'meter ' + st.cls;
    if (!pw.value) { m.textContent = ''; return; }
    var extra = pw.value.length < 8 ? ' (use at least 8 characters)' : '';
    m.textContent = 'Strength: ' + st.label + (st.bitsLabel ? ' (' + st.bitsLabel + ')' : '') + extra;
  }

  function doSetup() {
    if (state.busy) return;
    var pw = ($('setupPw') && $('setupPw').value) || '';
    var pw2 = ($('setupPw2') && $('setupPw2').value) || '';
    var hint = ($('setupHint') && $('setupHint').value) || '';
    var err = $('setupStatus');
    if (pw.length < 8) {
      if (err) err.textContent = 'Use at least 8 characters for the master password.';
      return;
    }
    if (pw !== pw2) {
      if (err) err.textContent = 'The two passwords do not match.';
      return;
    }
    if (hint && hint.toLowerCase().indexOf(pw.toLowerCase()) !== -1) {
      if (err) err.textContent = 'The hint must not contain the master password.';
      return;
    }
    setBusy(true, 'Creating the vault…');
    var vault = PMCrypto.emptyVault();
    PMCrypto.encryptWithPassword(vault, pw).then(function (res) {
      var rec = PMStore.mergeHeader(null, res.header, { hint: hint, fails: 0, delayUntil: 0 });
      return PMStore.saveRecord(rec).then(function (saved) {
        state.rec = saved;
        state.key = res.key;
        state.vault = vault;
        pw = pw2 = '';
        if ($('setupPw')) $('setupPw').value = '';
        if ($('setupPw2')) $('setupPw2').value = '';
        setBusy(false, '');
        enterApp();
      });
    }).catch(function (e) {
      setBusy(false, '');
      if (err) err.textContent = (e && e.message) || 'Could not create the vault.';
    });
  }

  function startCountdownWatch() {
    if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
    function tick() {
      var rec = state.rec || {};
      var left = PMLock.remainingDelay(rec);
      var btn = $('unlockGo');
      var wait = $('unlockWait');
      var status = $('unlockStatus');
      if (left > 0) {
        if (btn) { btn.disabled = true; btn.setAttribute('data-wait', '1'); }
        if (wait) {
          wait.hidden = false;
          wait.textContent = 'Too many wrong tries. Try again in ' + Math.ceil(left / 1000) + 's.';
        }
      } else {
        if (btn && !state.busy) { btn.disabled = false; btn.removeAttribute('data-wait'); }
        if (wait) { wait.hidden = true; wait.textContent = ''; }
        if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
        if (status && status.textContent.indexOf('Too many') === 0) status.textContent = '';
      }
    }
    tick();
    if (PMLock.remainingDelay(state.rec || {}) > 0) {
      state.countdownTimer = setInterval(tick, 250);
    }
  }

  function tryUnlockHeader(header, password) {
    return PMCrypto.decryptWithPassword(header, password);
  }

  function applyUnlockedVault(vault) {
    var v = PMCrypto.migrateVault(vault && typeof vault === 'object' ? vault : PMCrypto.emptyVault());
    state.vault = v;
    return v;
  }

  function finishUnlock(rec, res, usedPrev) {
    var cleared = PMLock.clearFails(rec);
    var extra = { hint: cleared.hint, fails: 0, delayUntil: 0 };
    var header = rec;
    var note = '';
    if (usedPrev) {
      // Rekey was interrupted and the user unlocked with the previous password.
      // Roll main back to prev so only one password works.
      header = rec.prev;
      extra.dropPrev = true;
      note = 'A master password change was interrupted, so the previous password was used. You can change it again in Settings.';
    } else if (rec && rec.prev) {
      extra.dropPrev = true;
    }
    rec = PMStore.mergeHeader(rec, header, extra);
    state.key = res.key;
    var wasVer = Number((res.vault && res.vault.version) || 0);
    applyUnlockedVault(res.vault);
    var migrated = wasVer < 2;
    return PMStore.saveRecord(rec).then(function (saved) {
      state.rec = saved;
      if (migrated) return saveEncrypted();
    }).then(function () {
      if ($('unlockPw')) $('unlockPw').value = '';
      setBusy(false, '');
      enterApp();
      if (note) {
        setTimeout(function () { PMDlg.message('Password change interrupted', note); }, 0);
      }
    });
  }

  function doUnlock() {
    if (state.busy) return;
    var rec = state.rec;
    if (!PMStore.hasVault(rec)) {
      setScreen('screenSetup');
      return;
    }
    var left = PMLock.remainingDelay(rec);
    if (left > 0) {
      startCountdownWatch();
      return;
    }
    var pw = ($('unlockPw') && $('unlockPw').value) || '';
    var status = $('unlockStatus');
    if (!pw) {
      if (status) status.textContent = 'Enter the master password.';
      return;
    }
    setBusy(true, 'Unlocking…');
    tryUnlockHeader(PMStore.cryptoHeader(rec), pw).then(function (res) {
      return finishUnlock(rec, res, false);
    }).catch(function (err) {
      if (rec && rec.prev) {
        return tryUnlockHeader(rec.prev, pw).then(function (res) {
          return finishUnlock(rec, res, true);
        });
      }
      throw err;
    }).catch(function () {
      var failed = PMLock.applyFail(rec);
      rec = PMStore.mergeHeader(rec, rec, failed);
      return PMStore.saveRecord(rec).then(function (saved) {
        state.rec = saved;
        setBusy(false, '');
        if (status) {
          status.textContent = failed.fails >= PMLock.FAIL_FREE
            ? 'Wrong master password. Too many wrong tries.'
            : 'Wrong master password.';
        }
        startCountdownWatch();
      });
    }).catch(function (e) {
      setBusy(false, '');
      if (status) status.textContent = (e && e.message) || 'Could not unlock.';
    });
  }

  /* ---------- boot / events ---------- */

  function bindChrome() {
    var add = $('addBtn');
    if (add) add.addEventListener('click', addEntry);
    var lockBtn = $('lockBtn');
    if (lockBtn) lockBtn.addEventListener('click', function () { if (root.PMLock) PMLock.lockNow(); else onLocked(); });
    var setBtn = $('settingsBtn');
    if (setBtn) setBtn.addEventListener('click', openSettings);
    var healthBtn = $('healthBtn');
    if (healthBtn) healthBtn.addEventListener('click', openHealth);
    var search = $('searchBox');
    if (search) {
      search.addEventListener('input', function () {
        state.query = search.value || '';
        renderList();
      });
    }
    var filters = $('filterBar');
    if (filters) {
      filters.addEventListener('click', function (e) {
        var tagBtn = e.target && e.target.closest && e.target.closest('[data-tag]');
        if (tagBtn) {
          state.tagFilter = tagBtn.getAttribute('data-tag') || '';
          renderFilters();
          renderList();
          return;
        }
        var b = e.target && e.target.closest && e.target.closest('[data-filter]');
        if (!b) return;
        state.filter = b.getAttribute('data-filter');
        renderFilters();
        renderList();
      });
    }
    var list = $('entryList');
    if (list) {
      list.addEventListener('click', function (e) {
        var b = e.target && e.target.closest && e.target.closest('.entry');
        if (!b) return;
        selectEntry(b.getAttribute('data-id'));
      });
    }
    var setupGo = $('setupGo');
    if (setupGo) setupGo.addEventListener('click', doSetup);
    var setupPw = $('setupPw');
    if (setupPw) setupPw.addEventListener('input', paintSetupMeter);
    ['setupPw', 'setupPw2', 'setupHint'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); doSetup(); }
      });
    });
    var unlockGo = $('unlockGo');
    if (unlockGo) unlockGo.addEventListener('click', doUnlock);
    var unlockPw = $('unlockPw');
    if (unlockPw) unlockPw.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doUnlock(); }
    });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
        if (state.vault) {
          e.preventDefault();
          if (root.PMLock) PMLock.lockNow(); else onLocked();
        }
      }
    });
  }

  function boot() {
    bindChrome();
    if (root.PMTheme) PMTheme.boot();
    PMStore.loadRecord().then(function (rec) {
      state.rec = rec;
      if (!PMStore.hasVault(rec)) {
        setScreen('screenSetup');
        var pw = $('setupPw');
        if (pw) pw.focus();
        return;
      }
      setScreen('screenUnlock');
      showHint();
      startCountdownWatch();
      var up = $('unlockPw');
      if (up) up.focus();
    }).catch(function (err) {
      setScreen('screenSetup');
      var st = $('setupStatus');
      if (st) {
        st.textContent = (err && err.message) ||
          'This browser blocked saved storage, so the vault cannot be created.';
      }
    });
  }

  root.PMUi = {
    boot: boot,
    _state: state
  };
})(typeof window !== 'undefined' ? window : globalThis);
