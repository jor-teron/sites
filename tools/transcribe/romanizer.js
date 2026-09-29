/*=============================================================================
  romanizer.js — local Indic → Latin (not translation)
  Needs hindi.js + assamese.js + bengali.js loaded first.
  Uses CONFIG.ROMANIZER_STYLE ("simple" | "iast") and the #langSelect value:
    hi / ne     → Devanagari rules (Auto: Nepali if the text looks Nepali)
    as / bn     → Bengali-script rules (Auto: Assamese if ৰ / ৱ / Assamese words)
  Per word (simple style): word list first (HI_WORDS / NE_WORDS / AS_WORDS /
  BN_WORDS, the user's everyday spellings), then listed stem + known suffix
  (तपाईंलाई → tapailai), then the letter rules + schwa deletion.
=============================================================================*/

/* Zero-width joiners that may sit inside words */
const ROMAN_ZW = { "\u200C": 1, "\u200D": 1 };

/* Native digits → 0-9 (index = value) */
const ROMAN_DIGITS_DEV = "०१२३४५६७८९";
const ROMAN_DIGITS_BENG = "০১২৩৪৫৬৭৮৯";

/* Prepared (NFC-keyed) tables, built on first use */
let ROMAN_TABLES = null;

/*----------------------------------------------------------------------------
  isDevanagari
  True if the character sits in the Devanagari block.
----------------------------------------------------------------------------*/
function isDevanagari(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x0900 && c <= 0x097F;
}

/*----------------------------------------------------------------------------
  isBengaliAssamese
  True if the character sits in the Bengali / Assamese block.
----------------------------------------------------------------------------*/
function isBengaliAssamese(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x0980 && c <= 0x09FF;
}

/*----------------------------------------------------------------------------
  hasKey
  Own-property test (map values may be "").
----------------------------------------------------------------------------*/
function hasKey(map, key) {
  return !!map && Object.prototype.hasOwnProperty.call(map, key);
}

/*----------------------------------------------------------------------------
  toNfc
  NFC-normalize a string (live transcripts arrive as NFC).
----------------------------------------------------------------------------*/
function toNfc(s) {
  return String(s).normalize ? String(s).normalize("NFC") : String(s);
}

/*----------------------------------------------------------------------------
  nfcKeys
  Copy of a map with every key NFC-normalized, so tables can be written
  with precomposed or decomposed nukta letters alike.
----------------------------------------------------------------------------*/
function nfcKeys(map) {
  const out = {};
  if (!map) return out;
  Object.keys(map).forEach(function (k) {
    out[k] = map[k];
    out[toNfc(k)] = map[k];
  });
  return out;
}

/*----------------------------------------------------------------------------
  suffixList
  NFC suffixes, longest first (so वाला wins over ला-like shorter endings).
----------------------------------------------------------------------------*/
function suffixList(list) {
  return (list || []).map(toNfc).sort(function (a, b) {
    return Array.from(b).length - Array.from(a).length;
  });
}

