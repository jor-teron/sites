/*=============================================================================
  assamese.js — Bengali-Assamese letter maps for local romanizer (Assamese)
  Edit spellings here. Not translation.
  Keys may be written precomposed or decomposed (য় or য+়).
=============================================================================*/

/* Independent vowels (অ spoken closer to "o"; word-initial অ → AS_INITIAL) */
const AS_VOWELS = {
  "অ": "o", "আ": "a", "ই": "i", "ঈ": "i", "উ": "u", "ঊ": "u",
  "ঋ": "ri", "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou"
};

/* Matras */
const AS_MATRA = {
  "া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u",
  "ৃ": "ri", "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou"
};

/* Consonants without inherent vowel */
const AS_CONS = {
  "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng",
  "চ": "s", "ছ": "s", "জ": "j", "ঝ": "jh", "ঞ": "ny",
  "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh", "ণ": "n",
  "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n",
  "প": "p", "ফ": "ph", "ব": "b", "ভ": "bh", "ম": "m",
  "য": "j", "র": "r", "ল": "l",
  "শ": "x", "ষ": "x", "স": "x", "হ": "h",
  "ক্ষ": "khy", "জ্ঞ": "gy", "চ্ছ": "s",
  /* Assamese-specific */
  "ৰ": "r", "ৱ": "w",
  /* Nukta letters (arrive as base + ় in NFC text) */
  "য়": "y", "ড়": "r", "ঢ়": "rh",
  /* Khanda ta: never takes a vowel */
  "ৎ": "t"
};

/* Letters that never carry the inherent vowel */
const AS_DEAD = { "ৎ": 1 };

/* Virama / nukta */
const AS_VIRAMA = "্";
const AS_NUKTA = "়";

/* Nasal / breath marks */
const AS_MARKS = { "ং": "anusvara", "ঁ": "chandrabindu", "ঃ": "visarga" };

/* Stand-alone symbols */
const AS_PUNCT = { "।": ".", "॥": ".", "ঽ": "'" };

/* Whole-word spellings. Checked before the rules; also the stem for
   STEM + suffix words (গুৱাহাটী + ত → Guwahatit). Ported from
   caption-for-nei roman_as.csv (the user's everyday spellings). */
const AS_WORDS = {
  "সকলো": "xokolo", "কমলা": "komola", "অসম": "Axom", "অসমীয়া": "Axomiya",
  "গুৱাহাটী": "Guwahati", "ডিফু": "Diphu", "কাৰ্বি": "Karbi", "আংলং": "Anglong",
  "মোৰ": "mor", "নাম": "naam", "কি": "ki", "আপুনি": "apuni",
  "মই": "moi", "তুমি": "tumi", "তই": "toi", "আমি": "ami",
  "তেওঁ": "teo", "সি": "xi", "কেনে": "kene", "কেনেকুৱা": "kenekua",
  "আছে": "ase", "আছোঁ": "asu", "ভাল": "bhal", "হয়": "hoy",
  "নহয়": "nohoy", "নাই": "nai", "ধন্যবাদ": "dhonyobad", "নমস্কাৰ": "nomoskar",
  "খবৰ": "khobor", "আজি": "aji", "কালি": "kali", "যাম": "jam",
  "আহক": "ahok", "পানী": "pani", "ভাত": "bhat", "চাহ": "sah",
  "ঘৰ": "ghor", "মানুহ": "manuh"
};

/* Endings split off when the stem is in the word list. Longest match first. */
const AS_SUFFIXES = ["ৰ", "ক", "ত", "লৈ", "বোৰ", "জন", "জনী", "খন", "টো", "টি", "ৰে", "ও"];

/* Word-initial vowels spelled differently (অসম → axom, like "Axom") */
const AS_INITIAL = { "অ": "a" };

/* Words that mark Bengali-script text as Assamese when Language = Auto
   (besides the letters ৰ / ৱ and the classifier ending -টো) */
const AS_MARKER_WORDS = [
  "মই", "আপুনি", "তই", "কিয়", "কেনেকৈ", "নহয়", "তেওঁ", "আছোঁ",
  "এইটো", "সেইটো", "কেনে", "হয়নে", "নেকি"
];
