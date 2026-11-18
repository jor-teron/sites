/**
 * Orbital Core - Main Game Bootstrapping & Three.js Viewport
 * Connects 3D rendering, orbit camera interactions, raycast selection, and HUD event wiring.
 */

import * as THREE from '../vendor/three/three.module.min.js';
import { Simulation } from './sim.js';
import { HUD } from '../ui/hud.js';
import { sound } from './audio.js';
import { saveManager } from './save.js';

class OrbitalCoreApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.sim = null;
    this.hud = null;

    // Camera Orbit State
    this.spherical = new THREE.Spherical(35, Math.PI / 3, Math.PI / 4);
    this.target = new THREE.Vector3(0, 0, 0);
    this.isDragging = false;
    this.previousPointer = { x: 0, y: 0 };
    this.pinchDist = 0;

    // Lighting State
    this.sunLight = null;
    this.ambientLight = null;
    this.dayNightEnabled = saveManager.data.settings.dayNightShadows;

    // Raycasting
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // 30 FPS Loop Accumulator
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.tickInterval = 1000 / 30; // 33.33ms (30 FPS)

    this.initThree();
    this.initGame();
    this.bindInput();
    this.startLoop();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060913);

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    this.updateCameraPosition();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = this.dayNightEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // Ambient Space Light
    this.ambientLight = new THREE.AmbientLight(0xffffff, this.dayNightEnabled ? 0.35 : 0.85);
    this.scene.add(this.ambientLight);

    // Directional Sun Light
    this.sunLight = new THREE.DirectionalLight(0xfffaed, this.dayNightEnabled ? 1.4 : 0.8);
    this.sunLight.position.set(50, 40, 50);
    this.sunLight.castShadow = this.dayNightEnabled;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.scene.add(this.sunLight);

    // Distant Starfield Particles
    this.createStarfield();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  createStarfield() {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 600;
    const starPos = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      starPos[i] = (Math.random() - 0.5) * 800;
      starPos[i + 1] = (Math.random() - 0.5) * 800;
      starPos[i + 2] = (Math.random() - 0.5) * 800;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0.8 });
    const stars = new THREE.Points(starGeo, starMat);
    this.scene.add(stars);
  }

  initGame() {
    this.hud = new HUD({
      onSelectBuildType: (typeKey) => {
        // Build card selected
      },
      onUpgradeTower: (tower) => {
        this.sim.upgradeTower(tower);
      },
      onScrapTower: (tower) => {
        this.sim.scrapTower(tower);
      },
      onSpeedChange: (speed) => {
        this.sim.simSpeed = speed;
        saveManager.updateSettings({ simSpeed: speed });
      },
      onStartWave: () => {
        sound.init();
        this.sim.startNextWave();
      },
      onShockwave: () => {
        this.sim.triggerShockwave();
      },
      onSeedJump: (seed) => {
        this.loadLevel(seed);
      },
      onToggleShadows: () => {
        this.dayNightEnabled = !this.dayNightEnabled;
        this.renderer.shadowMap.enabled = this.dayNightEnabled;
        this.sunLight.castShadow = this.dayNightEnabled;
        this.sunLight.intensity = this.dayNightEnabled ? 1.4 : 0.8;
        this.ambientLight.intensity = this.dayNightEnabled ? 0.35 : 0.85;
        saveManager.updateSettings({ dayNightShadows: this.dayNightEnabled });
        return this.dayNightEnabled;
      },
      onToggleAudio: () => {
        sound.setMuted(!sound.muted);
        saveManager.updateSettings({ muted: sound.muted });
        return sound.muted;
      },
      onNextLevel: () => {
        this.loadLevel(this.sim.level + 1);
      },
      onRetryLevel: () => {
        this.loadLevel(this.sim.level);
      }
    });

    this.sim = new Simulation(
      this.scene,
      (state) => this.hud.update(state),
      (level, score) => this.hud.showDefeat(level, score),
      (level, score) => this.hud.showVictory(level, score)
    );

    // Apply saved settings
    if (saveManager.data.settings.muted) {
      sound.setMuted(true);
      if (this.hud.dom.btnAudio) this.hud.dom.btnAudio.textContent = '🔇 Audio: OFF';
    }
    if (saveManager.data.settings.simSpeed !== undefined) {
      this.sim.simSpeed = saveManager.data.settings.simSpeed;
      this.hud.dom.speedBtns.forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.speed, 10) === this.sim.simSpeed);
      });
    }

    // Load initial level or active session
    const startLevel = saveManager.data.inProgress ? saveManager.data.inProgress.level : saveManager.data.currentLevel;
    this.loadLevel(startLevel, saveManager.data.inProgress);
  }

  loadLevel(level, resumeState = null) {
    this.hud.hideInspector();
    this.sim.loadLevel(level, resumeState);

    // Auto-scale camera distance to planet radius
    const targetDist = this.sim.planet.baseRadius * 2.8;
    this.spherical.radius = targetDist;
    this.updateCameraPosition();

    if (this.hud.dom.seedInput) {
      this.hud.dom.seedInput.value = level;
    }
  }

  bindInput() {
    const el = this.renderer.domElement;

    // Mouse / Touch Drag to Rotate Globe
    const onPointerDown = (x, y) => {
      sound.init(); // Initialize audio context on user interaction
      this.isDragging = true;
      this.previousPointer = { x, y };
    };

    const onPointerMove = (x, y) => {
      if (!this.isDragging) return;
      const dx = x - this.previousPointer.x;
      const dy = y - this.previousPointer.y;

      const rotateSpeed = 0.005;
      this.spherical.theta -= dx * rotateSpeed;
      this.spherical.phi -= dy * rotateSpeed;
      // Clamp vertical polar angle to prevent gimbal flip
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));

      this.previousPointer = { x, y };
      this.updateCameraPosition();
    };

    const onPointerUp = () => {
      this.isDragging = false;
    };

    el.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onPointerUp);

    // Touch events
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        this.pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const delta = (dist - this.pinchDist) * 0.1;
        this.spherical.radius = Math.max(
          this.sim.planet.baseRadius * 1.5,
          Math.min(this.sim.planet.baseRadius * 5.0, this.spherical.radius - delta)
        );
        this.pinchDist = dist;
        this.updateCameraPosition();
      }
    }, { passive: false });

    window.addEventListener('touchend', onPointerUp);

    // Scroll Wheel Zoom
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomSpeed = 0.05 * this.sim.planet.baseRadius;
      this.spherical.radius = Math.max(
        this.sim.planet.baseRadius * 1.4,
        Math.min(this.sim.planet.baseRadius * 4.5, this.spherical.radius + (e.deltaY > 0 ? zoomSpeed : -zoomSpeed))
      );
      this.updateCameraPosition();
    }, { passive: false });

    // Click / Tap on 3D Planet for Tower Placement or Selection
    el.addEventListener('click', (e) => {
      // Calculate normalized device coordinates (-1 to +1)
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

      this.raycaster.setFromCamera(this.pointer, this.camera);

      // Check click on existing towers
      for (let t of this.sim.towers) {
        const intersects = this.raycaster.intersectObjects(t.mesh.children, true);
        if (intersects.length > 0) {
          this.sim.selectTower(t);
          this.hud.showInspector(t, this.sim.energy);
          return;
        }
      }

      // Check click on planet surface nav nodes
      if (this.sim.planet && this.sim.planet.terrainMesh) {
        const intersects = this.raycaster.intersectObject(this.sim.planet.terrainMesh, false);
        if (intersects.length > 0) {
          const hitPos = intersects[0].point;

          // Find closest buildable node
          let bestNode = null;
          let minD = Infinity;
          for (let node of this.sim.planet.navNodes) {
            const d = node.pos.distanceTo(hitPos);
            if (d < minD && d < 4.0) {
              minD = d;
              bestNode = node;
            }
          }

          if (bestNode) {
            if (bestNode.occupied && bestNode.tower) {
              this.sim.selectTower(bestNode.tower);
              this.hud.showInspector(bestNode.tower, this.sim.energy);
            } else if (bestNode.buildable && !bestNode.occupied) {
              this.sim.buildTower(bestNode.id, this.hud.selectedBuildType);
            }
          }
        }
      }
    });
  }

  updateCameraPosition() {
    this.camera.position.setFromSpherical(this.spherical).add(this.target);
    this.camera.lookAt(this.target);
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  startLoop() {
    const animate = (currentTime) => {
      requestAnimationFrame(animate);

      const delta = currentTime - this.lastTime;
      this.lastTime = currentTime;
      this.accumulator += delta;

      // Fixed 30 FPS tick updates
      while (this.accumulator >= this.tickInterval) {
        this.sim.update(this.tickInterval / 1000);
        this.accumulator -= this.tickInterval;
      }

      // Gentle orbital sun rotation when Day/Night shadows is ON
      if (this.dayNightEnabled && this.sunLight) {
        const t = currentTime * 0.0003;
        const orbitR = this.sim.planet.baseRadius * 3.0;
        this.sunLight.position.set(Math.cos(t) * orbitR, Math.sin(t * 0.5) * orbitR * 0.5, Math.sin(t) * orbitR);
      }

      this.renderer.render(this.scene, this.camera);
    };

    requestAnimationFrame(animate);
  }
}

// Boot game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  new OrbitalCoreApp();
});
