# Weather Simulator — learning notes

Small things worth knowing, in the order the app uses them.

## 1. One source of truth
All sliders write into `state` (js/state.js). Nothing else stores weather data.
Every change calls `renderAll()`, which redraws the sky, clouds, rain, ground + trees, and report.
If the screen looks wrong, look at `state` first.

`state.altitude` does **not** exist. Height is a property of the place, read
with `elevationOf(state.place)` (js/ground.js). One copy, one place.

## 2. Rules are an ordered list
`headline()` in js/report.js is just `if` statements, top to bottom:
fog → snow → rain → cold → hot → windy → snow on ground → night → high mountain → fair.
The first rule that matches wins, so **order is the logic**.

## 3. Fog is "cloud near the ground"
Real fog = lots of water + cold + almost no wind (wind blows it away).
```js
if (cloud < 40 || humidity < 70 || wind > 2.5) return 0;
return Math.min(1, (humidity - 70) / 20);
```
The number it returns (0…1) is used twice: as text ("Misty"/"Foggy") and as CSS
`opacity` on the `.fog` layer. One number, two places — that is the whole trick.

## 4. "Feels like" is two formulas, not one
- Cold + windy → **wind chill** (Environment Canada). Wind strips heat away.
- Hot + humid → feels **hotter**, because sweat evaporates slower.
Both need a limit: below 10 °C the heat formula is meaningless.

## 5. Snow has memory
Rain appears and is gone. Snow *accumulates*: `tickSnow(dt)` adds a little every
frame while it snows, and melts when the temperature is above 0 °C.
Every change is `rate * dt`, so a slow laptop and a fast phone build the same pile.

## 6. Melt is why "Snow Day" can appear
Snow is not the headline *while* it snows (*Snowstorm* wins). Stop the snow, warm
to +4 °C: the pile shrinks and the report says `Snow is melting (12 cm left)`.

## 7. Units — one number, one unit
**The Wind slider is km/h everywhere.** Label, wind chill and `windName()` all take
km/h. `windPx()` only scales it into pixels per second for motion, which is a
drawing decision, not a unit change. Comment any such decision.

**Temperature has two numbers.** The slider is *sea level* air; `state.temperature`
is the air *at your place*. `applyTemperature()` is the only place that converts.
The slider label even says so: `sea level 24 °C`, and the output shows the local
air plus how far it moved (`12 °C (−12 local)`).

## 8. Why the scene shrinks on a phone
`.app:focus-within .scene { flex-basis: 24dvh; }` shrinks the scene while you drag
a slider. Pure CSS, no JS listener.

## 9. Reset should clear *history*, not just sliders
Reset puts sliders back, `resetSnow()`, `clearSave()`, re-render. Without resetting
`snow`, a reset would leave last winter lying there.

## 10. Procedural trees = one seed + a loop
`makeRng(20261107)` (mulberry32) gives the same "random" numbers every reload.
Same seed = same forest; change the seed = a new forest, zero new code.

## 11. Sway = CSS variable written by JS
JS writes `--sway` and `--tier-sway`; CSS does `transform: rotate(...)` with
`transform-origin: 50% 100%` (pivot at the foot). Tips lag the trunk (`phase - i*0.35`),
which reads as "springy" instead of "rigid".

## 12. Weather changes what a tree *looks* like
`syncTreeLook()` writes `--cold`, `--mist`, `--snowcoat` on slider change only.

## 13. Depth for free
Each tree's `depth` 0.55…1 scales `--h`/`--w`, opacity and `z-index`.
Small + faint + behind = far away. No 3D, no camera.

## 14. A place is a latitude, not a preset
Two numbers could decide the base air: `SEA_LEVEL_TEMP - |lat| * TEMP_FALLOFF`
(27 °C at the equator, 0.42 °C colder per degree). `baseTemperatureAt()` still
computes it, but **v1.0 does not apply it for you**: picking a place keeps the air
mass you set and only changes the height it has to climb. Otherwise the two
lessons (latitude vs. altitude) cancel each other out on screen.
Adding a new place is still **one row** in `PLACES`.

## 15. Height bends the air (the lapse rate)
`temperatureAt()`: −6.5 °C per 1,000 m up, **+11 °C per 1,000 m down** into a basin.
That second sign is why the Dead Sea (already hot at 31°N) reads *warmer* than the
sea beside it, and why a 3,550 m pass is ~23 °C colder than the coast.
Same air mass, different height — that is the whole demonstration.

