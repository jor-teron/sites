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

- Health: First Aid, Human Body Explorer (HBE1: 15 main parts in 6 groups, tap a part for its card, list view, 8-question quiz; Expert/All mode planned for HBE2)
- Outdoors: Survival and Outdoors (SO1a: Fire and Water; more topics planned)
- Language: NE-India Dictionary, Caption for NEI (still in Tools), English Basic, Typing Tutor (TT1: graded keyboard lessons, on-screen keyboard, 1/2/5 minute test)
- Language and Maths: Maths and Logic (ML1a: 6 topics: Everyday Numbers, Times Tables, Fractions/Percent, Money Maths, Shapes and Measuring, Patterns and Puzzles)
- Coding: Learning HTML (Basic) (still in Tools), Code Lab (still in Lab)

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
