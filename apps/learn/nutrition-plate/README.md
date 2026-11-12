<!-- (before NP3) # Nutrition Plate — NP-1a / NP-1b / NP-1c -->
<!-- (before NP4) # Nutrition Plate — NP-1a / NP-1b / NP-1c / NP2 / NP3 -->
<!-- (before NP5) # Nutrition Plate — NP-1a / NP-1b / NP-1c / NP2 / NP3 / NP4 -->
<!-- (before NP7) # Nutrition Plate — NP-1a / NP-1b / NP-1c / NP2 / NP3 / NP4 / NP5 -->
# Nutrition Plate — NP-1a / NP-1b / NP-1c / NP2 / NP3 / NP4 / NP5 / NP7

Learn app for building Indian meal plates and planning a day.
Entry: `index.html` → `nutrition-plate.html`; standalone or Hub window.
No network content, accounts, analytics, external fonts or runtime dependencies.

## Food data

<!-- (before NP2) - 150 foods, mostly everyday Indian items, each with a code-drawn icon. -->
- 217 foods (150 from NP-1a, 43 added in NP2, 24 in NP3), mostly everyday Indian
  and Assam home foods, each with a code-drawn icon, in 13 groups.
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
- Age group, sex, activity and diet set a rough daily target from ICMR-NIN style
  figures. Sex is female, male, or prefer not to say (the mid-point, including for
  iron). Sugar is a keep-below amount (~10% of energy).
- Progress bars compare the whole day with that target. Short tips include
  “add a protein”, “too much sugar” and “add vegetables”.
- `learn.nutrition-plate.v1` stores the current week, the selected day, person
  settings, personal portion sizes, the week-start preference, and up to 20
  named plates and 20 named days on this device. Saved meals store the grams
  actually used.
- This is an educational guide, not medical advice. Needs vary by sex, body size,
  health and life stage.

## Games and polish (NP-1c)

- Guess the calories: eight questions, four energy choices, best score saved.
- Fix this plate: five unbalanced plates; add or remove foods until the
  balanced-plate guide is met.
- Healthier swaps: eight questions on lighter or higher-fibre alternatives.
- How to use explains portions, the plate guide, sex-specific targets and saves.
- On phones the 150-food library uses group chips, a compact list, and
  collapsible groups so it is not one long scroll.
- Bowl icons for dals and sabzis are drawn distinctly (colour, garnish or shape).

## Kitchen garden, leafy greens and named rice (NP2)

- New group **Leafy greens** (`leafy`), after Vegetables: lai xaak, amaranth
  (khutora), drumstick leaves (sojina paat), water spinach (kolmou), jute leaves
  (morapat), colocasia leaves (kochu xaak), pumpkin leaves, bathua, dhekia, radish
  leaves, lettuce, and a bunch of coriander or mint. Leafy greens count with
  vegetables in the plate guide and the "add vegetables" tip.
- Grains: Basmati, Joha, bora saul and red rice (1 katori, 140 g), separate from
  the generic steamed, brown and jeera rice.
- Vegetables: tomato, onion, cucumber, cauliflower, green peas, capsicum, radish
  and carrot as their own items; ridge, sponge, snake, pointed (potol), ash (komora)
  and ivy (kundru / kunduli) gourds; sweet potato, kochu, ol and yam; knol khol,
  raw papaya, green jackfruit (kothal), raw banana, banana flower (koldil), banana
  stem (posola), spring onion and drumstick (sojina).
- Palak, methi, sarson da saag, cabbage, lauki, kaddu and karela stay in Vegetables
  unchanged.

## Condiments, pork, dry fish and broiler (NP3)

- New group **Condiments** (`condiments`), after Fats, nuts and seeds: ginger,
  garlic, green chilli, dry red chilli, turmeric, cumin, mustard seed, lemon / nemu,
  tamarind, outenga, vegetarian pickle, kharisa and mustard oil. Small household
  portions (1 tsp, a few cloves, 1 wedge). Condiments sit on the side of the plate
  guide, outside the four quarters and outside "oils, snacks or sweets". The generic
  cooking oil stays in Fats.
- Meat and fish (non-veg, hidden by the vegetarian and egg filters): pork curry,
  smoked pork, fried pork; dry fish — hukoti, namsing / sidol, dried small fish,
  dried prawn; plain cooked broiler and broiler fry; masor tenga and small-fish fry.
- Nutrient method is the same as NP-1a. Foods with no exact IFCT 2017 row use the
  closest one and stay approximate: Joha (milled aromatic rice), bora saul
  (glutinous rice), red rice (red / parboiled rice), potol (parwal), komora (ash
  gourd), kochu / ol / kath alu (colocasia, elephant foot yam, yam), koldil (banana
  flower), posola (plantain stem), lai xaak (mustard leaves), khutora (amaranth),
  dhekia (fern; leafy-green average), kolmou (ipomoea leaves), morapat (jute leaves),
  outenga (elephant apple; sour-fruit values), kharisa (bamboo shoot + chilli),
  hukoti / namsing / sidol (dried fish; hukoti with arum stem), smoked pork (cooked
  pork), masor tenga (fish curry with less fat). Cooked sabzis and saags include a
  typical teaspoon or so of oil, as the NP-1a sabzis do.
