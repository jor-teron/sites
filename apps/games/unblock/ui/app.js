/**
 * Unblock — app wiring (UNB-0).
 * Creates Game, binds HUD / board / modals / buttons, exposes window.app.
 */
import { Game } from '../core/game.js';
import { renderBoard } from './render.js';
import { attachDragHandlers } from './input.js';
import { updateHud, hideNextButton } from './hud.js';
import { showVictory, hideVictory, bindModalControls } from './modals.js';

class UnblockApp {
    constructor() {
        this.game = new Game();
        this.bindControls();
        this.render();
    }

    /** Full board + HUD redraw. */
    render() {
        updateHud(this.game);
        renderBoard(this.game, (el, blockId, cellSize) => {
            attachDragHandlers(this.game, el, blockId, cellSize, () => this.afterMove());
        });
    }

    /** Called after a committed drag move. */
    afterMove() {
        this.render();
        if (this.game.isWon()) {
            this.handleVictory();
        }
    }

    handleVictory() {
        this.game.recordVictory();
        showVictory(this.game);
    }

    /** Restart / load helpers used by buttons. */
    restart() {
        this.game.loadCurrentLevel();
        hideNextButton();
        this.render();
    }

    setLevel(n) {
        if (!this.game.setLevel(n)) return;
        hideNextButton();
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
            alert('Hint: Clear intersecting blocks by sliding them up/down or left/right to free the red hero block!');
        };

        document.getElementById('btn-next').onclick = () => {
            hideVictory();
            this.nextLevel();
        };

        bindModalControls(this.game, {
            onPickLevel: (n) => this.setLevel(n),
            onReplay: () => this.restart(),
            onNext: () => this.nextLevel()
        });

        window.onresize = () => this.render();
    }
}

// Start app on DOMContentLoaded (same as the Lab entry)
window.addEventListener('DOMContentLoaded', () => {
    window.app = new UnblockApp();
});
