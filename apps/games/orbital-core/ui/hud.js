/**
 * Orbital Core - Heads-Up Display Controller
 * Manages stats displays, tower placement menus, speed docks, modal dialogues, and user inputs.
 */

import { TOWER_TYPES } from '../core/towers.js';

export class HUD {
  constructor(handlers) {
    this.handlers = handlers; // { onSelectBuildType, onUpgradeTower, onScrapTower, onSpeedChange, onShockwave, onSeedJump, onToggleShadows, onToggleAudio, onNextLevel, onRetryLevel }
    this.selectedBuildType = 'laser';
    this.activeTower = null;

    this.cacheDom();
    this.bindEvents();
    this.renderTowerDock();
  }

  cacheDom() {
    this.dom = {
      level: document.getElementById('stat-level'),
      shield: document.getElementById('stat-shield'),
      energy: document.getElementById('stat-energy'),
      wave: document.getElementById('stat-wave'),
      score: document.getElementById('stat-score'),
      btnWave: document.getElementById('btn-wave'),
      btnShockwave: document.getElementById('btn-shockwave'),
      speedBtns: document.querySelectorAll('.btn-speed'),
      seedInput: document.getElementById('seed-input'),
      btnJump: document.getElementById('btn-jump'),
      btnShadows: document.getElementById('btn-shadows'),
      btnAudio: document.getElementById('btn-audio'),
      towerDock: document.getElementById('tower-dock'),
      inspector: document.getElementById('tower-inspector'),
      inspTitle: document.getElementById('insp-title'),
      inspStats: document.getElementById('insp-stats'),
      btnUpgrade: document.getElementById('btn-upgrade'),
      btnScrap: document.getElementById('btn-scrap'),
      modal: document.getElementById('game-modal'),
      modalTitle: document.getElementById('modal-title'),
      modalDesc: document.getElementById('modal-desc'),
      modalBtn: document.getElementById('modal-btn')
    };
  }

