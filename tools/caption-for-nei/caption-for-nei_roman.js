/**
 * Caption for NEI — caption-for-nei_roman.js
 * Version: 0.14
 * First release: 28 Sep 2026
 * Last edit: 28 Sep 2026
 * Credit: personal project (Karbi Anglong / Assam)
 *
 * Local ABC romanizer (rule-based, no network). Loaded after the data files
 * caption-for-nei_roman_deva.js / caption-for-nei_roman_beng.js and before
 * caption-for-nei_logic.js.
 *
 *   window.CFN_ROMAN.romanize(text, lang)  → everyday Latin spelling
 *   window.CFN_ROMAN.addWords(lang, csv)   → load a roman_xx.csv word list
 *   window.CFN_ROMAN.hasIndic(text)        → true if any known script letter
 *
 * lang = session Input code ("hi-IN", "as", "auto", ...). A word whose script
 * does not match lang (or lang "auto" / "en-IN") is read by script:
 * Devanagari → CFN_CONFIG.ROMAN_AUTO_DEVANAGARI_LANG (hi),
 * Bengali script → CFN_CONFIG.ROMAN_AUTO_BENGALI_SCRIPT_LANG (as).
 *
 * Per word: word list first (whole word, then list stem + known suffix),
 * otherwise letters → units → inherent-vowel (schwa) deletion → spelling.
 * Tables live in the data files; style / per-language tweaks in CFN_CONFIG.
 */
