// HUD, hints, overlay and end-of-level (win/loss) handling.
import { S, buildLevel } from './entities.js';
import { LEVELS } from './levels.js';

const levelEl = document.getElementById('hud-level');
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
    overlayTitle.textContent = `LEVEL ${S.currentLevelIndex + 1}/${LEVELS.length} CLEAR`;
    overlayStars.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    overlayMsg.textContent = `Score ${S.score}` + (unusedBirds ? `  •  +${unusedBirds * 1000} bird bonus` : '');

    if (S.currentLevelIndex + 1 < LEVELS.length) {
      overlayBtn.textContent = 'NEXT LEVEL';
    } else {
      overlayBtn.textContent = 'BACK TO LEVEL 1';
    }
    overlayBtn2.classList.remove('hidden');
    overlay.classList.remove('hidden');
  } else {
    S.gameState = 'gameover';
    overlayTitle.textContent = `LEVEL ${S.currentLevelIndex + 1}/${LEVELS.length}: OUT OF BIRDS`;
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
  levelEl.textContent = `${S.currentLevelIndex + 1}/${LEVELS.length}`;
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
    buildLevel(S.currentLevelIndex);
  });

  overlayBtn.addEventListener('click', () => {
    if (S.gameState === 'gameover') {
      buildLevel(S.currentLevelIndex);
    } else if (S.gameState === 'levelclear') {
      const next = (S.currentLevelIndex + 1) % LEVELS.length;
      buildLevel(next);
    }
  });

  overlayBtn2.addEventListener('click', () => {
    buildLevel(S.currentLevelIndex);
  });
}