  bindEvents() {
    // Wave start button
    if (this.dom.btnWave) {
      this.dom.btnWave.addEventListener('click', () => {
        if (this.handlers.onStartWave) this.handlers.onStartWave();
      });
    }

    // Shockwave emergency button
    if (this.dom.btnShockwave) {
      this.dom.btnShockwave.addEventListener('click', () => {
        if (this.handlers.onShockwave) this.handlers.onShockwave();
      });
    }

    // Speed controls
    this.dom.speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseInt(btn.dataset.speed, 10);
        this.dom.speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.handlers.onSpeedChange) this.handlers.onSpeedChange(speed);
      });
    });

    // Seed quick-jump
    if (this.dom.btnJump && this.dom.seedInput) {
      this.dom.btnJump.addEventListener('click', () => {
        const seedVal = parseInt(this.dom.seedInput.value, 10);
        if (!isNaN(seedVal) && seedVal >= 1 && seedVal <= 999) {
          if (this.handlers.onSeedJump) this.handlers.onSeedJump(seedVal);
        }
      });
    }

    // Shadow toggle
    if (this.dom.btnShadows) {
      this.dom.btnShadows.addEventListener('click', () => {
        if (this.handlers.onToggleShadows) {
          const enabled = this.handlers.onToggleShadows();
          this.dom.btnShadows.textContent = enabled ? '☀️ Shadows: ON' : '☀️ Shadows: OFF';
        }
      });
    }

    // Audio toggle
    if (this.dom.btnAudio) {
      this.dom.btnAudio.addEventListener('click', () => {
        if (this.handlers.onToggleAudio) {
          const muted = this.handlers.onToggleAudio();
          this.dom.btnAudio.textContent = muted ? '🔇 Audio: OFF' : '🔊 Audio: ON';
        }
      });
    }

    // Upgrade tower
    if (this.dom.btnUpgrade) {
      this.dom.btnUpgrade.addEventListener('click', () => {
        if (this.activeTower && this.handlers.onUpgradeTower) {
          this.handlers.onUpgradeTower(this.activeTower);
        }
      });
    }

    // Scrap tower
    if (this.dom.btnScrap) {
      this.dom.btnScrap.addEventListener('click', () => {
        if (this.activeTower && this.handlers.onScrapTower) {
          this.handlers.onScrapTower(this.activeTower);
          this.hideInspector();
        }
      });
    }
  }

  renderTowerDock() {
    if (!this.dom.towerDock) return;
    this.dom.towerDock.innerHTML = '';

    const towerIcons = {
      laser: '⚡',
      mortar: '💣',
      cryo: '❄️',
      missile: '🚀'
    };

    Object.keys(TOWER_TYPES).forEach(key => {
      const def = TOWER_TYPES[key];
      const card = document.createElement('div');
      card.className = `tower-card ${key === this.selectedBuildType ? 'selected' : ''}`;
      card.dataset.type = key;

      card.innerHTML = `
        <span class="tower-icon">${towerIcons[key] || '🏰'}</span>
        <span class="tower-name">${def.name}</span>
        <span class="tower-cost">$${def.cost}</span>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.tower-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedBuildType = key;
        if (this.handlers.onSelectBuildType) {
          this.handlers.onSelectBuildType(key);
        }
      });

      this.dom.towerDock.appendChild(card);
    });
  }

  update(state) {
    if (this.dom.level) this.dom.level.textContent = `LEVEL ${state.level}`;
    if (this.dom.shield) this.dom.shield.textContent = `${Math.ceil(state.coreShield)}%`;
    if (this.dom.energy) this.dom.energy.textContent = `$${state.energy}`;
    if (this.dom.wave) this.dom.wave.textContent = `WAVE ${state.wave}/${state.maxWaves}`;
    if (this.dom.score) this.dom.score.textContent = state.score;

    if (this.dom.btnWave) {
      this.dom.btnWave.style.display = state.isWaveActive ? 'none' : 'block';
    }

    if (this.dom.btnShockwave) {
      if (state.shockwaveCooldown > 0) {
        this.dom.btnShockwave.disabled = true;
        this.dom.btnShockwave.textContent = `⚡ Shockwave (${state.shockwaveCooldown}s)`;
      } else {
        this.dom.btnShockwave.disabled = false;
        this.dom.btnShockwave.textContent = `⚡ Shockwave READY`;
      }
    }

    // Disable unaffordable tower cards
    document.querySelectorAll('.tower-card').forEach(card => {
      const key = card.dataset.type;
      const def = TOWER_TYPES[key];
      if (def && state.energy < def.cost) {
        card.classList.add('disabled');
      } else {
        card.classList.remove('disabled');
      }
    });

    // Update inspector card if open
    if (this.activeTower) {
      this.showInspector(this.activeTower, state.energy);
    }
  }

  showInspector(tower, currentEnergy) {
    this.activeTower = tower;
    if (!this.dom.inspector) return;
    this.dom.inspector.classList.add('visible');

    const def = tower.def;
    this.dom.inspTitle.textContent = `${def.name} (Rank ${tower.level})`;
    this.dom.inspStats.innerHTML = `
      Damage: ${Math.round(tower.damage)} | Range: ${Math.round(tower.range)}m<br>
      Cadence: ${tower.fireRate.toFixed(2)}s | ${def.desc}
    `;

    if (tower.level >= 3) {
      this.dom.btnUpgrade.disabled = true;
      this.dom.btnUpgrade.textContent = `MAX RANK`;
    } else {
      const cost = tower.upgradeCost;
      this.dom.btnUpgrade.disabled = currentEnergy < cost;
      this.dom.btnUpgrade.textContent = `Upgrade ($${cost})`;
    }

    this.dom.btnScrap.textContent = `Scrap (+$${tower.scrapValue})`;
  }

  hideInspector() {
    this.activeTower = null;
    if (this.dom.inspector) {
      this.dom.inspector.classList.remove('visible');
    }
  }

  showVictory(level, score) {
    if (!this.dom.modal) return;
    this.dom.modal.classList.add('visible');
    this.dom.modalTitle.className = 'modal-title victory';
    this.dom.modalTitle.textContent = 'ASTEROID DEFENDED!';
    this.dom.modalDesc.textContent = `Level ${level} complete. All alien swarm waves neutralized. Score: ${score}.`;
    this.dom.modalBtn.textContent = 'Next Asteroid (Level ' + (level + 1) + ')';
    this.dom.modalBtn.onclick = () => {
      this.dom.modal.classList.remove('visible');
      if (this.handlers.onNextLevel) this.handlers.onNextLevel();
    };
  }

  showDefeat(level, score) {
    if (!this.dom.modal) return;
    this.dom.modal.classList.add('visible');
    this.dom.modalTitle.className = 'modal-title defeat';
    this.dom.modalTitle.textContent = 'CORE BREACHED';
    this.dom.modalDesc.textContent = `The Core Shield was overwhelmed on Level ${level}. Final Score: ${score}.`;
    this.dom.modalBtn.textContent = 'Reclaim Asteroid (Retry)';
    this.dom.modalBtn.onclick = () => {
      this.dom.modal.classList.remove('visible');
      if (this.handlers.onRetryLevel) this.handlers.onRetryLevel();
    };
  }
}
