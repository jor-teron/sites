/*
 * spreadsheet_spellnumber.js  (SH29)
 * Pure SPELLNUMBER wording: WORLD, INR, USA, UK.
 * Loads in the browser (script tag) and in Node (module.exports).
 * INDIA is accepted as a quiet alias for INR. No style appends " only".
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SPELLNUMBER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ERR_VALUE = "#VALUE!";
  var ERR_NUM = "#NUM!";
  var STYLE_HINT = "SPELLNUMBER style: WORLD, INR, USA or UK";
  var MAX = 1e15;

  var ONES = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen"
  ];
  var TENS = [
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"
  ];
  var SCALES = [
    { v: 1e12, w: "trillion" },
    { v: 1e9, w: "billion" },
    { v: 1e6, w: "million" },
    { v: 1e3, w: "thousand" }
  ];

  function cap(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function belowHundred(n) {
    if (n < 20) return ONES[n];
    var t = Math.floor(n / 10), u = n % 10;
    if (u === 0) return TENS[t];
    return TENS[t] + "-" + ONES[u];
  }

  function belowThousand(n, withAnd) {
    if (n < 100) return belowHundred(n);
    var h = Math.floor(n / 100), r = n % 100;
    var s = ONES[h] + " hundred";
    if (r) s += (withAnd ? " and " : " ") + belowHundred(r);
    return s;
  }

  function shortScale(n, withAnd) {
    if (n === 0) return "zero";
    var parts = [], rest = n, i, q;
    for (i = 0; i < SCALES.length; i++) {
      q = Math.floor(rest / SCALES[i].v);
      if (q) {
        parts.push(belowThousand(q, withAnd) + " " + SCALES[i].w);
        rest = rest % SCALES[i].v;
      }
    }
    if (rest) parts.push(belowThousand(rest, withAnd));
    return parts.join(" ");
  }

  function indiaInt(n) {
    if (n === 0) return "zero";
    var parts = [], crore, rest, lakh, thousand;
    crore = Math.floor(n / 10000000);
    rest = n % 10000000;
    if (crore) {
      parts.push((crore < 1000 ? belowThousand(crore, false) : indiaInt(crore)) + " crore");
    }
    lakh = Math.floor(rest / 100000);
    rest = rest % 100000;
    if (lakh) parts.push(belowThousand(lakh, false) + " lakh");
    thousand = Math.floor(rest / 1000);
    rest = rest % 1000;
    if (thousand) parts.push(belowThousand(thousand, false) + " thousand");
    if (rest) parts.push(belowThousand(rest, false));
    return parts.join(" ");
  }

  function toPlainDecimal(n) {
    var s, parts, coeff, exp, sign, digits, dot, point, i, out;
    s = String(n);
    if (s.indexOf("e") === -1 && s.indexOf("E") === -1) return s;
    parts = s.split(/e/i);
    coeff = parts[0];
    exp = parseInt(parts[1], 10);
    sign = "";
    if (coeff.charAt(0) === "-") {
      sign = "-";
      coeff = coeff.slice(1);
    }
    dot = coeff.indexOf(".");
    digits = coeff.replace(".", "");
    if (dot < 0) dot = coeff.length;
    point = dot + exp;
    if (point <= 0) {
      out = "0.";
      for (i = 0; i < -point; i++) out += "0";
      return sign + out + digits;
    }
    if (point >= digits.length) {
      out = digits;
      for (i = 0; i < point - digits.length; i++) out += "0";
      return sign + out;
    }
    return sign + digits.slice(0, point) + "." + digits.slice(point);
  }

  function cleanAbs(n) {
    return Number(Math.abs(n).toPrecision(15));
  }

  function fracDigits(plain) {
    var i = plain.indexOf(".");
    var frac;
    if (i < 0) return "";
    frac = plain.slice(i + 1).replace(/0+$/, "");
    return frac;
  }

  /* String-safe half-up rounding to 2 decimal places, as an integer cent count. */
  function roundToCents(abs) {
    var s = toPlainDecimal(abs);
    var parts = s.split(".");
    var whole = parts[0];
    var frac = parts[1] || "";
    var cents = parseInt((frac.charAt(0) || "0") + (frac.charAt(1) || "0"), 10);
    var next = frac.charAt(2) || "0";
    var major = parseInt(whole, 10);
    if (next >= "5") cents += 1;
    if (cents >= 100) {
      major += 1;
      cents -= 100;
    }
    return major * 100 + cents;
  }

  function moneyWords(centsTotal, majorWord, majorPlural, minorWord, minorPlural, intFn) {
    var major = Math.floor(centsTotal / 100);
    var minor = centsTotal % 100;
    var maj, min;
    if (centsTotal === 0) return "zero " + majorPlural;
    if (major && minor) {
      maj = intFn(major) + " " + (major === 1 ? majorWord : majorPlural);
      min = intFn(minor) + " " + (minor === 1 ? minorWord : minorPlural);
      return maj + " and " + min;
    }
    if (major) return intFn(major) + " " + (major === 1 ? majorWord : majorPlural);
    return intFn(minor) + " " + (minor === 1 ? minorWord : minorPlural);
  }

  function normStyle(style) {
    var s = style == null ? "" : String(style).trim().toUpperCase();
    if (s === "" || s === "WORLD") return "WORLD";
    if (s === "INR" || s === "INDIA") return "INR";
    if (s === "USA") return "USA";
    if (s === "UK") return "UK";
    return null;
  }

  function isNumeric(n) {
    return typeof n === "number" && !isNaN(n);
  }

  function spell(number, style) {
    var n, abs, sign, kind, words, cents, plain, frac, digits, i;
    if (typeof number === "string") {
      number = number.trim();
      if (number === "" || /^TRUE|FALSE$/i.test(number)) return ERR_VALUE;
      n = Number(number);
    } else {
      n = number;
    }
    if (!isNumeric(n) || (typeof n === "number" && isNaN(n))) return ERR_VALUE;
    if (!isFinite(n)) return ERR_NUM;
    kind = normStyle(style);
    if (!kind) return ERR_VALUE;
    abs = Math.abs(n);
    if (!(abs < MAX)) return ERR_NUM;
    sign = n < 0 ? "minus " : "";

    if (kind === "WORLD") {
      abs = cleanAbs(n);
      plain = toPlainDecimal(abs);
      /* Integers (including 1.0) have no decimal part. */
      if (abs === 0) {
        words = sign + "zero";
        return cap(words);
      }
      var intPart = Math.floor(abs);
      frac = fracDigits(plain);
      words = intPart === 0 && frac ? "zero" : shortScale(intPart, false);
      if (frac) {
        digits = [];
        for (i = 0; i < frac.length; i++) digits.push(ONES[parseInt(frac.charAt(i), 10)]);
        words += " point " + digits.join(" ");
      }
      return cap(sign + words);
    }

    abs = cleanAbs(n);
    cents = roundToCents(abs);
    if (Math.floor(cents / 100) >= MAX) return ERR_NUM;
    if (kind === "INR") {
      words = moneyWords(cents, "rupee", "rupees", "paisa", "paise", indiaInt);
    } else if (kind === "USA") {
      words = moneyWords(cents, "dollar", "dollars", "cent", "cents", function (x) {
        return shortScale(x, false);
      });
    } else {
      words = moneyWords(cents, "pound", "pounds", "penny", "pence", function (x) {
        return shortScale(x, true);
      });
    }
    return cap(sign + words);
  }

  return {
    spell: spell,
    STYLE_HINT: STYLE_HINT,
    ERR_VALUE: ERR_VALUE,
    ERR_NUM: ERR_NUM
  };
});
