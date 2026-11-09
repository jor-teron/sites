/**
 * Unblock — session / level flow (UNB-0).
 * Pure of DOM: loads levels, owns GameLogic, records wins via Storage.
 * UI modules call into this and re-render from its public fields.
 */
import { CONFIG } from './config.js';
import { generateLevel } from './levelGenerator.js';
import { GameLogic } from './gameLogic.js';
import { Storage } from './storage.js';

export class Game {
    constructor() {
        this.progress = Storage.loadProgress();
        this.currentLevelNum = this.progress.currentLevel || 0;
        /** @type {GameLogic|null} */
        this.logic = null;
        this.loadCurrentLevel();
    }

    /** Rebuild GameLogic from the current level seed. */
    loadCurrentLevel() {
        const blocks = generateLevel(this.currentLevelNum);
        this.logic = new GameLogic(blocks);
    }

    /**
     * Jump to a level index (0 .. totalLevels-1).
     * @param {number} levelNum
     * @returns {boolean} false if out of range
     */
    setLevel(levelNum) {
        if (levelNum < 0 || levelNum >= CONFIG.totalLevels) return false;
        this.currentLevelNum = levelNum;
        this.loadCurrentLevel();
        return true;
    }

    /** Advance to the next level (clamped by setLevel). */
    nextLevel() {
        return this.setLevel(this.currentLevelNum + 1);
    }

    /**
     * Apply a cell delta move.
     * @param {string} blockId
     * @param {number} delta
     * @returns {boolean}
     */
    moveBlock(blockId, delta) {
        return this.logic.moveBlock(blockId, delta);
    }

    /** @returns {boolean} */
    undo() {
        return this.logic.undo();
    }

    /** @returns {boolean} */
    isWon() {
        return this.logic.isWon();
    }

    /** Persist best moves and advance saved currentLevel. */
    recordVictory() {
        this.progress = Storage.completeLevel(this.currentLevelNum, this.logic.moveCount);
    }

    /** Refresh progress from storage (e.g. before painting the level grid). */
    reloadProgress() {
        this.progress = Storage.loadProgress();
        return this.progress;
    }

    get moveCount() {
        return this.logic.moveCount;
    }

    get historyLength() {
        return this.logic.history.length;
    }

    get blocks() {
        return this.logic.blocks;
    }

    /** @param {string} id */
    getBlock(id) {
        return this.logic.getBlock(id);
    }

    /**
     * Clamp a drag delta against collisions.
     * @param {string} blockId
     * @param {number} delta
     */
    getValidDeltaRange(blockId, delta) {
        return this.logic.getValidDeltaRange(blockId, delta);
    }
}