/*----------------------------------------------------------------------------
  prepareTables
  Build the per-language tables once (after all map files are loaded).
----------------------------------------------------------------------------*/
function prepareTables() {
  const devBase = {
    script: "dev",
    vowels: DEV_VOWELS, matra: DEV_MATRA, cons: nfcKeys(DEV_CONS),
    consIast: nfcKeys(DEV_CONS_IAST), virama: DEV_VIRAMA, nukta: DEV_NUKTA,
    marks: DEV_MARKS, punct: DEV_PUNCT, punctIast: DEV_PUNCT_IAST,
    dead: {}, digits: ROMAN_DIGITS_DEV, inherent: "a", initial: {}
  };
  /* Hindi and Nepali share the letters but not the word lists */
  const hi = Object.assign({}, devBase, {
    words: nfcKeys(HI_WORDS), suffixes: suffixList(HI_SUFFIXES)
  });
  const ne = Object.assign({}, devBase, {
    words: nfcKeys(NE_WORDS), suffixes: suffixList(NE_SUFFIXES)
  });
  const as = {
    script: "beng",
    vowels: AS_VOWELS, matra: AS_MATRA, cons: nfcKeys(AS_CONS), consIast: {},
    virama: AS_VIRAMA, nukta: AS_NUKTA, marks: AS_MARKS, punct: AS_PUNCT,
    punctIast: {}, words: nfcKeys(AS_WORDS), suffixes: suffixList(AS_SUFFIXES),
    dead: AS_DEAD, digits: ROMAN_DIGITS_BENG, inherent: "o",
    initial: AS_INITIAL
  };
  /* bengali.js missing → fall back to the Assamese letters */
  const hasBn = typeof BN_CONS !== "undefined";
  const bn = !hasBn ? as : {
    script: "beng",
    vowels: BN_VOWELS, matra: BN_MATRA, cons: nfcKeys(BN_CONS), consIast: {},
    virama: BN_VIRAMA, nukta: BN_NUKTA, marks: BN_MARKS, punct: BN_PUNCT,
    punctIast: {}, words: nfcKeys(BN_WORDS), suffixes: suffixList(BN_SUFFIXES),
    dead: BN_DEAD, digits: ROMAN_DIGITS_BENG, inherent: "o", initial: {}
  };
  [hi, ne, as, bn].forEach(function (t) {
    t.maxCons = 1;
    Object.keys(t.cons).forEach(function (k) {
      t.maxCons = Math.max(t.maxCons, Array.from(k).length);
    });
  });
  return {
    hi: hi, ne: ne, as: as, bn: bn,
    neMarkers: new Set(NE_MARKER_WORDS.map(toNfc)),
    asMarkers: new Set(AS_MARKER_WORDS.map(toNfc))
  };
}

/*----------------------------------------------------------------------------
  romanTables
  Prepared tables (lazy).
----------------------------------------------------------------------------*/
function romanTables() {
  if (!ROMAN_TABLES) ROMAN_TABLES = prepareTables();
  return ROMAN_TABLES;
}

/*----------------------------------------------------------------------------
  romanStyle
  "iast" or "simple" from CONFIG.
----------------------------------------------------------------------------*/
function romanStyle() {
  if (typeof CONFIG !== "undefined" && CONFIG.ROMANIZER_STYLE === "iast") return "iast";
  return "simple";
}

/*----------------------------------------------------------------------------
  selectedLang
  Current Language dropdown value ("auto" when there is no page).
----------------------------------------------------------------------------*/
function selectedLang() {
  if (typeof document === "undefined") return "auto";
  const sel = document.getElementById("langSelect");
  return sel && sel.value ? sel.value : "auto";
}

