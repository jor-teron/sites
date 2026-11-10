/* 3D Builder — tb_io.js: .h3d format v2, placement helpers, autosave. TD2 */

export const RELEASE = 'TD2';
export const FORMAT = 'h3d';
export const FORMAT_VERSION = 2;
export const FORMAT_VERSION_MIN = 1;
export const STORAGE_KEY = '3dbuilder.scene';
export const IDB_NAME = '3dbuilder';
export const IDB_STORE = 'kv';

export const SHAPE_TYPES = ['box', 'sphere', 'cylinder', 'cone', 'plane', 'torus'];
export const LIGHT_TYPES = ['light-point', 'light-spot', 'light-directional'];
export const TYPES = SHAPE_TYPES.slice();
export const ALL_TYPES = SHAPE_TYPES.concat(['group'], LIGHT_TYPES);

export const TYPE_LABELS = {
  box: 'Box',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
  cone: 'Cone',
  plane: 'Plane',
  torus: 'Torus',
  group: 'Group',
  'light-point': 'Point light',
  'light-spot': 'Spot light',
  'light-directional': 'Directional light'
};

export const DEFAULT_COLOR = '#4f8cff';
export const DEFAULT_LIGHT_COLOR = '#ffffff';
export const DEFAULT_MATERIAL = { roughness: 0.55, metalness: 0.12, opacity: 1 };
export const SNAP = { translate: 0.5, rotateDeg: 15, scale: 0.1 };
export const PLACE_STEP = 1.25;
export const PLACE_MIN_DIST = 0.9;
export const TEX_MAX_DIM = 256;

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

export function clamp01(v, fallback) {
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function isShapeType(type) { return SHAPE_TYPES.indexOf(type) >= 0; }
export function isLightType(type) { return LIGHT_TYPES.indexOf(type) >= 0; }

/** Y so a default primitive sits on the grid (y = 0). Lights sit above it. */
export function sitHeight(type) {
  if (type === 'plane') return 0;
  if (type === 'torus') return 0.2;
  if (isLightType(type) || type === 'group') return 2;
  return 0.5;
}

export function defaultRotationDeg(type) {
  if (type === 'plane') return [-90, 0, 0];
  if (type === 'light-spot' || type === 'light-directional') return [-90, 0, 0];
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
  return [(((occupied && occupied.length) || 0) + 1) * step, 0];
}

export function isFiniteNumber(n) {
  return typeof n === 'number' && isFinite(n);
}

export function makeId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* ok */ }
  return 'o_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function parseVec3(v, fallback) {
  if (Array.isArray(v) && v.length >= 3 &&
      isFinite(Number(v[0])) && isFinite(Number(v[1])) && isFinite(Number(v[2]))) {
    return [Number(v[0]), Number(v[1]), Number(v[2])];
  }
  return fallback.slice();
}

export function parseColor(c) {
  return parseColorOr(c, DEFAULT_COLOR);
}

export function parseColorOr(c, fallback) {
  if (typeof c === 'string' && /^#([0-9a-fA-F]{6})$/.test(c)) return c.toLowerCase();
  if (typeof c === 'string' && /^#([0-9a-fA-F]{3})$/.test(c)) {
    const a = c.charAt(1), b = c.charAt(2), d = c.charAt(3);
    return ('#' + a + a + b + b + d + d).toLowerCase();
  }
  return fallback;
}

export function normalizeMaterial(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  let roughness;
  if (m.roughness != null && isFinite(Number(m.roughness))) roughness = clamp01(m.roughness, 0.55);
  else if (m.shininess != null && isFinite(Number(m.shininess))) roughness = clamp01(1 - Number(m.shininess), 0.55);
  else roughness = DEFAULT_MATERIAL.roughness;
  return {
    roughness: roughness,
    metalness: clamp01(m.metalness, DEFAULT_MATERIAL.metalness),
    opacity: clamp01(m.opacity, DEFAULT_MATERIAL.opacity)
  };
}

export function normalizeTexture(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'image' && typeof raw.id === 'string' && raw.id) {
    return { kind: 'image', id: raw.id };
  }
  if (raw.kind === 'text') {
    return {
      kind: 'text',
      text: String(raw.text != null ? raw.text : ''),
      textColor: parseColorOr(raw.textColor, '#ffffff'),
      bgColor: parseColorOr(raw.bgColor, '#1e293b'),
      fontSize: Math.max(12, Math.min(128, isFinite(Number(raw.fontSize)) ? Number(raw.fontSize) : 48))
    };
  }
  return null;
}

export function normalizeLight(raw, type) {
  const r = raw || {};
  const defDist = type === 'light-directional' ? 0 : 12;
  const intensity = isFinite(Number(r.intensity)) ? Math.max(0, Math.min(20, Number(r.intensity))) : 1.5;
  const distance = isFinite(Number(r.distance)) ? Math.max(0, Number(r.distance)) : defDist;
  const angle = isFinite(Number(r.angle)) ? Math.max(1, Math.min(90, Number(r.angle))) : 30;
  const penumbra = clamp01(r.penumbra, 0.25);
  return { intensity: intensity, distance: distance, angle: angle, penumbra: penumbra };
}

