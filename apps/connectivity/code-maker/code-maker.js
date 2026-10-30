/* code-maker.js (QR1): UI, rendering (bwip-js), PNG/SVG/copy/share/print, history, self-check.
   Storage keys: code_maker_history (last 30), code_maker_theme ('system'|'light'|'dark'), code_maker_last. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var T = window.CodeTypes, HKEY = 'code_maker_history', MAXH = 30;
  var cv = $('cv'), cur = null, logo = null, timer = 0, vals = {};

  /* ---- Theme: own choice, 'system' follows the Hub's sites-hub.theme, else Light (Hub default). ---- */
  var THEMES = ['system', 'light', 'dark'];
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }
  function applyTheme() {
    var t = lsGet('code_maker_theme') || 'system', hub = lsGet('sites-hub.theme');
    var dark = t === 'dark' || (t === 'system' && hub === 'dark');
    document.documentElement.classList.toggle('dark', dark);
    $('themeLbl').textContent = t.charAt(0).toUpperCase() + t.slice(1);
  }
  $('themeBtn').onclick = function () {
    var t = lsGet('code_maker_theme') || 'system'; lsSet('code_maker_theme', THEMES[(THEMES.indexOf(t) + 1) % 3]); applyTheme();
  };
  addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') applyTheme(); });
  applyTheme();

  /* ---- Form ---- */
  function el(tag, attrs, txt) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (txt) e.textContent = txt; return e; }
  function buildFields(type, preset) {
    var box = $('fields'); box.innerHTML = ''; vals = preset || {};
    T[type].fields.forEach(function (f) {
      var id = f[0], kind = f[2], inp;
      if (kind === 'button') {
        inp = el('button', { type: 'button', class: 'mini', id: 'f_' + id }, f[1]);
        inp.onclick = function () {
          if (!navigator.geolocation) return toast('Location is not available here.');
          navigator.geolocation.getCurrentPosition(function (p) {
            setVal('lat', p.coords.latitude.toFixed(6)); setVal('lng', p.coords.longitude.toFixed(6)); schedule();
          }, function () { toast('Could not get your location.'); });
        };
        box.appendChild(inp); return;
      }
      var lab = el('label', { class: kind === 'check' ? 'lbl chk' : 'lbl' }, f[1]);
      if (kind === 'area') inp = el('textarea', { rows: 3 });
      else if (kind.indexOf('select:') === 0) {
        inp = el('select');
        kind.slice(7).split('|').forEach(function (o) { var p = o.split('='); inp.appendChild(el('option', { value: p[0] }, p[1])); });
      } else if (kind === 'check') inp = el('input', { type: 'checkbox' });
      else if (kind === 'num') inp = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off' });
      else inp = el('input', { type: kind, autocomplete: 'off' });
      inp.id = 'f_' + id; if (f[3]) inp.placeholder = f[3];
      if (vals[id] != null) { if (kind === 'check') inp.checked = !!vals[id]; else inp.value = vals[id]; }
      inp.addEventListener(kind === 'check' || kind.indexOf('select') === 0 ? 'change' : 'input', schedule);
      if (kind === 'check') lab.insertBefore(inp, lab.firstChild); else lab.appendChild(inp);
      box.appendChild(lab);
    });
    var g = T[type].group;
    $('eccRow').hidden = g !== 'qr'; $('logoRow').hidden = g !== 'qr';
  }
  function setVal(id, v) { var e = $('f_' + id); if (e) e.value = v; }
  function readVals() {
    var v = {};
    T[$('type').value].fields.forEach(function (f) {
      var e = $('f_' + f[0]); if (!e || f[2] === 'button') return; v[f[0]] = f[2] === 'check' ? e.checked : e.value;
    });
    return v;
  }
  function opts() {
    return { scale: +$('scale').value, ecc: $('ecc').value, fg: $('fg').value, bg: $('bg').value, margin: +$('margin').value, label: $('label').value };
  }

  /* ---- Render ---- */
  function bwOpts(t, text, o, forSvg) {
    var g = T[t].group, b = { bcid: g === 'qr' ? 'qrcode' : T[t].bcid, text: text, scale: o.scale, barcolor: o.fg.slice(1) };
    if (g === 'qr') b.eclevel = logo ? 'H' : o.ecc;
    if (g === '1d') { b.includetext = true; b.textxalign = 'center'; b.height = 14; b.textcolor = o.fg.slice(1); }
    if (t === 'itf14') { b.bordercolor = o.fg.slice(1); }
    if (t === 'pdf417') b.rowmult = 2;
    return b;
  }
  function generate() {
    var t = $('type').value, o = opts(), err = $('err');
    $('scaleLbl').textContent = o.scale; $('marginLbl').textContent = o.margin;
    $('badge').hidden = true;
    var r;
    try { r = T[t].build(readVals()); } catch (e) { return fail(e.message); }
    var tmp = document.createElement('canvas');
    try { bwipjs.toCanvas(tmp, bwOpts(t, r.text, o)); } catch (e) { return fail(friendly(e)); }
    var m = o.margin * o.scale * 2, lh = o.label ? Math.max(14, o.scale * 5) : 0, lp = lh ? Math.round(lh * 0.5) : 0;
    cv.width = tmp.width + 2 * m; cv.height = tmp.height + 2 * m + lh + lp;
    var c = cv.getContext('2d');
    c.fillStyle = o.bg; c.fillRect(0, 0, cv.width, cv.height);
    c.drawImage(tmp, m, m);
    var lg = null;
    if (logo && T[t].group === 'qr') {
      var side = Math.round(tmp.width * 0.22), pad = Math.round(side * 0.12), x = m + (tmp.width - side) / 2, y = m + (tmp.height - side) / 2;
      c.fillStyle = o.bg; c.fillRect(x - pad, y - pad, side + 2 * pad, side + 2 * pad);
      c.drawImage(logo, x, y, side, side); lg = { x: x, y: y, side: side, pad: pad };
    }
    if (lh) { c.fillStyle = o.fg; c.font = lh + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(o.label, cv.width / 2, tmp.height + m + lp * 0.5); }
    err.hidden = true; $('outCard').classList.remove('bad');
    $('hint').textContent = r.note || (T[t].group === 'qr' && logo ? 'Logo on: error correction set to H.' : '');
    cur = { type: t, vals: readVals(), opts: o, text: r.text, geo: { m: m, w: tmp.width, h: tmp.height, lh: lh, lp: lp, lg: lg } };
    lsSet('code_maker_last', JSON.stringify({ type: t, vals: cur.vals, opts: o }));
    if (T[t].group === 'qr') selfCheck(r.text);
  }
  function friendly(e) {
    var s = String(e && e.message || e).replace(/^bwipp\.\w+#\d+:\s*/, '');
    if (/too long|maximum|exceed/i.test(s)) return 'Too much data for this code. Use less text or a lower error correction.';
    return 'Cannot make this code: ' + s;
  }
  function fail(msg) {
    cur = null; var e = $('err'); e.textContent = msg; e.hidden = false; $('outCard').classList.add('bad'); $('hint').textContent = '';
    cv.width = 1; cv.height = 1;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(generate, 120); }

  /* ---- Self-check: read the QR back if BarcodeDetector exists; otherwise skip silently. ---- */
  function selfCheck(text) {
    if (!('BarcodeDetector' in window)) return;
    try {
      var d = new window.BarcodeDetector({ formats: ['qr_code'] });
      d.detect(cv).then(function (res) { if (cur && cur.text === text && res.some(function (x) { return x.rawValue === text; })) $('badge').hidden = false; }).catch(function () {});
    } catch (_) { /* unsupported format */ }
  }

  /* ---- SVG ---- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function makeSVG() {
    var g = cur.geo, o = cur.opts, W = cv.width, H = cv.height;
    var inner = bwipjs.toSVG(bwOpts(cur.type, cur.text, o, true));
    var vb = (inner.match(/viewBox="([^"]+)"/) || [])[1] || ('0 0 ' + g.w + ' ' + g.h);
    var body = inner.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    var s = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<rect width="100%" height="100%" fill="' + o.bg + '"/>' +
      '<svg x="' + g.m + '" y="' + g.m + '" width="' + g.w + '" height="' + g.h + '" viewBox="' + vb + '">' + body + '</svg>';
    if (g.lg && logo) {
      var lc = document.createElement('canvas'); lc.width = lc.height = 256; lc.getContext('2d').drawImage(logo, 0, 0, 256, 256);
      s += '<rect x="' + (g.lg.x - g.lg.pad) + '" y="' + (g.lg.y - g.lg.pad) + '" width="' + (g.lg.side + 2 * g.lg.pad) + '" height="' + (g.lg.side + 2 * g.lg.pad) + '" fill="' + o.bg + '"/>' +
        '<image x="' + g.lg.x + '" y="' + g.lg.y + '" width="' + g.lg.side + '" height="' + g.lg.side + '" href="' + lc.toDataURL('image/png') + '"/>';
    }
    if (g.lh) s += '<text x="' + W / 2 + '" y="' + (g.m + g.h + g.lp * 0.5 + g.lh * 0.85) + '" font-family="system-ui, sans-serif" font-size="' + g.lh + '" text-anchor="middle" fill="' + o.fg + '">' + esc(o.label) + '</text>';
    return s + '</svg>';
  }

  /* ---- Output actions ---- */
  function fname(ext) { return 'code-' + cur.type + '-' + new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-') + '.' + ext; }
  function download(href, name) { var a = el('a', { href: href, download: name }); document.body.appendChild(a); a.click(); a.remove(); }
  function need() { if (!cur) { toast('Fill in the form first.'); return false; } return true; }
  function toast(s) { var t = $('toast'); t.textContent = s; clearTimeout(toast.t); toast.t = setTimeout(function () { t.textContent = ''; }, 3500); }
  function blob() { return new Promise(function (ok) { cv.toBlob(ok, 'image/png'); }); }
  $('pngBtn').onclick = function () { if (need()) { download(cv.toDataURL('image/png'), fname('png')); toast('PNG saved.'); } };
  $('svgBtn').onclick = function () {
    if (!need()) return; var u = URL.createObjectURL(new Blob([makeSVG()], { type: 'image/svg+xml' }));
    download(u, fname('svg')); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); toast('SVG saved.');
  };
  $('copyBtn').onclick = function () {
    if (!need()) return;
    if (navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob() })]).then(function () { toast('Image copied.'); }, copyText);
    } else copyText();
  };
  function copyText() {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cur.text).then(function () { toast('Image copy not allowed here; copied the code text.'); }, function () { toast('Copy is not allowed here. Use PNG.'); });
    else toast('Copy is not allowed here. Use PNG.');
  }
  if (navigator.share && navigator.canShare) $('shareBtn').hidden = false;
  $('shareBtn').onclick = function () {
    if (!need()) return;
    blob().then(function (b) {
      var f = new File([b], fname('png'), { type: 'image/png' });
      if (navigator.canShare({ files: [f] })) return navigator.share({ files: [f], title: 'Code' });
      return navigator.share({ text: cur.text });
    }).catch(function () {});
  };
  $('printBtn').onclick = function () {
    if (!need()) return;
    var n = Math.max(1, Math.min(60, +$('copies').value || 1)), pa = $('printArea'), src = cv.toDataURL('image/png');
    pa.innerHTML = '';
    for (var i = 0; i < n; i++) pa.appendChild(el('img', { src: src, alt: '' }));
    setTimeout(function () { window.print(); }, 50);
  };

  /* ---- Logo ---- */
  $('logoBtn').onclick = function () { $('logoFile').click(); };
  $('logoFile').onchange = function () {
    var f = this.files[0]; if (!f) return; var img = new Image();
    img.onload = function () { logo = img; $('logoClr').hidden = false; $('ecc').value = 'H'; generate(); };
    img.onerror = function () { toast('That image could not be read.'); };
    var rd = new FileReader(); rd.onload = function () { img.src = rd.result; }; rd.readAsDataURL(f); this.value = '';
  };
  $('logoClr').onclick = function () { logo = null; this.hidden = true; generate(); };

  /* ---- History ---- */
  function hist() { try { return JSON.parse(lsGet(HKEY)) || []; } catch (_) { return []; } }
  function names(t) { var o = $('type').querySelector('option[value="' + t + '"]'); return o ? o.textContent : t; }
  function paintHist() {
    var h = hist(), ul = $('hist'); ul.innerHTML = ''; $('histEmpty').hidden = h.length > 0; $('histClr').hidden = !h.length;
    h.forEach(function (it) {
      var li = el('li'), open = el('button', { type: 'button', class: 'hopen' });
      open.appendChild(el('b', null, names(it.type))); open.appendChild(el('span', null, it.text.replace(/\s+/g, ' ').slice(0, 70)));
      open.appendChild(el('small', null, new Date(it.ts).toLocaleString()));
      open.onclick = function () { load(it); scrollTo({ top: 0, behavior: 'smooth' }); };
      var del = el('button', { type: 'button', class: 'mini', 'aria-label': 'Delete' }, '✕');
      del.onclick = function () { lsSet(HKEY, JSON.stringify(hist().filter(function (x) { return x.id !== it.id; }))); paintHist(); };
      li.appendChild(open); li.appendChild(del); ul.appendChild(li);
    });
  }
  $('saveBtn').onclick = function () {
    if (!need()) return;
    var h = hist().filter(function (x) { return !(x.type === cur.type && x.text === cur.text); });
    h.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: cur.type, vals: cur.vals, opts: cur.opts, text: cur.text });
    if (!lsSet(HKEY, JSON.stringify(h.slice(0, MAXH)))) toast('Could not save (storage full or blocked).'); else toast('Saved to Recent.');
    paintHist();
  };
  $('histClr').onclick = function () { if (confirm('Clear all recent codes on this device?')) { lsSet(HKEY, '[]'); paintHist(); } };

  function load(it) {
    if (!T[it.type]) return;
    $('type').value = it.type; var o = it.opts || {};
    if (o.scale) $('scale').value = o.scale; if (o.ecc) $('ecc').value = o.ecc; if (o.fg) $('fg').value = o.fg; if (o.bg) $('bg').value = o.bg;
    if (o.margin != null) $('margin').value = o.margin; $('label').value = o.label || '';
    buildFields(it.type, it.vals); generate();
  }

  /* ---- Wire up ---- */
  $('type').onchange = function () { buildFields(this.value); generate(); };
  ['scale', 'ecc', 'fg', 'bg', 'margin', 'label'].forEach(function (id) { $(id).addEventListener('input', schedule); });
  if (matchMedia('(min-width: 900px)').matches) $('opts').open = true;
  var last = null; try { last = JSON.parse(lsGet('code_maker_last')); } catch (_) { /* */ }
  if (last && T[last.type]) load(last); else { buildFields('url', { url: 'https://example.com' }); generate(); }
  paintHist();
  window.CodeMaker = { generate: generate, svg: function () { return cur ? makeSVG() : null; }, cur: function () { return cur; }, load: load };
})();
