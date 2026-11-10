/* Invoice Maker INV1 — editor, live A4 preview, history, clients, backup.
   Totals come from inv_calc.js. Dialogs: ../shared/office-dialog.js. */
'use strict';

var RELEASE = 'INV1';
var STORE_KEY = 'invoice-maker-v1';
var JSPDF_SRC = '../draftly/vendor/jspdf.umd.min.js';
var QR_SRC = '../../../shared/vendor/qrcode.js';
var DEFAULT_TERMS = 'Goods once sold will not be taken back. Interest may be charged on overdue payments. Subject to the jurisdiction of the place of supply.';
var DEFAULT_ACCENT = '#0f5c4c';

var store = null;
var current = null;
var numberLocked = false;
var editingId = null;
var toastTimer = 0;
var qrCache = { key: '', data: '' };

function $(id) { return document.getElementById(id); }

function today() {
  var d = new Date();
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function addDays(iso, n) {
  n = Number(n) || 0;
  if (!n) return '';
  var d = InvCalc.parseDate(iso) || new Date();
  d.setDate(d.getDate() + n);
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function uid() {
  return 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function toast(msg) {
  var el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 2800);
}

function hubTheme() {
  try { return localStorage.getItem('sites-hub.theme') || ''; } catch (e) { return ''; }
}

function isDark() {
  var mode = (store && store.settings && store.settings.theme) || 'auto';
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  var t = hubTheme();
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
}

function applyTheme() {
  document.documentElement.classList.toggle('dark', isDark());
  var seg = $('themeSeg');
  if (!seg) return;
  var mode = (store && store.settings && store.settings.theme) || 'auto';
  Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
    b.classList.toggle('on', b.getAttribute('data-v') === mode);
  });
}

function defaultSettings() {
  return {
    theme: 'auto',
    prefixes: { 'tax-invoice': 'INV', quote: 'QT', receipt: 'RCT', 'bill-of-supply': 'BOS' },
    width: 3,
    dueDays: 15,
    roundOff: true,
    showQr: true,
    notes: '',
    terms: DEFAULT_TERMS,
    template: 'classic',
    accent: DEFAULT_ACCENT
  };
}

function emptyProfile() {
  return {
    name: '', address: '', gstin: '', state: '', phone: '', email: '',
    logo: '', signature: '',
    accName: '', accNo: '', ifsc: '', bank: '', upi: ''
  };
}

function emptyStore() {
  return { version: 1, profile: emptyProfile(), clients: [], invoices: [], settings: defaultSettings() };
}

function loadStore() {
  var raw;
  try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
  var s = emptyStore();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.profile && typeof raw.profile === 'object') {
    Object.keys(s.profile).forEach(function (k) {
      if (raw.profile[k] != null) s.profile[k] = raw.profile[k];
    });
  }
  if (Array.isArray(raw.clients)) s.clients = raw.clients;
  if (Array.isArray(raw.invoices)) s.invoices = raw.invoices;
  if (raw.settings && typeof raw.settings === 'object') {
    var d = defaultSettings();
    s.settings.theme = raw.settings.theme || d.theme;
    s.settings.width = raw.settings.width || d.width;
    s.settings.dueDays = raw.settings.dueDays != null ? raw.settings.dueDays : d.dueDays;
    s.settings.roundOff = raw.settings.roundOff !== false;
    s.settings.showQr = raw.settings.showQr !== false;
    s.settings.notes = raw.settings.notes != null ? raw.settings.notes : d.notes;
    s.settings.terms = raw.settings.terms != null ? raw.settings.terms : d.terms;
    s.settings.template = raw.settings.template || d.template;
    s.settings.accent = raw.settings.accent || d.accent;
    s.settings.prefixes = d.prefixes;
    if (raw.settings.prefixes && typeof raw.settings.prefixes === 'object') {
      Object.keys(d.prefixes).forEach(function (k) {
        if (raw.settings.prefixes[k]) s.settings.prefixes[k] = String(raw.settings.prefixes[k]);
      });
    }
  }
  return s;
}

function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch (e) {
    toast('Could not save. Storage on this device may be full.');
    return false;
  }
}

function usedNumbers() {
  return store.invoices.map(function (x) { return x.number; });
}

function prefixFor(type) {
  var p = store.settings.prefixes || {};
  return p[type] || InvCalc.docTypeInfo(type).prefix;
}

function assignNumber(inv, force) {
  if (!force && numberLocked) return;
  var fy = InvCalc.financialYear(inv.date || today());
  var nums = usedNumbers();
  if (editingId) {
    var cur = store.invoices.filter(function (x) { return x.id === editingId; })[0];
    if (cur) nums = nums.filter(function (n) { return n !== cur.number; });
  }
  inv.number = InvCalc.nextNumber(prefixFor(inv.type), fy.label, nums, store.settings.width);
  var n = $('docNumber');
  if (n && current === inv) n.value = inv.number;
}

function blankItem() {
  return { description: '', hsn: '', qty: '', unit: 'Nos', rate: '', discount: '', gstPct: 18 };
}

function blankInvoice() {
  var date = today();
  var inv = {
    id: uid(),
    type: 'tax-invoice',
    number: '',
    date: date,
    dueDate: addDays(date, store.settings.dueDays),
    clientId: '',
    client: { name: '', address: '', gstin: '', state: '' },
    placeOfSupply: store.profile.state || '',
    items: [blankItem(), blankItem()],
    notes: store.settings.notes || '',
    terms: store.settings.terms || '',
    status: 'unpaid',
    template: store.settings.template || 'classic',
    accent: store.settings.accent || DEFAULT_ACCENT,
    showQr: store.settings.showQr !== false,
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };
  numberLocked = false;
  editingId = null;
  assignNumber(inv, true);
  return inv;
}

function fillStateSelect(sel, withBlank) {
  if (!sel) return;
  var keep = sel.value;
  sel.innerHTML = '';
  if (withBlank) {
    var z = document.createElement('option');
    z.value = '';
    z.textContent = '—';
    sel.appendChild(z);
  }
  InvCalc.STATES.forEach(function (st) {
    var o = document.createElement('option');
    o.value = st.code;
    o.textContent = st.name;
    sel.appendChild(o);
  });
  if (keep) sel.value = keep;
}

function fillTypeSelect() {
  var sel = $('docType');
  sel.innerHTML = '';
  InvCalc.DOC_TYPES.forEach(function (t) {
    var o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.label;
    sel.appendChild(o);
  });
}

