/**
 * Caption for NEI — caption-for-nei_roman_beng.js
 * Version: 0.13
 * First release: 28 Sep 2026
 * Last edit: 28 Sep 2026
 * Credit: personal project (Karbi Anglong / Assam)
 *
 * Bengali-script data tables (Assamese + Bengali) for the local ABC
 * romanizer (caption-for-nei_roman.js). Data only, no logic.
 * Tokens: "@A" "@I" "@U" long vowels, "@N" nasal (see the deva file).
 * ড় ঢ় য় are stored as base + nukta (়) because Unicode NFC splits them.
 */
window.CFN_ROMAN_DATA = window.CFN_ROMAN_DATA || {};
window.CFN_ROMAN_DATA.beng = {
  name: "Bengali script",
  /* Unicode block U+0980–U+09FF */
  range: [0x0980, 0x09ff],
  virama: "\u09CD",
  nuktaSign: "\u09BC",
  vowels: {
    "অ": "o", "আ": "@A", "ই": "i", "ঈ": "@I", "উ": "u", "ঊ": "@U",
    "ঋ": "ri", "ৠ": "ri", "ঌ": "li", "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou",
  },
  matras: {
    "া": "@A", "ি": "i", "ী": "@I", "ু": "u", "ূ": "@U", "ৃ": "ri", "ৄ": "ri",
    "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou",
  },
  consonants: {
    "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng",
    "চ": "ch", "ছ": "chh", "জ": "j", "ঝ": "jh", "ঞ": "n",
    "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh", "ণ": "n",
    "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n",
    "প": "p", "ফ": "ph", "ব": "b", "ভ": "bh", "ম": "m",
    "য": "j", "র": "r", "ৰ": "r", "ল": "l", "ৱ": "w",
    "শ": "sh", "ষ": "sh", "স": "s", "হ": "h",
    /* khanda ta */
    "ৎ": "t",
  },
  /* Base + nukta: ড় ঢ় য় */
  nukta: { "ড": "r", "ঢ": "rh", "য": "y" },
  conjuncts: { "ক্ষ": "kh", "জ্ঞ": "gy" },
  /* ya-phala / ba-phala after virama */
  phala: { "য": "y", "ব": "w" },
  labials: "পফবভম",
  /* anusvara ং, chandrabindu ঁ, visarga ঃ */
  signs: { "ং": "ng", "ঁ": "@N", "ঃ": "h", "ঽ": "" },
  digits: "০১২৩৪৫৬৭৮৯",
  punct: {},
  glideVowels: "",
  diphthongVowels: {},
  /* Per-language defaults; CFN_CONFIG.ROMAN_LANG[lang] overrides these. */
  langs: {
    as: {
      inherent: "o",
      glideY: false,
      diphthong: false,
      medialBlockAfterInitial: "অ",
      keepFinalAfterCluster: true,
      /* word-initial অ → "a" (অসম → axom) */
      initialVowels: { "অ": "a" },
      /* Assamese চ/ছ sound "s", স/শ/ষ sound "x" */
      consonants: { "চ": "s", "ছ": "s", "স": "x", "শ": "x", "ষ": "x" },
      conjuncts: { "চ্ছ": "s" },
      style: { longA: "a", longAFinal: "a", longI: "i", longIFinal: "i", longU: "u", longUFinal: "u" },
      suffixes: ["ৰ", "ক", "ত", "লৈ", "বোৰ", "জন", "জনী", "খন", "টো", "টি", "ৰে", "ও"],
    },
    bn: {
      inherent: "o",
      glideY: false,
      diphthong: false,
      medialBlockAfterInitial: "অ",
      keepFinalAfterCluster: true,
      initialVowels: {},
      consonants: { "স": "s", "শ": "sh", "ষ": "sh" },
      /* যাচ্ছি → jachhi */
      conjuncts: { "চ্ছ": "chh" },
      style: { longA: "a", longAFinal: "a", longI: "i", longIFinal: "i", longU: "u", longUFinal: "u" },
      suffixes: ["ের", "র", "কে", "তে", "রা", "দের", "টা", "টি", "গুলো", "ও"],
    },
  },
};
