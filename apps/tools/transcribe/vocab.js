/*=============================================================================
  vocab.js — speech biasing terms for Live Transcribe (customVocabulary)
  Ported from caption-for-nei city.csv, town.csv, surname.csv, vocab.csv.
  These help the transcriber HEAR names; they are not romanizer spellings.
  Keep the list short (Google: best results with up to ~100 terms).
=============================================================================*/

const VOCAB_TERMS = [
  /* Cities */
  "Guwahati", "Dispur", "Jorhat", "Tezpur", "Silchar", "Diphu", "Dibrugarh", "Nagaon", "Tinsukia", "Bongaigaon",
  /* Towns */
  "Dokmoka", "Bagori", "Kaziranga", "Hamren", "Bokajan", "Howraghat", "Donkamokam", "Manja",
  /* Family names */
  "Teron", "Terang", "Engti", "Enghi", "Timung", "Bey", "Kro", "Ronghang", "Tisso", "Phangcho",
  /* Other phrases */
  "Assam", "Karbi Anglong", "Karbi"
];