function fillClientSelect() {
  var sel = $('clientSel');
  var keep = current && current.clientId;
  sel.innerHTML = '';
  var z = document.createElement('option');
  z.value = '';
  z.textContent = 'Choose a client';
  sel.appendChild(z);
  store.clients.slice().sort(function (a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  }).forEach(function (c) {
    var o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.name || '(no name)';
    sel.appendChild(o);
  });
  if (keep) sel.value = keep;
}

function fillUnit(sel, val) {
  sel.innerHTML = '';
  InvCalc.UNITS.forEach(function (u) {
    var o = document.createElement('option');
    o.value = u;
    o.textContent = u;
    sel.appendChild(o);
  });
  sel.value = val || 'Nos';
}

function fillGst(sel, val) {
  sel.innerHTML = '';
  InvCalc.GST_RATES.forEach(function (r) {
    var o = document.createElement('option');
    o.value = String(r);
    o.textContent = String(r) + '%';
    sel.appendChild(o);
  });
  sel.value = val == null || val === '' ? '18' : String(val);
}

function renderLines() {
  var body = $('lineBody');
  body.innerHTML = '';
  var hideGst = current.type === 'bill-of-supply';
  current.items.forEach(function (it, i) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input class="desc" data-k="description" maxlength="120"></td>' +
      '<td><input class="hsn mono" data-k="hsn" maxlength="10"></td>' +
      '<td><input class="qty" data-k="qty" type="number" min="0" step="any"></td>' +
      '<td><select class="unit" data-k="unit"></select></td>' +
      '<td><input class="rate" data-k="rate" type="number" min="0" step="any"></td>' +
      '<td><input class="disc" data-k="discount" type="number" min="0" step="any"></td>' +
      '<td><select class="gst" data-k="gstPct"></select></td>' +
      '<td><button type="button" class="rm" data-rm="' + i + '" aria-label="Remove line">×</button></td>';
    body.appendChild(tr);
    tr.querySelector('[data-k="description"]').value = it.description || '';
    tr.querySelector('[data-k="hsn"]').value = it.hsn || '';
    tr.querySelector('[data-k="qty"]').value = it.qty === '' || it.qty == null ? '' : it.qty;
    tr.querySelector('[data-k="rate"]').value = it.rate === '' || it.rate == null ? '' : it.rate;
    tr.querySelector('[data-k="discount"]').value = it.discount === '' || it.discount == null ? '' : it.discount;
    fillUnit(tr.querySelector('[data-k="unit"]'), it.unit);
    fillGst(tr.querySelector('[data-k="gstPct"]'), hideGst ? 0 : it.gstPct);
    if (hideGst) tr.querySelector('[data-k="gstPct"]').disabled = true;
  });
}

function readLines() {
  var rows = $('lineBody').querySelectorAll('tr');
  current.items = [];
  Array.prototype.forEach.call(rows, function (tr) {
    function v(k) { var el = tr.querySelector('[data-k="' + k + '"]'); return el ? el.value : ''; }
    current.items.push({
      description: v('description'),
      hsn: v('hsn'),
      qty: v('qty'),
      unit: v('unit') || 'Nos',
      rate: v('rate'),
      discount: v('discount'),
      gstPct: v('gstPct')
    });
  });
}

function selectedClient() {
  var id = $('clientSel').value;
  var i;
  for (i = 0; i < store.clients.length; i++) if (store.clients[i].id === id) return store.clients[i];
  return null;
}

function applyClient(c) {
  if (!c) {
    current.clientId = '';
    current.client = { name: '', address: '', gstin: '', state: '' };
    return;
  }
  current.clientId = c.id;
  current.client = { name: c.name || '', address: c.address || '', gstin: c.gstin || '', state: c.state || '' };
  if (c.state) {
    current.placeOfSupply = c.state;
    $('posSel').value = InvCalc.stateCode(c.state) || c.state;
  }
  showBillTo();
}

function showBillTo() {
  var c = current.client || {};
  var parts = [c.name, c.address, c.gstin ? ('GSTIN: ' + c.gstin) : '', c.state ? InvCalc.stateName(c.state) : ''];
  $('billTo').textContent = parts.filter(Boolean).join('\n') || 'No client selected.';
}

function collectForm() {
  current.type = $('docType').value;
  current.number = $('docNumber').value.trim();
  current.date = $('docDate').value || today();
  current.dueDate = $('docDue').value;
  current.placeOfSupply = $('posSel').value;
  current.notes = $('docNotes').value;
  current.terms = $('docTerms').value;
  current.template = $('tplSel').value;
  current.accent = $('accentIn').value || DEFAULT_ACCENT;
  readLines();
  var c = selectedClient();
  if (c) applyClient(c);
  else showBillTo();
}

function fillForm() {
  $('docType').value = current.type;
  $('docNumber').value = current.number;
  $('docDate').value = current.date;
  $('docDue').value = current.dueDate || '';
  fillClientSelect();
  $('clientSel').value = current.clientId || '';
  $('posSel').value = InvCalc.stateCode(current.placeOfSupply) || current.placeOfSupply || '';
  $('docNotes').value = current.notes || '';
  $('docTerms').value = current.terms || '';
  $('tplSel').value = current.template || 'classic';
  $('accentIn').value = current.accent || DEFAULT_ACCENT;
  $('btnPaid').textContent = current.status === 'paid' ? 'Mark unpaid' : 'Mark paid';
  showBillTo();
  renderLines();
  renderPreview();
}

