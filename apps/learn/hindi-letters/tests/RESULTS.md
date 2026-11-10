# Hindi Letters validation

Local checkout /workspace/sites_hl; branch learn/hindi-letters. Chrome test server: 127.0.0.1:8834 only. No push, PR, merge, build bump or edits to protected shared files.

| Release | Node tests | Chrome checks | Console errors |
| --- | ---: | ---: | ---: |
| HL-1a | 3 | 20 | 0 |
| HL-1b | 7 | 35 | 0 |
| HL-1c (final regression) | 14 | 72 | 0 |

Reproduce:

```
node --test apps/learn/hindi-letters/tests/data.cjs apps/learn/hindi-letters/tests/games.cjs
python3 -m http.server 8834 --bind 127.0.0.1
# In another shell:
node apps/learn/hindi-letters/tests/browser.cjs
```

Final content: 49 chart entries (13 vowels/signs + 33 basic consonants + 3 conjuncts), 429 matra combinations, 5 half-letter examples, 6 conjunct examples, 10 numerals, 200 unique picture words across 8 themes. Every learning-data id is unique across collections. All Hindi fields use valid Devanagari code points. Word duplicates are checked after Unicode normalization.

400 deterministic game sessions cover 4,000 generated questions; every choice set has one target and unique ids; every shuffled word has exactly the target's letter-group multiset. Answer locking prevents double scoring, pause blocks input, repeated tiles stay distinct, and both Intl.Segmenter and its fallback preserve matras/conjuncts.

Chrome uses desktop 1280×800 (also 1280×900 for the scripted pointer trace), portrait 390×844 and landscape 844×390. All four games are completed start to finish at 10/10, with best stars saved. Phone checks require no horizontal overflow and visible game controls at least 44px high. Screenshots outside git at /workspace/hl-*.png were opened and visually inspected for correctly formed Devanagari, pre-base कि, half forms, words, a traced अ, and the PIL-rendered icon. A row-scan script sends actual mouse/pointer events over the rendered अ and scores 3 stars, >95% coverage; a filled box cannot score 3 stars. Clear removes ink while saved best stars remain.

Theme checks cover Auto default, explicit light/dark and following Hub changes. Speech integration stubs a Hindi voice to verify hi-IN selection and spoken-audio off, while the real headless machine exercises the no-Hindi-voice fallback. All functionality still opens when localStorage is unavailable.

Limitations: native Hindi speech quality needs a device with a Hindi voice; no physical-phone or Hindi-educator review. Emoji are approximate mnemonic pictures. Tracing arrows deliberately describe simplified body-then-headline phases, not exact calligraphic stroke sequences; stroke order is guided rather than enforced. Font outlines differ from handwriting. Additional nukta letters occur in words but are outside the traditional basic chart.
