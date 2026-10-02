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
  "ক্ষ": "kkh", "জ্ঞ": "gy", "চ্ছ": "chh",
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

/* Endings split off when the stem is in the word list. Longest match first. */
const BN_SUFFIXES = ["ের", "র", "কে", "তে", "রা", "দের", "টা", "টি", "গুলো", "ও"];

/* Virama / nukta */
const BN_VIRAMA = "্";
const BN_NUKTA = "়";

/* Nasal / breath marks */
const BN_MARKS = { "ং": "anusvara", "ঁ": "chandrabindu", "ঃ": "visarga" };

/* Stand-alone symbols */
const BN_PUNCT = { "।": ".", "॥": ".", "ঽ": "'" };

/* Whole-word spellings (final "o" kept, etc.). Checked before the rules;
   also the stem for STEM + suffix words. Includes caption-for-nei
   roman_bn.csv (the user's everyday spellings). */
const BN_WORDS = {
  "হল": "holo", "ছিল": "chhilo", "গেল": "gelo", "দিল": "dilo",
  "নিল": "nilo", "এল": "elo", "বলল": "bollo", "করল": "korlo",
  "কত": "koto", "মত": "moto", "যত": "joto", "তত": "toto",
  "এত": "eto", "হত": "hoto", "ভাল": "bhalo", "বড়": "boro",
  "ছোট": "chhoto", "শুভ": "shubho", "কমলা": "komola", "আমি": "ami",
  "তুমি": "tumi", "আপনি": "apni", "কেমন": "kemon", "আছো": "achho",
  "আছি": "achhi", "আছে": "achhe", "আছেন": "achhen", "ভালো": "bhalo",
  "কী": "ki", "কি": "ki", "না": "na", "হ্যাঁ": "haan",
  "নাম": "naam", "আমার": "amar", "তোমার": "tomar", "এবং": "ebong",
  "কোথায়": "kothay", "কেন": "keno", "ধন্যবাদ": "dhonnobad", "নমস্কার": "nomoskar",
  "খুব": "khub", "এখন": "ekhon", "আজ": "aaj", "কাল": "kal",
  "যাব": "jabo", "খাবার": "khabar", "বাংলা": "Bangla", "কলকাতা": "Kolkata",
  "সে": "se", "ঠিক": "thik", "হয়": "hoy", "সব": "sob"
};
