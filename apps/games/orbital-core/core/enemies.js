/**
 * Orbital Core - The 5 Procedural Enemy Archetypes
 * Manages low-poly 3D models, health bars, movement animations, and status effects.
 */

import * as THREE from '../vendor/three/three.module.min.js';

export const ENEMY_TYPES = {
  scuttler: {
    id: 'scuttler',
    name: 'Scuttler',
    hp: 80,
    speed: 2.3, // meters per second
    reward: 12,
    isFlyer: false,
    color: 0x00ff66,
    scale: 0.8
  },
  goliath: {
    id: 'goliath',
    name: 'Goliath',
    hp: 550,
    speed: 0.8,
    reward: 50,
    armor: 0.45, // 45% damage reduction
    isFlyer: false,
    color: 0xff6600,
    scale: 1.5
  },
  burrower: {
    id: 'burrower',
    name: 'Phase Burrower',
    hp: 200,
    speed: 1.5,
    reward: 30,
    isFlyer: false,
    color: 0xaa00ff,
    scale: 1.0
  },
  skimmer: {
    id: 'skimmer',
    name: 'Void Skimmer',
    hp: 130,
    speed: 2.7,
    altitude: 3.5, // meters above terrain
    reward: 25,
    isFlyer: true,
    color: 0x00ffff,
    scale: 1.1
  },
  queen: {
    id: 'queen',
    name: 'Shield Queen',
    hp: 1200,
    speed: 0.9,
    altitude: 4.5,
    reward: 140,
    isFlyer: true,
    shieldRadius: 6.0,
    color: 0xffffff,
    scale: 2.0
  }
};

export class Enemy {
  constructor(typeKey, startPos, pathNodes, planetMesh) {
    this.typeKey = typeKey;
    this.def = ENEMY_TYPES[typeKey];
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.speed = this.def.speed;
    this.pathNodes = pathNodes || [];
    this.pathIndex = 0;
    this.slowTimer = 0;
    this.slowFactor = 1.0;
    this.isDead = false;
    this.reachedCore = false;
    this.phaseBurrowTimer = 0;
    this.isBurrowed = false;
    this.animClock = 0;

    this.mesh = this.buildMesh();
    this.mesh.position.copy(startPos);
    planetMesh.add(this.mesh);
  }

  buildMesh() {
    const group = new THREE.Group();
    const color = this.def.color;
    const s = this.def.scale;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x222831,
      roughness: 0.6,
      metalness: 0.4
    });

    const glowMat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.8,
      roughness: 0.2
    });

    if (this.typeKey === 'scuttler') {
      // Tetrahedral insect body with needle legs
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, 1.0 * s, 3), glowMat);
      body.rotation.x = Math.PI / 2;
      group.add(body);
    } else if (this.typeKey === 'goliath') {
      // Heavy jagged basalt boulder
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 * s), bodyMat);
      const seam = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 * s), glowMat);
      group.add(boulder);
      group.add(seam);
    } else if (this.typeKey === 'burrower') {
      // Spiral segmented drill
      const drill = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.6 * s, 1.4 * s, 6), glowMat);
      drill.rotation.x = Math.PI / 2;
      group.add(drill);
    } else if (this.typeKey === 'skimmer') {
      // Stealth delta wing
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 1.6 * s, 3), glowMat);
      wing.rotation.x = Math.PI / 2;
      wing.scale.set(1.4, 0.3, 1.0);
      group.add(wing);
    } else if (this.typeKey === 'queen') {
      // Rotating icosahedral cage with glowing core
      const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 * s, 0), new THREE.MeshBasicMaterial({ color, wireframe: true }));
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.6 * s, 8, 8), glowMat);
      const bubble = new THREE.Mesh(
        new THREE.SphereGeometry(this.def.shieldRadius, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x3399ff, transparent: true, opacity: 0.2, wireframe: true })
      );
      group.add(cage);
      group.add(core);
      group.add(bubble);
      this.cageMesh = cage;
    }

    // Health Bar Billboard
    const barGeo = new THREE.PlaneGeometry(1.4 * s, 0.15 * s);
    const barMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    this.healthBar = new THREE.Mesh(barGeo, barMat);
    this.healthBar.position.y = 1.2 * s;
    group.add(this.healthBar);

    return group;
  }

  takeDamage(amount) {
    if (this.isBurrowed) return false;
    let actual = amount;
    if (this.def.armor) {
      actual *= (1 - this.def.armor);
    }
    this.hp -= actual;
    this.updateHealthBar();

    if (this.hp <= 0) {
      this.isDead = true;
      return true;
    }
    return false;
  }

  applySlow(factor, duration) {
    this.slowFactor = Math.min(this.slowFactor, factor);
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  updateHealthBar() {
    if (!this.healthBar) return;
    const pct = Math.max(0, this.hp / this.maxHp);
    this.healthBar.scale.x = pct;
    if (pct < 0.3) {
      this.healthBar.material.color.setHex(0xff2222);
    } else if (pct < 0.6) {
      this.healthBar.material.color.setHex(0xffaa00);
    }
  }

  update(dt) {
    this.animClock += dt;

    // Handle Slow timer
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 1.0;
    }

    // Handle Burrower stealth cycling
    if (this.typeKey === 'burrower') {
      this.phaseBurrowTimer += dt;
      if (this.phaseBurrowTimer > 6.0) this.phaseBurrowTimer = 0;
      this.isBurrowed = this.phaseBurrowTimer > 3.0 && this.phaseBurrowTimer < 5.0;
      this.mesh.visible = !this.isBurrowed;
    }

    // Queen rotation
    if (this.cageMesh) {
      this.cageMesh.rotation.y += dt * 1.5;
      this.cageMesh.rotation.x += dt * 0.8;
    }

    // Movement along path nodes
    if (this.pathIndex >= this.pathNodes.length) {
      this.reachedCore = true;
      return;
    }

    const targetNode = this.pathNodes[this.pathIndex];
    let targetPos = targetNode.pos.clone();

    // Flyers hover above the terrain
    if (this.def.isFlyer) {
      targetPos.addScaledVector(targetNode.normal, this.def.altitude);
    }

    const currentSpeed = this.speed * this.slowFactor;
    const moveDist = currentSpeed * dt;
    const dir = new THREE.Vector3().subVectors(targetPos, this.mesh.position);
    const distToTarget = dir.length();

    if (distToTarget <= moveDist) {
      this.mesh.position.copy(targetPos);
      this.pathIndex++;
    } else {
      dir.normalize();
      this.mesh.position.addScaledVector(dir, moveDist);

      // Orient forward along path and upright relative to planet surface
      const up = targetNode.normal;
      const matrix = new THREE.Matrix4().lookAt(this.mesh.position, targetPos, up);
      this.mesh.quaternion.setFromRotationMatrix(matrix);
    }
  }

  dispose(planetMesh) {
    planetMesh.remove(this.mesh);
  }
}