/*----------------------------------------------------------------------------
  splitWords
  Words of a text (split on anything that is not a letter or mark).
----------------------------------------------------------------------------*/
function splitWords(text) {
  return text.split(/[\s.,!?;:"'()\[\]\u0964\u0965\-]+/).filter(Boolean);
}

/*----------------------------------------------------------------------------
  looksNepali
  Devanagari text with Nepali marker words or word-final halant.
----------------------------------------------------------------------------*/
function looksNepali(text) {
  const markers = romanTables().neMarkers;
  return splitWords(text).some(function (w) {
    return markers.has(w) || (w.length > 1 && w.charAt(w.length - 1) === DEV_VIRAMA);
  });
}

/*----------------------------------------------------------------------------
  looksAssamese
  Bengali-script text with ৰ / ৱ, Assamese marker words or -টো.
----------------------------------------------------------------------------*/
function looksAssamese(text) {
  if (/[\u09F0\u09F1]/.test(text)) return true;
  const markers = romanTables().asMarkers;
  return splitWords(text).some(function (w) {
    return markers.has(w) || (w.length > 2 && /টো$/.test(w));
  });
}

/*----------------------------------------------------------------------------
  resolveLang
  Pick the rule set for one script from the dropdown value and the text.
----------------------------------------------------------------------------*/
function resolveLang(script, want, text) {
  if (script === "dev") {
    if (want === "hi" || want === "ne") return want;
    return looksNepali(text) ? "ne" : "hi";
  }
  if (want === "as" || want === "bn") return want;
  return looksAssamese(text) ? "as" : "bn";
}

/*----------------------------------------------------------------------------
  tokenize
  Turn one run of Indic letters into tokens:
    C = consonant {c, v, hal, inh}, V = vowel, N = nasal/visarga mark,
    B = break (punctuation / digit, spelled in s).
  Consonants use longest match so क्ष, ज्ञ, ক্ষ and base+nukta keys hit.
----------------------------------------------------------------------------*/
function tokenize(chars, t, style) {
  const toks = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (ROMAN_ZW[ch]) { i += 1; continue; }

    let hit = null;
    for (let len = Math.min(t.maxCons, chars.length - i); len >= 1; len--) {
      const key = chars.slice(i, i + len).join("");
      if (hasKey(t.cons, key)) { hit = { key: key, len: len }; break; }
    }
    if (hit) {
      const start = i;
      i += hit.len;
      if (chars[i] === t.nukta) i += 1; /* unknown nukta combo: base sound */
      while (ROMAN_ZW[chars[i]]) i += 1;
      const tok = { t: "C", key: hit.key, c: t.cons[hit.key], v: "",
        hal: false, inh: false, del: false, src: "" };
      const mark = chars[i];
      if (hasKey(t.dead, hit.key)) {
        tok.hal = true;
      } else if (mark === t.virama) {
        tok.hal = true;
        i += 1;
      } else if (hasKey(t.matra, mark)) {
        tok.v = t.matra[mark];
        i += 1;
      } else {
        tok.v = t.inherent;
        tok.inh = true;
      }
      tok.src = chars.slice(start, i).join("");
      toks.push(tok);
      continue;
    }

    i += 1;
    if (hasKey(t.vowels, ch)) {
      toks.push({ t: "V", v: t.vowels[ch], src: ch });
    } else if (hasKey(t.matra, ch)) {
      toks.push({ t: "V", v: t.matra[ch], src: ch });
    } else if (hasKey(t.marks, ch)) {
      toks.push({ t: "N", kind: t.marks[ch], src: ch });
    } else if (t.digits.indexOf(ch) >= 0) {
      toks.push({ t: "B", s: String(t.digits.indexOf(ch)) });
    } else if (hasKey(t.punct, ch)) {
      const s = style === "iast" && hasKey(t.punctIast, ch) ? t.punctIast[ch] : t.punct[ch];
      toks.push({ t: "B", s: s });
    }
    /* stray virama / nukta / unknown signs are dropped */
  }
  return toks;
}

/*----------------------------------------------------------------------------
  isCluster
  True if consonant token i is the second half of a conjunct.
----------------------------------------------------------------------------*/
function isCluster(toks, i, t) {
  const tok = toks[i];
  if (tok.key.indexOf(t.virama) >= 0) return true;
  const prev = toks[i - 1];
  return !!prev && prev.t === "C" && prev.hal;
}

/*----------------------------------------------------------------------------
  keepFinalVowel
  Should the last consonant keep its inherent vowel?
----------------------------------------------------------------------------*/
function keepFinalVowel(toks, i, lang, t) {
  const tok = toks[i];
  const conj = isCluster(toks, i, t);
  if (lang === "hi") return conj && hasKey(DEV_KEEP_FINAL, tok.key);
  if (lang === "ne") return conj || tok.key === "छ";
  if (lang === "bn") {
    /* করছ korchho: verb ending -ছ after a bare consonant keeps its "o" */
    const prev = toks[i - 1];
    return conj || tok.key === "হ" ||
      (tok.key === "ছ" && !!prev && prev.t === "C" && prev.inh);
  }
  return conj; /* as */
}

/*----------------------------------------------------------------------------
  deleteSchwa
  Mark inherent vowels that are not spoken (tok.del):
  1. word-final (unless the word has one syllable or keepFinalVowel says so)
  2. medial, right to left: V C [a] C V → drop, never two in a row,
     never inside a conjunct or before य. Bengali/Assamese: not right after a
     word-initial অ (অসম stays "axom", not "axm"; আমরা → amra).
----------------------------------------------------------------------------*/
function deleteSchwa(toks, lang, t, asSuffix) {
  let voiced = 0;
  toks.forEach(function (k) {
    if (k.t === "V" || (k.t === "C" && !k.hal)) voiced += 1;
  });
  /* A suffix glued to a listed stem (-ক, -ৰ, -ত) is never a word on its own */
  if (voiced <= 1 && !asSuffix) return;

  const last = toks.length - 1;
  const lt = toks[last];
  if (lt.t === "C" && lt.inh && !keepFinalVowel(toks, last, lang, t)) lt.del = true;

  for (let i = last - 1; i > 0; i--) {
    const tok = toks[i];
    if (tok.t !== "C" || !tok.inh || tok.del) continue;
    if (isCluster(toks, i, t)) continue;
    const next = toks[i + 1];
    if (!next || next.t !== "C" || next.hal || next.del) continue;
    if (next.key.indexOf(t.virama) >= 0) continue;
    if (next.key === "य") continue; /* खानुभयो, not khaanubhyo */
    let p = i - 1;
    while (p >= 0 && toks[p].t === "N") p -= 1;
    if (p < 0) continue;
    const prev = toks[p];
    if (prev.t === "C" && (prev.hal || prev.del)) continue;
    /* Bengali script: keep the vowel only right after a word-initial অ
       (অসম oxom/axom), but আমরা amra, আপনি apni */
    if (t.script === "beng" && prev.t === "V" && p === 0 && prev.src === "অ") continue;
    tok.del = true;
  }
}

/*----------------------------------------------------------------------------
  bengaliClusters
  Bengali-script conjunct sounds: য-phala → y, ব-phala mostly silent,
  Bengali স → s before stops/nasals, initial ক্ষ → kh.
----------------------------------------------------------------------------*/
function bengaliClusters(toks, lang) {
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    if (tok.t !== "C") continue;
    const prev = toks[i - 1];
    const afterHal = !!prev && prev.t === "C" && prev.hal && prev.key !== "ৎ";
    if (tok.key === "য" && afterHal) tok.c = "y";
    if (tok.key === "ব" && afterHal && !/^[মরৰবল]$/.test(prev.key)) tok.c = "";
    if (lang === "bn") {
      const next = toks[i + 1];
      if (tok.key === "স" && tok.hal && next && next.t === "C" &&
          hasKey(BN_S_BEFORE, next.key.charAt(0))) tok.c = "s";
      if (tok.key === "ক্ষ" && i === 0) tok.c = "kh";
    }
  }
}

