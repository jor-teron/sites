/*=============================================================================
  assamese.js — Bengali-Assamese letter maps for local romanizer
  Edit spellings here. Not translation.
=============================================================================*/

/* Independent vowels (অ often spoken closer to "o") */
const AS_VOWELS = {
  "অ": "o", "আ": "a", "ই": "i", "ঈ": "ii", "উ": "u", "ঊ": "uu",
  "ঋ": "ri", "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou"
};

/* Consonants without inherent vowel */
const AS_CONS = {
  "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng",
  "চ": "s", "ছ": "s", "জ": "z", "ঝ": "jh", "ঞ": "ny",
  "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh", "ণ": "n",
  "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n",
  "প": "p", "ফ": "ph", "ব": "b", "ভ": "bh", "ম": "m",
  "য": "z", "র": "r", "ল": "l",
  "শ": "x", "ষ": "x", "স": "x", "হ": "h",
  "ক্ষ": "khy",
  /* Assamese-specific */
  "ৰ": "r", "ৱ": "w", "য়": "y",
  "ড়": "r", "ঢ়": "rh"
};

/* Matras */
const AS_MATRA = {
  "া": "a", "ি": "i", "ী": "ii", "ু": "u", "ূ": "uu",
  "ৃ": "ri", "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou"
};

/* Virama / nukta / signs */
const AS_VIRAMA = "্";
const AS_NUKTA = "়";
const AS_SIGN = { "ং": "ng", "ঃ": "h", "ঁ": "n", "।": ".", "॥": "." };