## 16. The ground has its own line — the sea never sets it
There is **one** fraction that positions the ground: `--horizon`
(`horizonLine()` in js/ground.js). That is the line where the trees stand and
where the sky ends. It depends **only on height**:

```js
HORIZON_COAST = 0.30   // you stand near the sea: a low, wide sky
HORIZON_HIGH  = 0.46   // on a summit the horizon rises with you
horizon = COAST + min(1, metres / 3600) * (HIGH - COAST)
```

The water is a *separate* number, `--sea-level`, and it is **not** in that sum:
in a basin the water surface sits at `SEA_SURFACE = 0.10`, well below the
horizon, so you look *down* at it. The sea never moves the ground.

> This is the bug that was fixed: the ground used to be drawn with
> `bottom: calc(ground × 100% − 26%)`, a formula built around the old
> `SEA_LINE = 0.45`. At the coast that put the ground's top edge on the sea
> line, so the ground (and every tree on it) floated up the picture. Now the
> ground block is a fixed `--ground-h` tall and its **top edge is the horizon**.

## 17. Trees stand on the horizon, always
`.trees-layer` is a **zero-height** band pinned to the bottom of `.ground`
(`css/trees.css`). A tree grows *up* from its own bottom edge, so its foot is
the horizon by construction — no per-place padding, no magic offsets. Only
heights are written by JS, never a foot position.
The layer also has the `--tree-h` unit, so `--h`/`--w` are real lengths that
cannot depend on the ground box (which is what made tall places look wrong).

## 18. Rain must stop where the eye stops
`fallTarget()` returns `horizonLine()`: drops vanish at the skyline, in front of
the valley, in every place. `syncFallFloor()` turns that fraction into canvas
pixels on resize and on change.

## 19. Saving: store the input, derive the rest
`snow` and the sliders are saved; everything else is derived.
Order matters on load: **place first**, then temperature — the saved temperature
is sea-level air for *that* place, so it cannot be read before the place is known.
v1 saves are read once, then dropped.

## 20. The place also changes the *picture* (js/look.js)
Height is not just a number in the report. `syncPlaceLook()` writes three more
CSS variables into `.scene`:

| variable | from | what CSS does |
|---|---|---|
| `--altitude` | metres / snow line | valley haze turns bluer as you climb |
| `--crest-snow` | metres + local air temp | a white band on the crest, gone when it is warm |
| `.above-trees` | metres > `TREE_LINE_M` | the forest is hidden: rock and scree |

JS writes numbers, CSS maps numbers to colour — same rule as the fog.

## 21. Tree line and snow line are the same idea
`TREE_LINE_M = 2600`, `SNOW_LINE_M = 1200`. Kedarnath (3,550 m) has no trees;
Zermatt (1,620 m) does and can hold snow on top. Nobody wrote "if Kedarnath" —
the two constants did it.

## 22. WS1 — light pass (taps, battery, calm motion)
Dropped the leftover stub files (`css/_link-check.css`, `agent/_trees-layout.patch.txt`).
Reset, place picker and slider thumbs are ≥ 48px, with a jelly press on Reset.
The rAF loop pauses while the tab is hidden (no big dt on resume), and
`prefers-reduced-motion` freezes tree sway / long fades and cuts rain particles.

## 23. WS2 — your place + live weather
Weather Sim is **standalone**: it never reads My Day's saved place. Your town
lives in `localStorage` under `weather-sim:custom-place` (`{name,lat,lon,elev,tz}`),
and the fixed `PLACES` stay as extras. `registerCustomPlace()` adds a `"custom"`
row so `elevationOf` / look / report all keep working. Water name is `""`, so an
inland town is just land (`seaLine` only draws water when elevation < 0).

**Live → sliders.** Open-Meteo gives *local* air. The Temperature slider is
*sea-level* air, so we invert the lapse:

```js
// temperatureAt: local = sea − (km × 6.5)   when above sea
// seaLevelFromLocal: sea = local + (km × 6.5)
```

Then clamp to the slider's real range (20…60). Humidity / cloud / wind (km/h)
map straight across; time of day is the place's local hour from `current.time`.
`liveToSliders()` is a pure function so a small Node test can check the maths
without a network.

One pull on open (if custom is selected and online), and again when you tap
**↻ Live**. Dragging a slider afterwards is free simulation — no auto-refetch.
Reset clears the weather snapshot but **keeps** your place (it is a setting).
