/**
 * Unblock — board theme picker modal (UNB-4).
 * Mini CSS previews; choice saved via themes/registry.js.
 */
import {
    BOARD_THEMES,
    getBoardThemeId,
    setBoardThemeId
} from './themes/registry.js';

/**
 * Wire the header theme button + modal.
 * @param {{ onThemeChange?: (id: string) => void }} [handlers]
 */
export function bindThemePicker(handlers = {}) {
    const btn = document.getElementById('btn-board-theme');
    const modal = document.getElementById('modal-themes');
    const grid = document.getElementById('theme-grid');
    const closeBtn = document.getElementById('btn-close-themes');
    if (!btn || !modal || !grid) return;

    const renderCards = () => {
        const current = getBoardThemeId();
        grid.innerHTML = '';
        for (const t of BOARD_THEMES) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'theme-card' + (t.id === current ? ' selected' : '');
            card.dataset.theme = t.id;
            card.setAttribute('aria-pressed', t.id === current ? 'true' : 'false');
            card.innerHTML =
                `<div class="theme-preview" data-board-theme="${t.id}" aria-hidden="true">` +
                  `<div class="tp-board">` +
                    `<div class="tp-block tp-player"></div>` +
                    `<div class="tp-block tp-h2"></div>` +
                    `<div class="tp-block tp-v2"></div>` +
                    `<div class="tp-exit">E</div>` +
                  `</div>` +
                `</div>` +
                `<span class="theme-card-name">${t.name}</span>` +
                `<span class="theme-card-blurb">${t.blurb}</span>`;
            card.onclick = () => {
                const id = setBoardThemeId(t.id);
                renderCards();
                modal.style.display = 'none';
                if (handlers.onThemeChange) handlers.onThemeChange(id);
            };
            grid.appendChild(card);
        }
    };

    btn.onclick = () => {
        renderCards();
        modal.style.display = 'flex';
    };
    closeBtn.onclick = () => { modal.style.display = 'none'; };
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}
