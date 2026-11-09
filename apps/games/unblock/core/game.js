/**
 * Unblock — session / level flow (UNB-1).
 * Loads precomputed levels, owns GameLogic, tracks hints, records wins.
 */
import { CONFIG, starsFor } from './config.js';
import { getLevel } from './levels.js';
import { GameLogic } from './gameLogic.js';
import { Storage } from './storage.js';

export class Game {
    constructor() {
        this.progress = Storage.loadProgress();
        this.currentLevelNum = this.progress.currentLevel || 0;
        /** @type {GameLogic|null} */
        this.logic = null;
        /** @type {number} */
        this.par = 0;
        /** hints used on the current attempt */
        this.hintsUsed = 0;
        this.loadCurrentLevel();
    }

    /** Rebuild from assets/levels.json entry. */
    loadCurrentLevel() {
        const { par, blocks } = getLevel(this.currentLevelNum);
        this.par = par;
        this.logic = new GameLogic(blocks);
        this.hintsUsed = 0;
    }

    /**
     * Jump to a level and persist it as current.
     * @param {number} levelNum
     */
    setLevel(levelNum) {
        if (levelNum < 0 || levelNum >= CONFIG.totalLevels) return false;
        this.currentLevelNum = levelNum;
        this.progress = Storage.setCurrentLevel(levelNum);
        this.loadCurrentLevel();
        return true;
    }

    nextLevel() {
        return this.setLevel(this.currentLevelNum + 1);
    }

    moveBlock(blockId, delta) {
        return this.logic.moveBlock(blockId, delta);
    }

    undo() {
        return this.logic.undo();
    }

    isWon() {
        return this.logic.isWon();
    }

    recordVictory() {
        const stars = starsFor(this.logic.moveCount, this.par);
        this.progress = Storage.completeLevel(
            this.currentLevelNum,
            this.logic.moveCount,
            stars
        );
        return stars;
    }

    reloadProgress() {
        this.progress = Storage.loadProgress();
        return this.progress;
    }

    noteHintUsed() {
        this.hintsUsed += 1;
    }

    get moveCount() { return this.logic.moveCount; }
    get historyLength() { return this.logic.history.length; }
    get blocks() { return this.logic.blocks; }

    getBlock(id) { return this.logic.getBlock(id); }

    getValidDeltaRange(blockId, delta) {
        return this.logic.getValidDeltaRange(blockId, delta);
    }

    getSlideLimits(blockId) {
        return this.logic.getSlideLimits(blockId);
    }
}
