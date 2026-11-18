/**
 * Orbital Core - LocalStorage Save & State Restoration Engine
 * Persists level unlocks, high scores, audio/lighting preferences, and active match sessions.
 */

const STORAGE_KEY = 'sites-hub.orbital-core';

export class SaveManager {
  constructor() {
    this.data = this.load();
  }

  defaultData() {
    return {
      highestLevel: 1,
      currentLevel: 1,
      highScores: {},
      settings: {
        muted: false,
        dayNightShadows: false,
        simSpeed: 1
      },
      inProgress: null
    };
  }

  load() {
    try {
      if (typeof localStorage === 'undefined') return this.defaultData();
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          highestLevel: Math.max(1, parsed.highestLevel || 1),
          currentLevel: Math.max(1, parsed.currentLevel || 1),
          highScores: parsed.highScores || {},
          settings: {
            muted: !!(parsed.settings && parsed.settings.muted),
            dayNightShadows: !!(parsed.settings && parsed.settings.dayNightShadows),
            simSpeed: (parsed.settings && parsed.settings.simSpeed) || 1
          },
          inProgress: parsed.inProgress || null
        };
      }
    } catch (e) {
      console.warn('Orbital Core save load error:', e);
    }
    return {
      highestLevel: 1,
      currentLevel: 1,
      highScores: {},
      settings: {
        muted: false,
        dayNightShadows: false,
        simSpeed: 1
      },
      inProgress: null
    };
  }

  save() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Orbital Core save error:', e);
    }
  }

  recordVictory(level, score) {
    if (level >= this.data.highestLevel && this.data.highestLevel < 999) {
      this.data.highestLevel = level + 1;
    }
    const prevScore = this.data.highScores[level] || 0;
    if (score > prevScore) {
      this.data.highScores[level] = score;
    }
    this.data.inProgress = null;
    this.save();
  }

  saveActiveMatch(level, energy, coreShield, wave, towers) {
    this.data.currentLevel = level;
    this.data.inProgress = {
      level,
      energy,
      coreShield,
      wave,
      towers: towers.map(t => ({
        nodeId: t.node.id,
        typeKey: t.typeKey,
        level: t.level
      }))
    };
    this.save();
  }

  clearActiveMatch() {
    this.data.inProgress = null;
    this.save();
  }

  updateSettings(settings) {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
  }
}

export const saveManager = new SaveManager();
