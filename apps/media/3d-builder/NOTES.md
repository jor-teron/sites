# 3D Builder — notes

## TD1

- New Media app at `apps/media/3d-builder/` (3D section, after 3D Viewer).
  Name is "3D Builder". Scene autosave key `3dbuilder.scene` (`.h3d` JSON,
  format version 1). Theme key `3dbuilder.theme` `{theme: auto|light|dark}`.
  Auto follows Hub `sites-hub.theme` / `sites-hub.themeAuto` live (storage,
  hub-prefs, matchMedia, focus) and updates the viewport background.
- Local three.js r170 (`vendor/three/`, from LandCraft's unmodified build plus
  official OrbitControls and TransformControls). Import map maps `"three"`
  to the local module. No CDN.
- Viewport: grid floor, axes hint, orbit / pan / zoom (mouse and touch).
  View buttons: Perspective, Front, Top, Side, and Frame selected (F).
- Add: box, sphere, cylinder, cone, plane, torus. New shapes sit on the
  grid and offset so they do not overlap.
- Click to select (raycast), empty click to deselect. Move / Rotate / Scale
  gizmo (toolbar and W / E / R). Snap toggle (0.5 units, 15°, 0.1 scale).
  Orbit is disabled while the gizmo is dragged.
- Properties: name, position, rotation in degrees, scale, colour. Live
  while dragging. Duplicate (Ctrl+D) and Delete (Del). Object list: click
  to select, double-click or Rename for an in-app dialog.
- Undo / Redo (buttons, Ctrl+Z / Ctrl+Y), snapshot stack capped at 100.
  New / Save `.h3d` / Open `.h3d`. In-app dialogs only.
- Renders on demand only (no continuous animation loop). pixelRatio capped
  at 1.5. No shadows. Modest geometry segments, for a 4 GB Celeron.
- Tests: `node --check` on every JS file, `node tests/td1.test.mjs` (pure
  helpers only). No Puppeteer, Playwright or jsdom.

### Limits

- Needs WebGL. There is no GLB / OBJ / STL export yet (that is TD3).
  `.h3d` is this app's own JSON, not a file the 3D Viewer can open.
- Export of exact-CAD or high-poly meshes is out of scope. Shapes are
  simple primitives with a single colour.
- Frame-step animation and a real-time loop are intentionally off, so
  the view only redraws after an edit, a camera move, or a resize.
- The Media page tile comes from `apps/media/media-apps.csv`. The Hub menu
  catalog needs a Team 1 / Main Builder `hub_appindex_gen.py --catalog-only`
  run before the new app shows in the Hub flyout.