<!-- (before NP4) - Not in NP2 / NP3: a Portions page, typing grams, and week or month plans (NP4–NP6). -->
<!-- (before NP5) - Week and month plans are still later work (NP5–NP6). -->
- A month planner (NP6) is parked and is not in this release.

## Portions and typed grams (NP4)

- A **Portions** tab lists every food with its default household size (for
  example 1 roti at 40 g, or 1 katori at 100 g) and a grams field. Leave the
  box blank to use the default. Reset one food, or Reset all. Personal sizes
  stay on this device.
- On the plate, + and − add or remove one of the user's portions. A grams
  field on the plate item sets a one-off amount for that serving only, without
  changing the saved personal portion.
- Nutrients scale from the food's per-gram values (the IFCT-based per-portion
  figure divided by its default grams).
- Saved plates and days store the grams actually used. Changing a personal
  portion later does not rewrite old meals. Existing qty-only saves migrate to
  `qty ×` the default household grams.
- Games keep using the built-in default portions and their original food lists.
  Figures stay approximate guides, not medical advice.

## Week planner (NP5)

- Seven days, each with breakfast, lunch, snacks and dinner. The plate editor
  is the view for one day of that week: pick a day, then add foods, portions
  and one-off grams as in NP4.
- Week totals are compared with seven times the daily ICMR-NIN style target
  (same age, sex, activity and diet). The selected day's bars and tips stay.
<!-- (before NP7) - Copy this day onto another day, or onto Monday–Friday (Saturday and Sunday
  are not changed). An in-app dialog asks for confirmation before those days
  are overwritten. -->
- NP7: the Copy controls are gone; Every day replaces them (see below).
- The week starts on Monday by default. The user can change the start day;
  meals stay on their weekday, and the preference is stored on this device.
- Today's unsaved pre-NP5 day migrates into this week on today's weekday and
  is not lost. Named plate and day snapshots and personal portions are kept.
  Saved week days store the grams actually used, so changing a portion later
  does not rewrite them.
- A month planner (NP6) is parked and is not included.

## Every day (NP7)

- The week row is **Every day**, then the seven days in week-start order.
  Every day always stays first; changing the start day does not move meals.
- Every day is a live template stored as `everyDay` (breakfast, lunch, snacks,
  dinner, actual grams like any day). It is not a calendar day.
- Inheritance is per meal slot: a weekday slot with no food shows Every day's
  meal for that slot (marked “From Every day”). A slot with food is the day's
  own and is never overwritten when Every day changes.
- Copy-on-write: + / −, typed grams, adding a food or loading a plate on an
  inherited slot saves a copy of what was showing plus the edit as that day's
  own meal. Every day and the other days are unchanged.
- Emptying a day's slot makes it follow Every day again. There is no separate
  "keep this meal empty" choice in this release.
- Week totals add the seven resolved days (own meal or Every day). Every day is
  never counted as an eighth day. The selected day's bars and tips use what the
  day shows; with Every day selected they show the template itself.
- Saved days store what the day shows, including meals taken from Every day.
- Old NP5 saves load with Every day empty; existing day meals stay as they are
  and nothing is moved from Monday into Every day.
- Copy this day and Copy to Mon–Fri were removed.
- In Desktop the in-page top row now hides when the Hub title bar takes the
  tabs (`[hidden]` rule in `ui/nutrition.css`); standalone pages and Phone keep
  it. The “‹ Learn” back-to-category button was removed.

`learn.nutrition-plate.theme`: absent = Auto (System), following the Hub
through the existing read-only HubTheme helper. The app opens Windowed with
the Hub default.

## Offline and tests

`offline.js` caches only this app's shell and its existing theme/header
dependencies. Offline use needs a successful first visit over HTTPS or localhost.

Run:

```
node --test apps/learn/nutrition-plate/tests/model.test.cjs apps/learn/nutrition-plate/tests/np23.test.cjs apps/learn/nutrition-plate/tests/np4.test.cjs apps/learn/nutrition-plate/tests/np5.test.cjs apps/learn/nutrition-plate/tests/np7.test.cjs
python3 -m http.server 8826 --bind 127.0.0.1
NODE_PATH=/workspace/arw-test-deps/node_modules node apps/learn/nutrition-plate/tests/browser.cjs
```

The browser script needs `puppeteer-core`, `/usr/bin/google-chrome`, and
`/workspace/np_review` for screenshots. It covers adding by tap, meals,
targets, save/load, persistence, 390×844 / 844×390 / desktop, light and dark,
games, How to use, sex-specific targets, the compact phone library, and 44 px buttons.
