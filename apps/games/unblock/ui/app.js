/**
 * Unblock — app wiring (UNB-4).
 * Async boot: levels, light/dark chrome, board theme, gear; re-layout on resize.
 */
import { loadLevels } from '../core/levels.js';
import { Game } from '../core/game.js';
import { renderBoard } from './render.js';
import { attachDragHandlers } from './input.js';
import { updateHud, hideNextButton } from './hud.js';
import { showVictory, hideVictory, bindVictoryControls } from './modals.js';
import { bindLevelPicker } from './levelPicker.js';
import { showHint } from './hint.js';
import { UnblockSettings } from './settings.js';
import { sizeBoard } from './layout.js';
import { applyBoardTheme } from './themes/registry.js';
import { bindThemePicker } from './themePicker.js';

class UnblockApp {
    constructor() {
        this.game = new Game();
        UnblockSettings.applyTheme();
        applyBoardTheme();
        UnblockSettings.onChange((ch) => {
            if ('theme' in ch) UnblockSettings.applyTheme();
        });
        const gear = document.getElementById('gearSlot');
        if (gear) UnblockSettings.mountGear(gear);
        this.bindControls();
        this.render();
    }

    /** Full HUD + board redraw (also re-fits the board square). */
    render() {
        sizeBoard();
        updateHud(this.game);
        renderBoard(this.game, (el, blockId, cellSize) => {
            attachDragHandlers(this.game, el, blockId, cellSize, () => this.afterMove());
        });
    }

    afterMove() {
        this.render();
        if (this.game.isWon()) this.handleVictory();
    }

    handleVictory() {
        const stars = this.game.recordVictory();
        UnblockSettings.vibrate([40, 40, 60]);
        showVictory(this.game, stars);
    }

    restart() {
        this.game.loadCurrentLevel();
        hideNextButton();
        hideVictory();
        this.render();
    }

    setLevel(n) {
        if (!this.game.setLevel(n)) return;
        hideNextButton();
        hideVictory();
        this.render();
    }

    nextLevel() {
        this.game.nextLevel();
        hideNextButton();
        this.render();
    }

    bindControls() {
        document.getElementById('btn-restart').onclick = () => this.restart();

        document.getElementById('btn-undo').onclick = () => {
            if (this.game.undo()) {
                this.render();
                hideNextButton();
            }
        };

        document.getElementById('btn-hint').onclick = () => {
            showHint(this.game);
        };

        document.getElementById('btn-next').onclick = () => {
            hideVictory();
            this.nextLevel();
        };

        bindLevelPicker(this.game, {
            onPickLevel: (n) => this.setLevel(n)
        });

        bindVictoryControls({
            onReplay: () => this.restart(),
            onNext: () => this.nextLevel()
        });

        // Re-render so Car & Bus SVGs / cellSize refresh after a theme change
        bindThemePicker({
            onThemeChange: () => this.render()
        });

        let resizeTimer = 0;
        const onResize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.render(), 50);
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', onResize);
        }
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    try { UnblockSettings.applyTheme(); } catch (_) { /* ok */ }
    try { applyBoardTheme(); } catch (_) { /* ok */ }
    const loading = document.getElementById('loading');
    try {
        await loadLevels();
        if (loading) loading.style.display = 'none';
        window.app = new UnblockApp();
    } catch (err) {
        console.error(err);
        if (loading) loading.textContent = 'Failed to load levels.';
    }
});
