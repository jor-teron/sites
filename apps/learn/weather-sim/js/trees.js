/* trees.js — procedural pines that lean in the wind
   WS5: 3–4 overlapping clip-path tiers, short trunk, depth haze (--haze)

   No images, no SVG files: one tree = one <div class="tree"> with a trunk
   <div class="trunk"> plus a stack of foliage <div class="tier">s.
   Everything (height, width, tier count, colour) comes from a seeded random
   number generator, so the forest looks the same on every reload.

   Animation: CSS variables --sway (angle) and per-tier --tier-sway.
   JS only writes numbers into style; the browser animates transforms.
   That keeps this file small and the motion on the compositor.

   The forest is skipped above the tree line (js/ground.js: TREE_LINE_M),
   not rebuilt — the same trees simply stay hidden.

   WHERE THE FEET ARE (WS4): the layer is a zero-height band pinned with the
   shared --horizon CSS var (css/trees.css), so a tree's bottom edge IS the
   horizon line in every place. Only heights are set here — never the foot. */

const treesLayerEl = $("trees");

/* ---------- tiny seedable random (mulberry32) ---------- */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TREE_COUNT = 7;
const trees = [];

/* ---------- build one tree ---------- */
function makeTree(rng) {
  const el = document.createElement("div");
  el.className = "tree";

  /* trunk */
  const trunk = document.createElement("div");
  trunk.className = "trunk";
  el.appendChild(trunk);

  /* shape */
  const height = 0.62 + rng() * 0.38;       // 0.62…1 of the height unit
  const widthRatio = 0.34 + rng() * 0.16;   // foliage width / tree height
  const tiers = 3 + Math.floor(rng() * 2);  // WS5: 3…4 cones (was 3…5)

  /* colour: greens that cool off when it freezes */
  const hue = 96 + rng() * 34;              // 96…130 (green → blue-green)
  const sat = 26 + rng() * 22;
  el.style.setProperty("--hue", hue.toFixed(0));
  el.style.setProperty("--sat", sat.toFixed(0) + "%");

  const tierEls = [];

  /* WS5: tiers overlap down from the tip; leave ~20% at the bottom for trunk */
  for (let i = 0; i < tiers; i++) {
    const tier = document.createElement("div");
    tier.className = "tier";
    const p = i / Math.max(1, tiers - 1);   // 0 = top … 1 = bottom
    /* narrower at the tip, wider at the base */
    tier.style.width = (48 + p * 52).toFixed(1) + "%";
    /* each tier is tall enough to overlap the one below */
    tier.style.height = (38 + (1 - p) * 8).toFixed(1) + "%";
    /* stack from tip; overlap ~35% of height so edges droop over the next */
    tier.style.top = (p * 52).toFixed(1) + "%";
    tier.style.zIndex = String(tiers - i);
    el.appendChild(tier);
    tierEls.push(tier);
  }

  /* placement: a fixed slot per tree, with a little jitter */
  const slot = 0.04 + ((trees.length + 0.5) / TREE_COUNT) * 0.92 + (rng() - 0.5) * 0.1;

  treesLayerEl.appendChild(el);

  return {
    el,
    tierEls,
    slot,                           // 0…1 across the scene
    depth: 0.55 + rng() * 0.45,
    height,
    widthRatio,
    phase: rng() * Math.PI * 2,     // where this tree is in its sway cycle
    lean: (rng() - 0.5) * 2,        // -1…1, a small permanent lean
    stiff: 0.7 + rng() * 0.6,       // thicker trees move less
  };
}

function buildTrees() {
  const rng = makeRng(20261107); // fixed seed → same forest every time
  for (let i = 0; i < TREE_COUNT; i++) {
    trees.push(makeTree(rng));
  }
}

/* =========================================================
   WHERE A TREE CAN STAND
   Two reasons a tree can be hidden, both read from the place:
     - it would stand in the water (below sea level: the shore is narrow)
     - the place is above the tree line (a pass at 3,550 m has no forest)
   The forest itself never changes — we only hide what is not there.
   ========================================================= */
