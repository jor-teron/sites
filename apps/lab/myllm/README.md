# MyLLM — release ML1

Plan and train a tiny character-level language model in your browser. Plain JS, no build step.

## Tabs
- **Train** — the original MyLLM: model settings, training data (twitter_chat.txt), Train/Stop, loss chart, Generate.
- **Plan** (ML1, 2026-11-02) — LLM Calculator R13 merged in: parameters, file sizes, memory, steps and training time for a Llama-style tiny model, Target (reverse) search, real-model examples in ⓘ, word counter, calibration, Copy JSON and PDF/JSON export.

## Files
- `myllm.html`, `myllm.css`, `myllm.js` (engine + Train UI), `myllm.test.js` (`node myllm.test.js`)
- `myllm_tabs.js` — Train | Plan tab row (last tab saved in `myllm.tab`, `#plan` opens Plan)
- `myllm_plan_*.js`, `myllm_plan.css` — copies of `../llm-calc/` (R13), CSS scoped under `#plan`

## Settings keys (localStorage)
- `llm-calc.v1` — Plan inputs, same key as LLM Calculator so saved values carry over
- `myllm.tab` — last open tab

The standalone LLM Calculator (`../llm-calc/`) still works and is listed under Legacy.
