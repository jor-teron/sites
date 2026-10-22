# Calendar

## 1. What it is
A basic calendar (releases C1 + C4) with four swipe screens: **Month** (default), **Year**, **Count** (jump to date + day counter) and **Settings**. No events, notes or holidays yet (C2 / C3 parked). Version 1.0.

## 2. Files
- `calendar.html` / `calendar.css`: page, layout, light / dark, safe-area
- `calendar_logic.js`: month / year rendering, date maths, gestures, keys, saving
- `calendar_icon.png`: hub icon
- `index.html`: opens `calendar.html`

## 3. Behaviour rules
- **Month (C1):** month grid, today filled in the accent colour, Sundays red. Prev / Today / Next on the RIGHT of the header (right-handed). Swipe the grid horizontally 75 px or more: left = next month, right = previous. Tapping a day selects it and shows weekday, date, day of year, ISO week number and how far from today. Tapping a grey day of the next / previous month jumps there.
- **Year (C4):** 12 mini months (3 columns on phone, 4 on wide screens), own prev / next / Today. Tap a month to open it in Month.
- **Count (C4):** Jump to date (date input + Go, opens and selects that day in Month). Day counter: From / To, optional "Include end date", shows days plus weeks + days. 2026-01-01 → 2026-12-31 = 364 days (365 with end date).
- **Screens:** Month → Year → Count → Settings. Four dots at the top (clickable). A horizontal swipe of 75 px or more on the top bar switches screens: left = next, right = previous, wrapping around.
- **Settings:** Week starts Sunday (default) or Monday; Theme Dark (default), Light, or System (Hub pref `sites-hub.theme`, otherwise the device). About: name, version, short description.
- **Saved:** screen, shown month, selected day and counter dates in localStorage `calendar-state-v1`; settings in `calendar-settings-v1` (`week`, `theme`).

## 4. Keyboard
- Left / Right arrow: previous / next month (Month) or year (Year)
- PageUp / PageDown or Alt+Left / Alt+Right: previous / next screen (wraps)
- T: today (Month)
