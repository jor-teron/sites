/*=============================================================================
  hindi.js — Devanagari letter maps for local romanizer
  Edit spellings here. Not translation.
=============================================================================*/

/* Independent vowels */
const DEV_VOWELS = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ii", "उ": "u", "ऊ": "uu",
  "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
  "ॲ": "e", "ऑ": "o"
};

/* Consonants without inherent vowel (walker adds a / matra) */
const DEV_CONS = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h",
  "क्ष": "ksh", "त्र": "tr", "ज्ञ": "gy",
  "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "d", "ढ़": "dh", "फ़": "f", "य़": "y"
};

/* Matras (vowel signs) */
const DEV_MATRA = {
  "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu",
  "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
  "ॅ": "e", "ॉ": "o"
};

/* Virama / nukta / signs */
const DEV_VIRAMA = "्";
const DEV_NUKTA = "़";
const DEV_SIGN = { "ं": "n", "ँ": "n", "ः": "h", "ऽ": "'", "।": ".", "॥": "." };
