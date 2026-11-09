/**
 * Unblock — localStorage progress (UNB-1).
 * Key: unblock_game_save_v2
 * Shape: {
 *   currentLevel: number,
 *   completedLevels: { [levelNum]: { bestMoves: number, stars: number } }
 * }
 * v1 saves are ignored.
 */
import { CONFIG } from './config.js';

function empty() {
    return { completedLevels: {}, currentLevel: 0 };
}

export const Storage = {
    loadProgress() {
        try {
            const raw = localStorage.getItem(CONFIG.storageKey);
            if (!raw) return empty();
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object') return empty();
            return {
                completedLevels: data.completedLevels || {},
                currentLevel: Number.isFinite(data.currentLevel) ? data.currentLevel : 0
            };
        } catch (e) {
            console.error('Failed to load storage', e);
            return empty();
        }
    },

    saveProgress(progress) {
        try {
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(progress));
        } catch (e) {
            console.error('Failed to save storage', e);
        }
    },

    /** Persist the level the player is currently on (picker / jump). */
    setCurrentLevel(levelNum) {
        const progress = this.loadProgress();
        progress.currentLevel = Math.max(0, Math.min(CONFIG.totalLevels - 1, levelNum));
        this.saveProgress(progress);
        return progress;
    },

    /**
     * Record a win (best moves + stars). Advances currentLevel to next.
     * @param {number} levelNum
     * @param {number} moves
     * @param {number} stars
     */
    completeLevel(levelNum, moves, stars) {
        const progress = this.loadProgress();
        const prev = progress.completedLevels[levelNum];
        if (!prev || moves < prev.bestMoves) {
            progress.completedLevels[levelNum] = { bestMoves: moves, stars };
        } else if (stars > (prev.stars || 0)) {
            progress.completedLevels[levelNum] = { bestMoves: prev.bestMoves, stars };
        }
        progress.currentLevel = Math.min(CONFIG.totalLevels - 1, levelNum + 1);
        this.saveProgress(progress);
        return progress;
    }
};
