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


## TD2

- `.h3d` format version 2 (opens version 1 and migrates: visible, unlocked, default
  material, no texture, no custom sky). Autosave uses IndexedDB (`3dbuilder` /
  `scene`) and still tries `localStorage` `3dbuilder.scene` (drops big textures
  there if the quota is hit).
- Groups: select two or more, Group (Ctrl+G) or Ungroup (Ctrl+Shift+G). Children
  keep their world transform. The outliner indents children.
- Hide and lock toggles on each row in the object list. Locked objects can be
  selected but not moved with the gizmo. Hidden objects are skipped in the view.
- Materials on shapes: roughness (or shininess in the file), metalness, opacity.
- Add Point, Spot or Directional lights (helpers you can move). The default
  hemisphere and directional lights stay on. Scene panel: optional custom sky
  colour; otherwise the viewport follows the theme.
- Image texture (file picker, resized to 256 px JPEG) and text texture (drawn
  on a canvas). Images are stored in the project `textures` map as data URLs.
- Multi-select with Shift or Ctrl click in the view and the list. Align
  (left/centre/right on X, Y or Z) and Distribute (needs 3+). Snap also
  snaps bounding-box faces to other objects when you release a move.
- Undo / redo covers the new edits (full project snapshot, including textures).
- Tests: `node --check`, `node tests/td1.test.mjs`, `node tests/td2.test.mjs`.
  No Puppeteer, Playwright or jsdom. RELEASE / title / `?v=` = TD2.

### TD2 limits

- Object snap runs when you finish a move, not live mid-drag, so the gizmo
  does not fight the snap.
- Image textures are capped at 256 px and JPEG-compressed so a 4 GB Celeron
  and localStorage stay comfortable. Very large projects may only autosave
  fully in IndexedDB.
- Lights have no shadows. Multi-select rotation is around the selection
  centre (a pivot), not each object's own origin.
- GLB / OBJ / STL import and export were added in TD3.

## TD3

- Export the scene as `.glb` (official GLTFExporter), `.obj` (OBJExporter) or
  `.stl` (binary STLExporter). All three are local r170 copies under
  `vendor/three/examples/jsm/` (plus `GLTFLoader` and `BufferGeometryUtils`).
  Default lights are added to the export so other viewers are not black.
  Helpers, the gizmo and the grid are left out.
- Import a self-contained `.glb` (or a single-file `.gltf`). The model is
  wrapped as one object, scaled to a comfortable size and sat on the grid.
  The original file is stored in the project `models` map as a data URL.
- PNG screenshot of the current view (gizmo and selection box hidden).
- Save / Open still use `.h3d`. Format version 3 (opens and migrates v1 and
  v2). Import is capped at 8 MB.
- Downloads go through an in-app dialog with a Download button. No native
  alert/confirm/prompt. RELEASE / title / `?v=` = TD3.
- Tests: `node --check`, `tests/td1.test.mjs`, `td2.test.mjs`, `td3.test.mjs`.
  No Puppeteer, Playwright or jsdom.

### TD3 limits

- `.gltf` files that need a sidecar `.bin` or external textures will fail.
  Prefer a single `.glb`.
- Imported models are one object: you can move, rotate, scale, hide, lock
  and group them, but not edit their inner meshes or materials. The stored
  file is the original import, not a bake of later material tweaks (there
  are none).
- STL has no colour or textures. OBJ is a single geometry dump without a
  separate `.mtl`.
- Large models make `.h3d` autosave heavy; IndexedDB holds the full project,
  localStorage may drop models/textures if the quota is hit.
