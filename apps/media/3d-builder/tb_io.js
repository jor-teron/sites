/* 3D Builder — tb_io.js: .h3d format, placement helpers, autosave. TD1 */

export const RELEASE = 'TD1';
export const FORMAT = 'h3d';
export const FORMAT_VERSION = 1;
export const STORAGE_KEY = '3dbuilder.scene';
export const TYPES = ['box', 'sphere', 'cylinder', 'cone', 'plane', 'torus'];
export const TYPE_LABELS = {
  box: 'Box',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
  cone: 'Cone',
  plane: 'Plane',
  torus: 'Torus'
};
export const DEFAULT_COLOR = '#4f8cff';
export const SNAP = { translate: 0.5, rotateDeg: 15, scale: 0.1 };
export const PLACE_STEP = 1.25;
export const PLACE_MIN_DIST = 0.9;

export function radToDeg(r) {
  return Number(r) * 180 / Math.PI;
}

export function degToRad(d) {
  return Number(d) * Math.PI / 180;
}

export function snapValue(v, step) {
  if (!step || !isFinite(Number(v))) return v;
  return Math.round(Number(v) / step) * step;
}

export function roundN(v, n) {
  const p = Math.pow(10, n == null ? 3 : n);
  return Math.round(Number(v) * p) / p;
}

/** Y so a default primitive sits on the grid (y = 0). */
export function sitHeight(type) {
  if (type === 'plane') return 0;
  if (type === 'torus') return 0.2;
  return 0.5;
}

export function defaultRotationDeg(type) {
  if (type === 'plane') return [-90, 0, 0];
  return [0, 0, 0];
}

export function nextName(type, existingNames) {
  const label = TYPE_LABELS[type] || 'Object';
  const used = new Set((existingNames || []).map(function (s) { return String(s); }));
  let i = 1;
  while (used.has(label + ' ' + i)) i += 1;
  return label + ' ' + i;
}

/**
 * First free XZ slot, starting at the origin and walking +X, then a ring.
 * occupied is an array of [x, z].
 */
export function nextOffset(occupied, step, minDist) {
  step = step == null ? PLACE_STEP : step;
  minDist = minDist == null ? PLACE_MIN_DIST : minDist;
  const pts = occupied || [];
  function free(x, z) {
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i][0] - x;
      const dz = pts[i][1] - z;
      if (dx * dx + dz * dz < minDist * minDist) return false;
    }
    return true;
  }
  if (free(0, 0)) return [0, 0];
  // Prefer a line along +X so new shapes line up predictably.
  for (let n = 1; n <= 48; n++) {
    if (free(n * step, 0)) return [n * step, 0];
  }
  for (let ring = 1; ring <= 48; ring++) {
    const reach = ring * step;
    if (free(-reach, 0)) return [-reach, 0];
    if (free(0, reach)) return [0, reach];
    if (free(0, -reach)) return [0, -reach];
    for (let i = 1; i <= ring; i++) {
      const o = i * step;
      const cand = [
        [reach, o], [reach, -o], [-reach, o], [-reach, -o],
        [o, reach], [-o, reach], [o, -reach], [-o, -reach]
      ];
      for (let c = 0; c < cand.length; c++) {
        if (free(cand[c][0], cand[c][1])) return cand[c];
      }
    }
  }
  return [(occupied.length + 1) * step, 0];
}

export function isFiniteNumber(n) {
  return typeof n === 'number' && isFinite(n);
}

function parseVec3(v, fallback) {
  if (Array.isArray(v) && v.length >= 3 &&
      isFinite(Number(v[0])) && isFinite(Number(v[1])) && isFinite(Number(v[2]))) {
    return [Number(v[0]), Number(v[1]), Number(v[2])];
  }
  return fallback.slice();
}

export function parseColor(c) {
  if (typeof c === 'string' && /^#([0-9a-fA-F]{6})$/.test(c)) return c.toLowerCase();
  if (typeof c === 'string' && /^#([0-9a-fA-F]{3})$/.test(c)) {
    const a = c.charAt(1), b = c.charAt(2), d = c.charAt(3);
    return ('#' + a + a + b + b + d + d).toLowerCase();
  }
  return DEFAULT_COLOR;
}

export function normalizeObject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || '').toLowerCase();
  if (TYPES.indexOf(type) < 0) return null;
  const name = (typeof raw.name === 'string' && raw.name.trim()) ? raw.name.trim() : nextName(type, []);
  const id = (typeof raw.id === 'string' && raw.id) ? raw.id : null;
  let scale = parseVec3(raw.scale, [1, 1, 1]);
  if (Math.abs(scale[0]) < 0.01) scale[0] = 0.01;
  if (Math.abs(scale[1]) < 0.01) scale[1] = 0.01;
  if (Math.abs(scale[2]) < 0.01) scale[2] = 0.01;
  return {
    id: id,
    type: type,
    name: name,
    position: parseVec3(raw.position, [0, sitHeight(type), 0]),
    rotation: parseVec3(raw.rotation, defaultRotationDeg(type)),
    scale: scale,
    color: parseColor(raw.color)
  };
}

export function makeProject(objects) {
  return { format: FORMAT, version: FORMAT_VERSION, objects: objects || [] };
}

export function validateProject(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Not a project file.' };
  if (data.format !== FORMAT) return { ok: false, error: 'This is not a .h3d project.' };
  if (data.version !== FORMAT_VERSION) {
    return { ok: false, error: 'Unsupported .h3d version (' + data.version + ').' };
  }
  if (!Array.isArray(data.objects)) return { ok: false, error: 'The project has no object list.' };
  const objects = [];
  for (let i = 0; i < data.objects.length; i++) {
    const o = normalizeObject(data.objects[i]);
    if (!o) return { ok: false, error: 'Object ' + (i + 1) + ' is not a valid shape.' };
    objects.push(o);
  }
  return { ok: true, project: makeProject(objects) };
}

export function parseProject(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  return validateProject(data);
}

export function stringifyProject(project) {
  return JSON.stringify(project, null, 2);
}

export function loadAutosave() {
  try {
    const t = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY) : null;
    if (!t) return { ok: true, project: makeProject([]), empty: true };
    const r = parseProject(t);
    if (!r.ok) return { ok: true, project: makeProject([]), empty: true, corrupt: true };
    return { ok: true, project: r.project, empty: r.project.objects.length === 0 };
  } catch (e) {
    return { ok: true, project: makeProject([]), empty: true };
  }
}

export function saveAutosave(project) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(STORAGE_KEY, stringifyProject(project));
    return true;
  } catch (e) {
    return false;
  }
}

export function downloadH3d(project, filename) {
  const blob = new Blob([stringifyProject(project)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'scene.h3d';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
}
