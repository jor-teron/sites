# Learn (category)

`apps/learn/` is the Learn category: study and reference apps. **LN1** added the category page and list; the apps themselves stay where they are (Learn only links to them).

- **Page:** `learn.html` is the tiles page (`index.html` only redirects to it and keeps `?query` and `#hash`). Logic and look are shared in `shared/tiles/` (`tiles.js`, `tiles.css`).
- **List:** `learn-apps.csv` is the source of truth. Header `name, path, icon, newtab, section`; lines starting `#` are comments; `icon`, `newtab` and `section` are optional.
  - `path` and `icon` are relative to this folder (for an app in another category use `../tools/<app>/`).
  - Empty `icon` means `<folder>/<folder>_icon.png`; if that is missing the tile shows a letter.
  - `newtab` 1 opens the app in its own tab on a desktop Hub.
  - `section` groups tiles under a heading. Sections appear in order of first appearance; apps with no section go last under "Other".
- **Add an app:** add one line to `learn-apps.csv`. For a new app inside Learn, put its folder here (like `first-aid/`) and use `first-aid/` style paths.
- **Needs http:** the CSV is fetched, so open the page from the live site or a local server, not `file://` (same as every category page).
- **Shared kit:** `common/` and `first-aid/` belong to the Games bot; don't edit them from here.
- **Icon:** `learn_icon.png` (128 px, white graduation cap on a green rounded square, same size and style as the other category icons).

## Current list

- Health: First Aid, Human Body Explorer (HBE3: External tab by default with 38 outside parts (face, body, arms, hands, legs, feet, skin; Front/Back toggle) and an Inside tab with Simple mode with 15 main parts, Expert mode with about 50 parts incl. brain parts, senses, nerves, blood vessels, full skeleton, more muscles and skin; smooth code-drawn figure with shaded organs, bone-shaped bones and fibre-textured muscles; neutral body with no private parts; back parts drawn dashed; foldable card on phones; 8-question quiz per tab and mode)
- Outdoors: Survival and Outdoors (SO1a: Fire and Water; more topics planned)
- Language: NE-India Dictionary, Caption for NEI (still in Tools), English Basic, Typing Tutor (TT1: graded keyboard lessons, on-screen keyboard, 1/2/5 minute test), Morse Code (MC1: chart of A-Z, 0-9 and punctuation with optional tree view, text <-> Morse translator with sound and lamp at 5-25 WPM, tap key with live decoding, 10 graded listen/tap lessons, SOS button)
- Language and Maths: Maths and Logic (ML1a: 6 topics: Everyday Numbers, Times Tables, Fractions/Percent, Money Maths, Shapes and Measuring, Patterns and Puzzles), Clock Reading (CR1: drag the clock hands, digital 12 h / 24 h, time in words, Read / Set / Match quizzes in 5 levels)
- Coding: Learning HTML (Basic) (still in Tools), Code Lab (still in Lab)
- Music: Piano Basics (PB1: on-screen piano with WebAudio sound, note names in letters or sargam, 6 play-along tunes, name-the-note quiz), Guitar Chords (GC1: code-drawn neck in standard tuning, 20 chords with finger dots and O/X marks, plucked-string sound, strum by swipe or button, left-handed mode, chord-change practice with metronome, name-the-chord quiz), Tuner & Metronome (TM1: WebAudio metronome 30-240 BPM with lookahead timing, tap tempo, 2/3/4/6 beats with accented beat 1, pendulum and presets; microphone tuner with YIN pitch detection, note + octave, optional sargam, cents needle, guitar EADGBE mode with tighten/loosen hints, reference tones; plain-language help for beginners)
- Science: Periodic Table (PT1: all 118 elements in the standard layout, colour by category or state with legend filter, search, element cards with mass, group, period, state, year and kid-friendly facts, symbol/name/find-it quizzes in 3 levels)
- Life Skills: Road Safety (RS1: 31 Indian road signs in mandatory/cautionary/informatory groups, traffic light trainer with pedestrian signal, left-hand-traffic safe-crossing game with Look Right-Left-Right, rule cards incl. helmet, seatbelt and 112, sign and scenario quizzes in 3 levels)

## Not yet in the Hub menu

Learn is **not** in the Hub menu yet. Until the Hub owner makes these four edits, the page only opens by its address (`apps/learn/learn.html`):

1. `hub/core/hub_config.js`: add `Learn: 'apps/learn/learn-apps.csv'` to `HUB_CAT_CSV` (this also gives the Start flyout and `hub_catalog.js`).
2. `hub/core/hub_apps.js`: add a row `Learn, Learn Page, apps/learn/learn.html, , 0, 0, <order>` (choose the menu position).
3. `hub/core/hub.js`: add `Learn: 'apps/learn/learn.html'` to `CAT_PAGES`.
4. `hub/update/hub_sw.js`: add `apps/learn/learn_icon.png` and `apps/learn/learn-apps.csv` to the offline cache lists.

After these, run `python3 hub/core/hub_appindex_gen.py --catalog-only` and commit `hub/core/hub_catalog.js`.

## Misc / todo

- Hub Main Bot edits listed above (not done).
- Decide: move the Language and Coding apps into `apps/learn/`, or keep them in Tools/Lab and only list them here. Tools still tags Learning HTML with section "Learn" and Favorite lists Caption for NEI; leave as is until decided.
- More Learn apps and ideas: to be collected here.