/*----------------------------------------------------------------------------
  vowelText
  Spell one vowel name for the language/style.
  Hindi simple: ii → ee (i at word end / before a final nasal),
                uu → oo (u at word end).
----------------------------------------------------------------------------*/
function vowelText(v, lang, style, atEnd, beforeEndNasal) {
  if (lang !== "hi" && lang !== "ne") return v;
  if (style === "iast") return DEV_VOWEL_IAST[v] || v;
  if (v === "ii") return lang === "ne" || atEnd || beforeEndNasal ? "i" : "ee";
  if (v === "uu") return lang === "ne" || atEnd ? "u" : "oo";
  if (v === "rii") return "ri";
  if (v === "ae") return "e";
  if (v === "ao") return "o";
  return v;
}

/*----------------------------------------------------------------------------
  markText
  Spell anusvara / chandrabindu / visarga.
----------------------------------------------------------------------------*/
function markText(kind, next, t, style) {
  if (kind === "visarga") return style === "iast" ? "ḥ" : "h";
  if (kind === "chandrabindu") return style === "iast" ? "ṁ" : "n";
  if (t.script === "beng") return "ng";
  if (style === "iast") return "ṃ";
  return next && next.t === "C" && hasKey(DEV_LABIALS, next.key.charAt(0)) ? "m" : "n";
}

