/**
 * Orbital Core - Procedural Asteroid & Planetoid Generator
 * Generates deterministic 3D celestial bodies for seeds 1 - 999.
 * Computes surface elevations, lakes, lava, mountains, biomes, and navigation nodes.
 */

import * as THREE from '../vendor/three/three.module.min.js';

// Deterministic Mulberry32 PRNG
export function createRng(seed) {
  let s = Math.floor(Math.abs(seed)) || 1;
  return function next() {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Lightweight 3D Simplex-style Noise
class FastNoise3D {
  constructor(seed) {
    const rng = createRng(seed);
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const r = Math.floor(rng() * (i + 1));
      const temp = p[i];
      p[i] = p[r];
      p[r] = temp;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = x * x * x * (x * (x * 6 - 15) + 10);
    const v = y * y * y * (y * (y * 6 - 15) + 10);
    const w = z * z * z * (z * (z * 6 - 15) + 10);

    const A = this.perm[X] + Y, AA = this.perm[A] + Z, AB = this.perm[A + 1] + Z;
    const B = this.perm[X + 1] + Y, BA = this.perm[B] + Z, BB = this.perm[B + 1] + Z;

    const grad = (hash, x, y, z) => {
      const h = hash & 15;
      const u = h < 8 ? x : y;
      const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
      return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    };

    const lerp = (a, b, t) => a + t * (b - a);

    return lerp(
      lerp(
        lerp(grad(this.perm[AA], x, y, z), grad(this.perm[BA], x - 1, y, z), u),
        lerp(grad(this.perm[AB], x, y - 1, z), grad(this.perm[BB], x - 1, y - 1, z), u),
        v
      ),
      lerp(
        lerp(grad(this.perm[AA + 1], x, y, z - 1), grad(this.perm[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(this.perm[AB + 1], x, y - 1, z - 1), grad(this.perm[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  }

  fbm(x, y, z, octaves = 3) {
    let total = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * freq, y * freq, z * freq) * amp;
      max += amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    return total / max;
  }
}

// Biome palette definitions
export const BIOMES = {
  verdant: {
    name: 'Verdant Forest',
    liquidType: 'water',
    liquidColor: 0x1a73e8,
    liquidEmissive: 0x051d4d,
    rockColor: [0.35, 0.45, 0.25],
    peakColor: [0.85, 0.9, 0.95],
    flatColor: [0.2, 0.55, 0.22],
    lowColor: [0.65, 0.55, 0.35],
    atmosphere: 0x8ec6e6,
    hasTrees: true,
  },
  desert: {
    name: 'Arid Canyons',
    liquidType: 'water',
    liquidColor: 0x2299aa,
    liquidEmissive: 0x062830,
    rockColor: [0.75, 0.45, 0.25],
    peakColor: [0.85, 0.65, 0.45],
    flatColor: [0.82, 0.58, 0.32],
    lowColor: [0.9, 0.72, 0.45],
    atmosphere: 0xffddaa,
    hasTrees: false,
  },
  volcanic: {
    name: 'Molten Basalt',
    liquidType: 'lava',
    liquidColor: 0xff3b00,
    liquidEmissive: 0xdd2200,
    rockColor: [0.12, 0.12, 0.14],
    peakColor: [0.25, 0.15, 0.15],
    flatColor: [0.15, 0.14, 0.16],
    lowColor: [0.35, 0.1, 0.05],
    atmosphere: 0xff5522,
    hasTrees: false,
  },
  tundra: {
    name: 'Glacial Ice',
    liquidType: 'water',
    liquidColor: 0x33bbee,
    liquidEmissive: 0x052535,
    rockColor: [0.45, 0.55, 0.65],
    peakColor: [0.95, 0.98, 1.0],
    flatColor: [0.75, 0.85, 0.95],
    lowColor: [0.55, 0.65, 0.75],
    atmosphere: 0xcceeff,
    hasTrees: true,
  },
  toxic: {
    name: 'Toxic Alien',
    liquidType: 'acid',
    liquidColor: 0x00ff66,
    liquidEmissive: 0x008822,
    rockColor: [0.28, 0.15, 0.35],
    peakColor: [0.55, 0.25, 0.75],
    flatColor: [0.35, 0.18, 0.45],
    lowColor: [0.18, 0.35, 0.2],
    atmosphere: 0x88ffaa,
    hasTrees: false,
  }
};

/**
 * Builds procedural planetoid geometry and simulation graph
 */
export function generatePlanet(seed = 1) {
  const level = Math.max(1, Math.min(999, Math.floor(seed)));
  const rng = createRng(seed);
  const noise = new FastNoise3D(seed * 1337);

  // Radius formula: 10m at level 1 scaling to 50m at level 999
  const baseRadius = 10 + 40 * Math.pow((level - 1) / 998, 0.75);

  // Biome determination
  const biomeKeys = Object.keys(BIOMES);
  const biomeIndex = Math.floor(rng() * biomeKeys.length);
  const biome = BIOMES[biomeKeys[biomeIndex]];

  // Shape Archetype
  // 0: Sphere/Ovoid, 1: Contact Binary (Peanut), 2: Torus, 3: Crystal Monolith, 4: Canyon Gouged
  const shapeKind = Math.floor(rng() * 5);

  // Sea level threshold for water/lava lakes
  const seaLevel = baseRadius * 0.95;

  // Sphere base geometry tessellation
  const subdivisions = baseRadius > 30 ? 4 : 3;
  const baseGeo = new THREE.IcosahedronGeometry(baseRadius, subdivisions);
  const posAttr = baseGeo.attributes.position;
  const vertexCount = posAttr.count;

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);

  // Calculate vertex displacements and vertex colors
  for (let i = 0; i < vertexCount; i++) {
    let vx = posAttr.getX(i);
    let vy = posAttr.getY(i);
    let vz = posAttr.getZ(i);

    // Direction vector
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
    let nx = vx / len;
    let ny = vy / len;
    let nz = vz / len;

    // Base noise perturbation
    let n = noise.fbm(nx * 1.8, ny * 1.8, nz * 1.8, 3);

    // Shape modifiers
    let shapeFactor = 1.0;
    if (shapeKind === 1) {
      // Contact Binary (Peanut / Bi-lobate)
      const pinch = Math.abs(ny);
      shapeFactor = 0.75 + 0.35 * Math.sin(pinch * Math.PI);
    } else if (shapeKind === 2) {
      // Torus-like flattening
      const rH = Math.sqrt(nx * nx + nz * nz);
      shapeFactor = 0.85 + 0.3 * Math.sin(rH * Math.PI);
    } else if (shapeKind === 3) {
      // Crystal Monolith (Faceted plateau clamp)
      n = Math.round(n * 6) / 6;
      shapeFactor = 0.95;
    } else if (shapeKind === 4) {
      // Canyon Gouged
      const canyonAngle = Math.atan2(nz, nx);
      if (Math.abs(Math.sin(canyonAngle * 2)) < 0.25 && Math.abs(ny) < 0.6) {
        n -= 0.6; // Deep fissure
      }
    }

    // Radial elevation
    const elevationDelta = (n * 0.35) * baseRadius;
    let r = (baseRadius + elevationDelta) * shapeFactor;

    // North pole (Spawn) and South pole (Core Drill) leveling
    if (ny > 0.88) r = baseRadius * 1.02; // Flattened spawn basin
    if (ny < -0.88) r = baseRadius * 1.01; // Flattened core pedestal

    vx = nx * r;
    vy = ny * r;
    vz = nz * r;

    positions[i * 3] = vx;
    positions[i * 3 + 1] = vy;
    positions[i * 3 + 2] = vz;

    // Vertex Coloring based on altitude & slopes
    let c = biome.flatColor;
    if (r < seaLevel) {
      c = biome.lowColor; // Near shoreline / basin
    } else if (r > baseRadius * 1.1) {
      c = biome.peakColor; // Mountain peak
    } else if (r > baseRadius * 1.03) {
      c = biome.rockColor; // Cliffside
    }

    colors[i * 3] = c[0] + (rng() * 0.04 - 0.02);
    colors[i * 3 + 1] = c[1] + (rng() * 0.04 - 0.02);
    colors[i * 3 + 2] = c[2] + (rng() * 0.04 - 0.02);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (baseGeo.index) {
    geometry.setIndex(baseGeo.index);
  }
  geometry.computeVertexNormals();

  // Terrain Material
  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.1,
    flatShading: true,
  });

  const terrainMesh = new THREE.Mesh(geometry, terrainMat);
  terrainMesh.castShadow = true;
  terrainMesh.receiveShadow = true;

  // Inner Liquid Sphere (Lakes / Oceans / Lava)
  const liquidGeo = new THREE.SphereGeometry(seaLevel * 0.99, 32, 24);
  const liquidMat = new THREE.MeshStandardMaterial({
    color: biome.liquidColor,
    emissive: biome.liquidEmissive,
    emissiveIntensity: biome.liquidType === 'lava' ? 0.9 : 0.2,
    roughness: 0.2,
    metalness: 0.3,
    transparent: biome.liquidType === 'water',
    opacity: biome.liquidType === 'water' ? 0.8 : 1.0,
  });
  const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
  terrainMesh.add(liquidMesh);

  // Core Drill Station at South Pole
  const coreGroup = new THREE.Group();
  const drillPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 1.2, 3, 8),
    new THREE.MeshStandardMaterial({ color: 0x445566, metalness: 0.8, roughness: 0.2 })
  );
  const drillCore = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x00ffff })
  );
  coreGroup.add(drillPole);
  coreGroup.add(drillCore);
  coreGroup.position.set(0, -baseRadius * 0.99, 0);
  coreGroup.rotation.x = Math.PI;
  terrainMesh.add(coreGroup);

  // Spawner Portals (North Pole primary + Equatorial fissures at higher levels)
  const spawners = [
    { pos: new THREE.Vector3(0, baseRadius * 1.02, 0), id: 'spawner-north' }
  ];

  if (level > 100) {
    spawners.push({ pos: new THREE.Vector3(baseRadius * 1.01, 0, 0), id: 'spawner-east' });
  }
  if (level > 400) {
    spawners.push({ pos: new THREE.Vector3(-baseRadius * 1.01, 0, 0), id: 'spawner-west' });
  }
  if (level > 700) {
    spawners.push({ pos: new THREE.Vector3(0, 0, baseRadius * 1.01), id: 'spawner-front' });
  }

  // Create spawner rift visuals
  spawners.forEach(sp => {
    const rift = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.2, 8, 16),
      new THREE.MeshBasicMaterial({ color: 0xff0055 })
    );
    rift.position.copy(sp.pos);
    rift.lookAt(0, 0, 0);
    terrainMesh.add(rift);
  });

  // Procedural Aurora Ribbon
  const auroraRibbon = createAurora(baseRadius, biome.atmosphere);
  terrainMesh.add(auroraRibbon);

  // Surface Navigation & Buildable Graph Nodes (clean 2D spherical grid)
  const navNodes = [];
  const latCount = 16;
  const lonCount = 32;
  const grid = [];

  for (let latIdx = 0; latIdx < latCount; latIdx++) {
    grid[latIdx] = [];
    const lat = 0.15 + (latIdx / (latCount - 1)) * (Math.PI - 0.3);
    for (let lonIdx = 0; lonIdx < lonCount; lonIdx++) {
      const lon = (lonIdx / lonCount) * (Math.PI * 2);
      const nx = Math.sin(lat) * Math.cos(lon);
      const ny = Math.cos(lat);
      const nz = Math.sin(lat) * Math.sin(lon);

      // Raycast / sample surface elevation along this normal
      const r = sampleSurfaceRadius(nx, ny, nz, positions, vertexCount, baseRadius);
      const pos = new THREE.Vector3(nx * r, ny * r, nz * r);
      const normal = new THREE.Vector3(nx, ny, nz).normalize();

      // Check buildability: dry land, not too steep, not on spawner or core
      const isLiquid = r < seaLevel;
      const isPeak = r > baseRadius * 1.15;
      const nearNorth = ny > 0.82;
      const nearSouth = ny < -0.82;
      const buildable = !isLiquid && !isPeak && !nearNorth && !nearSouth;

      const node = {
        id: navNodes.length,
        latIdx,
        lonIdx,
        lat,
        lon,
        pos,
        normal,
        radius: r,
        buildable,
        occupied: false,
        isLiquid,
        tower: null,
        neighbors: []
      };
      grid[latIdx][lonIdx] = node.id;
      navNodes.push(node);
    }
  }

  // Connect immediate neighbors (up, down, left, right, and diagonals with wrap)
  for (let n of navNodes) {
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        if (dLat === 0 && dLon === 0) continue;
        const nLat = n.latIdx + dLat;
        const nLon = (n.lonIdx + dLon + lonCount) % lonCount;
        if (nLat >= 0 && nLat < latCount) {
          n.neighbors.push(grid[nLat][nLon]);
        }
      }
    }
  }

  return {
    level,
    seed,
    baseRadius,
    biome,
    shapeKind,
    terrainMesh,
    corePosition: new THREE.Vector3(0, -baseRadius * 0.99, 0),
    spawners,
    navNodes,
    seaLevel
  };
}

