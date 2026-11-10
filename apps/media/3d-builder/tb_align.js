/* 3D Builder — tb_align.js: align, distribute, bounding-box snap. TD2
   Pure helpers, no DOM. Boxes are { min:[x,y,z], max:[x,y,z] }. */

export const OBJECT_SNAP_THRESHOLD = 0.2;

export function boxCenter(box) {
  return [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2
  ];
}

export function boxSize(box) {
  return [
    box.max[0] - box.min[0],
    box.max[1] - box.min[1],
    box.max[2] - box.min[2]
  ];
}

/**
 * items: [{ id, box, position: [x,y,z] }]
 * axis: 0|1|2    mode: 'min' | 'center' | 'max'
 * Returns { [id]: [x,y,z] } new world positions (origin of each object).
 */
export function alignItems(items, axis, mode) {
  const out = {};
  if (!items || items.length < 2) return out;
  axis = axis | 0;
  if (axis < 0 || axis > 2) return out;
  const feats = items.map(function (it) {
    const c = boxCenter(it.box);
    const f = mode === 'min' ? it.box.min[axis]
      : mode === 'max' ? it.box.max[axis]
      : c[axis];
    return f;
  });
  let target;
  if (mode === 'min') target = Math.min.apply(null, feats);
  else if (mode === 'max') target = Math.max.apply(null, feats);
  else target = feats.reduce(function (a, b) { return a + b; }, 0) / feats.length;
  items.forEach(function (it, i) {
    const delta = target - feats[i];
    const p = it.position.slice();
    p[axis] = it.position[axis] + delta;
    out[it.id] = p;
  });
  return out;
}

/**
 * Evenly space centres along axis between the first and last (sorted by centre).
 * First and last stay put. Needs 3+ items.
 */
export function distributeItems(items, axis) {
  const out = {};
  if (!items || items.length < 3) return out;
  axis = axis | 0;
  if (axis < 0 || axis > 2) return out;
  const sorted = items.slice().sort(function (a, b) {
    return boxCenter(a.box)[axis] - boxCenter(b.box)[axis];
  });
  const first = boxCenter(sorted[0].box)[axis];
  const last = boxCenter(sorted[sorted.length - 1].box)[axis];
  const gap = (last - first) / (sorted.length - 1);
  sorted.forEach(function (it, i) {
    const want = first + gap * i;
    const have = boxCenter(it.box)[axis];
    const p = it.position.slice();
    p[axis] = it.position[axis] + (want - have);
    out[it.id] = p;
  });
  return out;
}

/**
 * Translation [dx,dy,dz] that would snap movingBox faces to other boxes.
 * Per axis, the nearest face-to-face (min/min, min/max, max/min, max/max)
 * within threshold wins. No snap on an axis if nothing is close enough.
 */
export function snapBoxes(movingBox, otherBoxes, threshold) {
  const t = threshold == null ? OBJECT_SNAP_THRESHOLD : threshold;
  const d = [0, 0, 0];
  if (!movingBox || !otherBoxes || !otherBoxes.length) return d;
  for (let axis = 0; axis < 3; axis++) {
    let best = t + 1;
    let bestDelta = 0;
    const mMin = movingBox.min[axis];
    const mMax = movingBox.max[axis];
    for (let i = 0; i < otherBoxes.length; i++) {
      const o = otherBoxes[i];
      const candidates = [
        o.min[axis] - mMin,
        o.max[axis] - mMin,
        o.min[axis] - mMax,
        o.max[axis] - mMax
      ];
      for (let c = 0; c < candidates.length; c++) {
        const ad = Math.abs(candidates[c]);
        if (ad <= t && ad < best) {
          best = ad;
          bestDelta = candidates[c];
        }
      }
    }
    if (best <= t) d[axis] = bestDelta;
  }
  return d;
}