/*----------------------------------------------------------------------------
  stemSuffixWord
  Listed stem + known suffix (तपाईंलाई → tapai + lai, দিল্লীতে …): the stem
  from the word list, the suffix by the rules. "" when nothing matches.
  Stems must be 2+ letters so one-letter words do not grab endings.
----------------------------------------------------------------------------*/
function stemSuffixWord(native, lang, t) {
  const sufs = t.suffixes || [];
  for (let k = 0; k < sufs.length; k++) {
    const suf = sufs[k];
    if (native.length <= suf.length || native.slice(-suf.length) !== suf) continue;
    const stem = native.slice(0, native.length - suf.length);
    if (Array.from(stem).length < 2 || !hasKey(t.words, stem)) continue;
    const sufToks = tokenize(Array.from(suf), t, "simple");
    const head = t.words[stem];
    /* One bare letter after a consonant sound takes the inherent vowel:
       অসম + ত → Axomot, but গুৱাহাটী + ত → Guwahatit */
    if (sufToks.length === 1 && sufToks[0].t === "C" && sufToks[0].inh && !/[aeiouy]$/i.test(head)) {
      return head + t.inherent + sufToks[0].c;
    }
    return head + renderWord(sufToks, lang, t, "simple", true);
  }
  return "";
}

/*----------------------------------------------------------------------------
  renderWord
  Spell one word's tokens (schwa rules only in the simple style).
----------------------------------------------------------------------------*/
function renderWord(toks, lang, t, style, asSuffix) {
  if (!toks.length) return "";
  const simple = style === "simple";
  if (simple && !asSuffix) {
    const native = toks.map(function (k) { return k.src; }).join("");
    if (hasKey(t.words, native)) return t.words[native];
    const listed = stemSuffixWord(native, lang, t);
    if (listed) return listed;
  }
  if (simple) {
    deleteSchwa(toks, lang, t, asSuffix);
    if (t.script === "beng") bengaliClusters(toks, lang);
  }
  const dev = t.script === "dev";
  /* Spoken syllables (after schwa deletion) for the final आ → a rule */
  let syl = 0;
  toks.forEach(function (k) {
    if (k.t === "V" || (k.t === "C" && !k.hal && !k.del)) syl += 1;
  });

  let out = "";
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    const atEnd = i === toks.length - 1;
    let restNasal = !atEnd;
    for (let j = i + 1; j < toks.length; j++) if (toks[j].t !== "N") restNasal = false;
    /* Everyday Hindi/Nepali: final आ → a in longer words (karna, mera);
       one-syllable words keep aa (jaa). A suffix continues its stem. */
    const shortA = simple && dev && atEnd && tok.v === "aa" && (syl > 1 || asSuffix);
    const prevTok = toks[i - 1];

    if (tok.t === "C") {
      let c = style === "iast" && hasKey(t.consIast, tok.key) ? t.consIast[tok.key] : tok.c;
      /* व after a virama is a glide: स्व sw, द्व dw */
      if (simple && dev && tok.key === "व" && prevTok && prevTok.t === "C" && prevTok.hal) c = "w";
      out += c;
      if (!tok.hal && !tok.del) out += shortA ? "a" : vowelText(tok.v, lang, style, atEnd, restNasal);
    } else if (tok.t === "V") {
      let v = shortA ? "a" : vowelText(tok.v, lang, style, atEnd, restNasal);
      /* Assamese word-initial অ → a (অসম axom) */
      if (simple && i === 0 && !asSuffix && hasKey(t.initial, tok.src)) v = t.initial[tok.src];
      /* Nepali diphthong: आ/अ + इ ई उ ऊ → ai / au (दाइ dai, तपाई tapai, आउनु aunu) */
      if (simple && lang === "ne" && /^(i|ii|u|uu)$/.test(tok.v) && prevTok) {
        const pv = prevTok.t === "V" ? prevTok.v : (prevTok.t === "C" && !prevTok.hal && !prevTok.del ? prevTok.v : "");
        if (pv === "a" || pv === "aa") {
          if (/aa$/.test(out)) out = out.slice(0, -1);
          v = tok.v.charAt(0);
        }
      }
      /* Hindi/Nepali glide: गए gaye, लिए liye */
      const prev = toks[i - 1];
      if (style === "simple" && t.script === "dev" && tok.v === "e" && prev &&
          /^(a|aa|i|ii)$/.test(prev.t === "V" ? prev.v : (prev.t === "C" && !prev.hal && !prev.del ? prev.v : ""))) {
        v = "y" + v;
      }
      out += v;
    } else if (tok.t === "N") {
      out += markText(tok.kind, toks[i + 1], t, style);
    }
  }
  return out;
}

