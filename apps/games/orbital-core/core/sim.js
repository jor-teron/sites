/**
 * Orbital Core - Game Simulation Engine
 * Handles A* pathfinding, projectile ballistics, tower targeting, wave progression,
 * meteorite hazards, emergency shockwaves, and fixed-step simulation speed control (1x-5x).
 */

import * as THREE from '../vendor/three/three.module.min.js';
import { generatePlanet } from './planet.js';
import { Tower, TOWER_TYPES } from './towers.js';
import { Enemy, ENEMY_TYPES } from './enemies.js';
import { sound } from './audio.js';
import { saveManager } from './save.js';

export class Simulation {
  constructor(scene, onHudUpdate, onGameOver, onVictory) {
    this.scene = scene;
    this.onHudUpdate = onHudUpdate;
    this.onGameOver = onGameOver;
    this.onVictory = onVictory;

    this.level = 1;
    this.energy = 400;
    this.coreShield = 100;
    this.wave = 0;
    this.maxWaves = 5;
    this.score = 0;
    this.shockwaveCooldown = 0;
    this.simSpeed = 1; // 0=Paused, 1, 2, 3, 4, 5

    this.planet = null;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.meteorites = [];
    this.selectedTower = null;

    this.waveSpawnTimer = 0;
    this.waveSpawnQueue = [];
    this.isWaveActive = false;
    this.meteoriteTimer = 25.0; // Seconds between random space debris
    this.isGameOver = false;

    // Visual effect group in 3D scene
    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);
  }

  loadLevel(levelNumber, resumeState = null) {
    this.level = Math.max(1, Math.min(999, Math.floor(levelNumber)));
    this.isGameOver = false;

    // Clean up existing entities
    this.cleanup();

    // Generate procedural planet for this seed
    this.planet = generatePlanet(this.level);
    this.scene.add(this.planet.terrainMesh);

    // Initial game parameters
    this.energy = 350 + Math.floor(this.level * 5);
    this.coreShield = 100;
    this.wave = 0;
    this.maxWaves = 4 + Math.min(6, Math.floor(this.level / 150));
    this.score = 0;
    this.shockwaveCooldown = 0;
    this.waveSpawnTimer = 2.0;

    // Restore saved in-progress state if valid
    if (resumeState && resumeState.level === this.level) {
      this.energy = resumeState.energy;
      this.coreShield = resumeState.coreShield;
      this.wave = resumeState.wave;
      if (resumeState.towers && resumeState.towers.length > 0) {
        resumeState.towers.forEach(tData => {
          const node = this.planet.navNodes[tData.nodeId];
          if (node && node.buildable && !node.occupied) {
            const tower = new Tower(tData.typeKey, node, this.planet.terrainMesh);
            tower.level = tData.level || 1;
            node.occupied = true;
            node.tower = tower;
            this.towers.push(tower);
          }
        });
      }
    }

    this.recomputeAllPaths();
    this.updateHud();
  }

  cleanup() {
    this.towers.forEach(t => t.dispose(this.planet ? this.planet.terrainMesh : this.scene));
    this.enemies.forEach(e => e.dispose(this.planet ? this.planet.terrainMesh : this.scene));
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.meteorites = [];
    this.selectedTower = null;

    while (this.fxGroup.children.length > 0) {
      this.fxGroup.remove(this.fxGroup.children[0]);
    }

    if (this.planet && this.planet.terrainMesh) {
      this.scene.remove(this.planet.terrainMesh);
      this.planet = null;
    }
  }

  // Spherical A* Pathfinding across geodesic nav nodes
  findPath(startPos, targetPos) {
    if (!this.planet || !this.planet.navNodes.length) return [];
    const nodes = this.planet.navNodes;

    // Find closest valid nodes to start and target
    let startNodeId = 0, targetNodeId = 0;
    let minStartDist = Infinity, minTargetDist = Infinity;

    for (let i = 0; i < nodes.length; i++) {
      const dStart = nodes[i].pos.distanceToSquared(startPos);
      if (dStart < minStartDist) {
        minStartDist = dStart;
        startNodeId = i;
      }
      const dTarget = nodes[i].pos.distanceToSquared(targetPos);
      if (dTarget < minTargetDist) {
        minTargetDist = dTarget;
        targetNodeId = i;
      }
    }

    // A* algorithm with visited closedSet and iteration bound
    const openSet = [startNodeId];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    gScore.set(startNodeId, 0);
    fScore.set(startNodeId, nodes[startNodeId].pos.distanceTo(nodes[targetNodeId].pos));

    let iterations = 0;
    while (openSet.length > 0 && iterations++ < 1500) {
      // Find lowest fScore in openSet
      let bestIdx = 0;
      let bestF = fScore.get(openSet[0]) || Infinity;
      for (let i = 1; i < openSet.length; i++) {
        const f = fScore.get(openSet[i]) || Infinity;
        if (f < bestF) {
          bestF = f;
          bestIdx = i;
        }
      }
      const current = openSet.splice(bestIdx, 1)[0];
      closedSet.add(current);

      if (current === targetNodeId) {
        const path = [nodes[current]];
        let curr = current;
        while (cameFrom.has(curr)) {
          curr = cameFrom.get(curr);
          path.unshift(nodes[curr]);
        }
        return path;
      }

      const neighbors = nodes[current].neighbors;
      for (let nId of neighbors) {
        if (closedSet.has(nId)) continue;
        const neighbor = nodes[nId];

        // Tower obstruction blocks pathing
        if (neighbor.occupied) continue;

        let stepCost = nodes[current].pos.distanceTo(neighbor.pos);
        if (neighbor.isLiquid) stepCost *= 3.0; // Water / Lava penalty

        const tentativeG = (gScore.get(current) || 0) + stepCost;
        if (tentativeG < (gScore.get(nId) || Infinity)) {
          cameFrom.set(nId, current);
          gScore.set(nId, tentativeG);
          const h = neighbor.pos.distanceTo(nodes[targetNodeId].pos);
          fScore.set(nId, tentativeG + h);

          if (!openSet.includes(nId)) {
            openSet.push(nId);
          }
        }
      }
    }

    // Direct fallback if completely blocked
    return [nodes[startNodeId], nodes[targetNodeId]];
  }

  recomputeAllPaths() {
    this.enemies.forEach(enemy => {
      enemy.pathNodes = this.findPath(enemy.mesh.position, this.planet.corePosition);
      enemy.pathIndex = 0;
    });
  }

  buildTower(nodeId, typeKey) {
    const node = this.planet.navNodes[nodeId];
    if (!node || !node.buildable || node.occupied) return false;
    const def = TOWER_TYPES[typeKey];
    if (!def || this.energy < def.cost) return false;

    // Temporarily test if building this tower completely traps creeps
    node.occupied = true;
    const testPath = this.findPath(this.planet.spawners[0].pos, this.planet.corePosition);
    if (!testPath || testPath.length < 2) {
      node.occupied = false;
      return false; // Cannot completely seal the spawner
    }

    this.energy -= def.cost;
    const tower = new Tower(typeKey, node, this.planet.terrainMesh);
    node.tower = tower;
    this.towers.push(tower);
    sound.build();

    this.recomputeAllPaths();
    this.selectTower(tower);
    this.updateHud();
    this.autoSave();
    return true;
  }

  upgradeTower(tower) {
    if (!tower || this.energy < tower.upgradeCost) return false;
    this.energy -= tower.upgradeCost;
    tower.upgrade();
    this.updateHud();
    this.autoSave();
    return true;
  }

  scrapTower(tower) {
    if (!tower) return false;
    const refund = tower.scrapValue;
    this.energy += refund;
    tower.node.occupied = false;
    tower.node.tower = null;
    tower.dispose(this.planet.terrainMesh);

    const idx = this.towers.indexOf(tower);
    if (idx !== -1) this.towers.splice(idx, 1);

    sound.sell();
    if (this.selectedTower === tower) this.selectedTower = null;

    this.recomputeAllPaths();
    this.updateHud();
    this.autoSave();
    return true;
  }

  selectTower(tower) {
    if (this.selectedTower) this.selectedTower.hideRangeRing();
    this.selectedTower = tower;
    if (this.selectedTower) {
      this.selectedTower.showRangeRing(this.planet.terrainMesh);
    }
    this.updateHud();
  }

  triggerShockwave() {
    if (this.shockwaveCooldown > 0 || this.isGameOver) return;
    this.shockwaveCooldown = 45.0; // 45s cooldown
    sound.coreShockwave();

    // Shockwave particle sphere
    const blastGeo = new THREE.SphereGeometry(this.planet.baseRadius * 0.4, 24, 16);
    const blastMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.8 });
    const blastMesh = new THREE.Mesh(blastGeo, blastMat);
    blastMesh.position.copy(this.planet.corePosition);
    this.planet.terrainMesh.add(blastMesh);

    // Expand & remove shockwave mesh
    this.projectiles.push({
      mesh: blastMesh,
      life: 0.6,
      maxLife: 0.6,
      type: 'shockwave',
      update: (dt) => {
        blastMesh.scale.addScalar(dt * 3.5);
      }
    });

    // Eliminate creeps in proximity to Core
    const corePos = this.planet.corePosition;
    const thresholdSq = Math.pow(this.planet.baseRadius * 0.55, 2);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.mesh.position.distanceToSquared(corePos) < thresholdSq) {
        sound.explosion(1.2);
        this.energy += e.def.reward;
        this.score += e.def.reward * 2;
        e.dispose(this.planet.terrainMesh);
        this.enemies.splice(i, 1);
      }
    }
    this.updateHud();
  }

  startNextWave() {
    if (this.wave >= this.maxWaves || this.isWaveActive) return;
    this.wave++;
    this.isWaveActive = true;
    this.waveSpawnQueue = this.generateWaveQueue(this.wave);
    this.waveSpawnTimer = 0.5;
    this.updateHud();
  }

  generateWaveQueue(waveNum) {
    const queue = [];
    const baseCount = 6 + waveNum * 4 + Math.floor(this.level * 0.5);

    for (let i = 0; i < baseCount; i++) {
      let typeKey = 'scuttler';
      const r = Math.random();

      if (waveNum >= 2 && r > 0.60) typeKey = 'skimmer';
      if (waveNum >= 3 && r > 0.80) typeKey = 'burrower';
      if (waveNum >= 3 && r < 0.20) typeKey = 'goliath';
      if (waveNum === this.maxWaves && i === Math.floor(baseCount / 2)) typeKey = 'queen';

      queue.push(typeKey);
    }
    return queue;
  }

  spawnMeteorite() {
    if (!this.planet || this.isGameOver) return;
    sound.meteorWarning();

    // Pick random target node on planet
    const targetIdx = Math.floor(Math.random() * this.planet.navNodes.length);
    const targetNode = this.planet.navNodes[targetIdx];

    // High altitude spawn
    const spawnDir = targetNode.normal.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), (Math.random() - 0.5) * 0.5);
    const startPos = spawnDir.multiplyScalar(this.planet.baseRadius * 2.2);

    // Warning Reticle on ground
    const reticleGeo = new THREE.RingGeometry(2.0, 2.5, 16);
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0xff0033, side: THREE.DoubleSide });
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.position.copy(targetNode.pos);
    const up = new THREE.Vector3(0, 0, 1);
    reticle.quaternion.setFromUnitVectors(up, targetNode.normal);
    this.planet.terrainMesh.add(reticle);

    // Meteorite rock mesh
    const meteorGeo = new THREE.DodecahedronGeometry(1.4);
    const meteorMat = new THREE.MeshStandardMaterial({ color: 0x442211, emissive: 0xff3300, emissiveIntensity: 0.8 });
    const meteorMesh = new THREE.Mesh(meteorGeo, meteorMat);
    meteorMesh.position.copy(startPos);
    this.planet.terrainMesh.add(meteorMesh);

    this.meteorites.push({
      mesh: meteorMesh,
      reticle: reticle,
      targetPos: targetNode.pos,
      targetNode: targetNode,
      hp: 180,
      speed: this.planet.baseRadius * 0.45,
      isDead: false
    });
  }

  update(realDt) {
    if (this.isGameOver || this.simSpeed === 0) return;

    // Simulation delta scaled by speed multiplier (1x to 5x)
    const dt = Math.min(0.1, realDt) * this.simSpeed;

    // Handle Shockwave cooldown
    if (this.shockwaveCooldown > 0) {
      this.shockwaveCooldown -= dt;
      if (this.shockwaveCooldown < 0) this.shockwaveCooldown = 0;
    }

    // Periodic Falling Meteorite event
    this.meteoriteTimer -= dt;
    if (this.meteoriteTimer <= 0) {
      this.spawnMeteorite();
      this.meteoriteTimer = 20.0 + Math.random() * 15.0;
    }

    // Wave spawning
    if (this.isWaveActive && this.waveSpawnQueue.length > 0) {
      this.waveSpawnTimer -= dt;
      if (this.waveSpawnTimer <= 0) {
        const typeKey = this.waveSpawnQueue.shift();
        const spawner = this.planet.spawners[Math.floor(Math.random() * this.planet.spawners.length)];
        const path = this.findPath(spawner.pos, this.planet.corePosition);

        const enemy = new Enemy(typeKey, spawner.pos, path, this.planet.terrainMesh);
        this.enemies.push(enemy);
        this.waveSpawnTimer = 0.8 / Math.sqrt(this.wave);
      }
    }

    // Update enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt);

      if (e.reachedCore) {
        sound.explosion(0.8);
        this.coreShield -= (e.typeKey === 'queen' ? 35 : e.typeKey === 'goliath' ? 18 : 6);
        e.dispose(this.planet.terrainMesh);
        this.enemies.splice(i, 1);

        if (this.coreShield <= 0) {
          this.coreShield = 0;
          this.triggerDefeat();
          return;
        }
      } else if (e.isDead) {
        sound.explosion(0.6);
        this.energy += e.def.reward;
        this.score += e.def.reward * 3;
        e.dispose(this.planet.terrainMesh);
        this.enemies.splice(i, 1);
      }
    }

    // Update Towers
    this.towers.forEach(t => {
      if (t.cooldown > 0) t.cooldown -= dt;
      if (t.cooldown <= 0) {
        this.runTowerFiring(t);
      }
    });

    // Update Meteorites
    for (let i = this.meteorites.length - 1; i >= 0; i--) {
      const m = this.meteorites[i];
      const dir = new THREE.Vector3().subVectors(m.targetPos, m.mesh.position);
      const dist = dir.length();
      const step = m.speed * dt;

      if (dist <= step || m.isDead) {
        // Impact or destroyed in flight
        if (!m.isDead) {
          sound.explosion(1.8);
          // Ground impact damage to nearby towers & creeps
          const blastRadiusSq = Math.pow(6.0, 2);
          this.enemies.forEach(e => {
            if (e.mesh.position.distanceToSquared(m.targetPos) < blastRadiusSq) {
              e.takeDamage(150);
            }
          });
          // Reward partial salvage
          this.energy += 30;
        }
        this.planet.terrainMesh.remove(m.mesh);
        this.planet.terrainMesh.remove(m.reticle);
        this.meteorites.splice(i, 1);
      } else {
        dir.normalize();
        m.mesh.position.addScaledVector(dir, step);
        m.mesh.rotation.x += dt * 2;
        m.mesh.rotation.y += dt * 3;
      }
    }

    // Update Projectiles / FX
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.update) p.update(dt);
      if (p.life <= 0) {
        this.planet.terrainMesh.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // Check Wave Completion
    if (this.isWaveActive && this.waveSpawnQueue.length === 0 && this.enemies.length === 0) {
      this.isWaveActive = false;
      this.energy += 50 + this.wave * 15;
      this.score += 100 * this.wave;

      if (this.wave >= this.maxWaves) {
        this.triggerVictory();
      } else {
        this.autoSave();
      }
    }

    this.updateHud();
  }

  runTowerFiring(tower) {
    const tPos = tower.node.pos;
    const rangeSq = tower.range * tower.range;

    // Check anti-meteor interception (Missiles & Flak)
    if (tower.def.interceptsMeteor && this.meteorites.length > 0) {
      for (let m of this.meteorites) {
        if (m.mesh.position.distanceToSquared(tPos) < rangeSq * 1.5) {
          tower.cooldown = tower.fireRate;
          sound.laser();
          m.hp -= tower.damage;
          if (m.hp <= 0) {
            m.isDead = true;
            sound.explosion(1.2);
            this.energy += 50; // Bonus salvage
          }
          return;
        }
      }
    }

    // Find best target creep
    let target = null;
    let closestDistSq = Infinity;

    for (let e of this.enemies) {
      if (e.isBurrowed) continue;
      if (e.def.isFlyer && !tower.def.hitsAir) continue;
      if (!e.def.isFlyer && !tower.def.hitsGround) continue;

      const dSq = e.mesh.position.distanceToSquared(tPos);
      if (dSq < rangeSq && dSq < closestDistSq) {
        closestDistSq = dSq;
        target = e;
      }
    }

    if (!target) return;
    tower.cooldown = tower.fireRate;

    // Weapon mechanics
    if (tower.typeKey === 'laser') {
      sound.laser();
      target.takeDamage(tower.damage);
      this.createBeamFX(tPos, target.mesh.position, tower.def.color, 0.08);
    } else if (tower.typeKey === 'mortar') {
      sound.mortarLaunch();
      setTimeout(() => {
        sound.explosion(1.0);
        const aoeRadiusSq = Math.pow(tower.def.aoe, 2);
        this.enemies.forEach(e => {
          if (!e.def.isFlyer && e.mesh.position.distanceToSquared(target.mesh.position) < aoeRadiusSq) {
            e.takeDamage(tower.damage);
          }
        });
        this.createShockwaveFX(target.mesh.position, tower.def.aoe, tower.def.color);
      }, 500);
    } else if (tower.typeKey === 'missile') {
      sound.laser();
      target.takeDamage(tower.damage);
      this.createBeamFX(tPos, target.mesh.position, tower.def.color, 0.12);
    } else if (tower.typeKey === 'cryo') {
      sound.freeze();
      const aoeRadiusSq = Math.pow(tower.def.aoe, 2);
      this.enemies.forEach(e => {
        if (!e.def.isFlyer && e.mesh.position.distanceToSquared(tPos) < aoeRadiusSq) {
          e.takeDamage(tower.damage);
          e.applySlow(tower.def.slows, 3.0);
        }
      });
      this.createShockwaveFX(tPos, tower.def.aoe, tower.def.color);
    }
  }

  createBeamFX(start, end, colorHex, duration, thickness = 0.08) {
    const geo = new THREE.CylinderGeometry(thickness, thickness, start.distanceTo(end), 4);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9 });
    const beam = new THREE.Mesh(geo, mat);

    beam.position.copy(start).add(end).multiplyScalar(0.5);
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    beam.quaternion.setFromUnitVectors(up, dir);
    this.planet.terrainMesh.add(beam);

    this.projectiles.push({ mesh: beam, life: duration });
  }

  createShockwaveFX(center, radius, colorHex) {
    const ringGeo = new THREE.RingGeometry(radius * 0.8, radius, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(center);
    this.planet.terrainMesh.add(ring);
    this.projectiles.push({
      mesh: ring,
      life: 0.25,
      update: (dt) => {
        ring.scale.addScalar(dt * 2.0);
      }
    });
  }

  triggerVictory() {
    this.isGameOver = true;
    sound.levelWin();
    saveManager.recordVictory(this.level, this.score);
    if (this.onVictory) this.onVictory(this.level, this.score);
  }

  triggerDefeat() {
    this.isGameOver = true;
    sound.levelLose();
    saveManager.clearActiveMatch();
    if (this.onGameOver) this.onGameOver(this.level, this.score);
  }

  autoSave() {
    saveManager.saveActiveMatch(this.level, this.energy, this.coreShield, this.wave, this.towers);
  }

  updateHud() {
    if (this.onHudUpdate) {
      this.onHudUpdate({
        level: this.level,
        energy: this.energy,
        coreShield: this.coreShield,
        wave: this.wave,
        maxWaves: this.maxWaves,
        score: this.score,
        isWaveActive: this.isWaveActive,
        shockwaveCooldown: Math.ceil(this.shockwaveCooldown),
        selectedTower: this.selectedTower,
        simSpeed: this.simSpeed
      });
    }
  }
}