function totalsOf(inv) {
  return InvCalc.invoiceTotals(inv.items, {
    sellerState: (inv.sellerSnapshot && inv.sellerSnapshot.state) || store.profile.state,
    placeOfSupply: inv.placeOfSupply,
    roundOff: store.settings.roundOff !== false,
    docType: inv.type
  });
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function lineHtml(inv, tot) {
  var hideTax = inv.type === 'bill-of-supply';
  var head = '<tr><th>Description</th><th>HSN</th><th class="c">Qty</th><th>Unit</th><th class="r">Rate</th>' +
    '<th class="r">Disc.</th><th class="r">Taxable</th>' +
    (hideTax ? '' : '<th class="c">GST</th><th class="r">Tax</th>') +
    '<th class="r">Amount</th></tr>';
  var rows = tot.lines.filter(function (ln) {
    return ln.description || ln.qty || ln.rate || ln.discount;
  }).map(function (ln) {
    return '<tr><td>' + esc(ln.description) + '</td><td>' + esc(ln.hsn) + '</td>' +
      '<td class="c">' + esc(ln.qty) + '</td><td>' + esc(ln.unit) + '</td>' +
      '<td class="r">' + InvCalc.formatInr(ln.rate) + '</td>' +
      '<td class="r">' + InvCalc.formatInr(ln.discount) + '</td>' +
      '<td class="r">' + InvCalc.formatInr(ln.taxable) + '</td>' +
      (hideTax ? '' : '<td class="c">' + ln.gstPct + '%</td><td class="r">' + InvCalc.formatInr(ln.tax) + '</td>') +
      '<td class="r">' + InvCalc.formatInr(ln.total) + '</td></tr>';
  }).join('');
  if (!rows) rows = '<tr><td colspan="10" class="muted">No items yet.</td></tr>';
  return '<table class="items"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
}

function totalsHtml(tot, intra, hideTax) {
  var rows = '<tr><td>Taxable</td><td class="r">' + InvCalc.formatInr(tot.taxable) + '</td></tr>';
  if (!hideTax) {
    if (intra) {
      rows += '<tr><td>CGST</td><td class="r">' + InvCalc.formatInr(tot.cgst) + '</td></tr>';
      rows += '<tr><td>SGST</td><td class="r">' + InvCalc.formatInr(tot.sgst) + '</td></tr>';
    } else {
      rows += '<tr><td>IGST</td><td class="r">' + InvCalc.formatInr(tot.igst) + '</td></tr>';
    }
  }
  if (tot.roundOff) {
    rows += '<tr><td>Round off</td><td class="r">' + InvCalc.formatInr(tot.roundOff) + '</td></tr>';
  }
  rows += '<tr class="grand"><td>Total</td><td class="r">' + InvCalc.formatInr(tot.grand) + '</td></tr>';
  return '<table class="totals">' + rows + '</table>';
}

function profileFor(inv) {
  return inv.sellerSnapshot || store.profile;
}

function renderPreview() {
  if (!current) return;
  collectForm();
  var inv = current;
  var p = profileFor(inv);
  var tot = totalsOf(inv);
  var info = InvCalc.docTypeInfo(inv.type);
  var sheet = $('sheet');
  sheet.className = 'tpl-' + (inv.template || 'classic');
  sheet.style.setProperty('--inv-accent', inv.accent || DEFAULT_ACCENT);
  var logo = p.logo ? '<img class="sh-logo" alt="" src="' + p.logo + '">' : '';
  var bizBits = [esc(p.address), p.phone ? 'Ph: ' + esc(p.phone) : '', p.email ? esc(p.email) : '', p.gstin ? 'GSTIN: ' + esc(p.gstin) : '', p.state ? esc(InvCalc.stateName(p.state)) : ''].filter(Boolean).join('\n');
  var client = inv.client || {};
  var bill = [esc(client.name), esc(client.address), client.gstin ? 'GSTIN: ' + esc(client.gstin) : '', client.state ? esc(InvCalc.stateName(client.state)) : ''].filter(Boolean).join('\n') || '—';
  var banner = '<div class="sh-banner">' + logo +
    '<div class="sh-biz"><p class="sh-name">' + esc(p.name || 'Your business') + '</p><div class="sh-addr">' + bizBits + '</div></div>' +
    '<div class="sh-title">' + esc(info.title) + '</div></div>';
  var head = '<div class="sh-bar"></div><div class="sh-head">' + logo +
    '<div class="sh-biz"><p class="sh-name">' + esc(p.name || 'Your business') + '</p><div class="sh-addr">' + bizBits + '</div></div>' +
    '<div class="sh-title">' + esc(info.title) + '</div></div>';
  var meta = '<div class="sh-grid"><div class="sh-box"><div class="sh-k">Details</div>' +
    'No. ' + esc(inv.number) + '<br>Date: ' + esc(inv.date) + (inv.dueDate ? '<br>Due: ' + esc(inv.dueDate) : '') +
    '</div><div class="sh-box"><div class="sh-k">Bill to</div>' + bill +
    '<div class="muted">Place of supply: ' + esc(InvCalc.stateName(inv.placeOfSupply) || '—') + '</div></div></div>';
  var pay = '';
  if (p.accNo || p.upi || p.bank || p.ifsc) {
    pay = '<div class="sh-pay"><div class="sh-k">Payment</div>';
    if (p.accName) pay += 'Name: ' + esc(p.accName) + '<br>';
    if (p.bank) pay += 'Bank: ' + esc(p.bank) + '<br>';
    if (p.accNo) pay += 'A/c: ' + esc(p.accNo) + '<br>';
    if (p.ifsc) pay += 'IFSC: ' + esc(p.ifsc) + '<br>';
    if (p.upi) pay += 'UPI: ' + esc(p.upi);
    pay += '<div id="qrSlot"></div></div>';
  }
  var notes = '';
  if (inv.notes) notes += '<div><div class="sh-k">Notes</div>' + esc(inv.notes).replace(/\n/g, '<br>') + '</div>';
  if (inv.terms) notes += '<div style="margin-top:8px"><div class="sh-k">Terms</div>' + esc(inv.terms).replace(/\n/g, '<br>') + '</div>';
  var sign = '<div class="sh-sign">' + (p.signature ? '<img alt="" src="' + p.signature + '">' : '') +
    'For ' + esc(p.name || 'the business') + '<br><span class="muted">Authorised signatory</span></div>';
  sheet.innerHTML = (inv.template === 'modern' ? banner : head) + meta + lineHtml(inv, tot) +
    '<div class="sh-foot"><div><div class="sh-words">' + esc(tot.words) + '</div>' + notes + pay + '</div>' +
    '<div>' + totalsHtml(tot, tot.intraState, inv.type === 'bill-of-supply') + sign + '</div></div>';
  scalePreview();
  maybeQr(inv, tot, p);
}

function scalePreview() {
  var pane = $('previewPane');
  var sheet = $('sheet');
  if (!pane || !sheet) return;
  sheet.style.transform = 'none';
  var w = pane.clientWidth;
  var sw = sheet.offsetWidth || 794;
  var scale = Math.min(1, w / sw);
  sheet.style.transform = 'scale(' + scale + ')';
  pane.style.height = Math.ceil((sheet.offsetHeight || 1123) * scale + 8) + 'px';
}

function loadScript(src, ready) {
  if (ready()) return Promise.resolve();
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error('Failed to load ' + src)); };
    document.head.appendChild(s);
  });
}

