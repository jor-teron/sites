/** AOE RTS - Phaser game config, scene create / update and the sim step (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
// ============================================================================
// SCENE
// ============================================================================
function create() {
    scene = this; cam = this.cameras.main;
    initMap(MAP_NUM);
    initWater(MAP_NUM);
    initTerrain(MAP_NUM);
    initAnimals(MAP_NUM);
    bakeGround(this);
    Art.build(this);
    gUnder = this.add.graphics().setDepth(-5);
    gfx = this.add.graphics().setDepth(1e7);
    const c = townCenter;
    [[c.x - 1, c.y + 2], [c.x + 2, c.y - 1], [c.x + 2, c.y + 2]].slice(0, START_VILLAGERS).forEach(p => spawnVillager(p[0], p[1]));
    hudText = document.getElementById('hud');
    infoText = { setText: t => { document.getElementById('info').textContent = t; } };
    infoText.setText(DEFAULT_INFO);

    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setZoom(ZOOM_DEFAULT);
    centerOnTC();
    resumeSave();
    this.scale.on('resize', () => { cam.setZoom(Phaser.Math.Clamp(cam.zoom, minZoom(), ZOOM_MAX)); });

    this.input.mouse.disableContextMenu();
    this.input.on('pointerdown', onPointerDown, this);
    this.input.on('pointermove', onPointerMove, this);
    this.input.on('pointerup', onPointerUp, this);
    this.input.on('wheel', onWheel, this);
    this.input.on('gameout', () => { pointerInside = false; });
    this.input.on('gameover', () => { pointerInside = true; });
    keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    initMinimap();
}
function centerOnTC() { const p = tileCenter(townCenter.x + 0.5, townCenter.y + 0.5); cam.centerOn(p.x, p.y - 20); }
function minZoom() { return Math.max(ZOOM_MIN_ABS, Math.min(cam.width / WORLD_W, cam.height / WORLD_H)); }

function update(time, delta) {
    const dt = Math.min(delta, 100) / 1000;
    updateCameraKeys(dt);
    pathBudget = PATH_BUDGET;
    if (!paused) {
        // speed multiplies simulated time; split into small steps so 5x stays stable (no overshoot)
        const sim = dt * speed, n = Math.max(1, Math.ceil(sim / SIM_STEP - 1e-6)), h = sim / n;
        for (let k = 0; k < n; k++) simStep(h);
    }
    const hud = `Wood ${resources.wood} · Food ${resources.food} · Gold ${resources.gold} · Stone ${resources.stone} · Pop ${popCount()}/${popCap()}`;
    if (hudText.textContent !== hud) hudText.textContent = hud;
    updateBar();
    render();
    updateMinimap(time);
}

function simStep(dt) {
    animT += dt * 1000;
    villagers.forEach(v => { v.walking = false; updateVillager(v, dt); });
    spreadIdle(dt);
    regrowBerries(dt);
    for (let i = 0; i < deer.length; i++) updateDeer(deer[i], dt);
    updateTraining(dt);
}

// ============================================================================
// GAME CONFIG
// ============================================================================
const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: '#2d4a2d',
    fps: { target: 30, limit: 30 },
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    disableContextMenu: true,
    scene: { create: create, update: update }
};
const game = new Phaser.Game(config);
