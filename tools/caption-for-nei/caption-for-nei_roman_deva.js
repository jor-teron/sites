/**
 * Caption for NEI — caption-for-nei_roman_deva.js
 * Version: 0.13
 * First release: 28 Sep 2026
 * Last edit: 28 Sep 2026
 * Credit: personal project (Karbi Anglong / Assam)
 *
 * Devanagari data tables (Hindi + Nepali) for the local ABC romanizer
 * (caption-for-nei_roman.js). Data only, no logic.
 *
 * Tokens resolved by the engine using CFN_CONFIG.ROMAN_STYLE:
 *   "@A" long a (aa / a)   "@I" long i (ee / i)   "@U" long u (oo / u)
 *   "@V" va (v / w)        "@N" nasal (n, or m before labials)
 * Nukta letters (क़ ख़ ग़ ज़ ड़ ढ़ फ़ य़) are stored as base + nukta because
 * Unicode NFC splits the precomposed forms; see "nukta" below.
 */
window.CFN_ROMAN_DATA = window.CFN_ROMAN_DATA || {};
window.CFN_ROMAN_DATA.deva = {
  name: "Devanagari",
  /* Unicode block U+0900–U+097F */
  range: [0x0900, 0x097f],
  virama: "\u094D",
  nuktaSign: "\u093C",
  /* Independent vowels */
  vowels: {
    "अ": "a", "आ": "@A", "इ": "i", "ई": "@I", "उ": "u", "ऊ": "@U",
    "ऋ": "ri", "ॠ": "ri", "ऌ": "li", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
    "ऍ": "e", "ऎ": "e", "ऑ": "o", "ऒ": "o",
  },
  /* Vowel signs (matras) */
  matras: {
    "ा": "@A", "ि": "i", "ी": "@I", "ु": "u", "ू": "@U", "ृ": "ri", "ॄ": "ri",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॅ": "e", "ॆ": "e", "ॉ": "o", "ॊ": "o",
  },
  /* Consonants (inherent vowel added by the engine) */
  consonants: {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "ळ": "l", "व": "@V",
    "श": "sh", "ष": "sh", "स": "s", "ह": "h",
  },
  /* Base letter + nukta (़) → everyday spelling */
  nukta: {
    "क": "q", "ख": "kh", "ग": "gh", "ज": "z", "ड": "d", "ढ": "dh",
    "फ": "f", "य": "y", "र": "r", "न": "n", "ळ": "l",
  },
  /* Whole clusters with a fixed everyday spelling (checked before letters) */
  conjuncts: {
    "क्ष": "ksh", "ज्ञ": "gy", "च्छ": "chh", "श्र": "shr",
  },
  /* Second letter of a cluster (after virama) spelled differently */
  phala: { "व": "w" },
  /* Labial consonants: anusvara before these → ROMAN_STYLE.nasalLabial */
  labials: "पफबभम",
  /* Signs after a letter: anusvara, chandrabindu, visarga, avagraha */
  signs: { "ं": "@N", "ँ": "@N", "ः": "h", "ऽ": "" },
  /* ०–९ → 0–9 */
  digits: "०१२३४५६७८९",
  /* Danda and double danda (also used in Bengali-script text) */
  punct: { "।": ".", "॥": "." },
  /* Independent vowels that take a "y" glide after an a-sound (जाएंगे → jaayenge) */
  glideVowels: "एऐईइ",
  /* Independent vowels that form a diphthong after a/aa (तपाई → tapai) */
  diphthongVowels: { "इ": "i", "ई": "i", "उ": "u", "ऊ": "u" },
  /*
   * Per-language defaults. CFN_CONFIG.ROMAN_LANG[lang] overrides these.
   * inherent: vowel for a bare consonant. glideY / diphthong: see above.
   * medialBlockAfterInitial: word-initial vowels after which the next
   * consonant keeps its vowel (Assamese অসমীয়া → axomiya, not axmiya;
   * empty for Hindi so अपना → apna). keepFinalAfterCluster: मित्र → mitra.
   * suffixes: postpositions split off when the stem is in the word list.
   */
  langs: {
    hi: {
      inherent: "a",
      glideY: true,
      diphthong: false,
      medialBlockAfterInitial: "",
      keepFinalAfterCluster: true,
      suffixes: ["ने", "को", "से", "में", "का", "की", "के", "पर", "वाला", "वाले", "वाली", "जी"],
    },
    ne: {
      inherent: "a",
      glideY: false,
      diphthong: true,
      medialBlockAfterInitial: "",
      keepFinalAfterCluster: true,
      suffixes: ["लाई", "को", "का", "की", "मा", "ले", "हरू", "हरु", "बाट", "सँग", "देखि", "जी"],
    },
  },
};