function maybeQr(inv, tot, p) {
  var slot = $('qrSlot');
  if (!slot) return;
  if (inv.showQr === false || store.settings.showQr === false || !p.upi) return;
  var url = InvCalc.upiUrl({ pa: p.upi, pn: p.name || p.accName, am: tot.grand, tn: inv.number });
  if (!url) return;
  if (qrCache.key === url && qrCache.data) {
    slot.innerHTML = '<img class="sh-qr" alt="UPI QR" src="' + qrCache.data + '">';
    return;
  }
  loadScript(QR_SRC, function () { return typeof qrcode === 'function'; }).then(function () {
    var qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    var data = qr.createDataURL(4, 8);
    qrCache = { key: url, data: data };
    var el = $('qrSlot');
    if (el) el.innerHTML = '<img class="sh-qr" alt="UPI QR" src="' + data + '">';
  }).catch(function () { /* no QR lib — skip */ });
}

function showView(name) {
  Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
    v.classList.toggle('on', v.id === 'view-' + name);
  });
  Array.prototype.forEach.call(document.querySelectorAll('#nav .nav'), function (b) {
    b.classList.toggle('on', b.getAttribute('data-view') === name);
  });
  if (name === 'editor') setTimeout(scalePreview, 30);
  if (name === 'history') renderHistory();
  if (name === 'clients') renderClients();
  if (name === 'business') fillBusiness();
  if (name === 'settings') fillSettings();
}

function snapshotSeller() {
  var p = store.profile, out = emptyProfile(), k;
  for (k in p) if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = p[k];
  return out;
}

function saveCurrent() {
  collectForm();
  if (!current.number) { toast('Give this document a number.'); return; }
  current.updated = new Date().toISOString();
  if (!current.created) current.created = current.updated;
  current.sellerSnapshot = snapshotSeller();
  current.totals = totalsOf(current);
  current.status = current.status === 'paid' ? 'paid' : 'unpaid';
  var i, found = -1;
  for (i = 0; i < store.invoices.length; i++) if (store.invoices[i].id === current.id) found = i;
  var copy = JSON.parse(JSON.stringify(current));
  if (found >= 0) store.invoices[found] = copy;
  else store.invoices.unshift(copy);
  editingId = current.id;
  if (!saveStore()) return;
  $('editMsg').textContent = 'Saved ' + current.number + '.';
  toast('Saved ' + current.number);
  $('btnPaid').textContent = current.status === 'paid' ? 'Mark unpaid' : 'Mark paid';
}

function openInvoice(id) {
  var inv = store.invoices.filter(function (x) { return x.id === id; })[0];
  if (!inv) return;
  current = JSON.parse(JSON.stringify(inv));
  numberLocked = true;
  editingId = inv.id;
  fillForm();
  showView('editor');
}

function newDocument() {
  current = blankInvoice();
  fillForm();
  $('editMsg').textContent = '';
  showView('editor');
}

function duplicateInvoice(id) {
  var inv = store.invoices.filter(function (x) { return x.id === id; })[0];
  if (!inv) return;
  current = JSON.parse(JSON.stringify(inv));
  current.id = uid();
  current.status = 'unpaid';
  current.date = today();
  current.dueDate = addDays(current.date, store.settings.dueDays);
  current.created = new Date().toISOString();
  current.updated = current.created;
  delete current.sellerSnapshot;
  numberLocked = false;
  editingId = null;
  assignNumber(current, true);
  fillForm();
  showView('editor');
  toast('Duplicated as ' + current.number + '. Save to keep it.');
}

function deleteInvoice(id) {
  var inv = store.invoices.filter(function (x) { return x.id === id; })[0];
  if (!inv) return;
  var msg = 'Delete ' + (inv.number || 'this document') + '? This cannot be undone.';
  OfficeDialog.confirm({ title: 'Delete document', message: msg, okLabel: 'Delete', danger: true }).then(function (ok) {
    if (!ok) return;
    store.invoices = store.invoices.filter(function (x) { return x.id !== id; });
    if (current && current.id === id) newDocument();
    saveStore();
    renderHistory();
    toast('Deleted.');
  });
}

function togglePaid(id) {
  var inv = store.invoices.filter(function (x) { return x.id === id; })[0];
  if (!inv) return;
  inv.status = inv.status === 'paid' ? 'unpaid' : 'paid';
  inv.updated = new Date().toISOString();
  if (current && current.id === id) {
    current.status = inv.status;
    $('btnPaid').textContent = current.status === 'paid' ? 'Mark unpaid' : 'Mark paid';
  }
  saveStore();
  renderHistory();
}

function renderHistory() {
  var q = ($('histSearch').value || '').toLowerCase().trim();
  var st = $('histStatus').value;
  var body = $('histBody');
  body.innerHTML = '';
  var rows = store.invoices.filter(function (inv) {
    if (st && inv.status !== st) return false;
    if (!q) return true;
    var blob = [inv.number, inv.date, inv.type, (inv.client && inv.client.name) || '', inv.status].join(' ').toLowerCase();
    return blob.indexOf(q) !== -1;
  });
  $('histEmpty').hidden = rows.length > 0;
  rows.forEach(function (inv) {
    var tot = inv.totals || totalsOf(inv);
    var tr = document.createElement('tr');
    var typ = InvCalc.docTypeInfo(inv.type).label;
    tr.innerHTML = '<td>' + esc(inv.number) + '</td><td>' + esc(inv.date) + '</td><td>' +
      esc((inv.client && inv.client.name) || '—') + '</td><td>' + esc(typ) + '</td>' +
      '<td class="num">' + InvCalc.formatInr(tot.grand) + '</td>' +
      '<td class="' + (inv.status === 'paid' ? 'paid' : 'unpaid') + '">' + (inv.status === 'paid' ? 'Paid' : 'Unpaid') + '</td>' +
      '<td></td>';
    var acts = tr.lastChild;
    function add(label, cls, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mini' + (cls ? ' ' + cls : '');
      b.textContent = label;
      b.addEventListener('click', fn);
      acts.appendChild(b);
    }
    add('Open', '', function () { openInvoice(inv.id); });
    add('Duplicate', '', function () { duplicateInvoice(inv.id); });
    add(inv.status === 'paid' ? 'Unpaid' : 'Paid', '', function () { togglePaid(inv.id); });
    add('Delete', 'danger', function () { deleteInvoice(inv.id); });
    body.appendChild(tr);
  });
}

