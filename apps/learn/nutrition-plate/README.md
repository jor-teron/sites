# Nutrition Plate — NP-1a / NP-1b

Learn app for building Indian meal plates and planning a day.
Entry: `index.html` → `nutrition-plate.html`; standalone or Hub window.
No network content, accounts, analytics, external fonts or runtime dependencies.

## Food data

- 150 foods, mostly everyday Indian items, each with a code-drawn icon.
- Per-portion energy and nutrients are rounded guides scaled from IFCT 2017
  (per 100 g edible portion) and common measures: 1 roti, 1 katori, 1 cup or 1 piece.
- Shown: kcal, protein, carbohydrate, fat, fibre, sugar, iron, calcium and vitamin C.
- Values are approximate, not a laboratory analysis. Mixed dishes include a typical
  amount of cooking fat.

## Plate builder (NP-1a)

- Search, filter by food group, and filter by vegetarian / egg / non-veg.
- Drag a food onto the plate, or tap it to add one portion (phones included).
- Live totals and a balanced-plate guide (about half vegetables and fruit, one
  quarter grains, one quarter protein, with dairy on the side). Shares use food
  weight so vegetables stay visible.

## The day and the person (NP-1b)

- Plan breakfast, lunch, snacks and dinner as one day.
- Age group, activity and diet set a rough daily target from ICMR-NIN style
  mid-points (not sex-specific). Sugar is a keep-below amount (~10% of energy).
- Progress bars compare the whole day with that target. Short tips include
  “add a protein”, “too much sugar” and “add vegetables”.
- `learn.nutrition-plate.v1` stores the current day, person settings, and up to
  20 named plates and 20 named days on this device.
- This is an educational guide, not medical advice. Needs vary by sex, body size,
  health and life stage.

`learn.nutrition-plate.theme`: absent = Auto (System), following the Hub
through the existing read-only HubTheme helper. The app opens Windowed with
the Hub default.

## Offline and tests

`offline.js` caches only this app's shell and its existing theme/header
dependencies. Offline use needs a successful first visit over HTTPS or localhost.

Run:

```
node --test apps/learn/nutrition-plate/tests/model.test.cjs
python3 -m http.server 8826 --bind 127.0.0.1
NODE_PATH=/workspace/arw-test-deps/node_modules node apps/learn/nutrition-plate/tests/browser.cjs
```

The browser script needs `puppeteer-core`, `/usr/bin/google-chrome`, and
`/workspace/np_review` for screenshots. It covers adding by tap, meals,
targets, save/load, persistence, 390×844 / 844×390 / desktop, light and dark,
and 44 px buttons.
