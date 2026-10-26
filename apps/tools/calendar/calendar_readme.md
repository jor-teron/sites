# Calendar

## 1. What it is
A basic calendar (releases C1 + C4) with four swipe screens: **Month** (default), **Year**, **Holiday List** and **Settings**. Includes C3 Indian holidays. No events or notes yet (C2 parked). Version 1.1.

## 2. Files
- `calendar.html` / `calendar.css`: page, layout, light / dark, safe-area
- `calendar_holidays.js`: holiday data and rules (`window.CalHolidays`)
- `calendar_logic.js`: month / year rendering, date maths, gestures, keys, saving
- `calendar_icon.png`: hub icon
- `index.html`: opens `calendar.html`

## 3. Behaviour rules
- **Month (C1):** month grid, today filled in the accent colour, Sundays red. Prev / Today / Next on the RIGHT of the header (right-handed). Swipe the grid horizontally 75 px or more: left = next month, right = previous. Tapping a day selects it and shows weekday, date, day of year, ISO week number and how far from today. Tapping a grey day of the next / previous month jumps there.
- **Year (C4):** 12 mini months (3 columns on phone, 4 on wide screens), own prev / next / Today. Tap a month to open it in Month.
- **Screens:** Month → Year → Holiday List → Settings. Four dots at the top (clickable). A horizontal swipe of 75 px or more on the top bar switches screens: left = next, right = previous, wrapping around.
- **Settings:** Week starts Sunday (default) or Monday; Theme Dark (default), Light, or System (Hub pref `sites-hub.theme`, otherwise the device). About: name, version, short description.
- **Holidays (C3, fixed dates only):** New Year's Day 1 Jan, Republic Day 26 Jan, Ambedkar Jayanti 14 Apr, May Day 1 May, Independence Day 15 Aug, Gandhi Jayanti 2 Oct, Christmas Day 25 Dec, for every year. No movable festivals. Month: amber number with an underline bar, name in the day info and a "Holidays this month" list under the grid. Year: amber underlined number. Settings: Holidays On (default) / Off hides the markers (Holiday List stays viewable).
- **Holiday List:** table Date / Day / Holiday for the shown year, own prev / Today / next. Past rows grey, the next upcoming holiday highlighted. Tap a row to open that day in Month.
- **Jump & count:** the calendar button in the Month header opens a bottom sheet: Jump to date (Go opens and selects the day) and the Day counter (From / To, include end date, days plus weeks + days). Esc or tap outside closes it.
- **Saved:** screen, shown month, selected day and counter dates in localStorage `calendar-state-v1`; settings in `calendar-settings-v1` (`week`, `hol`, `theme`).

## 4. Keyboard
- Left / Right arrow: previous / next month (Month) or year (Year)
- PageUp / PageDown or Alt+Left / Alt+Right: previous / next screen (wraps)
- T: today (Month)

## Big-screen layout (2026-10-26)
Above 1000 px (and 1400 px) the header, month grid, info, holiday list, year view, holiday table and settings widen to ~1200 px / 90vw, the month grid fills the screen height, sizes scale with clamp(), the year view uses 4 (6 at 1400 px) columns, and day cells show the holiday name. Phone layout unchanged (the name span is hidden below 1000 px).
