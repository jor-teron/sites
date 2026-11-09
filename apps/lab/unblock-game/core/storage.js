import { CONFIG } from './config.js';

export const Storage = {
    loadProgress() {
        try {
            const data = localStorage.getItem(CONFIG.storageKey);
            return data ? JSON.parse(data) : { completedLevels: {}, currentLevel: 0 };
        } catch (e) {
            console.error('Failed to load storage', e);
            return { completedLevels: {}, currentLevel: 0 };
        }
    },

    saveProgress(progress) {
        try {
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(progress));
        } catch (e) {
            console.error('Failed to save storage', e);
        }
    },

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
