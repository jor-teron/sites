================================================================================
 README_learn.txt  -  Learn category notes (Hub Teacher)
================================================================================
 Owner: the Learn builder (apps/learn/**, learn-apps.csv). Times IST.
 Links: PR N = https://github.com/jor-teron/sites/pull/N

DC-1  Dictionary (18 Nov 2026)
  New app apps/learn/dictionary/ (Learn > Language, after English Basic).
  Offline English dictionary from Open English WordNet 2025 (CC BY 4.0, from
  Princeton WordNet 3.0): 127,311 words and phrases. Opens straight into
  search: prefix suggestions, meanings grouped by part of speech, examples,
  tappable synonyms and opposites, Hear it (browser speechSynthesis), recent
  searches (learn.dictionary.recent, last 20), word of the day, closest-word
  suggestions when not found, About with credits. Theme follows the Hub
  (hub_theme.js, Auto); opens Windowed (Hub default).
  Data: data/*.json made by tools/build_data.py (python3, stdlib). Shards by
  first letter, split one more letter while a shard is over 600 KB; i_<l>.json
  word lists for suggestions; wod.json; manifest.json. About 24 MB raw,
  about 7.6 MB gzip; first load about 85 KB.
  Rebuild: python3 apps/learn/dictionary/tools/build_data.py [xml.gz]
  Tests: node --test apps/learn/dictionary/tests/dict.test.cjs
  Note for Hub: data/ is not in hub_sw.js offline caching (needs HTTP fetch).
