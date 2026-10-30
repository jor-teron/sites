/* code-maker_types.js (QR1): one entry per code type.
   fields: [id, label, kind, placeholder]; build(v) returns { bcid, text } or throws Error(friendly message). */
(function () {
  'use strict';
  function req(v, k, name) { var s = (v[k] || '').trim(); if (!s) throw new Error(name + ' is needed.'); return s; }
  function wifiEsc(s) { return s.replace(/([\\;,:"])/g, '\\$1'); }
  function vEsc(s) { return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
  function digits(s) { return s.replace(/[\s-]/g, ''); }
  /* GS1 mod-10 check digit for the body (no check digit). */
  function gs1(body) {
    var sum = 0;
    for (var i = body.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += (+body[i]) * w;
    return String((10 - sum % 10) % 10);
  }
  function gtin(v, len, name) {
    var s = digits(req(v, 'code', name + ' number'));
    if (!/^\d+$/.test(s)) throw new Error(name + ' takes digits only.');
    if (s.length === len - 1) return { bcid: null, text: s + gs1(s), note: 'Check digit ' + gs1(s) + ' added.' };
    if (s.length !== len) throw new Error(name + ' needs ' + (len - 1) + ' digits (check digit added) or ' + len + ' digits.');
    var want = gs1(s.slice(0, -1));
    if (s.slice(-1) !== want) throw new Error('Wrong check digit: last digit should be ' + want + ', not ' + s.slice(-1) + '.');
    return { text: s };
  }
  function icsDate(d) { return d ? d.replace(/[-:]/g, '').slice(0, 13) + '00' : ''; }

  var T = {
    text: { group: 'qr', fields: [['text', 'Text', 'area', 'Any text']], build: function (v) { return { text: req(v, 'text', 'Text') }; } },
    url: { group: 'qr', fields: [['url', 'Website link', 'url', 'https://example.com']], build: function (v) {
      var u = req(v, 'url', 'Link'); if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u; return { text: u }; } },
    wifi: { group: 'qr', fields: [['ssid', 'Network name (SSID)', 'text', 'MyWiFi'], ['pass', 'Password', 'text', ''],
      ['sec', 'Security', 'select:WPA=WPA/WPA2/WPA3|WEP=WEP|nopass=None (open)'], ['hidden', 'Hidden network', 'check']],
      build: function (v) {
        var s = req(v, 'ssid', 'Network name'), sec = v.sec || 'WPA';
        if (sec !== 'nopass' && !(v.pass || '')) throw new Error('Password is needed (or pick None).');
        return { text: 'WIFI:T:' + sec + ';S:' + wifiEsc(s) + ';' + (sec !== 'nopass' ? 'P:' + wifiEsc(v.pass) + ';' : '') + (v.hidden ? 'H:true;' : '') + ';' };
      } },
    vcard: { group: 'qr', fields: [['first', 'First name', 'text', ''], ['last', 'Last name', 'text', ''], ['phone', 'Phone', 'tel', '+91…'],
      ['email', 'Email', 'email', ''], ['org', 'Company', 'text', ''], ['title', 'Job title', 'text', ''], ['web', 'Website', 'url', ''], ['addr', 'Address', 'text', '']],
      build: function (v) {
        var f = (v.first || '').trim(), l = (v.last || '').trim();
        if (!f && !l) throw new Error('A name is needed.');
        var L = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + vEsc(l) + ';' + vEsc(f) + ';;;', 'FN:' + vEsc((f + ' ' + l).trim())];
        if (v.org) L.push('ORG:' + vEsc(v.org)); if (v.title) L.push('TITLE:' + vEsc(v.title));
        if (v.phone) L.push('TEL;TYPE=CELL:' + v.phone.trim()); if (v.email) L.push('EMAIL:' + v.email.trim());
        if (v.web) L.push('URL:' + v.web.trim()); if (v.addr) L.push('ADR:;;' + vEsc(v.addr) + ';;;;');
        L.push('END:VCARD'); return { text: L.join('\r\n') };
      } },
    tel: { group: 'qr', fields: [['phone', 'Phone number', 'tel', '+91 98xxxxxxxx']], build: function (v) {
      var p = req(v, 'phone', 'Phone number').replace(/[^\d+]/g, ''); if (p.length < 3) throw new Error('Phone number looks too short.'); return { text: 'tel:' + p }; } },
    sms: { group: 'qr', fields: [['phone', 'Phone number', 'tel', ''], ['msg', 'Message', 'area', '']], build: function (v) {
      return { text: 'SMSTO:' + req(v, 'phone', 'Phone number').replace(/[^\d+]/g, '') + ':' + (v.msg || '') }; } },
    email: { group: 'qr', fields: [['to', 'To', 'email', 'name@example.com'], ['subj', 'Subject', 'text', ''], ['body', 'Message', 'area', '']],
      build: function (v) {
        var to = req(v, 'to', 'Email address'); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error('Email address looks wrong.');
        var q = []; if (v.subj) q.push('subject=' + encodeURIComponent(v.subj)); if (v.body) q.push('body=' + encodeURIComponent(v.body));
        return { text: 'mailto:' + to + (q.length ? '?' + q.join('&') : '') };
      } },
    geo: { group: 'qr', fields: [['lat', 'Latitude', 'text', '26.1445'], ['lng', 'Longitude', 'text', '91.7362'], ['here', 'Use my location', 'button']],
      build: function (v) {
        var a = parseFloat(v.lat), b = parseFloat(v.lng);
        if (isNaN(a) || a < -90 || a > 90) throw new Error('Latitude must be a number from -90 to 90.');
        if (isNaN(b) || b < -180 || b > 180) throw new Error('Longitude must be a number from -180 to 180.');
        return { text: 'geo:' + a + ',' + b };
      } },
    event: { group: 'qr', fields: [['sum', 'Title', 'text', ''], ['start', 'Starts', 'datetime-local'], ['end', 'Ends', 'datetime-local'], ['loc', 'Place', 'text', ''], ['desc', 'Notes', 'area', '']],
      build: function (v) {
        var s = req(v, 'sum', 'Title'); if (!v.start) throw new Error('Start time is needed.');
        if (v.end && v.end < v.start) throw new Error('End is before start.');
        var L = ['BEGIN:VEVENT', 'SUMMARY:' + vEsc(s), 'DTSTART:' + icsDate(v.start)];
        if (v.end) L.push('DTEND:' + icsDate(v.end)); if (v.loc) L.push('LOCATION:' + vEsc(v.loc)); if (v.desc) L.push('DESCRIPTION:' + vEsc(v.desc));
        L.push('END:VEVENT'); return { text: L.join('\r\n') };
      } },
    upi: { group: 'qr', fields: [['pa', 'UPI ID', 'text', 'name@bank'], ['pn', 'Payee name', 'text', ''], ['am', 'Amount (₹, optional)', 'number', ''], ['tn', 'Note', 'text', '']],
      build: function (v) {
        var pa = req(v, 'pa', 'UPI ID'); if (!/^[\w.\-]{2,}@[a-zA-Z][\w.\-]*$/.test(pa)) throw new Error('UPI ID should look like name@bank.');
        var q = 'pa=' + encodeURIComponent(pa).replace(/%40/g, '@'); if (v.pn) q += '&pn=' + encodeURIComponent(v.pn.trim());
        if (v.am) { var a = +v.am; if (!(a > 0)) throw new Error('Amount must be more than 0.'); q += '&am=' + a.toFixed(2); }
        q += '&cu=INR'; if (v.tn) q += '&tn=' + encodeURIComponent(v.tn.trim());
        return { text: 'upi://pay?' + q };
      } },
    ean13: { group: '1d', bcid: 'ean13', fields: [['code', 'EAN-13 number', 'num', '12 or 13 digits']], build: function (v) { return gtin(v, 13, 'EAN-13'); } },
    ean8: { group: '1d', bcid: 'ean8', fields: [['code', 'EAN-8 number', 'num', '7 or 8 digits']], build: function (v) { return gtin(v, 8, 'EAN-8'); } },
    upca: { group: '1d', bcid: 'upca', fields: [['code', 'UPC-A number', 'num', '11 or 12 digits']], build: function (v) { return gtin(v, 12, 'UPC-A'); } },
    itf14: { group: '1d', bcid: 'itf14', fields: [['code', 'ITF-14 number', 'num', '13 or 14 digits']], build: function (v) { return gtin(v, 14, 'ITF-14'); } },
    code128: { group: '1d', bcid: 'code128', fields: [['code', 'Text', 'text', 'ABC-123']], build: function (v) {
      var s = req(v, 'code', 'Text'); if (/[^\x00-\x7f]/.test(s)) throw new Error('Code 128 takes plain ASCII letters numbers and symbols only.'); return { text: s }; } },
    code39: { group: '1d', bcid: 'code39', fields: [['code', 'Text', 'text', 'ABC-123']], build: function (v) {
      var s = req(v, 'code', 'Text').toUpperCase(); if (!/^[0-9A-Z \-.$\/+%]+$/.test(s)) throw new Error('Code 39 takes A-Z 0-9 space and - . $ / + % only.'); return { text: s }; } },
    codabar: { group: '1d', bcid: 'rationalizedCodabar', fields: [['code', 'Number', 'text', 'A12345B']], build: function (v) {
      var s = req(v, 'code', 'Number').toUpperCase();
      if (!/^[ABCD]/.test(s)) s = 'A' + s; if (!/[ABCD]$/.test(s) || s.length < 3) s = s + 'B';
      if (!/^[ABCD][0-9\-$:\/.+]+[ABCD]$/.test(s)) throw new Error('Codabar takes 0-9 and - $ : / . + between start/stop letters A-D.');
      return { text: s }; } },
    datamatrix: { group: '2d', bcid: 'datamatrix', fields: [['text', 'Text', 'area', '']], build: function (v) { return { text: req(v, 'text', 'Text') }; } },
    pdf417: { group: '2d', bcid: 'pdf417', fields: [['text', 'Text', 'area', '']], build: function (v) { return { text: req(v, 'text', 'Text') }; } },
    aztec: { group: '2d', bcid: 'azteccode', fields: [['text', 'Text', 'area', '']], build: function (v) { return { text: req(v, 'text', 'Text') }; } }
  };
  window.CodeTypes = T;
  window.CodeTypesUtil = { gs1: gs1 };
})();
