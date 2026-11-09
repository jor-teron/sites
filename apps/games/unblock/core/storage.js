/**
 * Unblock — localStorage progress (UNB-0).
 * Key: CONFIG.storageKey ('unblock_game_save_v1').
 * Shape: { completedLevels: { [levelNum]: bestMoves }, currentLevel: number }.
 */
import { CONFIG } from './config.js';

export const Storage = {
    /** @returns {{ completedLevels: Object<string, number>, currentLevel: number }} */
    loadProgress() {
        try {
            const data = localStorage.getItem(CONFIG.storageKey);
            return data ? JSON.parse(data) : { completedLevels: {}, currentLevel: 0 };
        } catch (e) {
            console.error('Failed to load storage', e);
            return { completedLevels: {}, currentLevel: 0 };
        }
    },

    /** @param {{ completedLevels: Object, currentLevel: number }} progress */
    saveProgress(progress) {
        try {
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(progress));
        } catch (e) {
            console.error('Failed to save storage', e);
        }
    },

    /**
     * Record a win and advance currentLevel.
     * @param {number} levelNum
     * @param {number} moves
     * @returns {{ completedLevels: Object, currentLevel: number }}
     */
    completeLevel(levelNum, moves) {
        const progress = this.loadProgress();
        const currentBest = progress.completedLevels[levelNum];
        if (!currentBest || moves < currentBest) {
            progress.completedLevels[levelNum] = moves;
        }
        progress.currentLevel = Math.min(CONFIG.totalLevels - 1, levelNum + 1);
        this.saveProgress(progress);
        return progress;
    }
};
