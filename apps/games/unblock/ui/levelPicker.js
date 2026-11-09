/**
 * Unblock — paged level select (UNB-1).
 * Shows 100 levels at a time (000–099, 100–199, …) with prev/next.
 */
import { CONFIG } from '../core/config.js';

let page = 0; // 0..9

/**
 * @param {import('../core/game.js').Game} game
 * @param {(levelNum: number) => void} onPickLevel
 */
export function openLevelSelect(game, onPickLevel) {
    page = Math.floor(game.currentLevelNum / CONFIG.pageSize);
    renderPage(game, onPickLevel);
    document.getElementById('modal-levels').style.display = 'flex';
}

export function closeLevelSelect() {
    document.getElementById('modal-levels').style.display = 'none';
}

/**
 * @param {import('../core/game.js').Game} game
 * @param {(levelNum: number) => void} onPickLevel
 */
function renderPage(game, onPickLevel) {
    const gridEl = document.getElementById('level-grid');
    gridEl.innerHTML = '';
    const progress = game.reloadProgress();
    const start = page * CONFIG.pageSize;
    const end = Math.min(CONFIG.totalLevels, start + CONFIG.pageSize);

    document.getElementById('level-page-label').textContent =
        `${String(start).padStart(3, '0')} – ${String(end - 1).padStart(3, '0')}`;

    document.getElementById('btn-page-prev').disabled = page <= 0;
    document.getElementById('btn-page-next').disabled = end >= CONFIG.totalLevels;

    for (let i = start; i < end; i++) {
        const cell = document.createElement('div');
        cell.className = 'level-cell';
        if (i === game.currentLevelNum) cell.classList.add('current');
        const rec = progress.completedLevels[i];
        if (rec !== undefined) {
            cell.classList.add('completed');
            const stars = typeof rec === 'object' ? (rec.stars || 1) : 1;
            cell.innerHTML = `<span class="level-num">${i}</span><span class="level-stars">${'★'.repeat(stars)}</span>`;
        } else {
            cell.textContent = i;
        }
        cell.onclick = () => {
            onPickLevel(i);
            closeLevelSelect();
        };
        gridEl.appendChild(cell);
    }
}

/**
 * Wire picker chrome (open/close/jump/paging).
 * @param {import('../core/game.js').Game} game
 * @param {{ onPickLevel: (n:number)=>void }} handlers
 */
export function bindLevelPicker(game, handlers) {
    document.getElementById('btn-levels').onclick = () => {
        openLevelSelect(game, handlers.onPickLevel);
    };
    document.getElementById('btn-close-levels').onclick = () => closeLevelSelect();

    document.getElementById('btn-page-prev').onclick = () => {
        if (page > 0) {
            page -= 1;
            renderPage(game, handlers.onPickLevel);
        }
    };
    document.getElementById('btn-page-next').onclick = () => {
        if ((page + 1) * CONFIG.pageSize < CONFIG.totalLevels) {
            page += 1;
            renderPage(game, handlers.onPickLevel);
        }
    };

    document.getElementById('btn-jump-level').onclick = () => {
        const input = document.getElementById('level-jump-input');
        const val = parseInt(input.value, 10);
        if (!isNaN(val) && val >= 0 && val < CONFIG.totalLevels) {
            handlers.onPickLevel(val);
            closeLevelSelect();
        }
    };
}