function exportCsv() {
  var cols = ['Number', 'Type', 'Date', 'Due', 'Client', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Round off', 'Total', 'Status'];
  var lines = [cols.join(',')];
  function cell(v) {
    v = v == null ? '' : String(v);
    if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }
  store.invoices.forEach(function (inv) {
    var tot = inv.totals || totalsOf(inv);
    var c = inv.client || {};
    lines.push([
      inv.number, InvCalc.docTypeInfo(inv.type).label, inv.date, inv.dueDate || '',
      c.name || '', c.gstin || '',
      tot.taxable, tot.cgst, tot.sgst, tot.igst, tot.roundOff, tot.grand, inv.status
    ].map(cell).join(','));
  });
  downloadText('invoice-history.csv', lines.join('\n'), 'text/csv');
  toast('CSV downloaded.');
}

function downloadText(name, text, type) {
  var blob = new Blob([text], { type: type || 'text/plain' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

function downloadBlob(name, blob) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

function exportBackup() {
  var payload = {
    type: 'hub-invoice-maker-backup',
    format: 1,
    exported: new Date().toISOString(),
    release: RELEASE,
    data: store
  };
  downloadText('invoice-maker-backup.json', JSON.stringify(payload, null, 2), 'application/json');
  toast('Backup downloaded.');
}

function importBackup(file) {
  var reader = new FileReader();
  reader.onerror = function () { toast('Could not read that file.'); };
  reader.onload = function () {
    var raw;
    try { raw = JSON.parse(String(reader.result || '')); } catch (e) { toast('That file is not valid JSON.'); return; }
    var data = raw && raw.type === 'hub-invoice-maker-backup' ? raw.data : raw;
    if (!data || typeof data !== 'object' || !Array.isArray(data.invoices)) {
      toast('That file is not an Invoice Maker backup.');
      return;
    }
    OfficeDialog.confirm({
      title: 'Import backup',
      message: 'Replace all invoices, clients and business details on this device with the backup? This cannot be undone.',
      okLabel: 'Replace',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { toast('Could not save the backup. Storage may be full.'); return; }
      store = loadStore();
      current = blankInvoice();
      applyTheme();
      fillForm();
      fillBusiness();
      fillSettings();
      renderHistory();
      renderClients();
      toast('Backup imported.');
    });
  };
  reader.readAsText(file);
}

function renderClients() {
  var ul = $('clientList');
  ul.innerHTML = '';
  $('clEmpty').hidden = store.clients.length > 0;
  store.clients.slice().sort(function (a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  }).forEach(function (c) {
    var li = document.createElement('li');
    var who = document.createElement('div');
    who.className = 'who';
    who.textContent = (c.name || '(no name)') + (c.gstin ? ' · ' + c.gstin : '') + (c.state ? ' · ' + InvCalc.stateName(c.state) : '');
    li.appendChild(who);
    var ed = document.createElement('button');
    ed.type = 'button'; ed.className = 'mini'; ed.textContent = 'Edit';
    ed.addEventListener('click', function () { fillClientForm(c); });
    var del = document.createElement('button');
    del.type = 'button'; del.className = 'mini danger'; del.textContent = 'Delete';
    del.addEventListener('click', function () { deleteClient(c.id); });
    li.appendChild(ed);
    li.appendChild(del);
    ul.appendChild(li);
  });
}

function fillClientForm(c) {
  $('clId').value = c && c.id || '';
  $('clName').value = c && c.name || '';
  $('clGstin').value = c && c.gstin || '';
  $('clAddr').value = c && c.address || '';
  $('clState').value = c && (InvCalc.stateCode(c.state) || c.state) || '';
  $('clWarn').textContent = '';
}

function saveClient() {
  var name = $('clName').value.trim();
  var gstin = $('clGstin').value.trim().toUpperCase();
  if (!name) { $('clWarn').textContent = 'Enter a client name.'; return; }
  if (gstin && !InvCalc.gstinLooksOk(gstin)) {
    $('clWarn').textContent = 'That GSTIN does not look like a valid 15-character number.';
    return;
  }
  var id = $('clId').value || uid();
  var rec = { id: id, name: name, gstin: gstin, address: $('clAddr').value.trim(), state: $('clState').value };
  var i, found = -1;
  for (i = 0; i < store.clients.length; i++) if (store.clients[i].id === id) found = i;
  if (found >= 0) store.clients[found] = rec;
  else store.clients.push(rec);
  if (!saveStore()) return;
  fillClientForm(null);
  renderClients();
  fillClientSelect();
  toast('Client saved.');
}

function deleteClient(id) {
  var c = store.clients.filter(function (x) { return x.id === id; })[0];
  if (!c) return;
  OfficeDialog.confirm({ title: 'Delete client', message: 'Delete ' + (c.name || 'this client') + '?', okLabel: 'Delete', danger: true }).then(function (ok) {
    if (!ok) return;
    store.clients = store.clients.filter(function (x) { return x.id !== id; });
    saveStore();
    renderClients();
    fillClientSelect();
    toast('Client deleted.');
  });
}

function fillBusiness() {
  var p = store.profile;
  $('bizName').value = p.name || '';
  $('bizGstin').value = p.gstin || '';
  $('bizAddr').value = p.address || '';
  $('bizState').value = InvCalc.stateCode(p.state) || p.state || '';
  $('bizPhone').value = p.phone || '';
  $('bizEmail').value = p.email || '';
  $('bizAccName').value = p.accName || '';
  $('bizAccNo').value = p.accNo || '';
  $('bizIfsc').value = p.ifsc || '';
  $('bizBank').value = p.bank || '';
  $('bizUpi').value = p.upi || '';
  $('logoPrev').src = p.logo || '';
  $('signPrev').src = p.signature || '';
  $('bizWarn').textContent = '';
}

function saveBusiness() {
  var gstin = $('bizGstin').value.trim().toUpperCase();
  if (gstin && !InvCalc.gstinLooksOk(gstin)) {
    $('bizWarn').textContent = 'That GSTIN does not look like a valid 15-character number.';
    return;
  }
  var p = store.profile;
  p.name = $('bizName').value.trim();
  p.gstin = gstin;
  p.address = $('bizAddr').value.trim();
  p.state = $('bizState').value;
  p.phone = $('bizPhone').value.trim();
  p.email = $('bizEmail').value.trim();
  p.accName = $('bizAccName').value.trim();
  p.accNo = $('bizAccNo').value.trim();
  p.ifsc = $('bizIfsc').value.trim().toUpperCase();
  p.bank = $('bizBank').value.trim();
  p.upi = $('bizUpi').value.trim();
  if (!saveStore()) return;
  $('bizWarn').textContent = 'Saved on this device.';
  toast('Business details saved.');
  renderPreview();
}

function readImage(file, maxSide, asJpeg, done) {
  if (!file) return;
  if (!/^image\//.test(file.type || '')) { toast('Please choose an image file.'); return; }
  var url = URL.createObjectURL(file);
  var img = new Image();
  img.onload = function () {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var s = Math.min(1, maxSide / Math.max(w, h, 1));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    var ctx = c.getContext('2d');
    if (asJpeg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    try {
      done(asJpeg ? c.toDataURL('image/jpeg', 0.82) : c.toDataURL('image/png'));
    } catch (e) {
      toast('Could not read that image.');
    }
  };
  img.onerror = function () { URL.revokeObjectURL(url); toast('Could not read that image.'); };
  img.src = url;
}

function fillSettings() {
  var s = store.settings;
  $('pxInv').value = s.prefixes['tax-invoice'];
  $('pxQt').value = s.prefixes.quote;
  $('pxRct').value = s.prefixes.receipt;
  $('pxBos').value = s.prefixes['bill-of-supply'];
  $('pxWidth').value = s.width || 3;
  $('dueDays').value = s.dueDays != null ? s.dueDays : 15;
  $('setRound').checked = s.roundOff !== false;
  $('setQr').checked = s.showQr !== false;
  $('setNotes').value = s.notes || '';
  $('setTerms').value = s.terms || '';
  applyTheme();
  $('rel').textContent = RELEASE;
}

function saveSettings() {
  var s = store.settings;
  s.prefixes['tax-invoice'] = $('pxInv').value.trim() || 'INV';
  s.prefixes.quote = $('pxQt').value.trim() || 'QT';
  s.prefixes.receipt = $('pxRct').value.trim() || 'RCT';
  s.prefixes['bill-of-supply'] = $('pxBos').value.trim() || 'BOS';
  s.width = Math.max(2, Math.min(6, Number($('pxWidth').value) || 3));
  s.dueDays = Math.max(0, Math.min(365, Number($('dueDays').value) || 0));
  s.roundOff = $('setRound').checked;
  s.showQr = $('setQr').checked;
  s.notes = $('setNotes').value;
  s.terms = $('setTerms').value;
  s.template = $('tplSel').value || s.template;
  s.accent = $('accentIn').value || s.accent;
  if (!saveStore()) return;
  toast('Settings saved.');
  if (!numberLocked) assignNumber(current, true);
  renderPreview();
}

function safeName(s) {
  return String(s || 'invoice').replace(/[\\/:*?"<>|]+/g, '-');
}

function printDoc() {
  collectForm();
  renderPreview();
  setTimeout(function () { window.print(); }, 50);
}

function pdfColor(hex) {
  hex = String(hex || DEFAULT_ACCENT).replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  var n = parseInt(hex, 16);
  if (!isFinite(n)) n = 0x0f5c4c;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function writePdf(inv) {
  var JsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!JsPDF) throw new Error('jsPDF missing');
  var p = profileFor(inv);
  var tot = totalsOf(inv);
  var info = InvCalc.docTypeInfo(inv.type);
  var accent = pdfColor(inv.accent);
  var doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  var m = 14, y = 14, pageW = 210, right = pageW - m;
  var hideTax = inv.type === 'bill-of-supply';

  function ensure(h) {
    if (y + h > 287) { doc.addPage(); y = 14; }
  }
  function setAccent() { doc.setTextColor(accent.r, accent.g, accent.b); }
  function setInk() { doc.setTextColor(30); }
  function setMut() { doc.setTextColor(90); }

  if (inv.template === 'modern') {
    doc.setFillColor(accent.r, accent.g, accent.b);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(p.name || 'Your business', m, 12);
    doc.setFontSize(12);
    doc.text(info.title, right, 12, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    var topBits = [p.address, p.phone ? 'Ph: ' + p.phone : '', p.gstin ? 'GSTIN: ' + p.gstin : ''].filter(Boolean).join('  ');
    if (topBits) doc.text(topBits, m, 20, { maxWidth: 140 });
    y = 36;
  } else {
    if (inv.template !== 'minimal') {
      doc.setFillColor(accent.r, accent.g, accent.b);
      doc.rect(0, 0, pageW, 4, 'F');
      y = 12;
    }
    if (p.logo) {
      try { doc.addImage(p.logo, 'JPEG', m, y, 22, 14); } catch (e1) {
        try { doc.addImage(p.logo, 'PNG', m, y, 22, 14); } catch (e2) { /* skip logo */ }
      }
    }
    var tx = p.logo ? m + 26 : m;
    setInk();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(inv.template === 'minimal' ? 12 : 15);
    doc.text(p.name || 'Your business', tx, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setMut();
    var addr = [p.address, p.phone ? 'Ph: ' + p.phone : '', p.email, p.gstin ? 'GSTIN: ' + p.gstin : '', p.state ? InvCalc.stateName(p.state) : ''].filter(Boolean).join('\n');
    if (addr) doc.text(addr, tx, y + 10);
    if (inv.template === 'minimal') setInk(); else setAccent();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(info.title, right, y + 6, { align: 'right' });
    y += 28;
  }

  setInk();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Details', m, y);
  doc.text('Bill to', 110, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  var leftMeta = 'No. ' + (inv.number || '') + '\nDate: ' + (inv.date || '') + (inv.dueDate ? '\nDue: ' + inv.dueDate : '');
  var client = inv.client || {};
  var bill = [client.name, client.address, client.gstin ? 'GSTIN: ' + client.gstin : '', client.state ? InvCalc.stateName(client.state) : '', 'Place of supply: ' + (InvCalc.stateName(inv.placeOfSupply) || '—')].filter(Boolean).join('\n');
  doc.text(leftMeta, m, y);
  doc.text(bill || '—', 110, y);
  y += Math.max(18, (bill.split('\n').length + 1) * 4) + 4;

  var cols = hideTax
    ? [{ h: 'Description', w: 70 }, { h: 'HSN', w: 18 }, { h: 'Qty', w: 14, a: 'right' }, { h: 'Unit', w: 14 }, { h: 'Rate', w: 20, a: 'right' }, { h: 'Disc.', w: 16, a: 'right' }, { h: 'Taxable', w: 18, a: 'right' }, { h: 'Amount', w: 20, a: 'right' }]
    : [{ h: 'Description', w: 52 }, { h: 'HSN', w: 16 }, { h: 'Qty', w: 12, a: 'right' }, { h: 'Unit', w: 12 }, { h: 'Rate', w: 18, a: 'right' }, { h: 'Disc.', w: 14, a: 'right' }, { h: 'Taxable', w: 18, a: 'right' }, { h: 'GST', w: 12, a: 'right' }, { h: 'Tax', w: 16, a: 'right' }, { h: 'Amount', w: 18, a: 'right' }];
  function drawHead() {
    ensure(8);
    if (inv.template === 'minimal') {
      setInk();
      doc.setDrawColor(20);
      doc.setLineWidth(0.3);
      doc.line(m, y + 1, right, y + 1);
    } else {
      doc.setFillColor(inv.template === 'modern' ? 30 : accent.r, inv.template === 'modern' ? 30 : accent.g, inv.template === 'modern' ? 30 : accent.b);
      doc.rect(m, y - 4, pageW - 2 * m, 7, 'F');
      doc.setTextColor(255);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    var x = m;
    cols.forEach(function (c) {
      doc.text(c.h, c.a === 'right' ? x + c.w - 1 : x + 1, y, { align: c.a === 'right' ? 'right' : 'left' });
      x += c.w;
    });
    y += 6;
    setInk();
  }
  drawHead();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  var rows = tot.lines.filter(function (ln) { return ln.description || ln.qty || ln.rate || ln.discount; });
  if (!rows.length) {
    doc.setTextColor(90);
    doc.text('No items yet.', m, y);
    y += 6;
    setInk();
  }
  rows.forEach(function (ln) {
    ensure(8);
    var vals = hideTax
      ? [ln.description || '', ln.hsn || '', String(ln.qty), ln.unit || '', 'Rs. ' + InvCalc.formatInr(ln.rate, false), 'Rs. ' + InvCalc.formatInr(ln.discount, false), 'Rs. ' + InvCalc.formatInr(ln.taxable, false), 'Rs. ' + InvCalc.formatInr(ln.total, false)]
      : [ln.description || '', ln.hsn || '', String(ln.qty), ln.unit || '', 'Rs. ' + InvCalc.formatInr(ln.rate, false), 'Rs. ' + InvCalc.formatInr(ln.discount, false), 'Rs. ' + InvCalc.formatInr(ln.taxable, false), String(ln.gstPct) + '%', 'Rs. ' + InvCalc.formatInr(ln.tax, false), 'Rs. ' + InvCalc.formatInr(ln.total, false)];
    var x = m;
    cols.forEach(function (c, i) {
      var t = vals[i] || '';
      if (c.w < 50 && t.length > 28) t = t.slice(0, 27) + '…';
      doc.text(String(t), c.a === 'right' ? x + c.w - 1 : x + 1, y, { align: c.a === 'right' ? 'right' : 'left' });
      x += c.w;
    });
    doc.setDrawColor(230);
    doc.setLineWidth(0.15);
    doc.line(m, y + 2, right, y + 2);
    y += 6;
  });

  y += 4;
  ensure(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(tot.words.replace(/Rupees/g, 'Rupees').replace(/₹/g, 'Rs.'), m, y, { maxWidth: 110 });
  var ty = y;
  function totRow(label, val, bold) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10 : 9);
    doc.text(label, 140, ty);
    doc.text('Rs. ' + InvCalc.formatInr(val, false), right, ty, { align: 'right' });
    ty += 5;
  }
  totRow('Taxable', tot.taxable, false);
  if (!hideTax) {
    if (tot.intraState) { totRow('CGST', tot.cgst, false); totRow('SGST', tot.sgst, false); }
    else totRow('IGST', tot.igst, false);
  }
  if (tot.roundOff) totRow('Round off', tot.roundOff, false);
  totRow('Total', tot.grand, true);
  y = Math.max(y + 12, ty + 2);

  if (inv.notes) {
    ensure(12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setMut(); doc.text('Notes', m, y); y += 4;
    setInk(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    var nlines = doc.splitTextToSize(inv.notes, 110);
    doc.text(nlines, m, y);
    y += nlines.length * 4 + 3;
  }
  if (inv.terms) {
    ensure(12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setMut(); doc.text('Terms', m, y); y += 4;
    setInk(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    var tlines = doc.splitTextToSize(inv.terms, 110);
    doc.text(tlines, m, y);
    y += tlines.length * 4 + 3;
  }

  var payBits = [];
  if (p.accName) payBits.push('Name: ' + p.accName);
  if (p.bank) payBits.push('Bank: ' + p.bank);
  if (p.accNo) payBits.push('A/c: ' + p.accNo);
  if (p.ifsc) payBits.push('IFSC: ' + p.ifsc);
  if (p.upi) payBits.push('UPI: ' + p.upi);
  if (payBits.length) {
    ensure(20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setMut(); doc.text('Payment', m, y); y += 4;
    setInk(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(payBits.join('\n'), m, y);
    y += payBits.length * 4;
  }

  var qrUrl = (inv.showQr !== false && store.settings.showQr !== false && p.upi)
    ? InvCalc.upiUrl({ pa: p.upi, pn: p.name || p.accName, am: tot.grand, tn: inv.number })
    : '';
  if (qrUrl && typeof qrcode === 'function') {
    try {
      var qr = qrcode(0, 'M');
      qr.addData(qrUrl);
      qr.make();
      var n = qr.getModuleCount();
      var size = 28, cell = size / n, qx = right - size, qy = Math.max(y - 20, 240);
      ensure(size + 4);
      if (qy + size > 287) qy = y;
      doc.setFillColor(0);
      var r, c;
      for (r = 0; r < n; r++) for (c = 0; c < n; c++) if (qr.isDark(r, c)) doc.rect(qx + c * cell, qy + r * cell, cell, cell, 'F');
    } catch (eq) { /* skip QR */ }
  }

  ensure(22);
  var sy = 270;
  if (y > 250) { doc.addPage(); sy = 40; }
  if (p.signature) {
    try { doc.addImage(p.signature, 'PNG', right - 36, sy - 16, 36, 14); } catch (es) { /* skip */ }
  }
  setInk();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('For ' + (p.name || 'the business'), right, sy + 2, { align: 'right' });
  setMut();
  doc.text('Authorised signatory', right, sy + 6, { align: 'right' });

  return doc;
}

function savePdf() {
  collectForm();
  renderPreview();
  loadScript(JSPDF_SRC, function () { return !!(window.jspdf && window.jspdf.jsPDF); })
    .then(function () {
      if (current.showQr !== false && store.settings.showQr !== false && store.profile.upi) {
        return loadScript(QR_SRC, function () { return typeof qrcode === 'function'; }).catch(function () {});
      }
    })
    .then(function () {
      var doc = writePdf(current);
      var name = safeName(current.number || 'invoice') + '.pdf';
      var blob = doc.output('blob');
      downloadBlob(name, blob);
      toast('PDF saved.');
    })
    .catch(function () {
      OfficeDialog.confirm({
        title: 'Save as PDF',
        message: 'The PDF library could not be loaded. You can still use Print and choose Save as PDF in the print dialog.',
        okLabel: 'Print'
      }).then(function (ok) { if (ok) printDoc(); });
    });
}

function onNumberInput() { numberLocked = true; }

function onTypeOrDate() {
  if (numberLocked) return;
  collectForm();
  assignNumber(current, true);
  renderPreview();
}

function bind() {
  Array.prototype.forEach.call(document.querySelectorAll('#nav .nav'), function (b) {
    b.addEventListener('click', function () { showView(b.getAttribute('data-view')); });
  });
  $('lineBody').addEventListener('input', function () { renderPreview(); });
  $('lineBody').addEventListener('change', function () { renderPreview(); });
  $('lineBody').addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-rm') != null) {
      readLines();
      var i = Number(t.getAttribute('data-rm'));
      if (current.items.length <= 1) current.items[0] = blankItem();
      else current.items.splice(i, 1);
      renderLines();
      renderPreview();
    }
  });
  $('btnAddLine').addEventListener('click', function () {
    readLines();
    current.items.push(blankItem());
    renderLines();
    renderPreview();
  });
  ['docType', 'docDate', 'docDue', 'clientSel', 'posSel', 'docNotes', 'docTerms', 'tplSel', 'accentIn'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      if (id === 'docType' || id === 'docDate') onTypeOrDate();
      if (id === 'clientSel') applyClient(selectedClient());
      if (id === 'tplSel' || id === 'accentIn') {
        store.settings.template = $('tplSel').value;
        store.settings.accent = $('accentIn').value;
      }
      renderPreview();
    });
  });
  $('docNotes').addEventListener('input', renderPreview);
  $('docTerms').addEventListener('input', renderPreview);
  $('docNumber').addEventListener('input', onNumberInput);
  $('btnSave').addEventListener('click', saveCurrent);
  $('btnPrint').addEventListener('click', printDoc);
  $('btnPdf').addEventListener('click', savePdf);
  $('btnPaid').addEventListener('click', function () {
    if (!editingId) { current.status = current.status === 'paid' ? 'unpaid' : 'paid'; $('btnPaid').textContent = current.status === 'paid' ? 'Mark unpaid' : 'Mark paid'; toast(current.status === 'paid' ? 'Will be saved as paid.' : 'Will be saved as unpaid.'); return; }
    togglePaid(editingId);
  });
  $('btnNew').addEventListener('click', function () {
    if (!editingId && current && (current.items || []).some(function (it) { return it.description || it.qty || it.rate; })) {
      OfficeDialog.confirm({ title: 'New document', message: 'Start a new document? Unsaved changes on this one will be lost.', okLabel: 'New document' }).then(function (ok) { if (ok) newDocument(); });
    } else newDocument();
  });
  $('btnNewClient').addEventListener('click', function () {
    fillClientForm(null);
    showView('clients');
    $('clName').focus();
  });
  $('histSearch').addEventListener('input', renderHistory);
  $('histStatus').addEventListener('change', renderHistory);
  $('btnCsv').addEventListener('click', exportCsv);
  $('btnCsv2').addEventListener('click', exportCsv);
  $('btnSaveClient').addEventListener('click', saveClient);
  $('btnClearClient').addEventListener('click', function () { fillClientForm(null); });
  $('btnSaveBiz').addEventListener('click', saveBusiness);
  $('btnLogo').addEventListener('click', function () { $('logoFile').click(); });
  $('btnSign').addEventListener('click', function () { $('signFile').click(); });
  $('logoFile').addEventListener('change', function () {
    readImage($('logoFile').files[0], 360, true, function (data) {
      store.profile.logo = data;
      $('logoPrev').src = data;
      $('logoFile').value = '';
      saveStore();
      renderPreview();
    });
  });
  $('signFile').addEventListener('change', function () {
    readImage($('signFile').files[0], 320, false, function (data) {
      store.profile.signature = data;
      $('signPrev').src = data;
      $('signFile').value = '';
      saveStore();
      renderPreview();
    });
  });
  $('btnLogoClr').addEventListener('click', function () { store.profile.logo = ''; $('logoPrev').src = ''; saveStore(); renderPreview(); });
  $('btnSignClr').addEventListener('click', function () { store.profile.signature = ''; $('signPrev').src = ''; saveStore(); renderPreview(); });
  $('themeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    store.settings.theme = b.getAttribute('data-v') || 'auto';
    saveStore();
    applyTheme();
  });
  $('btnSaveSet').addEventListener('click', saveSettings);
  $('btnBackup').addEventListener('click', exportBackup);
  $('btnRestore').addEventListener('click', function () { $('backupFile').click(); });
  $('backupFile').addEventListener('change', function () {
    var f = $('backupFile').files[0];
    $('backupFile').value = '';
    if (f) importBackup(f);
  });
  window.addEventListener('resize', scalePreview);
  window.addEventListener('storage', function (e) {
    if (e.key === 'sites-hub.theme') applyTheme();
  });
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', applyTheme);
    else if (mq.addListener) mq.addListener(applyTheme);
  }
}

function init() {
  store = loadStore();
  fillTypeSelect();
  fillStateSelect($('posSel'), true);
  fillStateSelect($('clState'), true);
  fillStateSelect($('bizState'), true);
  applyTheme();
  current = blankInvoice();
  bind();
  fillForm();
  $('rel').textContent = RELEASE;
}

init();
