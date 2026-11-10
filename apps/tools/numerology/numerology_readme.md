# Numerology (NU1)

Offline numerology app. No libraries, no network. First run asks only for a full name and date of birth, then shows the numbers.

- Files: `numerology.html`, `numerology.css`, `numerology.js` (RELEASE = 'NU1', `?v=NU1`), `nu_calc.js` (pure maths, node-testable),
  `index.html` redirect, `numerology_icon.svg`, `test_nu_calc.js` (`node test_nu_calc.js`).
- Storage: localStorage `numerology-v1` = `{profiles:[{id,name,dob}], current, theme:'auto'|'light'|'dark', system:'pythagorean'|'chaldean'}`.
  Auto theme follows `sites-hub.theme` (else the device setting). The letter-value system is remembered.
- First screen: name + date of birth only. Later, add, edit or remove family profiles with in-app dialogs (no `alert` / `confirm`).
- Core numbers, master 11 / 22 / 33 kept unreduced:
  - Life Path — from the birth date (reduce month, day and year separately, then add). The main number.
  - Name number (Destiny / Expression) — all letters of the full name.
  - Heart number (Soul Urge) — vowels. A, E, I, O, U are always vowels; Y is a vowel unless it sits next to A, E, I, O or U.
  - Outer number (Personality) — consonants, using the same Y rule.
  - Birthday — the day of the month, reduced (11 and 22 kept).
- Timing: Personal Year, Month and Day for today. Personal Year uses the calendar year (from 1 January), plus birth month and day — it does not wait for the birthday.
- Compare: two saved profiles, Life Path only, from a fixed compatibility table (score 0–100 and a short traditional note).
- Name checker: type a spelling to see its name number; nothing is saved.
- Letter values: Western / Pythagorean (default, 1–9) or Chaldean (1–8, no 9; often used in India). Only name numbers change. Accented Latin letters are folded to A–Z (`José` → JOSE); other scripts are skipped.
- UI: Stopwatch-style big number cards; tap a card for the longer traditional meaning. Plain-language labels, with the older names in the detail. Readings are labelled traditional, for fun, not facts.
- Check 1990-07-15 Life Path 5 (month 7, day 6, year 1). 1966-05-29 Life Path 11, 1989-02-11 Life Path 22, 2009-11-11 Life Path 33. “Ann” Pythagorean name number 11. “Albert Einstein” Pythagorean 9 / heart 7 / outer 11; Chaldean name number 1. Personal Year of 1990-07-15 in calendar 2026 is 5; on 2026-11-10 the month is 7 and the day is 8.
