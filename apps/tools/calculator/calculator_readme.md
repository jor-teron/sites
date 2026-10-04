# Calculator

## 1. What it is
Phone-first calculator. A grey live answer shows as you type. History keeps recent sums.

## 2. Files
- `calculator.html` / `calculator.css`: layout, keys, look
- `calc_config.js`: settings and messages
- `calc_parse.js`: safe maths engine (no `eval`)
- `calc_format.js`: number display
- `calc_state.js`: key rules, `=`, history
- `calc_ui.js`: display, copy, history drawer
- `calc_keys.js`: keyboard and start-up
- `calc_test.js`: optional Node self-test (`node calc_test.js`); most users won't have Node

## 3. Behaviour rules
- **Live answer:** `2+3×4` shows `= 14`. Blank for a single number or an unfinished sum.
- **`=`:** shows the answer big and closes missing `)`. Pressing `=` again repeats the last step: `2+3` `=` `=` gives 8.
- **After `=`:** a digit starts fresh; an operator continues from the answer.
- **`±`:** flips the last number's sign.
- **`⌫`:** deletes one character (`sin(` in one go). Hold for 550 ms to clear all.
- **Copy:** tap the answer to copy it, without commas.
- **History:**
  - Keeps the last 20 sums; plain numbers and exact repeats aren't saved.
  - 🕘 opens it, ✕ closes it, Clear empties it.
  - Tapping an item inserts its answer.
- **Deg/Rad:** remembered.
- **Order:** `%` and `!` first, then `^` (right to left), minus sign, `× ÷`, `+ −`. `2π` means 2×π.
- **`%`:** `200+10%` = 220; `50×10%` = 5.
- **Limits:** 16 digits per number, 200 characters per sum.

## 4. Keyboard
- Digits; `.` or `,` for the decimal point
- `+ - * x / ( ) % ^ !`
- Enter or `=` for equals
- Backspace deletes
- Esc or Delete clears (Esc closes history first)
- Ctrl/Cmd+C copies the answer

Works inside the hub and responds to its phone D-pad: the hub sends buttons as key presses (Start = `=`, Select = clear, B = `×`).

## 5. Saved data
localStorage keys `calc_history` and `calc_angle`. To reset, delete them or clear site data.

## 6. Errors
- `1÷0`: "Can't divide by 0"
- `√(−4)`: "Invalid input"
- `tan(90)`: "Undefined"
- `2.5!`: "! needs a whole number ≥ 0"
- Results too big (e.g. `171!`): "Number too large"
- Unfinished sum: "Incomplete expression"

## 7. Screen sizes
- **Phone portrait:** 4-column basic keypad.
- **Landscape and desktop:** scientific keys are added (7 columns).
- Width is capped at 1000 px.

## 8. Safe settings (`calc_config.js`)
- `sigDigits`: digits shown
- `expHigh` / `expLow`: when e-notation starts
- `group`: thousands separator
- `historyMax`: history length
- `maxExprLength`: longest sum
- `toastMs`: how long messages stay
- `text`: message wording

## 9. Browser checklist
1. `2+3×4` shows grey `= 14`.
2. `2+3` `=` `=` gives 8.
3. `0.1+0.2` `=` gives 0.3.
4. `1÷0` `=` shows "Can't divide by 0".
5. `sin(30)` in Deg gives 0.5. Choose Rad and reload: it still shows RAD.
6. Holding ⌫ clears everything.

## 10. Known limits
- Old version after an update: hard-refresh.
- Results are rounded to 12 digits; e-notation from 1e15 and below 1e-9; `170!` is the largest factorial.

## 11. Change log
- 2026-10-04 (IST): new Calculator (commit f94efce). The old one is kept as Calculator (Beta) at `apps/tools/calculator-beta/`.

## 12. Related apps
- Calculator (Beta): the older version, left unchanged.
