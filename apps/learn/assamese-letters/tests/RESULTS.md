# Assamese Letters validation

Local worktree /workspace/wt_al-1; branch learn/al-1. No push, PR, build bump, docs or shared-file edits.

| Release | Node tests | Browser checks |
| --- | ---: | ---: |
| AL-1 | 17 | not run (non-browser only) |

Reproduce:

```
node --test apps/learn/assamese-letters/tests/data.cjs apps/learn/assamese-letters/tests/games.cjs
```

Content: 52 chart entries (11 vowels + 37 consonants + 4 signs), 518 matra combinations, 4 hasanta examples, 10 joined letters, 11 numerals (০–১০), 143 unique picture words across 8 themes. Every learning-data id is unique. All Assamese fields are Bengali-block code points, NFC, and never use Bengali র. 400 deterministic game sessions (4,000 questions) are checked; Listen & pick never asks a sound-alike letter. Intl.Segmenter and its fallback keep vowel signs, nukta, chandrabindu and conjuncts with their base. The icon and all glyphs were rendered with Noto Sans Bengali and visually checked.
