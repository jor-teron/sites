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
computes it, but it is **not applied for you**: setting a place keeps the air
mass you set and only changes the height it has to climb. Otherwise the two
lessons (latitude vs. altitude) cancel each other out on screen.
WS3: the only built-in row is a neutral `default`; your town is registered as
`"custom"` via `registerCustomPlace()`.

## 15. Height bends the air (the lapse rate)
`temperatureAt()`: −6.5 °C per 1,000 m up, **+11 °C per 1,000 m down** into a basin.
That second sign is why a below-sea-level basin reads *warmer* than the coast beside
it, and why a 3,550 m pass is ~23 °C colder than sea level. Same air mass, different
height — that is the whole demonstration.
(WS3 removed the old Dead Sea / Kedarnath presets; the maths still applies to any
custom place you set with a high or negative elevation.)

## 16. The ground has its own line — the sea never sets it
There is **one** fraction that positions the ground: `--horizon`
(`horizonLine()` in js/ground.js). That is the line where the trees stand and
where the sky ends. It depends **only on height**, and WS4 caps it at 25%:

```js
HORIZON_COAST = 0.16   // low coast: lots of sky
HORIZON_HIGH  = 0.25   // hard cap — ground never more than 25% tall
horizon = COAST + min(1, metres / 3600) * (HIGH - COAST)
```

The water is a *separate* number, `--sea-level`, and it is **not** in that sum:
in a basin the water surface sits at `SEA_SURFACE = 0.08`, well below the
horizon, so you look *down* at it. The sea never moves the ground.

> This is the bug that was fixed: the ground used to be drawn with
> `bottom: calc(ground × 100% − 26%)`, a formula built around the old
> `SEA_LINE = 0.45`. At the coast that put the ground's top edge on the sea
> line, so the ground (and every tree on it) floated up the picture. Now the
> ground block is a fixed `--ground-h` tall and its **top edge is the horizon**.

## 17. Trees stand on the horizon, always
`.trees-layer` is a **zero-height** band pinned with the **same** `--horizon`
CSS var as the ground crest (`css/trees.css`). It is a sibling of `.ground`
(child of `.scene`), so `bottom: calc(var(--horizon) * 100%)` is a % of the
scene — one shared source of truth. A tree grows *up* from that line.
(WS4 fixed the old bug where the layer sat at the *bottom* of `.ground`, so
the feet were lower than the crest.) Only heights are written by JS, never a
foot position. `--tree-h` keeps `--h`/`--w` as real lengths.

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
`TREE_LINE_M = 2600`, `SNOW_LINE_M = 1200`. A custom place at 3,550 m has no trees;
one at 1,620 m does and can hold snow on top. Nobody wrote "if mountain X" —
the two constants did it. (WS3 removed the Kedarnath / Zermatt presets.)

## 22. WS1 — light pass (taps, battery, calm motion)
Dropped the leftover stub files (`css/_link-check.css`, `agent/_trees-layout.patch.txt`).
Reset, place picker and slider thumbs are ≥ 48px, with a jelly press on Reset.
The rAF loop pauses while the tab is hidden (no big dt on resume), and
`prefers-reduced-motion` freezes tree sway / long fades and cuts rain particles.

## 23. WS2 — your place + live weather
Weather Sim is **standalone**: it never reads My Day's saved place. Your town
lives in `localStorage` under `weather-sim:custom-place` (`{name,lat,lon,elev,tz}`).
`registerCustomPlace()` adds a `"custom"` row so `elevationOf` / look / report
all keep working. Water name is `""`, so an inland town is just land
(`seaLine` only draws water when elevation < 0).

**Live → sliders.** Open-Meteo gives *local* air. The Temperature slider is
*sea-level* air, so we invert the lapse:

```js
// temperatureAt: local = sea − (km × 6.5)   when above sea
// seaLevelFromLocal: sea = local + (km × 6.5)
```

Then clamp to the slider's real range (WS3: 0…50; was 20…60 in WS2). Humidity /
cloud / wind (km/h) map straight across; time of day is the place's local hour
from `current.time`. `liveToSliders()` is a pure function so a small Node test
can check the maths without a network.

One pull on open (if a custom place is set and online), and again when you tap
**↻ Live**. Dragging a slider afterwards is free simulation — no auto-refetch.
Reset clears the weather snapshot but **keeps** your place (it is a setting).

## 24. WS3 — smaller thumbs, 0…50 °C, presets gone
Slider thumbs are ~24px again (WS1 had made them 48px); the input stays ~44px
tall so the finger still has room, and the track is a bit slimmer.
Temperature sea-level range is **0…50 °C** (was 20…60). Old saved values outside
that band are clamped on load. Semantics unchanged: the slider is still
sea-level air; local air is derived via `temperatureAt`.

All fixed presets (Mumbai / Kedarnath / Dead Sea / Zermatt / Leadville) are
gone. `PLACES` holds only a neutral `default` (lat ~26, elev 0, inland) plus
the runtime `"custom"` row. The place `<select>` is replaced by one big
**📍** button that opens the Set place panel. Shore / sea drawing code stays
in place for a custom place with elevation < 0, but nothing ships with water
now. Unknown saved place keys fall back through `resolvePlaceKey()` → custom
(if set) or `default`.

## 25. WS4 — lower horizon, trees on it, sun arc, crescent moon
**Horizon ≤ 25%.** `HORIZON_COAST = 0.16`, `HORIZON_HIGH = 0.25`. Even a high
custom place only lifts the crest a little; the sky keeps most of the frame.
`--ground-h` is ~22% so the green strip matches.

**One `--horizon` for ground and trees.** Trees moved out of `.ground` to sit
beside it under `.scene`, both reading `var(--horizon)`. Feet = crest, always.

**Sun path.** `sunPosition(hour, horizonFrac)`: rises at left on the horizon
(06:00), arcs to top-middle at noon (`sin(π·p)`), sets at right on the horizon
(19:00). The disc's centre sits on the crest at rise/set, so it goes down
*behind* the ground. Moon uses the same arc for the night (19:00→06:00).

**Crescent moon.** `mask-image` cuts an offset circle out of the pale disc →
a clean half crescent, glow kept.
