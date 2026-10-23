/* ============================================================
   FILE: modules/draftly-numfmt.js
   PROJECT: Draftly
   ROLE: Excel number formats → display text (for the .xlsx reader of the Merge tab).
         Numbers: 0 # ? , . % E+00 fractions, thousands, [$€-407] currency, "text", \c, _c, *c,
                  sections pos;neg;zero, simple [>n] conditions, General.
         Dates / times: y m d h s, AM/PM, [h] [m] [s], fractions of a second, English month and
                  day names, 1900 and 1904 date systems (with Excel's fake 29 Feb 1900).
         Format 14 (and other locale short dates) show ISO yyyy-mm-dd: unambiguous in a merge.
   API:  Draftly.numfmt.builtin(id)        → format code or null
         Draftly.numfmt.compile(code)      → { isDate, format(number, date1904) → string }
         Draftly.numfmt.general(number)    → string
   Pure functions: no DOM, no storage.
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.numfmt = (function () {
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var BUILTIN = {
    0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00',
    12: '# ?/?', 13: '# ??/??', 14: 'yyyy-mm-dd', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy',
    18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'yyyy-mm-dd h:mm',
    37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
    41: '#,##0 ;(#,##0)', 42: '"$"#,##0 ;("$"#,##0)', 43: '#,##0.00 ;(#,##0.00)', 44: '"$"#,##0.00 ;("$"#,##0.00)',
    45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@'
  };
  function builtin(id) {
    if (BUILTIN[id] != null) return BUILTIN[id];
    if ((id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return 'yyyy-mm-dd';   /* East Asian date formats */
    return null;
  }

  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }

  /* ---------------------------------------------------------- General */
  function general(x) {
    if (x === 0) return '0';
    var a = Math.abs(x);
    if (a >= 1e15 || a < 1e-6) {
      var e = x.toExponential(5).replace(/\.?0+e/, 'e');   /* 1.23457E+20 like Excel */
      return e.replace('e', 'E').replace(/E([+-])(\d)$/, 'E$10$2');
    }
    var s = String(Number(x.toPrecision(15)));
    if (s.indexOf('e') !== -1) s = Number(x.toPrecision(15)).toFixed(20).replace(/\.?0+$/, '');
    return s;
  }

  /* ---------------------------------------------------------- tokenizer */
  /* Tokens: {t:'lit',v} {t:'dig',c} {t:'dot'} {t:'comma'} {t:'pct'} {t:'exp',sign} {t:'slash'}
     {t:'y'|'mo'|'d'|'h'|'s',n} {t:'ampm',v} {t:'el',u,n} {t:'gen'} {t:'at'} */
  function tokenize(sec) {
    var toks = [], i = 0, n = sec.length, c, j, m, cond = null;
    while (i < n) {
      c = sec.charAt(i);
      if (c === '"') {
        j = sec.indexOf('"', i + 1); if (j < 0) j = n;
        toks.push({ t: 'lit', v: sec.slice(i + 1, j) }); i = j + 1; continue;
      }
      if (c === '\\') { toks.push({ t: 'lit', v: sec.charAt(i + 1) }); i += 2; continue; }
      if (c === '_') { toks.push({ t: 'lit', v: ' ' }); i += 2; continue; }
      if (c === '*') { i += 2; continue; }
      if (c === '[') {
        j = sec.indexOf(']', i); if (j < 0) j = n;
        var body = sec.slice(i + 1, j);
        if (/^(h+|m+|s+)$/i.test(body)) toks.push({ t: 'el', u: body.charAt(0).toLowerCase(), n: body.length });
        else if (body.charAt(0) === '$') {
          var cur = body.slice(1).split('-')[0];
          if (cur) toks.push({ t: 'lit', v: cur });
        } else if ((m = /^(<=|>=|<>|<|>|=)\s*(-?[\d.]+)$/.exec(body))) cond = { op: m[1], n: parseFloat(m[2]) };
        i = j + 1; continue;
      }
      if (/general/i.test(sec.substr(i, 7))) { toks.push({ t: 'gen' }); i += 7; continue; }
      if ((m = /^(am\/pm|a\/p)/i.exec(sec.substr(i, 5)))) { toks.push({ t: 'ampm', v: m[1] }); i += m[1].length; continue; }
      if (/[eE]/.test(c) && /[+-]/.test(sec.charAt(i + 1)) && toks.length) { toks.push({ t: 'exp', sign: sec.charAt(i + 1) }); i += 2; continue; }
      if (/[yYmMdDhHsS]/.test(c)) {
        j = i; while (j < n && sec.charAt(j).toLowerCase() === c.toLowerCase()) j++;
        var k = c.toLowerCase();
        toks.push({ t: k === 'm' ? 'mo' : k, n: j - i }); i = j; continue;
      }
      if (c === '0' || c === '#' || c === '?') { toks.push({ t: 'dig', c: c }); i++; continue; }
      if (c === '.') { toks.push({ t: 'dot' }); i++; continue; }
      if (c === ',') { toks.push({ t: 'comma' }); i++; continue; }
      if (c === '%') { toks.push({ t: 'pct' }); i++; continue; }
      if (c === '/') { toks.push({ t: 'slash' }); i++; continue; }
      if (c === '@') { toks.push({ t: 'at' }); i++; continue; }
      toks.push({ t: 'lit', v: c }); i++;
    }
    return { toks: toks, cond: cond };
  }

  function splitSections(code) {
    var out = [], cur = '', q = false, br = false, i, c;
    for (i = 0; i < code.length; i++) {
      c = code.charAt(i);
      if (c === '\\') { cur += c + code.charAt(i + 1); i++; continue; }
      if (c === '"') q = !q;
      else if (!q && c === '[') br = true;
      else if (!q && c === ']') br = false;
      if (c === ';' && !q && !br) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  function isDateToks(toks) {
    return toks.some(function (t) { return t.t === 'y' || t.t === 'mo' || t.t === 'd' || t.t === 'h' || t.t === 's' || t.t === 'ampm' || t.t === 'el'; });
  }

  /* ---------------------------------------------------------- numbers */
  function roundDec(x, dec) {   /* half away from zero on the decimal text, so 2.675 → 2.68 like Excel */
    var r = Number(Math.round(Number(x + 'e' + dec)) + 'e-' + dec);
    return isFinite(r) ? r : x;
  }
  function group(digits) {
    var out = '', k = 0, i;
    for (i = digits.length - 1; i >= 0; i--) {
      out = digits.charAt(i) + out; k++;
      if (k % 3 === 0 && i > 0) out = ',' + out;
    }
    return out;
  }

  function fmtFraction(toks, x) {
    var si = -1, i;
    for (i = 0; i < toks.length; i++) if (toks[i].t === 'slash') { si = i; break; }
    /* numerator: the run of dig tokens just before the slash; whole part: dig tokens before that */
    var ne = si - 1, ns = ne;
    while (ns > 0 && toks[ns - 1].t === 'dig') ns--;
    var wholeIdx = [], k;
    for (k = 0; k < ns; k++) if (toks[k].t === 'dig') wholeIdx.push(k);
    var nNum = ne - ns + 1;
    var denDigits = 0, fixedDen = '', j = si + 1;
    while (j < toks.length && toks[j].t === 'dig') { denDigits++; j++; }
    if (!denDigits) while (j < toks.length && toks[j].t === 'lit' && /^\d+$/.test(toks[j].v)) { fixedDen += toks[j].v; j++; }
    var hasWhole = wholeIdx.length > 0;
    var whole = hasWhole ? Math.floor(x) : 0, frac = x - whole, p, q;
    if (fixedDen) { q = parseInt(fixedDen, 10); p = Math.round(frac * q); }
    else {
      var maxQ = Math.pow(10, denDigits || 1) - 1, bestErr = Infinity;
      q = 1; p = Math.round(frac);
      for (var d = 1; d <= maxQ; d++) {
        var pn = Math.round(frac * d), err = Math.abs(frac - pn / d);
        if (err < bestErr - 1e-12) { bestErr = err; p = pn; q = d; }
        if (err < 1e-10) break;
      }
    }
    if (p === q && q > 0) { whole += hasWhole ? 1 : 0; p = hasWhole ? 0 : p; if (hasWhole) q = q; }
    var out = '', wholeDone = false;
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (hasWhole && i < ns) {
        if (t.t === 'dig') { if (!wholeDone) { out += (whole === 0 && wholeIdx.every(function (w) { return toks[w].c !== '0'; })) ? '' : String(whole); wholeDone = true; } }
        else if (t.t === 'lit') out += t.v;
      } else if (i >= ns && i <= ne) { if (i === ns) out += (p === 0 && hasWhole) ? pad('', nNum).replace(/0/g, ' ') : pad2(String(p), nNum); }
      else if (t.t === 'slash') out += (p === 0 && hasWhole) ? ' ' : '/';
      else if (i > si && i < j) { if (i === si + 1) out += (p === 0 && hasWhole) ? '' : String(q); }
      else if (t.t === 'lit') out += t.v;
      else if (t.t === 'pct') out += '%';
    }
    return out.replace(/^\s+|\s+$/g, '');
  }
  function pad2(s, w) { while (s.length < w) s = ' ' + s; return s; }

  /* x >= 0 */
  function fmtNumber(toks, x) {
    var i, pct = 0;
    for (i = 0; i < toks.length; i++) if (toks[i].t === 'pct') pct++;
    if (pct) x = Number((x * Math.pow(100, pct)).toPrecision(15));
    var ei = -1;
    for (i = 0; i < toks.length; i++) if (toks[i].t === 'exp') { ei = i; break; }
    if (ei >= 0) return fmtSci(toks, ei, x);
    for (i = 0; i < toks.length; i++) if (toks[i].t === 'slash') return fmtFraction(toks, x);
    var dot = -1;
    for (i = 0; i < toks.length; i++) if (toks[i].t === 'dot') { dot = i; break; }
    var intEnd = dot < 0 ? toks.length : dot;
    var firstDig = -1, lastDig = -1;
    for (i = 0; i < intEnd; i++) if (toks[i].t === 'dig') { if (firstDig < 0) firstDig = i; lastDig = i; }
    var lastAll = -1;
    for (i = 0; i < toks.length; i++) if (toks[i].t === 'dig') lastAll = i;
    var sep = false, scale = 0;
    for (i = 0; i < toks.length; i++) {
      if (toks[i].t !== 'comma') continue;
      if (firstDig >= 0 && i > firstDig && i < lastDig) sep = true;
      else if (lastAll >= 0 && i > lastAll) scale++;
    }
    var dec = 0;
    if (dot >= 0) for (i = dot + 1; i < toks.length; i++) if (toks[i].t === 'dig') dec++;
    if (scale) x = x / Math.pow(1000, scale);
    var s = roundDec(x, dec).toFixed(dec);
    var parts = s.split('.'), intStr = parts[0], decStr = parts[1] || '';
    var intToks = [];
    for (i = 0; i < intEnd; i++) if (toks[i].t === 'dig') intToks.push(i);
    var hasZero = intToks.some(function (k) { return toks[k].c === '0'; });
    if (intStr === '0' && !hasZero) intStr = '';
    var assign = {};
    if (intToks.length) {
      if (sep) {
        var g = group(intStr), need = intToks.length - intStr.length;
        if (need > 0) {   /* pad with zeros / spaces to the placeholder count */
          var padStr = '';
          for (i = intToks.length - 1 - intStr.length; i >= 0; i--) {
            var c0 = toks[intToks[i]].c; padStr = (c0 === '0' ? '0' : c0 === '?' ? ' ' : '') + padStr;
          }
          g = padStr + g;
        }
        assign[intToks[0]] = g;
      } else {
        var rest = intStr, idx;
        for (idx = intToks.length - 1; idx >= 0; idx--) {
          var tk = toks[intToks[idx]];
          if (idx === 0) { assign[intToks[idx]] = rest || (tk.c === '0' ? '0' : tk.c === '?' ? ' ' : ''); break; }
          if (rest.length) { assign[intToks[idx]] = rest.slice(-1); rest = rest.slice(0, -1); }
          else assign[intToks[idx]] = tk.c === '0' ? '0' : tk.c === '?' ? ' ' : '';
        }
      }
    }
    var out = '', di = 0, usedInt = false;
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.t === 'dig') {
        if (i < intEnd) { if (assign[i] != null) { out += assign[i]; usedInt = true; } }
        else {
          var dch = decStr.charAt(di++);
          if (dch === '0' && t.c !== '0' && /^0*$/.test(decStr.slice(di - 1))) dch = t.c === '?' ? ' ' : '';
          out += dch;
        }
      } else if (t.t === 'dot') { if (dec > 0) out += '.'; }
      else if (t.t === 'pct') out += '%';
      else if (t.t === 'lit') out += t.v;
    }
    if (!intToks.length && intStr !== '0' && intStr !== '') out = intStr + out;
    return out;
  }

  function fmtSci(toks, ei, x) {
    var mant = toks.slice(0, ei), expDigits = 0, i, tail = '';
    for (i = ei + 1; i < toks.length; i++) { if (toks[i].t === 'dig') expDigits++; else if (toks[i].t === 'lit') tail += toks[i].v; }
    var dec = 0, afterDot = false;
    mant.forEach(function (t) { if (t.t === 'dot') afterDot = true; else if (t.t === 'dig' && afterDot) dec++; });
    var e = 0, m = x;
    if (x !== 0) {
      e = Math.floor(Math.log10(x)); m = x / Math.pow(10, e);
      if (roundDec(m, dec) >= 10) { e++; m = x / Math.pow(10, e); }
    }
    var mt = fmtNumber(mant, roundDec(m, dec));
    var sign = e < 0 ? '-' : (toks[ei].sign === '+' ? '+' : '');
    return mt + 'E' + sign + pad(Math.abs(e), Math.max(1, expDigits)) + tail;
  }

  /* ---------------------------------------------------------- dates */
  function serialParts(v, date1904, unit) {
    if (v < 0 || v >= 2958466) return null;   /* up to 9999-12-31 */
    var days = Math.floor(v), ms = Math.round((v - days) * 86400000 / unit) * unit;
    if (ms >= 86400000) { days++; ms -= 86400000; }
    var y, mo, d, dow;
    if (date1904) {
      var dt = new Date(Date.UTC(1904, 0, 1) + days * 86400000);
      y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate(); dow = dt.getUTCDay();
    } else if (days === 60) { y = 1900; mo = 2; d = 29; dow = 3; }
    else if (days === 0) { y = 1900; mo = 1; d = 0; dow = 6; }
    else {
      var base = days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
      var dd = new Date(base + days * 86400000);
      y = dd.getUTCFullYear(); mo = dd.getUTCMonth() + 1; d = dd.getUTCDate();
      dow = days < 60 ? (days + 6) % 7 : dd.getUTCDay();
    }
    return { y: y, mo: mo, d: d, dow: dow, h: Math.floor(ms / 3600000), mi: Math.floor(ms / 60000) % 60, s: Math.floor(ms / 1000) % 60, ms: ms % 1000 };
  }

  function fmtDate(toks, v, date1904) {
    var hasFrac = false, ampm = false, i;
    for (i = 0; i < toks.length; i++) {
      if (toks[i].t === 'ampm') ampm = true;
      if (toks[i].t === 'dot' && toks[i + 1] && toks[i + 1].t === 'dig' && prevDate(toks, i) === 's') hasFrac = true;
    }
    var p = serialParts(v, date1904, hasFrac ? 10 : 1000);
    if (!p) return null;
    /* m is minutes after h (or [h]) and before s; otherwise month */
    var isMin = {};
    for (i = 0; i < toks.length; i++) {
      if (toks[i].t !== 'mo') continue;
      var pv = prevDate(toks, i), nx = nextDate(toks, i);
      if (pv === 'h' || pv === 'el-h' || nx === 's' || nx === 'el-s') isMin[i] = true;
    }
    var out = '';
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      switch (t.t) {
        case 'y': out += t.n <= 2 ? pad(p.y % 100, 2) : pad(p.y, 4); break;
        case 'mo':
          if (isMin[i]) out += t.n >= 2 ? pad(p.mi, 2) : String(p.mi);
          else if (t.n === 1) out += p.mo; else if (t.n === 2) out += pad(p.mo, 2);
          else if (t.n === 3) out += MONTHS[p.mo - 1].slice(0, 3);
          else if (t.n === 4) out += MONTHS[p.mo - 1]; else out += MONTHS[p.mo - 1].charAt(0);
          break;
        case 'd':
          if (t.n === 1) out += p.d; else if (t.n === 2) out += pad(p.d, 2);
          else if (t.n === 3) out += DAYS[p.dow].slice(0, 3); else out += DAYS[p.dow];
          break;
        case 'h': { var hh = ampm ? (p.h % 12 || 12) : p.h; out += t.n >= 2 ? pad(hh, 2) : String(hh); break; }
        case 's': out += t.n >= 2 ? pad(p.s, 2) : String(p.s); break;
        case 'ampm': {
          var pm = p.h >= 12, txt = t.v.length > 3 ? (pm ? 'PM' : 'AM') : (pm ? 'P' : 'A');
          out += t.v === t.v.toLowerCase() ? txt.toLowerCase() : txt; break;
        }
        case 'el': {
          var tot = t.u === 'h' ? Math.floor(v * 24 + 1e-9) : t.u === 'm' ? Math.floor(v * 1440 + 1e-9) : Math.floor(v * 86400 + 1e-9);
          out += pad(tot, t.n); break;
        }
        case 'dot':
          if (toks[i + 1] && toks[i + 1].t === 'dig' && prevDate(toks, i) === 's') {
            var nd = 0; while (toks[i + 1 + nd] && toks[i + 1 + nd].t === 'dig') nd++;
            out += '.' + pad(p.ms, 3).slice(0, nd); i += nd;
          } else out += '.';
          break;
        case 'lit': out += t.v; break;
        case 'slash': out += '/'; break;
        case 'comma': out += ','; break;
        case 'pct': out += '%'; break;
        default: break;
      }
    }
    return out;
  }
  function dateKind(t) { return t.t === 'el' ? 'el-' + t.u : (t.t === 'y' || t.t === 'mo' || t.t === 'd' || t.t === 'h' || t.t === 's') ? t.t : null; }
  function prevDate(toks, i) { for (var k = i - 1; k >= 0; k--) { var d = dateKind(toks[k]); if (d) return d; } return null; }
  function nextDate(toks, i) { for (var k = i + 1; k < toks.length; k++) { var d = dateKind(toks[k]); if (d) return d; } return null; }

  /* ---------------------------------------------------------- compile */
  function condOk(c, v) {
    switch (c.op) {
      case '<': return v < c.n; case '>': return v > c.n; case '<=': return v <= c.n;
      case '>=': return v >= c.n; case '=': return v === c.n; default: return v !== c.n;
    }
  }

  var cache = {};
  function compile(code) {
    if (cache[code]) return cache[code];
    var secs = splitSections(code).map(function (s) { return tokenize(s); });
    var anyDate = secs.some(function (s) { return isDateToks(s.toks); });
    var hasCond = secs.some(function (s) { return s.cond; });
    var res = {
      isDate: anyDate,
      format: function (v, date1904) {
        if (!isFinite(v)) return String(v);
        var si = 0, neg = v < 0, x = Math.abs(v);
        if (hasCond) {
          si = -1;
          secs.forEach(function (s, k) { if (si < 0 && s.cond && condOk(s.cond, v)) si = k; });
          if (si < 0) { secs.forEach(function (s, k) { if (si < 0 && !s.cond) si = k; }); if (si < 0) si = secs.length - 1; }
          neg = neg && si === 0;
        } else if (secs.length >= 2 && v < 0) { si = 1; neg = false; }
        else if (secs.length >= 3 && v === 0) si = 2;
        var toks = secs[si].toks;
        if (isDateToks(toks)) {
          var r = fmtDate(toks, v, !!date1904);
          return r == null ? general(v) : r;
        }
        var only = toks.filter(function (t) { return t.t !== 'lit'; });
        if (!only.length || only.every(function (t) { return t.t === 'at' || t.t === 'gen'; })) {
          var lits = '', gen = false;
          toks.forEach(function (t) { if (t.t === 'lit') lits += t.v; });
          toks.forEach(function (t) { if (t.t === 'gen' || t.t === 'at') gen = true; });
          if (gen) {   /* literals before / after General */
            var before = '', after = '', seen = false;
            toks.forEach(function (t) { if (t.t === 'gen' || t.t === 'at') seen = true; else if (t.t === 'lit') { if (seen) after += t.v; else before += t.v; } });
            return before + general(neg ? -x : x) + after;
          }
          return lits;
        }
        return (neg ? '-' : '') + fmtNumber(toks, x);
      }
    };
    cache[code] = res;
    return res;
  }

  return { builtin: builtin, compile: compile, general: general };
})();
