/**
 * Orbital Core - The 4 Defensive Tower Weapons
 * Handles tower geometries, range checks, firing logic, scrap refunds, and range indicators.
 */

import * as THREE from '../vendor/three/three.module.min.js';
import { sound } from './audio.js';

export const TOWER_TYPES = {
  laser: {
    id: 'laser',
    name: 'Pulse Laser',
    cost: 100,
    range: 9.0,
    damage: 28,
    fireRate: 0.25, // seconds between shots
    hitsAir: true,
    hitsGround: true,
    aoe: 0,
    color: 0x00ffcc,
    desc: 'Rapid-fire directed energy beam against fast scouts.'
  },
  mortar: {
    id: 'mortar',
    name: 'Plasma Mortar',
    cost: 250,
    range: 24.0,
    damage: 160,
    fireRate: 2.2,
    hitsAir: false,
    hitsGround: true,
    aoe: 5.5,
    color: 0xff8800,
    desc: 'Lobs explosive shells over ridges into distant clusters.'
  },
  cryo: {
    id: 'cryo',
    name: 'Cryo Spire',
    cost: 180,
    range: 11.0,
    damage: 12,
    fireRate: 1.0,
    slows: 0.5,
    hitsAir: false,
    hitsGround: true,
    aoe: 6.5,
    color: 0x88eeff,
    desc: 'Emits a 360-degree sub-zero frost wave that slows creeps by 50%.'
  },
  missile: {
    id: 'missile',
    name: 'Missile Silo',
    cost: 300,
    range: 20.0,
    damage: 115,
    fireRate: 1.5,
    hitsAir: true,
    hitsGround: true,
    interceptsMeteor: true,
    aoe: 3.5,
    color: 0xff3344,
    desc: 'Homing smart missiles targeting flyers and incoming meteorites.'
  }
};

export class Tower {
  constructor(typeKey, node, planetMesh) {
    this.typeKey = typeKey;
    this.def = TOWER_TYPES[typeKey];
    this.node = node;
    this.level = 1;
    this.cooldown = 0;
    this.totalInvested = this.def.cost;
    this.mesh = this.buildMesh();
    this.rangeRing = null;

    // Position & align perpendicular to planet surface normal
    this.mesh.position.copy(node.pos);
    const up = new THREE.Vector3(0, 1, 0);
    this.mesh.quaternion.setFromUnitVectors(up, node.normal);

    planetMesh.add(this.mesh);
  }

  get range() {
    return this.def.range * (1 + (this.level - 1) * 0.35);
  }

  get damage() {
    return this.def.damage * (1 + (this.level - 1) * 0.45);
  }

  get fireRate() {
    return Math.max(0.1, this.def.fireRate * (1 - (this.level - 1) * 0.15));
  }

  get upgradeCost() {
    return Math.floor(this.def.cost * 0.75 * this.level);
  }

  get scrapValue() {
    return Math.floor(this.totalInvested * 0.75);
  }

  upgrade() {
    if (this.level >= 3) return false;
    this.totalInvested += this.upgradeCost;
    this.level += 1;
    sound.build();

    // Add visual rank badge ring
    const rankRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.7 + this.level * 0.2, 0.08, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd700 })
    );
    rankRing.position.y = 1.0 + this.level * 0.4;
    rankRing.rotation.x = Math.PI / 2;
    this.mesh.add(rankRing);
    return true;
  }

  dispose(planetMesh) {
    if (this.rangeRing && this.rangeRing.parent) {
      this.rangeRing.parent.remove(this.rangeRing);
    }
    planetMesh.remove(this.mesh);
  }

  buildMesh() {
    const group = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x334455,
      metalness: 0.8,
      roughness: 0.3
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: this.def.color,
      emissive: this.def.color,
      emissiveIntensity: 0.7,
      roughness: 0.2
    });

    // Base pedestal
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 0.4, 8), baseMat);
    base.position.y = 0.2;
    base.castShadow = true;
    group.add(base);

    // Weapon-specific silhouettes
    if (this.typeKey === 'laser') {
      const turret = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.8, 8), accentMat);
      turret.position.y = 1.1;
      group.add(turret);
    } else if (this.typeKey === 'mortar') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.4, 1.4, 8), accentMat);
      barrel.position.y = 0.9;
      barrel.rotation.x = 0.4;
      group.add(barrel);
    } else if (this.typeKey === 'missile') {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 6), baseMat);
      silo.position.y = 0.8;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 6), accentMat);
      nose.position.y = 1.5;
      group.add(silo);
      group.add(nose);
    } else if (this.typeKey === 'cryo') {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), accentMat);
      crystal.position.y = 1.3;
      group.add(crystal);
    }

    return group;
  }

  showRangeRing(planetMesh) {
    this.hideRangeRing();
    const ringGeo = new THREE.RingGeometry(this.range * 0.95, this.range, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.def.color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4
    });
    this.rangeRing = new THREE.Mesh(ringGeo, ringMat);
    this.rangeRing.position.copy(this.node.pos);
    const up = new THREE.Vector3(0, 0, 1);
    this.rangeRing.quaternion.setFromUnitVectors(up, this.node.normal);
    planetMesh.add(this.rangeRing);
  }

  hideRangeRing() {
    if (this.rangeRing && this.rangeRing.parent) {
      this.rangeRing.parent.remove(this.rangeRing);
      this.rangeRing = null;
    }
  }
}
