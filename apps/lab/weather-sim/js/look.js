/* look.js — what the place does to the *picture*

   ground.js already moved the horizon (where your feet are). This file
   answers the next question: standing there, what does the world look like?

   Three rules, all driven by one derived number, elevationOf(state.place):

     altitude  > 800 m   → the far valley goes bluer the higher you are
     snow line > 1200 m  → the crest keeps snow while the air up there is cool
     no trees  > 2600 m  → above the tree line only rock and snow

   Nothing here stores anything. Pick another place, call syncPlaceLook(),
   and the whole scene re-tints itself. */

/* 0 at the coast … 1 at the snow line and beyond */
function altitudeLook() {
  const metres = Math.max(0, elevationOf(state.place));
  return Math.min(1, metres / SNOW_LINE_M);
}

/* does this place sit above the tree line? */
function aboveTreeLine() {
  return elevationOf(state.place) > TREE_LINE_M;
}

/* snow on the crest: white when the air up here is cool enough to hold it,
   so a warm forecast un-snows the mountain — the same rule as the ground. */
function crestSnow() {
  const metres = elevationOf(state.place);
  if (metres < SNOW_LINE_M) return 0;
  const cold = Math.min(1, Math.max(0, (3 - state.temperature) / 10)); // 0 at +3 °C
  return cold;
}

/* written into .scene; CSS reads these numbers, JS never touches a colour */
function syncPlaceLook() {
  const metres = elevationOf(state.place);

  sceneEl.style.setProperty("--altitude", altitudeLook().toFixed(3));
  sceneEl.style.setProperty("--altitude-basin", metres < 0 ? "1" : "0");
  sceneEl.style.setProperty("--crest-snow", crestSnow().toFixed(3));

  sceneEl.classList.toggle("above-trees", aboveTreeLine());
}