/**
 * Samples elevation along ray direction
 */
function sampleSurfaceRadius(nx, ny, nz, positions, count, baseRadius) {
  let closestDist = Infinity;
  let bestR = baseRadius;

  for (let i = 0; i < count; i += 2) {
    const vx = positions[i * 3];
    const vy = positions[i * 3 + 1];
    const vz = positions[i * 3 + 2];
    const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const dnx = vx / vLen;
    const dny = vy / vLen;
    const dnz = vz / vLen;

    const dot = nx * dnx + ny * dny + nz * dnz;
    if (dot > 0.98) {
      return vLen;
    }
    const dist = Math.abs(1.0 - dot);
    if (dist < closestDist) {
      closestDist = dist;
      bestR = vLen;
    }
  }
  return bestR;
}

/**
 * Procedural Aurora Borealis ribbon rings around magnetic poles
 */
function createAurora(radius, colorHex) {
  const auroraGroup = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(radius * 1.08, 0.4, 8, 36);
  const ringMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.35,
    wireframe: true
  });

  const northAurora = new THREE.Mesh(ringGeo, ringMat);
  northAurora.position.set(0, radius * 0.92, 0);
  northAurora.rotation.x = Math.PI / 2;

  const southAurora = new THREE.Mesh(ringGeo, ringMat);
  southAurora.position.set(0, -radius * 0.92, 0);
  southAurora.rotation.x = Math.PI / 2;

  auroraGroup.add(northAurora);
  auroraGroup.add(southAurora);
  return auroraGroup;
}