export function normalizeObject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || '').toLowerCase();
  if (ALL_TYPES.indexOf(type) < 0) return null;
  const name = (typeof raw.name === 'string' && raw.name.trim()) ? raw.name.trim() : nextName(type, []);
  const id = (typeof raw.id === 'string' && raw.id) ? raw.id : makeId();
  let scale = parseVec3(raw.scale, [1, 1, 1]);
  if (Math.abs(scale[0]) < 0.01) scale[0] = 0.01;
  if (Math.abs(scale[1]) < 0.01) scale[1] = 0.01;
  if (Math.abs(scale[2]) < 0.01) scale[2] = 0.01;
  if (isLightType(type)) scale = [1, 1, 1];
  const defColor = isLightType(type) ? DEFAULT_LIGHT_COLOR : DEFAULT_COLOR;
  const rec = {
    id: id,
    type: type,
    name: name,
    position: parseVec3(raw.position, [0, sitHeight(type), 0]),
    rotation: parseVec3(raw.rotation, defaultRotationDeg(type)),
    scale: scale,
    color: parseColorOr(raw.color, defColor),
    visible: raw.visible !== false,
    locked: !!raw.locked,
    parentId: (typeof raw.parentId === 'string' && raw.parentId) ? raw.parentId : null
  };
  if (isShapeType(type)) {
    rec.material = normalizeMaterial(raw.material);
    rec.texture = normalizeTexture(raw.texture);
  }
  if (isLightType(type)) {
    const L = normalizeLight(raw, type);
    rec.intensity = L.intensity;
    rec.distance = L.distance;
    rec.angle = L.angle;
    rec.penumbra = L.penumbra;
  }
  return rec;
}

export function makeProject(objects, extras) {
  extras = extras || {};
  const textures = {};
  if (extras.textures && typeof extras.textures === 'object') {
    Object.keys(extras.textures).forEach(function (k) {
      const t = extras.textures[k];
      if (t && typeof t.dataURL === 'string' && t.dataURL.indexOf('data:image/') === 0) {
        textures[k] = { dataURL: t.dataURL };
      }
    });
  }
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    skyCustom: !!extras.skyCustom,
    sky: extras.skyCustom ? parseColorOr(extras.sky, '#e8eef5') : null,
    objects: objects || [],
    textures: textures
  };
}

function fixParents(objects) {
  const byId = new Map();
  objects.forEach(function (o) { if (o.id) byId.set(o.id, o); });
  objects.forEach(function (o) {
    if (!o.parentId) { o.parentId = null; return; }
    if (o.parentId === o.id || !byId.has(o.parentId)) { o.parentId = null; return; }
    const p = byId.get(o.parentId);
    if (!p || p.type !== 'group') { o.parentId = null; return; }
    const seen = new Set();
    let cur = o;
    while (cur && cur.parentId) {
      if (seen.has(cur.id)) { o.parentId = null; break; }
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
    }
  });
  return objects;
}

function normalizeTexturesMap(raw) {
  const textures = {};
  if (!raw || typeof raw !== 'object') return textures;
  Object.keys(raw).forEach(function (k) {
    const t = raw[k];
    if (t && typeof t.dataURL === 'string' && t.dataURL.indexOf('data:image/') === 0) {
      textures[k] = { dataURL: t.dataURL };
    }
  });
  return textures;
}

/** Accept .h3d v1 or v2 and return a v2 project. */
export function migrateProject(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Not a project file.' };
  if (data.format !== FORMAT) return { ok: false, error: 'This is not a .h3d project.' };
  const v = data.version;
  if (v !== 1 && v !== 2) {
    return { ok: false, error: 'Unsupported .h3d version (' + v + ').' };
  }
  if (!Array.isArray(data.objects)) return { ok: false, error: 'The project has no object list.' };
  const objects = [];
  for (let i = 0; i < data.objects.length; i++) {
    const o = normalizeObject(data.objects[i]);
    if (!o) return { ok: false, error: 'Object ' + (i + 1) + ' is not a valid shape.' };
    objects.push(o);
  }
  fixParents(objects);
  const extras = {
    skyCustom: v >= 2 && !!data.skyCustom,
    sky: data.sky,
    textures: v >= 2 ? normalizeTexturesMap(data.textures) : {}
  };
  return { ok: true, project: makeProject(objects, extras), fromVersion: v };
}

export function validateProject(data) {
  return migrateProject(data);
}

export function parseProject(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  return migrateProject(data);
}

export function stringifyProject(project) {
  return JSON.stringify(project, null, 2);
}

function openDb() {
  return new Promise(function (resolve) {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    } catch (e) { resolve(null); }
  });
}

export function idbGet(key) {
  return openDb().then(function (db) {
    if (!db) return null;
    return new Promise(function (resolve) {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const rq = tx.objectStore(IDB_STORE).get(key);
        rq.onsuccess = function () { resolve(rq.result == null ? null : rq.result); };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  });
}

export function idbSet(key, value) {
  return openDb().then(function (db) {
    if (!db) return false;
    return new Promise(function (resolve) {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  });
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

export function loadAutosaveAsync() {
  return idbGet('scene').then(function (fromIdb) {
    if (fromIdb) {
      const r = (typeof fromIdb === 'string') ? parseProject(fromIdb) : migrateProject(fromIdb);
      if (r && r.ok) {
        return { ok: true, project: r.project, empty: r.project.objects.length === 0, source: 'idb' };
      }
    }
    const ls = loadAutosave();
    ls.source = 'localStorage';
    return ls;
  });
}

export function saveAutosave(project) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(STORAGE_KEY, stringifyProject(project));
    return true;
  } catch (e) {
    try {
      const slim = makeProject(project.objects, { skyCustom: project.skyCustom, sky: project.sky, textures: {} });
      localStorage.setItem(STORAGE_KEY, stringifyProject(slim));
      return true;
    } catch (e2) {
      return false;
    }
  }
}

export function saveAutosaveAsync(project) {
  const lsOk = saveAutosave(project);
  return idbSet('scene', project).then(function (idbOk) {
    return !!(idbOk || lsOk);
  });
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