(function () {
  "use strict";

  const DATA = window.CFN_ROMAN_DATA || {};
  /* lang → { native: roman } from roman_xx.csv */
  const WORDS = {};
  const ZW = /[\u200B\u200C\u200D]/g;

  /* Used when CFN_CONFIG.ROMAN_STYLE leaves a key out */
  const DEFAULT_STYLE = {
    longA: "aa", longAFinal: "a",
    longI: "ee", longIFinal: "i",
    longU: "oo", longUFinal: "u",
    va: "v", nasal: "n", nasalLabial: "m",
  };

  function cfg() {
    return window.CFN_CONFIG || {};
  }

  function norm(s) {
    return String(s || "").normalize("NFC").replace(ZW, "");
  }

  function scriptOf(ch) {
    const c = ch.charCodeAt(0);
    for (const key in DATA) {
      const r = DATA[key].range;
      if (r && c >= r[0] && c <= r[1]) return key;
    }
    return null;
  }

  /* All punctuation (danda) and digit maps across scripts */
  const PUNCT = {};
  const DIGIT = {};
  Object.keys(DATA).forEach(function (key) {
    Object.assign(PUNCT, DATA[key].punct || {});
    String(DATA[key].digits || "").split("").forEach(function (d, i) {
      DIGIT[d] = String(i);
    });
  });

  function langCode(lang) {
    return String(lang || "").split("-")[0].toLowerCase();
  }

  /* Language rules for a word in script s, given the session lang */
  function langFor(s, lang) {
    const code = langCode(lang);
    if (DATA[s] && DATA[s].langs && DATA[s].langs[code]) return code;
    const c = cfg();
    if (s === "beng") return c.ROMAN_AUTO_BENGALI_SCRIPT_LANG || "as";
    if (s === "deva") return c.ROMAN_AUTO_DEVANAGARI_LANG || "hi";
    return code;
  }

  /* Merge engine defaults < data < CFN_CONFIG for one script + language */
  function settings(s, lang) {
    const base = DATA[s];
    const L = (base.langs && base.langs[lang]) || {};
    const C = (cfg().ROMAN_LANG && cfg().ROMAN_LANG[lang]) || {};
    const opts = Object.assign({}, L, C);
    opts.style = Object.assign({}, DEFAULT_STYLE, cfg().ROMAN_STYLE || {}, L.style || {}, C.style || {});
    opts.consonants = Object.assign({}, base.consonants, L.consonants || {}, C.consonants || {});
    opts.vowels = Object.assign({}, base.vowels, L.vowels || {}, C.vowels || {});
    opts.matras = Object.assign({}, base.matras, L.matras || {}, C.matras || {});
    opts.conjuncts = Object.assign({}, base.conjuncts || {}, L.conjuncts || {}, C.conjuncts || {});
    opts.nukta = Object.assign({}, base.nukta || {}, L.nukta || {}, C.nukta || {});
    opts.phala = Object.assign({}, base.phala || {}, L.phala || {}, C.phala || {});
    opts.signs = Object.assign({}, base.signs || {}, L.signs || {}, C.signs || {});
    opts.initialVowels = Object.assign({}, L.initialVowels || {}, C.initialVowels || {});
    opts.conjunctKeys = Object.keys(opts.conjuncts).sort(function (a, b) {
      return b.length - a.length;
    });
    opts.data = base;
    return opts;
  }

  /* Letters → units: { t:"C"|"V"|"X", base, v, ch, virama, nasal, tail, ... } */
  function parseWord(w, o) {
    const d = o.data;
    const units = [];
    let i = 0;
    while (i < w.length) {
      const ch = w[i];
      let unit = null;
      for (let k = 0; k < o.conjunctKeys.length; k++) {
        const key = o.conjunctKeys[k];
        if (w.startsWith(key, i)) {
          unit = { t: "C", base: o.conjuncts[key], ch: key[0], cluster: true };
          i += key.length;
          break;
        }
      }
      if (!unit && o.consonants[ch] !== undefined) {
        unit = { t: "C", base: o.consonants[ch], ch: ch };
        i++;
        if (w[i] === d.nuktaSign) {
          if (o.nukta[ch] !== undefined) unit.base = o.nukta[ch];
          i++;
        }
      }
      if (unit) {
        const prev = units[units.length - 1];
        unit.afterVirama = !!(prev && prev.t === "C" && prev.virama);
        if (unit.afterVirama && !unit.cluster && o.phala[unit.ch] !== undefined) unit.base = o.phala[unit.ch];
        const next = w[i];
        if (next === d.virama) {
          unit.virama = true;
          unit.v = "";
          i++;
        } else if (next !== undefined && o.matras[next] !== undefined) {
          unit.v = o.matras[next];
          i++;
        } else {
          unit.v = null; /* inherent vowel */
        }
        units.push(unit);
        continue;
      }
      if (o.vowels[ch] !== undefined) {
        units.push({ t: "V", v: o.vowels[ch], ch: ch });
        i++;
        continue;
      }
      if (o.signs[ch] !== undefined) {
        const last = units[units.length - 1];
        if (!last) units.push({ t: "X", s: o.signs[ch] === "@N" ? o.style.nasal : o.signs[ch] });
        else if (o.signs[ch] === "@N") last.nasal = true;
        else last.tail = (last.tail || "") + o.signs[ch];
        i++;
        continue;
      }
      if (o.matras[ch] !== undefined) {
        /* stray vowel sign: read it as a vowel */
        units.push({ t: "V", v: o.matras[ch], ch: ch });
        i++;
        continue;
      }
      if (ch === d.nuktaSign || ch === d.virama) {
        i++;
        continue;
      }
      units.push({ t: "X", s: ch });
      i++;
    }
    return units;
  }

  function hasVowel(u) {
    if (!u) return false;
    if (u.t === "V") return true;
    if (u.t !== "C") return false;
    if (u.virama) return false;
    if (u.v === null) return !u.del;
    return true;
  }

  /*
   * Inherent-vowel (schwa) deletion.
   * Final: drop a bare final consonant's vowel (not in one-letter words,
   * not after a cluster when keepFinalAfterCluster, not when nasalised).
   * Medial, right to left: V C ə C V → V C C V (कमला → kamla, समझना → samajhna).
   */
  function deleteSchwa(units, o, asSuffix) {
    const n = units.length;
    if (!n) return;
    const last = units[n - 1];
    if (last.t === "C" && last.v === null && !last.nasal && !last.tail && (n > 1 || asSuffix)) {
      if (!(o.keepFinalAfterCluster && (last.afterVirama || last.cluster) && n > 1)) last.del = true;
    }
    for (let i = n - 2; i >= 1; i--) {
      const u = units[i];
      if (u.t !== "C" || u.v !== null || u.del || u.nasal || u.tail || u.cluster || u.afterVirama) continue;
      const prev = units[i - 1];
      const next = units[i + 1];
      if (!hasVowel(prev)) continue;
      if (prev.t === "V" && i - 1 === 0 && String(o.medialBlockAfterInitial || "").indexOf(prev.ch) !== -1) continue;
      if (!next || next.t !== "C" || !hasVowel(next)) continue;
      u.del = true;
    }
  }

  function resolveVowel(v, isLast, nasal, n, st) {
    if (v === "@A") return isLast && !nasal && n > 1 ? st.longAFinal : st.longA;
    if (v === "@I") return isLast ? st.longIFinal : st.longI;
    if (v === "@U") return isLast ? st.longUFinal : st.longU;
    return v;
  }

  function renderUnits(units, o) {
    const st = o.style;
    const d = o.data;
    const n = units.length;
    let out = "";
    for (let idx = 0; idx < n; idx++) {
      const u = units[idx];
      const isLast = idx === n - 1;
      if (u.t === "X") {
        out += u.s;
        continue;
      }
      let piece = "";
      if (u.t === "C") {
        piece = u.base === "@V" ? st.va : u.base;
        if (u.virama || u.del) piece += "";
        else if (u.v === null) piece += o.inherent || "a";
        else piece += resolveVowel(u.v, isLast, u.nasal, n, st);
      } else {
        let v = resolveVowel(u.v, isLast, u.nasal, n, st);
        if (idx === 0 && o.initialVowels[u.ch] !== undefined) v = o.initialVowels[u.ch];
        const prevVowel = idx > 0 && hasVowel(units[idx - 1]);
        if (prevVowel && o.diphthong && d.diphthongVowels && d.diphthongVowels[u.ch]) {
          v = d.diphthongVowels[u.ch];
          if (/aa$/.test(out)) out = out.slice(0, -1);
        } else if (prevVowel && o.glideY && String(d.glideVowels || "").indexOf(u.ch) !== -1 && /a$/.test(out)) {
          v = "y" + v;
        }
        piece = v;
      }
      if (u.nasal) {
        const next = units[idx + 1];
        piece += next && next.t === "C" && String(d.labials || "").indexOf(next.ch) !== -1 ? st.nasalLabial : st.nasal;
      }
      if (u.tail) piece += u.tail;
      out += piece;
    }
    return out;
  }

  function ruleRoman(word, s, lang, asSuffix) {
    const o = settings(s, lang);
    const units = parseWord(word, o);
    deleteSchwa(units, o, asSuffix);
    return renderUnits(units, o);
  }

  function romanizeWord(word, s, lang) {
    const list = WORDS[lang] || {};
    if (list[word] !== undefined) return list[word];
    const o = settings(s, lang);
    const sufs = (o.suffixes || []).slice().sort(function (a, b) {
      return b.length - a.length;
    });
    for (let i = 0; i < sufs.length; i++) {
      const suf = norm(sufs[i]);
      if (word.length > suf.length && word.endsWith(suf)) {
        const stem = word.slice(0, word.length - suf.length);
        if (list[stem] !== undefined) return list[stem] + ruleRoman(suf, s, lang, true);
      }
    }
    return ruleRoman(word, s, lang, false);
  }

  function romanize(text, lang) {
    const src = norm(text);
    let out = "";
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (PUNCT[ch] !== undefined) {
        out += PUNCT[ch];
        i++;
        continue;
      }
      if (DIGIT[ch] !== undefined) {
        out += DIGIT[ch];
        i++;
        continue;
      }
      const s = scriptOf(ch);
      if (!s) {
        out += ch;
        i++;
        continue;
      }
      let j = i + 1;
      while (j < src.length && scriptOf(src[j]) === s && PUNCT[src[j]] === undefined && DIGIT[src[j]] === undefined) j++;
      out += romanizeWord(src.slice(i, j), s, langFor(s, lang));
      i = j;
    }
    return out;
  }

  /* roman_xx.csv: "# comment" lines, then native,roman */
  function addWords(lang, csvText) {
    const code = langCode(lang);
    const list = WORDS[code] || (WORDS[code] = {});
    let n = 0;
    String(csvText || "").split(/\r?\n/).forEach(function (line) {
      const t = line.trim();
      if (!t || t.charAt(0) === "#") return;
      const cut = t.indexOf(",");
      if (cut < 1) return;
      const native = norm(t.slice(0, cut).trim());
      const roman = t.slice(cut + 1).trim();
      if (!native || !roman || native.toLowerCase() === "native") return;
      list[native] = roman;
      n++;
    });
    return n;
  }

  function hasIndic(text) {
    const src = String(text || "");
    for (let i = 0; i < src.length; i++) {
      const s = scriptOf(src[i]);
      if (s && PUNCT[src[i]] === undefined && DIGIT[src[i]] === undefined) return true;
    }
    return false;
  }

  window.CFN_ROMAN = {
    romanize: romanize,
    addWords: addWords,
    hasIndic: hasIndic,
    wordCount: function (lang) {
      return Object.keys(WORDS[langCode(lang)] || {}).length;
    },
  };
})();
