/*=============================================================================
  bengali.js — Bengali letter maps for local romanizer
  Same script block as Assamese; the romanizer picks this table when the
  Language is Bengali (or Auto and the text has no Assamese markers).
  Edit spellings here. Not translation.
=============================================================================*/

/* Independent vowels (অ spoken "o") */
const BN_VOWELS = {
  "অ": "o", "আ": "a", "ই": "i", "ঈ": "i", "উ": "u", "ঊ": "u",
  "ঋ": "ri", "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou"
};

/* Matras */
const BN_MATRA = {
  "া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u",
  "ৃ": "ri", "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou"
};

/* Consonants without inherent vowel */
const BN_CONS = {
  "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng",
  "চ": "ch", "ছ": "chh", "জ": "j", "ঝ": "jh", "ঞ": "n",
  "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh", "ণ": "n",
  "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n",
  "প": "p", "ফ": "ph", "ব": "b", "ভ": "bh", "ম": "m",
  "য": "j", "র": "r", "ল": "l",
  "শ": "sh", "ষ": "sh", "স": "sh", "হ": "h",
  "ক্ষ": "kkh", "জ্ঞ": "gy",
  /* Assamese letters, in case they show up */
  "ৰ": "r", "ৱ": "w",
  /* Nukta letters (arrive as base + ় in NFC text) */
  "য়": "y", "ড়": "r", "ঢ়": "rh",
  /* Khanda ta: never takes a vowel */
  "ৎ": "t"
};

/* Letters that never carry the inherent vowel */
const BN_DEAD = { "ৎ": 1 };

/* স reads "s" (not "sh") before these letters: স্কুল skul, রাস্তা rasta */
const BN_S_BEFORE = {
  "ক": 1, "খ": 1, "ট": 1, "ঠ": 1, "ত": 1, "থ": 1, "ন": 1,
  "প": 1, "ফ": 1, "ম": 1, "ল": 1, "র": 1
};

/* Virama / nukta */
const BN_VIRAMA = "্";
const BN_NUKTA = "়";

/* Nasal / breath marks */
const BN_MARKS = { "ং": "anusvara", "ঁ": "chandrabindu", "ঃ": "visarga" };

/* Stand-alone symbols */
const BN_PUNCT = { "।": ".", "॥": ".", "ঽ": "'" };

/* Whole-word spellings that the rules get wrong (final "o" kept, etc.) */
const BN_WORDS = {
  "হল": "holo", "ছিল": "chhilo", "গেল": "gelo", "দিল": "dilo", "নিল": "nilo",
  "এল": "elo", "বলল": "bollo", "করল": "korlo", "কত": "koto", "মত": "moto",
  "যত": "joto", "তত": "toto", "এত": "eto", "হত": "hoto", "ভাল": "bhalo",
  "বড়": "boro", "ছোট": "chhoto", "শুভ": "shubho", "কমলা": "komola"
};
