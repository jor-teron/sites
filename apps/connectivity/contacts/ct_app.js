/* CT1 app — list (⭐ favourites first, search), detail sheet (Call / Message / Video call), add / edit form, in-app delete confirm. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); }, HC = window.HubContacts, cur = null, editId = '';
  function ini(n) { return (String(n).trim()[0] || '?').toUpperCase(); }
  function av(el, c) { el.textContent = ini(c.name); var on = CTOpen.online(c.num); el.classList.toggle('on', on === true); }
  function li(c) {
    var l = document.createElement('li'), a = document.createElement('div'), n = document.createElement('div'), s = document.createElement('small');
    a.className = 'av'; av(a, c); n.className = 'nm'; n.textContent = (c.fav ? '⭐ ' : '') + c.name;
    s.textContent = c.num + (HC.isOld(c.num) ? ' (old number)' : ''); n.appendChild(s);
    l.appendChild(a); l.appendChild(n); l.dataset.id = c.id; l.onclick = function () { detail(c.id); };
    return l;
  }
  function hd(t) { var l = document.createElement('li'); l.className = 'hd'; l.textContent = t; return l; }
  function paint() {
    var q = $('q').value.trim().toLowerCase(), all = HC.list(), ul = $('list');
    var hit = all.filter(function (c) { return !q || c.name.toLowerCase().indexOf(q) >= 0 || c.num.indexOf(q) >= 0; });
    var fav = hit.filter(function (c) { return c.fav; }), rest = hit.filter(function (c) { return !c.fav; });
    ul.textContent = '';
    if (fav.length) { ul.appendChild(hd('Favourites')); fav.forEach(function (c) { ul.appendChild(li(c)); }); }
    if (rest.length) { if (fav.length) ul.appendChild(hd('All')); rest.forEach(function (c) { ul.appendChild(li(c)); }); }
    $('empty').hidden = hit.length > 0; $('empty').textContent = all.length ? 'No match.' : 'No contacts yet. Tap “+ New contact”.';
    if (cur && !$('sheet').hidden) { var c = HC.get(cur); if (c) fill(c); else $('sheet').hidden = true; }
  }
  function fill(c) { av($('d-av'), c); $('d-name').textContent = (c.fav ? '⭐ ' : '') + c.name; $('d-num').textContent = c.num + (CTOpen.online(c.num) ? ' · online' : ''); }
  function detail(id) { var c = HC.get(id); if (!c) return; cur = id; fill(c); $('sheet').hidden = false; }
  function num() { var c = HC.get(cur); if (c && !HC.numOk(c.num)) { dialog('This is an old 4-digit number. Edit it to their new 5-digit number first.', ['OK']); return ''; } return c ? c.num : ''; }
  $('d-call').onclick = function () { var n = num(); if (n) CTOpen.call(n); };
  $('d-vid').onclick = function () { var n = num(); if (n) CTOpen.video(n); };
  $('d-msg').onclick = function () { var n = num(); if (n) CTOpen.message(n); };
  $('d-close').onclick = function () { $('sheet').hidden = true; cur = null; };
  $('d-edit').onclick = function () { $('sheet').hidden = true; form(HC.get(cur)); };
  function form(c) {
    editId = c ? c.id : ''; $('f-title').textContent = c ? 'Edit contact' : 'New contact';
    $('f-name').value = c ? c.name : ''; $('f-num').value = c ? c.num : ''; $('f-fav').checked = !!(c && c.fav);
    $('f-del').hidden = !c; $('f-err').hidden = true; $('form').hidden = false; $('f-name').focus();
  }
  function err(t) { $('f-err').textContent = t; $('f-err').hidden = false; }
  $('b-new').onclick = function () { form(null); };
  $('f-cancel').onclick = function () { $('form').hidden = true; };
  $('f-num').oninput = function () { this.value = this.value.replace(/\D/g, '').slice(0, 5); };
  $('f-save').onclick = function () {
    var nm = $('f-name').value.trim(), n = $('f-num').value.trim(), old = editId && HC.get(editId);
    if (!nm) return err('Type a name.');
    if (!HC.numOk(n) && !(old && old.num === n && HC.isOld(n))) return err('The number is 5 digits, 10000–99999.');
    var x = { id: editId || undefined, name: nm, num: n, fav: $('f-fav').checked, did: old && old.num === n ? old.did : '' };
    var y = HC.save(x); if (!y) return err('Could not save (the list holds at most 200).');
    $('form').hidden = true; detail(y.id);
  };
  $('f-del').onclick = function () {
    var c = HC.get(editId); if (!c) return;
    dialog('Delete ' + c.name + '? Telephone and Messages use this list too.', ['Cancel', 'Delete'], function (b) { if (b === 'Delete') { HC.remove(c.id); $('form').hidden = true; cur = null; } });
  };
  function dialog(t, bs, cb) {   // Telephone's pattern: an in-app card with buttons
    $('dlg-t').textContent = t; var r = $('dlg-b'); r.textContent = '';
    bs.forEach(function (b, i) { var e = document.createElement('button'); e.className = 'btn' + (b === 'Delete' ? ' bad' : i === bs.length - 1 ? ' ok' : ''); e.textContent = b; e.onclick = function () { $('dlg').hidden = true; if (cb) cb(b); }; r.appendChild(e); });
    $('dlg').hidden = false;
  }
  $('q').oninput = paint;
  HC.onChange(paint);
  setInterval(function () { if (CTOpen.online('10000') !== null) paint(); }, 15000);   // refresh online dots inside the Hub
  window.CTApp = { paint: paint, detail: detail, form: form };   // test hook
  paint();
})();