function layoutTrees() {
  const treesAllowed = !aboveTreeLine();

  /* --water-span comes from ground.js: 0 on land, >0 in a basin.
     Trees use the dry share of the width, so none of them stands in water. */
  const span = sceneEl.style.getPropertyValue("--water-span");
  const wet = parseFloat(span) || 0;
  const land = 1 - wet;

  /* tree height is never more than a quarter of the scene: a forest on the
     skyline, not a wall across the picture. Narrow screens shrink it. */
  const groundW = Math.max(1, groundEl.clientWidth);
  const narrow = Math.max(0.55, Math.min(1, groundW / 720));

  trees.forEach((t) => {
    const x = t.slot * land;
    const hidden = !treesAllowed || (wet > 0 && x > land - 0.04);
    t.el.style.display = hidden ? "none" : "";
    if (hidden) return;

    t.el.style.left = (x * 100).toFixed(1) + "%";
    /* --tree-h is one unit of tree height, set on the layer (css/trees.css) */
    t.el.style.setProperty("--h", `calc(var(--tree-h) * ${(t.height * t.depth * narrow).toFixed(3)})`);
    t.el.style.setProperty("--w", `calc(var(--tree-h) * ${(t.height * t.widthRatio * t.depth * narrow).toFixed(3)})`);
    /* WS5: far (small) trees are a touch lighter / hazier */
    const haze = Math.max(0, 1 - t.depth); // 0 at front … ~0.45 at back
    t.el.style.setProperty("--haze", haze.toFixed(2));
    t.el.style.opacity = (0.72 + t.depth * 0.28).toFixed(2);
    t.el.style.zIndex = String(Math.round(t.depth * 10));
  });
}

/* ---------- sway ---------- */

/* wind 0…100 → amp of the wave, 0.5° (calm) … 9° (gale) */
function swayAmplitude() {
  return 0.5 + Math.pow(state.wind / 100, 1.4) * 9;
}

let treeTime = 0;

function tickTrees(dt) {
  treeTime += dt;

  const amp = swayAmplitude();
  /* gustiness: slow extra wobble, so the motion is not a metronome */
  const gust = 1 + 0.35 * Math.sin(treeTime * 0.7);
  /* how fast each tree waves: stronger wind = quicker */
  const rate = 0.9 + state.wind * 0.05;

  trees.forEach((t) => {
    if (t.el.style.display === "none") return;

    /* whole tree: steady lean downwind + a sine wave with its own phase */
    const wave = Math.sin(treeTime * rate + t.phase);
    const sway =
      state.wind * 0.045 * t.lean +      // permanent lean in the wind
      wave * amp * gust * t.lean;        // side to side
    const deg = sway / t.stiff;

    t.el.style.setProperty("--sway", deg.toFixed(2) + "deg");

    /* tiers: tips bend more and slightly later than the trunk */
    t.tierEls.forEach((tier, i) => {
      const lagged = Math.sin(treeTime * rate + t.phase - i * 0.35);
      const tipDeg = (t.lean * (amp * lagged * gust - amp * wave)) / t.stiff;
      tier.style.setProperty("--tier-sway", (tipDeg * 0.45).toFixed(2) + "deg");
    });
  });
}

/* ---------- look changes with weather ---------- */

let lastTreeLook = "";

/* called from renderAll: frost, fog fade, snow on branches */
function syncTreeLook() {
  const key = [
    Math.round(state.temperature),
    fogLevel().toFixed(2),
    Math.round(snowAmount() * 100),
  ].join("|");
  if (key === lastTreeLook) return;
  lastTreeLook = key;

  /* cold → needles lose saturation and go bluish-grey */
  const cold = Math.min(1, Math.max(0, (10 - state.temperature) / 22));
  /* fog fades trees back so they feel far away */
  const mist = fogLevel() * 0.55;
  /* snow on the branches once the ground is really white */
  const snowCoat = Math.min(1, snowAmount() * 1.4);

  trees.forEach((t) => {
    t.el.style.setProperty("--cold", cold.toFixed(2));
    t.el.style.setProperty("--mist", mist.toFixed(2));
    t.el.style.setProperty("--snowcoat", snowCoat.toFixed(2));
  });
}

buildTrees();
