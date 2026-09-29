/*=============================================================================
  hindi.js — Devanagari letter maps for local romanizer (Hindi + Nepali)
  Edit spellings here. Not translation.
  Keys may be written precomposed or decomposed (क़ or क+़); the romanizer
  normalizes them to NFC, the form the live transcript arrives in.
=============================================================================*/

/* Independent vowels → vowel names. The romanizer turns names into letters:
   simple: aa→aa, ii→ee (word-final i), uu→oo (word-final u)
   iast:   aa→ā, ii→ī, uu→ū, ri→ṛ … */
const DEV_VOWELS = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ii", "उ": "u", "ऊ": "uu",
  "ऋ": "ri", "ॠ": "rii", "ऌ": "lri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
  "ऎ": "e", "ऒ": "o", "ऍ": "ae", "ॲ": "ae", "ऑ": "ao"
};

/* Matras (vowel signs) → vowel names */
const DEV_MATRA = {
  "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu",
  "ृ": "ri", "ॄ": "rii", "ॢ": "lri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
  "ॆ": "e", "ॊ": "o", "ॅ": "ae", "ॉ": "ao"
};

/* Consonants without inherent vowel (walker adds a / matra).
   Multi-letter keys (क्ष, ज्ञ …) win over single letters (longest match). */
const DEV_CONS = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h",
  /* Conjuncts */
  "क्ष": "ksh", "त्र": "tr", "ज्ञ": "gy", "श्र": "shr",
  "च्च": "cch", "च्छ": "cch",
  /* Nukta letters (arrive as base + ़ in NFC text) */
  "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "d", "ढ़": "dh",
  "फ़": "f", "य़": "y", "ऩ": "n", "ऱ": "r", "ऴ": "l"
};

/* IAST spellings where they differ from DEV_CONS (ROMANIZER_STYLE "iast") */
const DEV_CONS_IAST = {
  "ङ": "ṅ", "च": "c", "छ": "ch", "ञ": "ñ",
  "ट": "ṭ", "ठ": "ṭh", "ड": "ḍ", "ढ": "ḍh", "ण": "ṇ",
  "श": "ś", "ष": "ṣ",
  "क्ष": "kṣ", "ज्ञ": "jñ", "श्र": "śr", "च्च": "cc", "च्छ": "cch",
  "ड़": "ṛ", "ढ़": "ṛh", "ग़": "ġ", "ऩ": "ṉ", "ऱ": "ṟ", "ऴ": "ḻ"
};

/* IAST vowel letters */
const DEV_VOWEL_IAST = {
  "aa": "ā", "ii": "ī", "uu": "ū", "ri": "ṛ", "rii": "ṝ", "lri": "ḷ",
  "ae": "ê", "ao": "ô"
};

/* Virama / nukta */
const DEV_VIRAMA = "्";
const DEV_NUKTA = "़";

/* Nasal / breath marks (spelled by the romanizer) */
const DEV_MARKS = { "ं": "anusvara", "ँ": "chandrabindu", "ः": "visarga" };

/* Stand-alone symbols */
const DEV_PUNCT = { "।": ".", "॥": ".", "॰": ".", "ऽ": "'", "ॐ": "om" };
const DEV_PUNCT_IAST = { "ॐ": "oṃ" };

/* Anusvara before these letters reads "m" (संभव → sambhav) */
const DEV_LABIALS = { "प": 1, "फ": 1, "ब": 1, "भ": 1, "म": 1 };

/* Hindi: keep word-final "a" after a conjunct ending in these (मित्र → mitra) */
const DEV_KEEP_FINAL = { "य": 1, "र": 1, "व": 1, "ण": 1, "त्र": 1, "ज्ञ": 1 };

/* Whole-word spellings that the rules get wrong */
const DEV_WORDS = {
  "में": "mein"
};

/* Words / endings that mark Devanagari text as Nepali when Language = Auto */
const NE_MARKER_WORDS = [
  "छ", "छु", "छन्", "छौं", "छौ", "छिन्", "छैन", "मेरो", "तिम्रो", "हाम्रो",
  "तपाईं", "तपाईँ", "हुन्छ", "भयो", "थियो", "पनि", "गर्छ", "गर्नुहोस्", "कस्तो"
];
