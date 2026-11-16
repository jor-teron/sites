# Physics Lab (PS1g)

A small 2D physics playground for Learn > Science. Vanilla HTML, CSS and classic JavaScript on a canvas; no framework, no CDN, no build step. It opens from `file://` and offline.

## Experiments

| Chip | What to watch |
| --- | --- |
| Sandbox | Free play: drag, throw, add and remove bodies |
| Falling | A 1 kg and a 5 kg ball dropped together |
| Ramps | The same height on a steep and a gentle ramp |
| Bounce | Three balls with bounce 0.9, 0.6 and 0.35 |
| Collision | A moving ball hits a still ball |
| Launch | 30, 45 and 60 degree launches at the same speed |

## Controls

- **Pause / Play**, **Reset**, **Trails**, **+ Ball**
- **Gravity**: Earth 9.8, Moon 1.6, Mars 3.7, Zero
- **Bounce** and **Friction** sliders change every body
- Drag a body to throw it; tap empty space to add a ball; double-tap a body to remove it
- The HUD shows time, the selected body, speed, height and moving / height energy with a total in joules
- **Done** marks the current experiment; the last scene is remembered

## Files and code

- `core/engine.js` - bodies, segments, fixed 1/240 s step, impulses, restitution, friction and box rotation. No DOM.
- `core/scenes.js` - the six scene definitions.
- `core/app.js` - canvas, pointer input, HUD and scene wiring.
- `ui/physics-lab.css` - dark and light palettes and the page shell.
- `tests/*.cjs` - engine and scene tests (`node --test`).

Saved keys: `learn.physics-lab.done` and `learn.physics-lab.exp`.

No `?v=` labels, no Hub files touched. Catalog regeneration is a Hub job.
