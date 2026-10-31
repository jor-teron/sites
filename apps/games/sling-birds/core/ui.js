// HUD, hints, overlay, level picker and end-of-level (win/loss) handling.
import { S, buildLevel } from './entities.js';
import { MAX_LEVEL, pad2, isLevelNumber } from './seed.js';

const levelInput = document.getElementById('lvl-input');
const prevBtn = document.getElementById('lvl-prev');
const nextBtn = document.getElementById('lvl-next');
const pickerEl = document.getElementById('picker');
const birdsEl = document.getElementById('hud-birds');
const pigsEl  = document.getElementById('hud-pigs');
const scoreEl = document.getElementById('hud-score');
const resetBtn = document.getElementById('btn-reset');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayStars = document.getElementById('overlay-stars');
const overlayMsg = document.getElementById('overlay-msg');
const overlayBtn = document.getElementById('overlay-btn');
const overlayBtn2 = document.getElementById('overlay-btn2');
const hintEl = document.getElementById('hint');

// ---------- SAVED PROGRESS (localStorage; every access guarded: private mode / disabled storage) ----------
const LAST_KEY = 'slingbirds.level';   // last level played, "00".."50"
const BEST_KEY = 'slingbirds.best';    // { "07": { score, stars } }

export function loadLastLevel() {
  try {
    const v = localStorage.getItem(LAST_KEY);
    if (/^\d{1,2}$/.test(v || '') && isLevelNumber(parseInt(v, 10))) return parseInt(v, 10);
  } catch (e) { /* ignore */ }
  return 0;   // first visit: the demo
}
function saveLastLevel(n) { try { localStorage.setItem(LAST_KEY, pad2(n)); } catch (e) { /* ignore */ } }
function readBest() {
  try {
    const o = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (e) { return {}; }
}
export function bestFor(n) {
  const b = readBest()[pad2(n)];
  return b && Number.isFinite(b.score) && Number.isFinite(b.stars) ? b : null;
}
// Returns true when this run is a new best for the level
function recordBest(n, score, stars) {
  const prev = bestFor(n);
  if (prev && prev.score >= score) return false;
  const all = readBest();
  all[pad2(n)] = { score, stars };
  try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
  return true;
}
const label = (n) => `LEVEL ${pad2(n)}`;
const starsText = (k) => '\u2605'.repeat(k) + '\u2606'.repeat(3 - k);

// ---------- PICKER ----------
function syncPicker() {
  if (document.activeElement !== levelInput) levelInput.value = pad2(S.levelNo);
  prevBtn.disabled = S.levelNo <= 0;
  nextBtn.disabled = S.levelNo >= MAX_LEVEL;
}
function flagBad(msg) {
  pickerEl.classList.add('bad');
  clearTimeout(flagBad._t);
  flagBad._t = setTimeout(() => pickerEl.classList.remove('bad'), 1600);
  showHint(msg, 2200);
}
export function gotoLevel(n) {
  if (!isLevelNumber(n)) return false;
  saveLastLevel(n);
  buildLevel(n);
  const best = bestFor(n);
  showHint(label(n) + (n === 0 ? ' \u00b7 DEMO' : '') + (best ? ` \u00b7 BEST ${best.score} ${starsText(best.stars)}` : ''), 2400);
  return true;
}
function commitInput() {
  const v = levelInput.value.trim();
  const junk = levelInput.dataset.junk === '1';       // letters / signs were typed and stripped
  levelInput.dataset.junk = '';
  if (!junk && /^\d{1,2}$/.test(v) && isLevelNumber(parseInt(v, 10))) {
    const n = parseInt(v, 10);
    if (n !== S.levelNo) { pickerEl.classList.remove('bad'); gotoLevel(n); }
  } else {
    flagBad(junk ? `DIGITS ONLY: 00-${MAX_LEVEL}` : v === '' ? `TYPE A NUMBER 00-${MAX_LEVEL}` : `LEVEL MUST BE 00-${MAX_LEVEL}`);
  }
  levelInput.value = pad2(S.levelNo);
  syncPicker();
}

export function endGame(won) {
  if (S.gameState === 'levelclear' || S.gameState === 'gameover') return;

  if (won) {
    S.gameState = 'levelclear';
    // Bonus for unused birds (current + queued)
    const unusedBirds = S.birdQueue.length + (S.currentBird ? 1 : 0);
    S.score += unusedBirds * 1000;
    updateHud();

    // Stars from score: 1 = cleared, 2 = base + 1000, 3 = base + 2500 (base = 500 per pig; blocks + spare birds add)
    const base = S.pigs.length * 500;
    const stars = S.score >= base + 2500 ? 3 : S.score >= base + 1000 ? 2 : 1;
    const newBest = recordBest(S.levelNo, S.score, stars);
    const best = bestFor(S.levelNo);
    overlayTitle.textContent = `${label(S.levelNo)} CLEAR`;
    overlayStars.textContent = starsText(stars);
    overlayMsg.textContent = `Score ${S.score}` + (unusedBirds ? `  \u2022  +${unusedBirds * 1000} bird bonus` : '') +
      (newBest ? '  \u2022  NEW BEST' : best ? `  \u2022  Best ${best.score}` : '');

    overlayBtn.textContent = S.levelNo < MAX_LEVEL ? 'NEXT LEVEL' : `BACK TO ${label(0)}`;
    overlayBtn2.classList.remove('hidden');
    overlay.classList.remove('hidden');
  } else {
    S.gameState = 'gameover';
    overlayTitle.textContent = `${label(S.levelNo)}: OUT OF BIRDS`;
    overlayStars.textContent = '☆☆☆';
    overlayMsg.textContent = `Score ${S.score}`;
    overlayBtn.textContent = 'RETRY';
    overlayBtn2.classList.add('hidden');
    overlay.classList.remove('hidden');
  }
}

export function hideOverlay() {
  overlay.classList.add('hidden');
}
export function updateHud() {
  syncPicker();
  birdsEl.textContent = S.birdQueue.length + (S.currentBird && !S.currentBird.launched ? 1 : 0);
  pigsEl.textContent = S.pigs.filter(p => !p.dead).length;
  scoreEl.textContent = S.score;
}

export function showHint(text, duration = 2400) {
  hintEl.textContent = text;
  hintEl.classList.add('show');
  clearTimeout(showHint._t);
  if (duration > 0) {
    showHint._t = setTimeout(() => hintEl.classList.remove('show'), duration);
  }
}

export function initUi() {
  resetBtn.addEventListener('click', () => {
    hideOverlay();
    buildLevel(S.levelNo);
  });

  overlayBtn.addEventListener('click', () => {
    if (S.gameState === 'gameover') {
      buildLevel(S.levelNo);
    } else if (S.gameState === 'levelclear') {
      gotoLevel(S.levelNo < MAX_LEVEL ? S.levelNo + 1 : 0);
    }
  });

  overlayBtn2.addEventListener('click', () => {
    buildLevel(S.levelNo);
  });

  // Level picker: prev / next, or type 00-50 and press Enter (or leave the box)
  prevBtn.addEventListener('click', () => gotoLevel(S.levelNo - 1));
  nextBtn.addEventListener('click', () => gotoLevel(S.levelNo + 1));
  levelInput.addEventListener('focus', () => { levelInput.dataset.junk = ''; levelInput.select(); });
  levelInput.addEventListener('input', () => {
    const clean = levelInput.value.replace(/\D/g, '').slice(0, 2);
    if (clean !== levelInput.value) { levelInput.value = clean; levelInput.dataset.junk = '1'; flagBad('DIGITS ONLY: 00-' + MAX_LEVEL); }
  });
  levelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitInput(); levelInput.blur(); }
    else if (e.key === 'Escape') { levelInput.dataset.junk = ''; levelInput.value = pad2(S.levelNo); pickerEl.classList.remove('bad'); levelInput.blur(); }
  });
  levelInput.addEventListener('blur', commitInput);
}
