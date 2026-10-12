/**
 * AOE RTS - Tiny Slice Isometric Game
 * Purpose: Single-player small RTS prototype
 * Features in this slice: Isometric map, one villager, wood gathering, one building placement, wood counter
 * Tech: Phaser 3 (local vendor), HTML5 Canvas
 * Author: Project setup
 * Date: 2026-10-10
 * Notes: Start of vertical slice. Expand later with ages, more buildings, combat.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Tile width in isometric projection (pixels) */
const TILE_WIDTH = 64;

/** Tile height in isometric projection (pixels) */
const TILE_HEIGHT = 32;

/** Map grid size (tiles) */
const MAP_SIZE = 12;

/** Villager movement speed (pixels per second) */
const VILLAGER_SPEED = 80;

/** Wood gathered per chop action */
const WOOD_PER_CHOP = 10;

// ============================================================================
// GAME CONFIG
// ============================================================================

/** Phaser game configuration */
const config = {
    type: Phaser.AUTO,
    width: 960,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#2d4a2d',
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    }
};

/** Main Phaser game instance */
const game = new Phaser.Game(config);

// ============================================================================
// GLOBAL STATE (for this tiny slice)
// ============================================================================

/** Current wood resource count */
let wood = 0;

/** Reference to the villager sprite */
let villager = null;

/** Target position for villager movement */
let moveTarget = null;

/** Whether villager is currently chopping */
let isChopping = false;

/** Selected tree tile coordinates (if any) */
let selectedTree = null;

/** HUD text for wood */
let woodText = null;

/** Graphics object for drawing map tiles */
let mapGraphics = null;

/** Simple map data: 0 = grass, 1 = tree */
let mapData = [];

// ============================================================================
// PRELOAD
// ============================================================================

/**
 * Preload assets (placeholders for now)
 */
function preload() {
    // No external assets yet — using generated graphics
    this.load.setBaseURL('');
}

// ============================================================================
// CREATE
// ============================================================================

/**
 * Create the scene: map, villager, HUD, input
 */
function create() {
    // Initialize map data
    initMap();

    // Create graphics layer for isometric tiles
    mapGraphics = this.add.graphics();

    // Draw the initial map
    drawMap(this);

    // Create villager (simple circle placeholder)
    villager = this.add.circle(0, 0, 8, 0x4a90e2);
    villager.setStrokeStyle(2, 0xffffff);

    // Position villager at map center (isometric)
    const centerIso = cartToIso(MAP_SIZE / 2, MAP_SIZE / 2);
    villager.x = centerIso.x + 480;
    villager.y = centerIso.y + 200;

    // Enable input
    this.input.on('pointerdown', onPointerDown, this);

    // Create HUD text
    woodText = this.add.text(10, 10, 'Wood: 0', {
        fontSize: '16px',
        fill: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 8, y: 4 }
    }).setScrollFactor(0).setDepth(100);

    // Instructions
    this.add.text(10, 40, 'Click map to move | Click tree to chop wood', {
        fontSize: '12px',
        fill: '#cccccc'
    }).setScrollFactor(0).setDepth(100);
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Game loop: handle movement and chopping
 * @param {number} time - Current time
 * @param {number} delta - Time since last frame (ms)
 */
function update(time, delta) {
    if (!villager) return;

    // Handle movement toward target
    if (moveTarget) {
        const dx = moveTarget.x - villager.x;
        const dy = moveTarget.y - villager.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 4) {
            const step = (VILLAGER_SPEED * delta) / 1000;
            villager.x += (dx / dist) * step;
            villager.y += (dy / dist) * step;
        } else {
            // Arrived
            villager.x = moveTarget.x;
            villager.y = moveTarget.y;
            moveTarget = null;

            // If arrived at tree, start chopping
            if (selectedTree) {
                isChopping = true;
                chopWood(this);
            }
        }
    }
}

// ============================================================================
// MAP FUNCTIONS
// ============================================================================

/**
 * Initialize map data with grass and some trees
 */
function initMap() {
    mapData = [];
    for (let y = 0; y < MAP_SIZE; y++) {
        mapData[y] = [];
        for (let x = 0; x < MAP_SIZE; x++) {
            // Mostly grass, some trees
            mapData[y][x] = (Math.random() < 0.15) ? 1 : 0;
        }
    }
}

/**
 * Convert cartesian grid coordinates to isometric screen coordinates
 * @param {number} cartX - Grid X
 * @param {number} cartY - Grid Y
 * @returns {{x: number, y: number}} Isometric position
 */
function cartToIso(cartX, cartY) {
    const isoX = (cartX - cartY) * (TILE_WIDTH / 2);
    const isoY = (cartX + cartY) * (TILE_HEIGHT / 2);
    return { x: isoX, y: isoY };
}

/**
 * Draw the isometric map using graphics
 * @param {Phaser.Scene} scene - Current scene
 */
function drawMap(scene) {
    mapGraphics.clear();

    for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            const iso = cartToIso(x, y);
            const screenX = iso.x + 480;
            const screenY = iso.y + 200;

            // Draw diamond tile
            const color = mapData[y][x] === 1 ? 0x2d5a2d : 0x3d6b3d;
            mapGraphics.fillStyle(color, 1);
            mapGraphics.beginPath();
            mapGraphics.moveTo(screenX, screenY);
            mapGraphics.lineTo(screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
            mapGraphics.lineTo(screenX, screenY + TILE_HEIGHT);
            mapGraphics.lineTo(screenX - TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
            mapGraphics.closePath();
            mapGraphics.fillPath();

            // Tree marker
            if (mapData[y][x] === 1) {
                mapGraphics.fillStyle(0x1a3a1a, 1);
                mapGraphics.fillCircle(screenX, screenY + 8, 6);
            }
        }
    }
}

// ============================================================================
// INPUT & ACTIONS
// ============================================================================

/**
 * Handle pointer down on the map
 * @param {Phaser.Input.Pointer} pointer - Pointer event
 */
function onPointerDown(pointer) {
    // Convert screen click to approximate grid (simple version)
    const localX = pointer.x - 480;
    const localY = pointer.y - 200;

    // Rough inverse isometric (for click targeting)
    const cartX = Math.round((localX / (TILE_WIDTH / 2) + localY / (TILE_HEIGHT / 2)) / 2);
    const cartY = Math.round((localY / (TILE_HEIGHT / 2) - localX / (TILE_WIDTH / 2)) / 2);

    if (cartX >= 0 && cartX < MAP_SIZE && cartY >= 0 && cartY < MAP_SIZE) {
        const iso = cartToIso(cartX, cartY);
        moveTarget = {
            x: iso.x + 480,
            y: iso.y + 200
        };

        // Check if clicked on a tree
        if (mapData[cartY][cartX] === 1) {
            selectedTree = { x: cartX, y: cartY };
        } else {
            selectedTree = null;
            isChopping = false;
        }
    }
}

/**
 * Chop wood from the selected tree
 * @param {Phaser.Scene} scene - Current scene
 */
function chopWood(scene) {
    if (!selectedTree || !isChopping) return;

    // Simple chop: add wood and remove tree after a delay
    wood += WOOD_PER_CHOP;
    woodText.setText('Wood: ' + wood);

    // Remove the tree
    mapData[selectedTree.y][selectedTree.x] = 0;
    drawMap(scene);

    isChopping = false;
    selectedTree = null;

    // Visual feedback
    scene.tweens.add({
        targets: villager,
        scale: 1.3,
        duration: 150,
        yoyo: true
    });
}
