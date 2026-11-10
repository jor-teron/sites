# Ant Farm

A sandbox ant colony in Games / Lab. Workers dig thin branching tunnels, forage
on the surface, and raise brood in chambers under a day and night cycle. Tap to
drop food or water. Open the gear for theme (Auto follows the Hub or your
system), frame rate, and low graphics.

## Open

- `ant-farm.html` is the game. `index.html` redirects and keeps the query string and hash.
- Test hook: `?seed=N&sim=SECONDS` starts a seeded colony and fast-forwards it.
  The same seed always builds the same farm.

## Layout

- `core/` — world grid, colony step, renderer, UI
- `assets/draw/` — soil and tunnels, surface, chambers, wooden frame
- `assets/models/ant.js` — code-drawn ants
- `ui/` — chrome styles and the shared settings bridge (`ui/settings.js`)
- `ant-farm_settings.js` — leftover path; settings now live in `ui/settings.js`

## Camera

The farm fills the window by default (cover / fill), so a portrait phone is no
longer a small letterboxed tank. Pinch or use the mouse wheel to zoom, drag to
pan, `+` / `-` to zoom, arrow keys to pan, `0` to refill the view around the
nest, `F` to fit the whole tank. Fit farm and Fill view are also in the ⋯ menu.

## Releases

- v0.1 R1, v0.2 AF2 (branching tunnels, shared settings), v0.3 AF3 (brood, day/night, falling food)
- **AF-4a** — fill-the-phone camera, smooth tunnel walls with rounded lips, richer
  soil and stones, distinct chamber floors, compact toolbar with the title
  visible, light theme plus Auto (System) as the default, settings moved to
  `ui/settings.js` (old keys still work).
- **AF-4b** — side-view ants with walk, dig and carry cycles, a bigger queen,
  clearer eggs / wriggling larvae / cocoons, soft glowing pheromone paths,
  ants that walk on dirt mounds, wet soil that dries with puddles and a
  drawn splash, and a moon with dimmer clouds at night (foragers inside the nest).

