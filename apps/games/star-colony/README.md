# Star Colony — SC-1c

An original, offline colony simulation. Open `star-colony.html` or `index.html`.
No downloads, external assets, copied art, accounts, or libraries are required.

## Core model

- 48 × 32 seeded terrain. Rock blocks A*. Ice/ore drills require the matching deposit.
- One tile per building. Walk-through airlocks; cardinal adjacency joins utility networks.
  Corridors extend networks. Isolated structures do not borrow global power or oxygen.
- Day = 180 simulation seconds (64% daylight). Each solar panel generates 16 power;
  each battery holds 900. Consumers use 6 total in the starter colony. Oxygen gets priority.
- Three settlers haul construction materials from physical storage, build, haul outputs,
  mine and tend farms. Needs interrupt work for oxygen, meals and sleep. All jobs walk
  real A* paths. Habitat domes are sealed oxygen reservoirs. Outside oxygen is suit air.
- Starter settlement is a survivable training base, not an empty death countdown.
- Local save key: `star-colony.save`; no offline-time progression. 0.25 s fixed ticks.
  `core/` is DOM-free; rendering and simulation rates are independent.
- Theme defaults Auto and follows Hub Light/Dark; settings gear uses shared Games Settings.
- Mouse/touch drag pans; wheel/pinch zooms. Tap plans the selected structure. Tap the
  selected build button again to inspect. Keyboard arrows move a tile cursor, Enter acts;
  P pauses and Escape cancels a blueprint selection. Plans charge resources only when hauled.

## Tests

`node --test apps/games/star-colony/tests/sim.test.cjs`

Browser checks: serve the repository on port 8828 and run `tests/browser.cjs` using
Puppeteer from `/workspace/sc-test/node_modules`. Phone checks are headless only.
SC-1a validation: 9 Node tests passed, including 20 full in-game days with all three
settlers alive, finite state and bounded jobs. 13 browser checks passed, including
1280×800, 390×844 and 844×390; no console/page errors.

At SC-1a, catalog wiring was reserved for SC-1c. No shared runtime code or build bump.


## SC-1b — events and growth

A warning precedes dust fronts, meteors, equipment faults and spore illness.
Repairs are field work (no resource cost); wrecked structures remain repairable.
Ships wait safely in orbit until you choose Pantry, Water or Materials. Every
three days after docking, up to two new settlers can arrive if you have beds.

Build a Discovery Lab and select a discovery with Research. Points come from
actual colonist work, not elapsed time. Prism Solar → Closed Water Loop → Gentle
Care → Woven Shells; Cargo Wings branches from Prism Solar. Hauler Nests launch
one physical hauling drone each. Skills grow through use and affect work speed;
hauling skill also improves carrying speed. A powered Care Station cures illness.
Goals track 10/20 settlers, all research and five consecutive days whose production
covers actual consumption with no power or resource shortages. Saves from SC-1a
upgrade without discarding the settlement.

SC-1b validation: 19 Node tests (core + growth), plus legal 30-day autoplay:
21 settlers, no deaths, all five discoveries and four milestones, bounded jobs,
finite state. Browser: 15 checks including research/ship actions, both phone
orientations and zero console/page errors. No real-phone test performed.


## SC-1c — polished controls and visuals

Original canvas suits, moving legs and work sparks; tracking solar panels,
illuminated domes, night lights, wind particles and meteor streaks. Power and
oxygen views show connections and reserves. Low graphics / reduced motion
remove decorative motion without changing simulation outcomes.

Inspect buildings on the map. Use Crew to select settlers (including overlapping
settlers) and inspect needs, skills, health and work. Alerts and Goals have their
own information tabs. Synthesized sounds obey the shared SFX and master volume;
the local mute button persists separately. There is no music.

Safe-area-aware portrait and landscape layouts, pinch zoom, scrolling build bar,
40px+ primary targets, focus outlines and modal focus trapping. The How to play
and Pause cards explain controls and keep time stopped. If the colony dies, its
summary appears once and you can inspect the remains or start over.

SC-1c validation: 25 Node tests and 27 headless Chrome checks passed on port 8828.
This includes the 20-day core endurance and 30-day growth autoplay, all four event
types, no NaN or stalled jobs, both phone viewports (390×844 and 844×390), actual
two-finger touch zoom, all primary targets ≥40px, Auto Hub Light/Dark, needs and
building cards, overlays, weather, mute, Help, game over and zero console errors.
Headless screenshots were inspected; no real phone was used.

Catalog wiring is added in SC-1c (six-column CSV, generated hub_catalog.js, manual
hub_appindex.js row and Games Settings progress-prefix/README entry). `newtab` is
empty / index value 0: Windowed by default. The catalog generator changed only
the new game row; no unrelated VNC row was retained. The icon is 128×128 PNG,
reproducible with `python3 apps/games/star-colony/assets/make_icon.py` (Pillow).

### Scope and tuning notes

This is deliberately a forgiving starter settlement, with renewable deposits,
unlimited storage and free field repairs. Network links are direct cardinal
adjacency; corridors are utilities, not sealed walkable rooms. Domes provide
five arrival beds each, not a room-construction system. No demolition, combat,
external art, multiplayer, service-worker changes or shared-runtime edits.
All three releases stay local on `games/star-colony`; no push, PR or merge.
