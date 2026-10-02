/*
 * Local profile helpers.
 * uniqId: 10-digit, created once.
 * name: 3–10 chars, editable.
 */

/* LocalStorage key for the saved profile object. */
const PROFILE_KEY = "p2pchat_profile_v1";

/**
 * Build a random 10-digit numeric id (string, leading zeros allowed).
 */
function makeUniqId() {
  /* 10 digits from 0000000000–9999999999 */
  let id = "";
  /* Fill each digit from crypto when available. */
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 10; i++) {
    id += String(buf[i] % 10);
  }
  return id;
}

/**
 * Validate display name: trimmed length 3–10.
 */
function isValidName(name) {
  /* Work on trimmed text only. */
  const n = String(name || "").trim();
  return n.length >= 3 && n.length <= 10;
}

/**
 * Read profile from LocalStorage, or null if missing/corrupt.
 */
function loadProfile() {
  /* Raw string from storage. */
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) {
    return null;
  }
  try {
    /* Parsed object. */
    const p = JSON.parse(raw);
    /* Must have 10-digit id and a name. */
    if (!p || !/^\d{10}$/.test(p.uniqId) || !isValidName(p.name)) {
      return null;
    }
    return { uniqId: p.uniqId, name: String(p.name).trim() };
  } catch (e) {
    return null;
  }
}

/**
 * Write profile to LocalStorage.
 */
function saveProfile(uniqId, name) {
  /* Persist both fields as JSON. */
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({ uniqId: uniqId, name: String(name).trim() })
  );
}

/**
 * Return existing profile or create uniqId and wait for name.
 */
function getOrInitProfile() {
  /* Existing saved profile. */
  const existing = loadProfile();
  if (existing) {
    return existing;
  }
  /* New id; name filled by setup UI. */
  return { uniqId: makeUniqId(), name: "" };
}