/*----------------------------------------------------------------------------
  romanizeRun
  Romanize one run of a single script with the given language rules.
----------------------------------------------------------------------------*/
function romanizeRun(run, lang) {
  const t = romanTables()[lang];
  const style = t.script === "dev" ? romanStyle() : "simple";
  const toks = tokenize(Array.from(run), t, style);
  let out = "";
  let word = [];
  toks.forEach(function (tok) {
    if (tok.t === "B") {
      out += renderWord(word, lang, t, style) + tok.s;
      word = [];
    } else {
      word.push(tok);
    }
  });
  return out + renderWord(word, lang, t, style);
}

/*----------------------------------------------------------------------------
  cleanRoman
  Drop leftover Indic marks / joiners, tidy spaces around punctuation.
----------------------------------------------------------------------------*/
function cleanRoman(s) {
  return s
    .replace(/[\u0900-\u09FF\u200C\u200D]/g, "")
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/ +([.,!?;:])/g, "$1")
    .trim();
}

/*----------------------------------------------------------------------------
  romanize
  Transliterate Hindi/Nepali (Devanagari) and Assamese/Bengali letters to
  Latin. lang: "hi" | "ne" | "as" | "bn" | "auto"; defaults to #langSelect.
----------------------------------------------------------------------------*/
function romanize(text, lang) {
  if (!text) return "";
  const src = toNfc(text);
  const want = lang || selectedLang();
  const chars = Array.from(src);
  let out = "";
  let buf = "";
  let mode = ""; /* "" | "dev" | "beng" */
  let devLang = "";
  let bengLang = "";

  function flush() {
    if (!buf) return;
    if (mode === "dev") {
      devLang = devLang || resolveLang("dev", want, src);
      out += romanizeRun(buf, devLang);
    } else if (mode === "beng") {
      bengLang = bengLang || resolveLang("beng", want, src);
      out += romanizeRun(buf, bengLang);
    }
    buf = "";
    mode = "";
  }

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ROMAN_ZW[ch] && mode) { buf += ch; continue; }
    const nextMode = isDevanagari(ch) ? "dev" : isBengaliAssamese(ch) ? "beng" : "";
    if (nextMode !== mode) flush();
    if (!nextMode) {
      out += ch;
    } else {
      mode = nextMode;
      buf += ch;
    }
  }
  flush();
  return cleanRoman(out);
}

/*----------------------------------------------------------------------------
  paintRoman
  Fill or hide the romanized line on a block.
----------------------------------------------------------------------------*/
function paintRoman(blockEl, sourceText) {
  if (!blockEl) return;
  let rom = blockEl.querySelector(".rom");
  if (!CONFIG.ENABLE_ROMANIZER) {
    if (rom) rom.textContent = "";
    return;
  }
  if (!rom) {
    rom = document.createElement("div");
    rom.className = "line rom";
    blockEl.appendChild(rom);
  }
  const r = romanize(sourceText || "");
  rom.textContent = r ? ("(Roman) " + r) : "";
}
