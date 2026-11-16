# English Letters validation

Local worktree /workspace/wt_el-1; branch learn/el-1.

| Release | Node tests | Browser checks |
| --- | ---: | ---: |
| EL-1 | 14 | not run (non-browser only) |

Reproduce:

```
node --test apps/learn/english-letters/tests/data.cjs apps/learn/english-letters/tests/games.cjs
```

Content: 26 chart letters (5 vowels + 21 consonants) with capital and small forms, names, phonics and stroke guides; 11 numerals (0–10); 8 digraphs, 20 blends, 75 CVC words and 64 sight words; 150 unique picture words across 8 themes. Every learning-data id is unique. Every word field is lowercase a–z only. Each letter has a picture word starting with that letter, and the word bank covers all 26 starters. 500 deterministic game sessions (5,000 questions) are checked across five modes.
