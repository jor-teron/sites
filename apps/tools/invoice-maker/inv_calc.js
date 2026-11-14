/* Invoice Maker INV1 — pure helpers (GST split, totals, round-off, amount in
   words, FY numbering). No DOM. Used by invoice-maker.js and test_inv_calc.js. */
'use strict';

var InvCalc = (function () {
  var GST_RATES = [0, 5, 12, 18, 28];

  var STATES = [
    { code: '01', name: 'Jammu and Kashmir' },
    { code: '02', name: 'Himachal Pradesh' },
    { code: '03', name: 'Punjab' },
    { code: '04', name: 'Chandigarh' },
    { code: '05', name: 'Uttarakhand' },
    { code: '06', name: 'Haryana' },
    { code: '07', name: 'Delhi' },
    { code: '08', name: 'Rajasthan' },
    { code: '09', name: 'Uttar Pradesh' },
    { code: '10', name: 'Bihar' },
    { code: '11', name: 'Sikkim' },
    { code: '12', name: 'Arunachal Pradesh' },
    { code: '13', name: 'Nagaland' },
    { code: '14', name: 'Manipur' },
    { code: '15', name: 'Mizoram' },
    { code: '16', name: 'Tripura' },
    { code: '17', name: 'Meghalaya' },
    { code: '18', name: 'Assam' },
    { code: '19', name: 'West Bengal' },
    { code: '20', name: 'Jharkhand' },
    { code: '21', name: 'Odisha' },
    { code: '22', name: 'Chhattisgarh' },
    { code: '23', name: 'Madhya Pradesh' },
    { code: '24', name: 'Gujarat' },
    { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
    { code: '27', name: 'Maharashtra' },
    { code: '29', name: 'Karnataka' },
    { code: '30', name: 'Goa' },
    { code: '31', name: 'Lakshadweep' },
    { code: '32', name: 'Kerala' },
    { code: '33', name: 'Tamil Nadu' },
    { code: '34', name: 'Puducherry' },
    { code: '35', name: 'Andaman and Nicobar Islands' },
    { code: '36', name: 'Telangana' },
    { code: '37', name: 'Andhra Pradesh' },
    { code: '38', name: 'Ladakh' },
    { code: '97', name: 'Other Territory' }
  ];

  var ALIASES = {
    'j&k': '01', 'jk': '01', 'jammu & kashmir': '01',
    'hp': '02',
    'ua': '05', 'uttaranchal': '05',
    'nct of delhi': '07', 'nct delhi': '07', 'new delhi': '07',
    'up': '09',
    'orissa': '21',
    'mp': '23',
    'daman and diu': '26', 'dadra and nagar haveli': '26', 'dnh': '26', 'dnhdd': '26',
    'mh': '27',
    'ka': '29',
    'tn': '33',
    'pondicherry': '34',
    'an islands': '35', 'andaman': '35',
    'ap': '37',
    'wb': '19'
  };

  var ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  var UNITS = ['Nos', 'Pcs', 'Kg', 'g', 'Ltr', 'Mtr', 'Box', 'Hrs', 'Day', 'Sq.ft', 'Set', 'Pack', 'Quintal', 'Ton'];

  var DOC_TYPES = [
    { id: 'tax-invoice', label: 'Tax Invoice', title: 'TAX INVOICE', prefix: 'INV' },
    { id: 'quote', label: 'Quote / Estimate', title: 'QUOTE', prefix: 'QT' },
    { id: 'receipt', label: 'Receipt', title: 'RECEIPT', prefix: 'RCT' },
    { id: 'bill-of-supply', label: 'Bill of Supply', title: 'BILL OF SUPPLY', prefix: 'BOS' }
  ];

  function num(n) {
    if (n == null || n === '') return 0;
    var v = Number(n);
    return isFinite(v) ? v : 0;
  }

  function round2(n) {
    n = num(n);
    return Math.round((n + (n >= 0 ? 1e-8 : -1e-8)) * 100) / 100;
  }

  function toPaise(n) {
    return Math.round(round2(n) * 100);
  }

  function fromPaise(p) {
    return (p || 0) / 100;
  }

  function money(n) {
    return fromPaise(toPaise(n));
  }

  function parseDate(d) {
    if (d instanceof Date && !isNaN(d.getTime())) return d;
    if (typeof d === 'string') {
      var m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    return null;
  }

  function financialYear(d) {
    var dt = parseDate(d);
    if (!dt) dt = new Date();
    var y = dt.getFullYear();
    var start = dt.getMonth() >= 3 ? y : y - 1;
    return {
      start: start,
      end: start + 1,
      label: String(start) + '-' + String(start + 1).slice(-2)
    };
  }

  function normalizePrefix(prefix) {
    var p = String(prefix == null ? 'INV' : prefix).trim();
    p = p.replace(/\/+$/, '');
    return p || 'INV';
  }

  function padNum(n, width) {
    var s = String(Math.max(0, Math.floor(num(n))));
    width = Math.max(1, num(width) || 3);
    while (s.length < width) s = '0' + s;
    return s;
  }

  function formatNumber(prefix, fyLabel, seq, width) {
    prefix = normalizePrefix(prefix);
    fyLabel = String(fyLabel || '').trim();
    seq = Math.max(1, Math.floor(num(seq)) || 1);
    var digits = String(seq);
    width = Math.max(num(width) || 3, digits.length);
    return prefix + '/' + fyLabel + '/' + padNum(seq, width);
  }

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function parseNumber(s) {
    s = String(s || '').trim();
    var m = s.match(/^(.+)\/(\d{4}-\d{2})\/(\d+)$/);
    if (!m) return null;
    return { prefix: m[1], fy: m[2], seq: parseInt(m[3], 10) };
  }

  function nextNumber(prefix, fyLabel, usedNumbers, width) {
    prefix = normalizePrefix(prefix);
    fyLabel = String(fyLabel || '').trim();
    width = num(width) || 3;
    var re = new RegExp('^' + escapeRe(prefix) + '/' + escapeRe(fyLabel) + '/(\\d+)$', 'i');
    var max = 0;
    (usedNumbers || []).forEach(function (n) {
      var m = String(n || '').trim().match(re);
      if (m) {
        var v = parseInt(m[1], 10);
        if (v > max) max = v;
      }
    });
    return formatNumber(prefix, fyLabel, max + 1, width);
  }

  function stateCode(s) {
    if (s == null) return '';
    s = String(s).trim();
    if (!s) return '';
    if (/^\d{2}$/.test(s)) return s;
    var lower = s.toLowerCase();
    if (ALIASES[lower]) return ALIASES[lower];
    var i;
    for (i = 0; i < STATES.length; i++) {
      if (STATES[i].name.toLowerCase() === lower) return STATES[i].code;
    }
    return '';
  }

  function stateName(s) {
    var c = stateCode(s);
    var i;
    if (c) {
      for (i = 0; i < STATES.length; i++) {
        if (STATES[i].code === c) return STATES[i].name;
      }
    }
    return String(s || '').trim();
  }

  function sameState(a, b) {
    var ca = stateCode(a), cb = stateCode(b);
    return !!ca && !!cb && ca === cb;
  }

  function lineAmounts(item) {
    item = item || {};
    var qty = num(item.qty);
    var rate = num(item.rate);
    var disc = num(item.discount);
    var gst = num(item.gstPct);
    if (qty < 0) qty = 0;
    if (rate < 0) rate = 0;
    if (disc < 0) disc = 0;
    if (gst < 0) gst = 0;
    var grossP = Math.round(qty * rate * 100);
    if (grossP < 0) grossP = 0;
    var discP = toPaise(disc);
    if (discP > grossP) discP = grossP;
    var taxableP = grossP - discP;
    var taxP = Math.round(taxableP * gst / 100);
    return {
      qty: qty,
      rate: money(rate),
      gross: fromPaise(grossP),
      discount: fromPaise(discP),
      taxable: fromPaise(taxableP),
      gstPct: gst,
      tax: fromPaise(taxP),
      total: fromPaise(taxableP + taxP),
      taxableP: taxableP,
      taxP: taxP
    };
  }

  function splitTaxPaise(taxP, intraState) {
    taxP = Math.round(num(taxP));
    if (taxP < 0) taxP = 0;
    if (intraState) {
      var half = Math.round(taxP / 2);
      var other = taxP - half;
      return { cgstP: half, sgstP: other, igstP: 0, taxP: taxP };
    }
    return { cgstP: 0, sgstP: 0, igstP: taxP, taxP: taxP };
  }

  function splitTax(taxable, gstPct, intraState) {
    var taxableP = toPaise(taxable);
    var taxP = Math.round(taxableP * num(gstPct) / 100);
    var s = splitTaxPaise(taxP, intraState);
    return {
      cgst: fromPaise(s.cgstP),
      sgst: fromPaise(s.sgstP),
      igst: fromPaise(s.igstP),
      tax: fromPaise(s.taxP)
    };
  }

  function invoiceTotals(items, opts) {
    opts = opts || {};
    var intra = sameState(opts.sellerState, opts.placeOfSupply);
    var noTax = opts.docType === 'bill-of-supply';
    var lines = [];
    var taxableP = 0, cgstP = 0, sgstP = 0, igstP = 0, discountP = 0, grossP = 0;
    var groups = {};
    (items || []).forEach(function (it, i) {
      var copy = {
        description: it && it.description != null ? String(it.description) : '',
        hsn: it && it.hsn != null ? String(it.hsn) : '',
        qty: it && it.qty,
        unit: it && it.unit != null ? String(it.unit) : 'Nos',
        rate: it && it.rate,
        discount: it && it.discount,
        gstPct: noTax ? 0 : (it && it.gstPct)
      };
      var a = lineAmounts(copy);
      var split = splitTaxPaise(a.taxP, intra);
      var row = {
        index: i,
        description: copy.description,
        hsn: copy.hsn,
        qty: a.qty,
        unit: copy.unit,
        rate: a.rate,
        discount: a.discount,
        taxable: a.taxable,
        gstPct: a.gstPct,
        cgst: fromPaise(split.cgstP),
        sgst: fromPaise(split.sgstP),
        igst: fromPaise(split.igstP),
        tax: fromPaise(split.taxP),
        total: a.total
      };
      lines.push(row);
      if (!copy.description && !a.qty && !a.rate && !a.discount) return;
      grossP += toPaise(a.gross);
      discountP += toPaise(a.discount);
      taxableP += a.taxableP;
      cgstP += split.cgstP;
      sgstP += split.sgstP;
      igstP += split.igstP;
      var key = String(a.gstPct);
      if (!groups[key]) groups[key] = { gstPct: a.gstPct, taxableP: 0, cgstP: 0, sgstP: 0, igstP: 0 };
      groups[key].taxableP += a.taxableP;
      groups[key].cgstP += split.cgstP;
      groups[key].sgstP += split.sgstP;
      groups[key].igstP += split.igstP;
    });
    var taxP = cgstP + sgstP + igstP;
    var grandP = taxableP + taxP;
    var roundOffP = 0;
    if (opts.roundOff !== false) {
      var roundedP = Math.round(grandP / 100) * 100;
      roundOffP = roundedP - grandP;
      grandP = roundedP;
    }
    var summary = Object.keys(groups).map(function (k) {
      var g = groups[k];
      return {
        gstPct: g.gstPct,
        taxable: fromPaise(g.taxableP),
        cgst: fromPaise(g.cgstP),
        sgst: fromPaise(g.sgstP),
        igst: fromPaise(g.igstP),
        tax: fromPaise(g.cgstP + g.sgstP + g.igstP)
      };
    }).sort(function (a, b) { return a.gstPct - b.gstPct; });
    return {
      lines: lines,
      intraState: intra,
      gross: fromPaise(grossP),
      discount: fromPaise(discountP),
      taxable: fromPaise(taxableP),
      cgst: fromPaise(cgstP),
      sgst: fromPaise(sgstP),
      igst: fromPaise(igstP),
      tax: fromPaise(taxP),
      roundOff: fromPaise(roundOffP),
      grand: fromPaise(grandP),
      summary: summary,
      words: amountInWords(fromPaise(grandP))
    };
  }

  function twoDigits(n) {
    n = Math.floor(n);
    if (n < 20) return ONES[n];
    var t = TENS[Math.floor(n / 10)];
    var o = ONES[n % 10];
    return o ? t + ' ' + o : t;
  }

  function threeDigits(n) {
    n = Math.floor(n);
    var h = Math.floor(n / 100);
    var r = n % 100;
    var s = h ? ONES[h] + ' Hundred' : '';
    if (r) s += (s ? ' ' : '') + twoDigits(r);
    return s;
  }

  function rupeesWords(n) {
    n = Math.floor(n);
    if (n === 0) return 'Zero';
    var parts = [];
    var crore = Math.floor(n / 10000000);
    if (crore) {
      parts.push(rupeesWords(crore) + ' Crore');
      n %= 10000000;
    }
    var lakh = Math.floor(n / 100000);
    if (lakh) {
      parts.push(twoDigits(lakh) + ' Lakh');
      n %= 100000;
    }
    var thousand = Math.floor(n / 1000);
    if (thousand) {
      parts.push(twoDigits(thousand) + ' Thousand');
      n %= 1000;
    }
    if (n) parts.push(threeDigits(n));
    return parts.join(' ');
  }

  function amountInWords(n) {
    n = num(n);
    if (!isFinite(n)) n = 0;
    var sign = n < 0;
    var paise = Math.round(Math.abs(n) * 100);
    var rupees = Math.floor(paise / 100);
    paise = paise % 100;
    var s = 'Rupees ' + rupeesWords(rupees);
    if (paise) s += ' and Paise ' + twoDigits(paise);
    s += ' Only';
    if (sign) s = 'Minus ' + s;
    return s;
  }

  function formatInr(n, withSymbol) {
    var v = round2(n);
    var sign = v < 0 ? '-' : '';
    v = Math.abs(v);
    var parts = v.toFixed(2).split('.');
    var int = parts[0];
    var last3 = int.slice(-3);
    var rest = int.slice(0, -3);
    if (rest) {
      rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      int = rest + ',' + last3;
    }
    var out = sign + int + '.' + parts[1];
    return withSymbol === false ? out : '₹' + out;
  }

  function upiUrl(opts) {
    opts = opts || {};
    var pa = String(opts.pa || opts.upi || '').trim();
    if (!pa) return '';
    var q = ['pa=' + encodeURIComponent(pa), 'cu=INR'];
    if (opts.pn) q.push('pn=' + encodeURIComponent(String(opts.pn)));
    if (opts.am != null && opts.am !== '' && isFinite(Number(opts.am))) {
      q.push('am=' + Number(opts.am).toFixed(2));
    }
    if (opts.tn) q.push('tn=' + encodeURIComponent(String(opts.tn)));
    return 'upi://pay?' + q.join('&');
  }

  function docTypeInfo(id) {
    var i;
    for (i = 0; i < DOC_TYPES.length; i++) {
      if (DOC_TYPES[i].id === id) return DOC_TYPES[i];
    }
    return DOC_TYPES[0];
  }

  function gstinLooksOk(s) {
    s = String(s || '').trim().toUpperCase();
    if (!s) return true;
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s);
  }

  return {
    GST_RATES: GST_RATES,
    STATES: STATES,
    UNITS: UNITS,
    DOC_TYPES: DOC_TYPES,
    num: num,
    round2: round2,
    money: money,
    toPaise: toPaise,
    fromPaise: fromPaise,
    parseDate: parseDate,
    financialYear: financialYear,
    normalizePrefix: normalizePrefix,
    formatNumber: formatNumber,
    parseNumber: parseNumber,
    nextNumber: nextNumber,
    stateCode: stateCode,
    stateName: stateName,
    sameState: sameState,
    lineAmounts: lineAmounts,
    splitTax: splitTax,
    invoiceTotals: invoiceTotals,
    amountInWords: amountInWords,
    formatInr: formatInr,
    upiUrl: upiUrl,
    docTypeInfo: docTypeInfo,
    gstinLooksOk: gstinLooksOk
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = InvCalc;
