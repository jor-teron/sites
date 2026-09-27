/*
    Island Game — Alpha 5
    70 x 35 m landscape island for a Celeron laptop.

    This build:
    - Rectangle island 70m (X) by 35m (Z), water rim, no swimming off-map
    - Two climbable hills
    - Sky + a few clouds (hidden on Low quality)
    - Blocky player + animals with faces
    - Chew mouth while eating, sleep eyes while resting
    - Trees with trunk collision and side branches
    - Grass tufts + flowers animals can eat
    - Animal loop: seek plant → eat 15s → rest under tree 45s
    - WASD + Space jump
    - NO pointer lock
    - LMB drag = pan (holds), RMB drag = look
    - FPS cap (default 30), Res, Quality, Pause

    Date: 2026-09-26
*/

// ---- Constants -------------------------------------------------------------

/** Island width on X (landscape). */
const MAP_SIZE_X = 70;

/** Island depth on Z. */
const MAP_SIZE_Z = 35;

/** Water plane larger than the island. */
const WATER_SIZE_X = 110;

/** Water plane depth. */
const WATER_SIZE_Z = 70;

/** Island top above water, metres. */
const ISLAND_HEIGHT = 1.6;

/** Walkable grass Y. */
const GROUND_Y = ISLAND_HEIGHT;

/** Player walk speed m/s. */
const WALK_SPEED = 5;

/** Jump impulse m/s. */
const JUMP_SPEED = 7.2;

/** Gravity m/s^2. */
const GRAVITY = 18;

/** Look mouse sensitivity (RMB drag). */
const LOOK_SENSITIVITY = 0.005;

/** Pan metres per pixel (LMB drag). Strong so it is obvious. */
const PAN_SENSITIVITY = 0.12;

/** Player collision radius. */
const PLAYER_RADIUS = 0.4;

/** Player height. */
const PLAYER_HEIGHT = 1.8;

/** Eat duration seconds. */
const EAT_TIME = 15;

/** Rest duration seconds. */
const REST_TIME = 45;

/** Seconds before a eaten plant can be used again. */
const PLANT_RESPAWN = 25;

// ---- Engine / scene --------------------------------------------------------

/** Canvas. */
const canvas = document.getElementById("renderCanvas");

/** Engine. */
const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true
});

/** Scene. */
const scene = new BABYLON.Scene(engine);
scene.collisionsEnabled = true;
scene.clearColor = new BABYLON.Color4(0.45, 0.68, 0.92, 1);

/** Pause flag — simulation frozen. */
let paused = false;

/** Quality flag. */
let quality = "low";

// ---- Lighting --------------------------------------------------------------

/** Hemisphere light. */
const hemiLight = new BABYLON.HemisphericLight(
    "hemiLight",
    new BABYLON.Vector3(0, 1, 0),
    scene
);
hemiLight.intensity = 0.7;
hemiLight.groundColor = new BABYLON.Color3(0.22, 0.3, 0.18);

/** Sun. */
const sun = new BABYLON.DirectionalLight(
    "sun",
    new BABYLON.Vector3(-0.35, -1, -0.2),
    scene
);
sun.position = new BABYLON.Vector3(20, 40, 12);
sun.intensity = 0.65;

// ---- Sky + clouds ----------------------------------------------------------

/**
 * Procedural sky if materials library is present.
 */
function createSky() {
    if (typeof BABYLON.SkyMaterial === "undefined") return null;
    const skyMat = new BABYLON.SkyMaterial("skyMat", scene);
    skyMat.backFaceCulling = false;
    skyMat.inclination = 0.15;
    skyMat.azimuth = 0.25;
    skyMat.luminance = 0.9;
    skyMat.turbidity = 4;
    skyMat.rayleigh = 1.4;
    const skybox = BABYLON.MeshBuilder.CreateBox("skybox", { size: 600 }, scene);
    skybox.material = skyMat;
    skybox.infiniteDistance = true;
    return skybox;
}

/** Sky instance. */
const skybox = createSky();

/** Cloud meshes so Low quality can hide them. */
const cloudMeshes = [];

/**
 * A few flattened puffs. Hidden when quality is Low.
 */
function createClouds() {
    const cloudMat = new BABYLON.StandardMaterial("cloudMat", scene);
    cloudMat.diffuseColor = new BABYLON.Color3(0.95, 0.96, 0.98);
    cloudMat.specularColor = new BABYLON.Color3(0, 0, 0);
    cloudMat.emissiveColor = new BABYLON.Color3(0.35, 0.38, 0.42);
    const spots = [
        [20, 28, -18],
        [-24, 30, 16],
        [32, 26, 22],
        [-10, 32, 34],
        [8, 27, -36]
    ];
    spots.forEach((p, i) => {
        const puff = BABYLON.MeshBuilder.CreateSphere(
            "cloud" + i,
            { diameterX: 18, diameterY: 5, diameterZ: 10, segments: 6 },
            scene
        );
        puff.position = new BABYLON.Vector3(p[0], p[1], p[2]);
        puff.material = cloudMat;
        puff.isPickable = false;
        cloudMeshes.push(puff);
    });
}

createClouds();

// ---- Materials -------------------------------------------------------------

/** Grass slab. */
const grassMat = new BABYLON.StandardMaterial("grassMat", scene);
grassMat.diffuseColor = new BABYLON.Color3(0.30, 0.55, 0.24);
grassMat.specularColor = new BABYLON.Color3(0.04, 0.04, 0.04);

/** Other 35x35 half — warmer grass. */
const grassMatB = new BABYLON.StandardMaterial("grassMatB", scene);
grassMatB.diffuseColor = new BABYLON.Color3(0.48, 0.52, 0.20);
grassMatB.specularColor = new BABYLON.Color3(0.04, 0.04, 0.04);

/** Hill dirt. */
const dirtMat = new BABYLON.StandardMaterial("dirtMat", scene);
dirtMat.diffuseColor = new BABYLON.Color3(0.42, 0.32, 0.18);
dirtMat.specularColor = new BABYLON.Color3(0.03, 0.03, 0.03);

/** Water. */
const waterMat = new BABYLON.StandardMaterial("waterMat", scene);
waterMat.diffuseColor = new BABYLON.Color3(0.12, 0.38, 0.55);
waterMat.specularColor = new BABYLON.Color3(0.35, 0.45, 0.55);
waterMat.alpha = 0.92;

/** Bark. */
const barkMat = new BABYLON.StandardMaterial("barkMat", scene);
barkMat.diffuseColor = new BABYLON.Color3(0.38, 0.24, 0.12);

/** Leaves. */
const leafMat = new BABYLON.StandardMaterial("leafMat", scene);
leafMat.diffuseColor = new BABYLON.Color3(0.18, 0.45, 0.16);

/** Tuft grass. */
const tuftMat = new BABYLON.StandardMaterial("tuftMat", scene);
tuftMat.diffuseColor = new BABYLON.Color3(0.22, 0.62, 0.20);

/** Face features (eyes / mouth). */
const faceMat = new BABYLON.StandardMaterial("faceMat", scene);
faceMat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.1);

/** Animal body. */
const animalMat = new BABYLON.StandardMaterial("animalMat", scene);
animalMat.diffuseColor = new BABYLON.Color3(0.72, 0.58, 0.38);

/** Flower colours. */
const flowerColors = [
    new BABYLON.Color3(0.92, 0.28, 0.42),
    new BABYLON.Color3(0.95, 0.82, 0.22),
    new BABYLON.Color3(0.72, 0.38, 0.88),
    new BABYLON.Color3(0.98, 0.55, 0.18)
];

// ---- Water / island / hill -------------------------------------------------

/**
 * Water rim at y = 0. No collision — player cannot leave the island.
 */
function createWater() {
    const water = BABYLON.MeshBuilder.CreateGround(
        "water",
        { width: WATER_SIZE_X, height: WATER_SIZE_Z },
        scene
    );
    water.position.y = 0;
    water.material = waterMat;
    return water;
}

createWater();

/**
 * Two 35x35 slabs making the 70x35 island. Split on the long X axis.
 * @param {string} name
 * @param {number} xCentre
 * @param {BABYLON.StandardMaterial} mat
 */
function createIslandHalf(name, xCentre, mat) {
    const slab = BABYLON.MeshBuilder.CreateBox(
        name,
        { width: 35, height: ISLAND_HEIGHT, depth: MAP_SIZE_Z },
        scene
    );
    slab.position.x = xCentre;
    slab.position.y = ISLAND_HEIGHT / 2;
    slab.material = mat;
    slab.checkCollisions = true;
    return slab;
}

/** West half (current green) and east half (new colour). */
const islands = [
    createIslandHalf("islandA", -17.5, grassMat),
    createIslandHalf("islandB", 17.5, grassMatB)
];

/**
 * Climbable hill bump.
 * @param {string} name
 * @param {number} x
 * @param {number} z
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 */
function createHill(name, x, z, sx, sy, sz) {
    const hillMesh = BABYLON.MeshBuilder.CreateSphere(
        name,
        { diameterX: sx, diameterY: sy, diameterZ: sz, segments: 8 },
        scene
    );
    hillMesh.position = new BABYLON.Vector3(x, GROUND_Y - 1.2, z);
    hillMesh.material = dirtMat;
    hillMesh.checkCollisions = true;
    return hillMesh;
}

/** Two hills. */
const hills = [
    createHill("hillA", -18, 8, 16, 8, 12),
    createHill("hillB", 22, -6, 14, 7, 11)
];

// ---- Dolphin (water loop) --------------------------------------------------

/** Dolphin body colour. */
const dolphinMat = new BABYLON.StandardMaterial("dolphinMat", scene);
dolphinMat.diffuseColor = new BABYLON.Color3(0.45, 0.52, 0.62);

/**
 * Low-poly dolphin that circles in the water, never on the island.
 */
function createDolphin() {
    const root = new BABYLON.TransformNode("dolphin", scene);
    const body = BABYLON.MeshBuilder.CreateSphere(
        "dolphinBody",
        { diameterX: 1.6, diameterY: 0.55, diameterZ: 0.5, segments: 6 },
        scene
    );
    body.parent = root;
    body.material = dolphinMat;
    const nose = BABYLON.MeshBuilder.CreateSphere(
        "dolphinNose",
        { diameterX: 0.7, diameterY: 0.22, diameterZ: 0.22, segments: 5 },
        scene
    );
    nose.parent = root;
    nose.position.x = 0.9;
    nose.material = dolphinMat;
    const fin = BABYLON.MeshBuilder.CreateBox(
        "dolphinFin",
        { width: 0.15, height: 0.45, depth: 0.08 },
        scene
    );
    fin.parent = root;
    fin.position.y = 0.35;
    fin.material = dolphinMat;
    return root;
}

/** Dolphin roots on the same loop, opposite sides. */
const dolphin = createDolphin();
const dolphinB = createDolphin();
dolphinB.name = "dolphinB";

/** Angle on the water loop, radians. */
let dolphinAngle = 0;

/**
 * Swim an ellipse around the island in the water.
 * @param {number} dt
 */
function updateDolphin(dt) {
    /** ~3.2 m/s on a ~42 m radius ≈ 2× animal walk. */
    dolphinAngle += dt * 0.076;
    const rx = 42;
    const rz = 24;
    function place(node, ang) {
        node.position.x = Math.cos(ang) * rx;
        node.position.z = Math.sin(ang) * rz;
        node.position.y = 0.35;
        node.rotation.y = ang + Math.PI / 2;
    }
    place(dolphin, dolphinAngle);
    place(dolphinB, dolphinAngle + Math.PI);
}

// ---- Trees -----------------------------------------------------------------

/** Rest points under trees (world XZ + y). */
const treeSpots = [];

/**
 * Tree with colliding trunk, two side branches, leaf balls.
 * @param {string} name
 * @param {number} x
 * @param {number} z
 * @param {number} scale
 */
function createTree(name, x, z, scale) {
    const trunkH = 3.4 * scale;
    const trunk = BABYLON.MeshBuilder.CreateCylinder(
        name + "_trunk",
        { height: trunkH, diameter: 0.55 * scale, tessellation: 8 },
        scene
    );
    trunk.position = new BABYLON.Vector3(x, GROUND_Y + trunkH / 2, z);
    trunk.material = barkMat;
    trunk.checkCollisions = true;

    /**
     * One branch sticking out of the trunk.
     * @param {string} id
     * @param {number} yaw
     * @param {number} heightOnTrunk
     */
    function addBranch(id, yaw, heightOnTrunk) {
        const len = 1.3 * scale;
        const br = BABYLON.MeshBuilder.CreateCylinder(
            name + "_br_" + id,
            { height: len, diameter: 0.16 * scale, tessellation: 6 },
            scene
        );
        br.material = barkMat;
        br.checkCollisions = false;
        const midY = GROUND_Y + heightOnTrunk;
        br.position = new BABYLON.Vector3(
            x + Math.sin(yaw) * (len / 2),
            midY,
            z + Math.cos(yaw) * (len / 2)
        );
        br.rotation.z = Math.PI / 2.4;
        br.rotation.y = yaw;

        const ball = BABYLON.MeshBuilder.CreateSphere(
            name + "_brleaf_" + id,
            { diameter: 1.6 * scale, segments: 6 },
            scene
        );
        ball.position = new BABYLON.Vector3(
            x + Math.sin(yaw) * len,
            midY + 0.35 * scale,
            z + Math.cos(yaw) * len
        );
        ball.material = leafMat;
        ball.checkCollisions = false;
    }

    addBranch("a", 0.4, 2.1 * scale);
    addBranch("b", 3.4, 2.4 * scale);

    const leaves = BABYLON.MeshBuilder.CreateSphere(
        name + "_leaves",
        { diameter: 3.2 * scale, segments: 7 },
        scene
    );
    leaves.position = new BABYLON.Vector3(x, GROUND_Y + trunkH + 0.2 * scale, z);
    leaves.material = leafMat;
    leaves.checkCollisions = false;

    treeSpots.push({ x: x, z: z, busy: false });
    treeCanopies.push(leaves);
}

/** Leaf balls used for a cheap wind sway. */
const treeCanopies = [];

createTree("t1", 24, -10, 1.0);
createTree("t2", 18, 8, 0.9);
createTree("t3", -22, -8, 1.05);
createTree("t4", 6, 10, 0.95);
createTree("t5", -14, 12, 0.85);

// ---- Hut + dock ------------------------------------------------------------

/** Wood for hut and dock. */
const woodMat = new BABYLON.StandardMaterial("woodMat", scene);
woodMat.diffuseColor = new BABYLON.Color3(0.55, 0.38, 0.22);

/** Roof tile. */
const roofMat = new BABYLON.StandardMaterial("roofMat", scene);
roofMat.diffuseColor = new BABYLON.Color3(0.62, 0.22, 0.16);

/**
 * Tiny hut on the east half.
 */
function createHut() {
    const hut = BABYLON.MeshBuilder.CreateBox(
        "hut",
        { width: 3.2, height: 2.2, depth: 2.8 },
        scene
    );
    hut.position = new BABYLON.Vector3(26, GROUND_Y + 1.1, 8);
    hut.material = woodMat;
    hut.checkCollisions = true;
    const roof = BABYLON.MeshBuilder.CreateCylinder(
        "hutRoof",
        { diameter: 4.2, height: 1.4, tessellation: 4 },
        scene
    );
    roof.position = new BABYLON.Vector3(26, GROUND_Y + 2.7, 8);
    roof.rotation.y = Math.PI / 4;
    roof.material = roofMat;
    roof.checkCollisions = false;
}

createHut();

/**
 * Dock sticking off the east shore into the water.
 */
function createDock() {
    const dock = BABYLON.MeshBuilder.CreateBox(
        "dock",
        { width: 4.5, height: 0.18, depth: 1.6 },
        scene
    );
    dock.position = new BABYLON.Vector3(36.2, GROUND_Y - 0.05, 0);
    dock.material = woodMat;
    dock.checkCollisions = false;
    const postA = BABYLON.MeshBuilder.CreateBox("dockPostA", { width: 0.16, height: 1.1, depth: 0.16 }, scene);
    postA.position = new BABYLON.Vector3(38.1, GROUND_Y - 0.55, 0.6);
    postA.material = woodMat;
    const postB = BABYLON.MeshBuilder.CreateBox("dockPostB", { width: 0.16, height: 1.1, depth: 0.16 }, scene);
    postB.position = new BABYLON.Vector3(38.1, GROUND_Y - 0.55, -0.6);
    postB.material = woodMat;
}

createDock();

// ---- Plants (grass + flowers) ----------------------------------------------

/** Eatable plants. */
const plants = [];

/**
 * Marks a plant eaten and starts respawn timer.
 * @param {object} plant
 */
/**
 * Shows or hides a plant (GLB clone and/or fallback bits).
 * @param {object} plant
 * @param {boolean} on
 */
function setPlantVisible(plant, on) {
    if (plant.model) plant.model.setEnabled(on);
    if (plant.stem) plant.stem.setEnabled(on && !plant.model);
    if (plant.head) plant.head.setEnabled(on && !plant.model);
}

function consumePlant(plant) {
    plant.available = false;
    plant.respawn = PLANT_RESPAWN;
    setPlantVisible(plant, false);
}

/**
 * Grass tuft or flower the animals can eat.
 * @param {string} kind  "grass" | "flower"
 * @param {number} x
 * @param {number} z
 * @param {number} colorIndex
 */
function createPlant(kind, x, z, colorIndex) {
    const stemH = kind === "grass" ? 1.7 : 0.62;
    const stem = BABYLON.MeshBuilder.CreateCylinder(
        kind + "_s_" + x + "_" + z,
        { height: stemH, diameter: kind === "grass" ? 0.16 : 0.04, tessellation: 5 },
        scene
    );
    stem.position = new BABYLON.Vector3(x, GROUND_Y + stemH / 2, z);
    stem.material = kind === "grass" ? tuftMat : leafMat;

    const head = BABYLON.MeshBuilder.CreateSphere(
        kind + "_h_" + x + "_" + z,
        { diameter: kind === "grass" ? 0.56 : 0.22, segments: 5 },
        scene
    );
    head.position = new BABYLON.Vector3(x, GROUND_Y + stemH + 0.06, z);
    if (kind === "grass") {
        head.material = tuftMat;
    } else {
        const mat = new BABYLON.StandardMaterial("fm_" + x + "_" + z, scene);
        mat.diffuseColor = flowerColors[colorIndex % flowerColors.length];
        head.material = mat;
    }

    plants.push({
        kind: kind,
        x: x,
        z: z,
        available: true,
        respawn: 0,
        reserved: false,
        stem: stem,
        head: head
    });
}

/** Spread plants on the flat island, away from the hill centre. */
const plantLayout = [
    ["grass", 8, -6], ["grass", 10, -5], ["flower", 9, -7],
    ["grass", 14, 10], ["flower", 15, 12], ["flower", 13, 11],
    ["grass", -12, -14], ["grass", -10, -12], ["flower", -11, -13],
    ["grass", 6, -16], ["flower", 8, -15],
    ["grass", -14, 6], ["flower", -16, 8],
    ["flower", 4, 14], ["grass", 5, 16],
    ["grass", 12, 2], ["flower", -8, -8]
];
plantLayout.forEach((p, i) => createPlant(p[0], p[1], p[2], i));

/** Hidden template mesh from flower.glb. */
let flowerTemplate = null;

/**
 * Parents a GLB clone onto one plant slot.
 * @param {object} plant
 * @param {number} i
 */
function attachFlowerModel(plant, i) {
    if (!flowerTemplate) return;
    if (plant.kind !== "flower") return;
    const model = flowerTemplate.clone("plantGlb_" + i);
    model.setEnabled(true);
    model.position = new BABYLON.Vector3(plant.x, GROUND_Y, plant.z);
    const sc = 3.0;
    model.scaling = new BABYLON.Vector3(sc, sc, sc);
    model.rotation.y = (i * 0.7) % (Math.PI * 2);
    plant.model = model;
    if (plant.stem) plant.stem.setEnabled(false);
    if (plant.head) plant.head.setEnabled(false);
}

/**
 * Loads flower.glb from the same folder as index.html.
 * Falls back to the old box flowers if the file is missing.
 */
function loadFlowerGlb() {
    if (typeof BABYLON.SceneLoader === "undefined") return;
    BABYLON.SceneLoader.ImportMesh(
        "",
        "./",
        "Flower.glb",
        scene,
        (meshes) => {
            if (!meshes || !meshes.length) return;
            flowerTemplate = meshes[0];
            flowerTemplate.setEnabled(false);
            plants.forEach((p, i) => attachFlowerModel(p, i));
        },
        null,
        () => {
            /** File not found or file:// block — keep primitive plants. */
        }
    );
}

loadFlowerGlb();

/**
 * Tick plant respawn timers.
 * @param {number} dt
 */
function updatePlants(dt) {
    plants.forEach((p) => {
        if (p.available) return;
        if (p.reserved) return;
        p.respawn -= dt;
        if (p.respawn <= 0) {
            p.available = true;
            setPlantVisible(p, true);
        }
    });
}

/**
 * Nearest free plant or null.
 * @param {number} x
 * @param {number} z
 */
function findFreePlant(x, z) {
    let best = null;
    let bestD = 1e9;
    plants.forEach((p) => {
        if (!p.available || p.reserved) return;
        const dx = p.x - x;
        const dz = p.z - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
            bestD = d;
            best = p;
        }
    });
    return best;
}

/**
 * Nearest free tree rest spot.
 * @param {number} x
 * @param {number} z
 */
function findFreeTree(x, z) {
    let best = null;
    let bestD = 1e9;
    treeSpots.forEach((t) => {
        if (t.busy) return;
        const dx = t.x - x;
        const dz = t.z - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
            bestD = d;
            best = t;
        }
    });
    return best;
}

// ---- Faces helper ----------------------------------------------------------

/**
 * Adds two eyes and a mouth on the +Z face of a head mesh.
 * @param {BABYLON.Mesh} head
 * @param {number} scale
 */
function addFace(head, scale) {
    const eyeL = BABYLON.MeshBuilder.CreateBox(
        head.name + "_el",
        { width: 0.07 * scale, height: 0.07 * scale, depth: 0.04 * scale },
        scene
    );
    eyeL.parent = head;
    eyeL.position = new BABYLON.Vector3(-0.1 * scale, 0.06 * scale, 0.22 * scale);
    eyeL.material = faceMat;

    const eyeR = BABYLON.MeshBuilder.CreateBox(
        head.name + "_er",
        { width: 0.07 * scale, height: 0.07 * scale, depth: 0.04 * scale },
        scene
    );
    eyeR.parent = head;
    eyeR.position = new BABYLON.Vector3(0.1 * scale, 0.06 * scale, 0.22 * scale);
    eyeR.material = faceMat;

    const mouth = BABYLON.MeshBuilder.CreateBox(
        head.name + "_m",
        { width: 0.16 * scale, height: 0.04 * scale, depth: 0.04 * scale },
        scene
    );
    mouth.parent = head;
    mouth.position = new BABYLON.Vector3(0, -0.08 * scale, 0.22 * scale);
    mouth.material = faceMat;
    return { eyeL: eyeL, eyeR: eyeR, mouth: mouth };
}

// ---- Animals ---------------------------------------------------------------

/** Animal list. */
const animals = [];

/**
 * Blocky animal with a face and a simple behaviour brain.
 * @param {number} id
 * @param {number} x
 * @param {number} z
 */
function createAnimal(id, x, z) {
    const root = new BABYLON.TransformNode("animal_" + id, scene);
    root.position = new BABYLON.Vector3(x, GROUND_Y, z);

    const body = BABYLON.MeshBuilder.CreateBox(
        "animalBody_" + id,
        { width: 0.7, height: 0.4, depth: 1.1 },
        scene
    );
    body.parent = root;
    body.position.y = 0.55;
    body.material = animalMat;

    const head = BABYLON.MeshBuilder.CreateBox(
        "animalHead_" + id,
        { width: 0.36, height: 0.32, depth: 0.36 },
        scene
    );
    head.parent = root;
    head.position = new BABYLON.Vector3(0, 0.72, 0.65);
    head.material = animalMat;
    const face = addFace(head, 1);

    const legOff = [[0.22, 0.35], [-0.22, 0.35], [0.22, -0.35], [-0.22, -0.35]];
    legOff.forEach((o, i) => {
        const leg = BABYLON.MeshBuilder.CreateBox(
            "animalLeg_" + id + "_" + i,
            { width: 0.12, height: 0.4, depth: 0.12 },
            scene
        );
        leg.parent = root;
        leg.position = new BABYLON.Vector3(o[0], 0.2, o[1]);
        leg.material = animalMat;
    });

    animals.push({
        root: root,
        /** seekFood | eat | seekTree | rest */
        state: "seekFood",
        targetPlant: null,
        targetTree: null,
        timer: 0,
        speed: 1.6,
        face: face,
        chewT: 0,
        dummy: [body, head]
    });
}

createAnimal(1, 8, 8);
createAnimal(2, -12, 10);
createAnimal(3, 20, -10);
createAnimal(4, -22, -8);
createAnimal(5, 4, -12);

/**
 * Loads cow.gltf from the HTML folder and swaps the blocky animals.
 */
function loadCowGltf() {
    if (typeof BABYLON.SceneLoader === "undefined") return;
    BABYLON.SceneLoader.ImportMesh(
        "",
        "./",
        "Cow.gltf",
        scene,
        (meshes, _ps, _sk, animationGroups) => {
            if (!meshes || !meshes.length) return;
            const template = meshes[0];
            template.setEnabled(false);
            const srcGroups = animationGroups || [];
            srcGroups.forEach((g) => g.stop());
            animals.forEach((a, i) => {
                const cow = template.clone("cow_" + i);
                cow.setEnabled(true);
                cow.parent = a.root;
                cow.position = new BABYLON.Vector3(0, 0, 0);
                const cowScale = 0.30;
                cow.scaling = new BABYLON.Vector3(cowScale, cowScale, cowScale);
                a.cow = cow;
                a.anims = {};
                srcGroups.forEach((g) => {
                    const ng = g.clone("cow" + i + "_" + g.name, (target) => {
                        if (!target || !target.name) return cow;
                        const kids = cow.getChildMeshes(true);
                        const hit = kids.find((m) =>
                            m.name === target.name ||
                            m.name.indexOf(target.name) !== -1
                        );
                        return hit || cow;
                    });
                    if (ng) {
                        ng.stop();
                        a.anims[g.name] = ng;
                    }
                });
                a.root.getChildMeshes().forEach((m) => {
                    if (m.name.indexOf("animal") === 0) m.setEnabled(false);
                });
                if (a.dummy) a.dummy.forEach((m) => m.setEnabled(false));
            });
        },
        null,
        () => {
            /** Missing Cow.gltf — keep blocky animals. */
        }
    );
}

loadCowGltf();

// ---- Birds -----------------------------------------------------------------

/** Stork hovers here. */
const stork = { node: null, t: 0 };

/** Flamingo shuttles on X at animal walk speed. */
const flamingo = { node: null, x: -32, dir: 1, speed: 1.6 };

/**
 * Loads Stork.glb (hover) and Flamingo.glb (shuttle). Height 1.0.
 */
function loadBirds() {
    if (typeof BABYLON.SceneLoader === "undefined") return;
    BABYLON.SceneLoader.ImportMesh("", "./", "Stork.glb", scene, (meshes) => {
        if (!meshes.length) return;
        stork.node = meshes[0];
        stork.node.position = new BABYLON.Vector3(8, 1.0, 4);
        stork.node.scaling = new BABYLON.Vector3(1, 1, 1);
    });
    BABYLON.SceneLoader.ImportMesh("", "./", "Flamingo.glb", scene, (meshes) => {
        if (!meshes.length) return;
        flamingo.node = meshes[0];
        flamingo.node.position = new BABYLON.Vector3(flamingo.x, 1.0, -4);
        flamingo.node.scaling = new BABYLON.Vector3(1, 1, 1);
    });
}

loadBirds();

/**
 * Stork bobs in place. Flamingo flies west-east at 1.6 m/s.
 * @param {number} dt
 */
function updateBirds(dt) {
    if (stork.node) {
        stork.t += dt;
        stork.node.position.y = 1.0 + Math.sin(stork.t * 2) * 0.08;
    }
    if (flamingo.node) {
        flamingo.x += flamingo.dir * flamingo.speed * dt;
        if (flamingo.x > 32) {
            flamingo.x = 32;
            flamingo.dir = -1;
        }
        if (flamingo.x < -32) {
            flamingo.x = -32;
            flamingo.dir = 1;
        }
        flamingo.node.position.x = flamingo.x;
        flamingo.node.position.y = 1.0;
        flamingo.node.position.z = -4;
        flamingo.node.rotation.y = flamingo.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
}

/**
 * Walk root toward x,z. Returns true when close.
 * @param {object} a
 * @param {number} tx
 * @param {number} tz
 * @param {number} dt
 * @param {number} arrive
 */
function walkToward(a, tx, tz, dt, arrive) {
    const dx = tx - a.root.position.x;
    const dz = tz - a.root.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < arrive) return true;
    const yaw = Math.atan2(dx, dz);
    a.root.rotation.y = yaw;
    const step = a.speed * dt;
    a.root.position.x += Math.sin(yaw) * step;
    a.root.position.z += Math.cos(yaw) * step;
    a.root.position.y = GROUND_Y;
    return false;
}

/**
 * Neutral / chew / sleep face on an animal.
 * @param {object} a
 * @param {string} mode  "idle" | "eat" | "sleep"
 * @param {number} dt
 */
function updateAnimalFace(a, mode, dt) {
    if (!a.face) return;
    if (mode === "eat") {
        a.chewT += dt * 8;
        const open = 1.2 + Math.abs(Math.sin(a.chewT)) * 2.2;
        a.face.mouth.scaling.y = open;
        a.face.eyeL.scaling.y = 1;
        a.face.eyeR.scaling.y = 1;
        return;
    }
    if (mode === "sleep") {
        a.face.mouth.scaling.y = 0.7;
        a.face.eyeL.scaling.y = 0.18;
        a.face.eyeR.scaling.y = 0.18;
        return;
    }
    a.face.mouth.scaling.y = 1;
    a.face.eyeL.scaling.y = 1;
    a.face.eyeR.scaling.y = 1;
}

/**
 * Plays one named cow clip. Stops the others.
 * @param {object} a
 * @param {string} clip  Idle | Eat | Walk | Gallop
 */
function playCowClip(a, clip) {
    if (!a.anims) return;
    if (a.clip === clip) return;
    a.clip = clip;
    Object.keys(a.anims).forEach((k) => {
        try { a.anims[k].stop(); } catch (e) { /* ignore */ }
    });
    const keys = Object.keys(a.anims);
    const found = keys.find((k) => k.toLowerCase() === clip.toLowerCase()) ||
        keys.find((k) => k.toLowerCase().indexOf(clip.toLowerCase()) !== -1);
    if (found) a.anims[found].start(true);
}

/**
 * Animal brain: eat 15s, rest under tree 45s, repeat.
 * @param {number} dt
 */
function updateAnimals(dt) {
    animals.forEach((a) => {
        if (a.state === "seekFood") {
            updateAnimalFace(a, "idle", dt);
            playCowClip(a, "Walk");
            if (!a.targetPlant || !a.targetPlant.available) {
                if (a.targetPlant) a.targetPlant.reserved = false;
                a.targetPlant = findFreePlant(a.root.position.x, a.root.position.z);
                if (a.targetPlant) a.targetPlant.reserved = true;
            }
            if (!a.targetPlant) return;
            const arrived = walkToward(a, a.targetPlant.x, a.targetPlant.z, dt, 0.7);
            if (arrived) {
                consumePlant(a.targetPlant);
                a.targetPlant.reserved = false;
                a.targetPlant = null;
                a.state = "eat";
                a.timer = EAT_TIME;
            }
            return;
        }

        if (a.state === "eat") {
            updateAnimalFace(a, "eat", dt);
            playCowClip(a, "Eat");
            a.timer -= dt;
            if (a.timer <= 0) {
                a.state = "seekTree";
            }
            return;
        }

        if (a.state === "seekTree") {
            if (!a.targetTree) {
                a.targetTree = findFreeTree(a.root.position.x, a.root.position.z);
                if (a.targetTree) a.targetTree.busy = true;
            }
            if (!a.targetTree) {
                a.state = "seekFood";
                return;
            }
            updateAnimalFace(a, "idle", dt);
            playCowClip(a, "Walk");
            const arrived = walkToward(a, a.targetTree.x, a.targetTree.z, dt, 1.2);
            if (arrived) {
                a.state = "rest";
                a.timer = REST_TIME;
            }
            return;
        }

        if (a.state === "rest") {
            updateAnimalFace(a, "sleep", dt);
            playCowClip(a, "Idle");
            a.timer -= dt;
            if (a.timer <= 0) {
                if (a.targetTree) a.targetTree.busy = false;
                a.targetTree = null;
                a.state = "seekFood";
            }
        }
    });
}

// ---- Player ----------------------------------------------------------------

/**
 * Blocky player with a face.
 */
function createPlayer() {
    const root = BABYLON.MeshBuilder.CreateBox(
        "playerRoot",
        { width: 0.7, height: PLAYER_HEIGHT, depth: 0.5 },
        scene
    );
    root.position = new BABYLON.Vector3(0, GROUND_Y + PLAYER_HEIGHT / 2, 0);
    root.isVisible = false;
    root.checkCollisions = true;
    root.ellipsoid = new BABYLON.Vector3(PLAYER_RADIUS, PLAYER_HEIGHT / 2, PLAYER_RADIUS);
    root.ellipsoidOffset = BABYLON.Vector3.Zero();

    const skinMat = new BABYLON.StandardMaterial("skinMat", scene);
    skinMat.diffuseColor = new BABYLON.Color3(0.92, 0.74, 0.58);
    const shirtMat = new BABYLON.StandardMaterial("shirtMat", scene);
    shirtMat.diffuseColor = new BABYLON.Color3(0.22, 0.48, 0.82);
    const pantMat = new BABYLON.StandardMaterial("pantMat", scene);
    pantMat.diffuseColor = new BABYLON.Color3(0.22, 0.26, 0.34);

    const torso = BABYLON.MeshBuilder.CreateBox("torso", { width: 0.7, height: 0.7, depth: 0.4 }, scene);
    torso.parent = root;
    torso.position.y = 0.05;
    torso.material = shirtMat;

    const head = BABYLON.MeshBuilder.CreateBox("head", { width: 0.42, height: 0.42, depth: 0.42 }, scene);
    head.parent = root;
    head.position.y = 0.58;
    head.material = skinMat;
    addFace(head, 1.05);

    const leftArm = BABYLON.MeshBuilder.CreateBox("leftArm", { width: 0.18, height: 0.65, depth: 0.18 }, scene);
    leftArm.parent = root;
    leftArm.position = new BABYLON.Vector3(-0.46, 0.05, 0);
    leftArm.material = skinMat;

    const rightArm = BABYLON.MeshBuilder.CreateBox("rightArm", { width: 0.18, height: 0.65, depth: 0.18 }, scene);
    rightArm.parent = root;
    rightArm.position = new BABYLON.Vector3(0.46, 0.05, 0);
    rightArm.material = skinMat;
    /** Pivot near the shoulder so a wave rotates the whole arm. */
    rightArm.setPivotPoint(new BABYLON.Vector3(0, 0.28, 0));
    root.rightArm = rightArm;

    const leftLeg = BABYLON.MeshBuilder.CreateBox("leftLeg", { width: 0.22, height: 0.7, depth: 0.22 }, scene);
    leftLeg.parent = root;
    leftLeg.position = new BABYLON.Vector3(-0.18, -0.55, 0);
    leftLeg.material = pantMat;
    root.leftLeg = leftLeg;

    const rightLeg = BABYLON.MeshBuilder.CreateBox("rightLeg", { width: 0.22, height: 0.7, depth: 0.22 }, scene);
    rightLeg.parent = root;
    rightLeg.position = new BABYLON.Vector3(0.18, -0.55, 0);
    rightLeg.material = pantMat;
    root.rightLeg = rightLeg;

    return root;
}

/** Player root. */
const player = createPlayer();

/** Vertical velocity. */
let velY = 0;

/** On floor. */
let grounded = true;

// ---- Camera (no pointer lock) ----------------------------------------------

/**
 * Follow camera. LMB pan, RMB look, no pointer lock.
 */
function createCamera() {
    const camera = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(0, 10, -14), scene);
    camera.minZ = 0.1;
    camera.inertia = 0;
    camera.inputs.clear();
    camera.attachControl(canvas, false);
    return camera;
}

/** Camera. */
const camera = createCamera();

/** Yaw. */
let camYaw = 0;

/** Pitch. */
let camPitch = 0.38;

/** Follow distance (wheel zoom changes this). */
let CAM_DISTANCE = 10;

/** Extra slide so the player can leave the centre of the view. */
const panOffset = new BABYLON.Vector3(0, 0, 0);

/** Left mouse held = pan. */
let lmb = false;

/** Right mouse held = look. */
let rmb = false;

canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());

canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    CAM_DISTANCE += ev.deltaY * 0.01;
    if (CAM_DISTANCE < 4) CAM_DISTANCE = 4;
    if (CAM_DISTANCE > 24) CAM_DISTANCE = 24;
}, { passive: false });

canvas.addEventListener("pointerdown", (ev) => {
    if (ev.button === 0) lmb = true;
    if (ev.button === 2) rmb = true;
    canvas.setPointerCapture(ev.pointerId);
});

canvas.addEventListener("pointerup", (ev) => {
    if (ev.button === 0) lmb = false;
    if (ev.button === 2) rmb = false;
});

canvas.addEventListener("pointercancel", () => {
    lmb = false;
    rmb = false;
});

/**
 * Pointer drag: LMB looks, RMB pans.
 * @param {PointerEvent} ev
 */
function onDrag(ev) {
    if (paused) return;
    if (!lmb && !rmb) return;
    const dx = ev.movementX || 0;
    const dy = ev.movementY || 0;
    if (lmb) {
        camYaw += dx * LOOK_SENSITIVITY;
        camPitch += dy * LOOK_SENSITIVITY;
        const limit = Math.PI / 2 - 0.12;
        if (camPitch > limit) camPitch = limit;
        if (camPitch < 0.08) camPitch = 0.08;
        return;
    }
    if (rmb) {
        const right = new BABYLON.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
        const fwd = new BABYLON.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
        panOffset.addInPlace(right.scale(-dx * PAN_SENSITIVITY));
        panOffset.addInPlace(fwd.scale(dy * PAN_SENSITIVITY));
        const capX = MAP_SIZE_X * 0.45;
        const capZ = MAP_SIZE_Z * 0.45;
        panOffset.x = Math.max(-capX, Math.min(capX, panOffset.x));
        panOffset.z = Math.max(-capZ, Math.min(capZ, panOffset.z));
    }
}

canvas.addEventListener("pointermove", onDrag);

/**
 * Follow player, then add pan offset.
 */
function updateCamera() {
    const offsetX = Math.sin(camYaw) * Math.cos(camPitch) * CAM_DISTANCE;
    const offsetZ = Math.cos(camYaw) * Math.cos(camPitch) * CAM_DISTANCE;
    const offsetY = Math.sin(camPitch) * CAM_DISTANCE + 1.4;
    const tx = player.position.x + panOffset.x;
    const tz = player.position.z + panOffset.z;
    camera.position.x = tx + offsetX;
    camera.position.y = player.position.y + offsetY;
    camera.position.z = tz + offsetZ;
    camera.setTarget(new BABYLON.Vector3(tx, player.position.y + 0.5, tz));
}

// ---- Input / pause / settings ----------------------------------------------

/** Keys. */
const keys = { w: false, a: false, s: false, d: false, g: false, c: false };

/** Player is sitting. */
let sitting = false;

/** Jump edge. */
let jumpQueued = false;

/**
 * Toggle pause overlay and button label.
 */
function setPaused(next) {
    paused = next;
    const ov = document.getElementById("pauseOverlay");
    const btn = document.getElementById("btnPause");
    if (ov) ov.hidden = !paused;
    if (btn) btn.textContent = paused ? "Resume" : "Pause";
}

/**
 * Keyboard.
 * @param {KeyboardEvent} ev
 * @param {boolean} isDown
 */
function setKey(ev, isDown) {
    const k = ev.key.toLowerCase();
    if (k === "w" || k === "arrowup") keys.w = isDown;
    if (k === "s" || k === "arrowdown") keys.s = isDown;
    if (k === "a" || k === "arrowleft") keys.a = isDown;
    if (k === "d" || k === "arrowright") keys.d = isDown;
    if (k === "g") keys.g = isDown;
    if (k === "c" && isDown) sitting = !sitting;
    if ((k === " " || k === "spacebar") && isDown) {
        jumpQueued = true;
        ev.preventDefault();
    }
    if (isDown && (k === "p" || k === "escape")) {
        setPaused(!paused);
    }
}

window.addEventListener("keydown", (ev) => setKey(ev, true));
window.addEventListener("keyup", (ev) => setKey(ev, false));

document.getElementById("btnPause").addEventListener("click", () => setPaused(!paused));

/**
 * Hardware scale from the Res dropdown (helps a Celeron).
 */
function applyResolution() {
    const val = document.getElementById("selRes").value;
    const w = canvas.clientWidth || window.innerWidth;
    let target = w;
    if (val !== "native") target = Number(val);
    const scale = Math.max(1, w / target);
    engine.setHardwareScalingLevel(scale);
    engine.resize();
}

document.getElementById("selRes").addEventListener("change", applyResolution);

/**
 * Low hides clouds. Normal shows them.
 */
function applyQuality() {
    quality = document.getElementById("selQual").value;
    const show = quality !== "low";
    cloudMeshes.forEach((c) => {
        c.setEnabled(show);
    });
}

document.getElementById("selQual").addEventListener("change", applyQuality);
applyQuality();
applyResolution();

document.getElementById("btnResetView").addEventListener("click", () => {
    panOffset.set(0, 0, 0);
    camYaw = 0;
    camPitch = 0.38;
    CAM_DISTANCE = 10;
});

/** Night tint flag. */
let isNight = false;

document.getElementById("btnDayNight").addEventListener("click", () => {
    isNight = !isNight;
    if (isNight) {
        hemiLight.intensity = 0.28;
        sun.intensity = 0.12;
        scene.clearColor = new BABYLON.Color4(0.05, 0.07, 0.14, 1);
    } else {
        hemiLight.intensity = 0.7;
        sun.intensity = 0.65;
        scene.clearColor = new BABYLON.Color4(0.45, 0.68, 0.92, 1);
    }
});

// ---- Movement --------------------------------------------------------------

/**
 * Slight canopy sway. Cheap, no extra meshes.
 */
function updateTreeSway() {
    const t = performance.now() * 0.001;
    treeCanopies.forEach((leaf, i) => {
        leaf.rotation.z = Math.sin(t * 0.8 + i) * 0.06;
        leaf.rotation.x = Math.cos(t * 0.6 + i * 0.4) * 0.04;
    });
}

/** Wave animation clock. */
let waveT = 0;

/**
 * Hold G to wave the right arm.
 * @param {number} dt
 */
function updateWave(dt) {
    const arm = player.rightArm;
    if (!arm) return;
    if (keys.g && !paused) {
        waveT += dt * 8;
        /** Swing the arm up/down in front of the body. */
        arm.rotation.x = -1.1 + Math.sin(waveT) * 0.7;
        arm.rotation.z = 0.15;
        return;
    }
    waveT = 0;
    arm.rotation.x *= 0.75;
    arm.rotation.z *= 0.75;
}

/**
 * Face walk direction.
 * @param {BABYLON.Vector3} dir
 */
function facePlayer(dir) {
    if (dir.lengthSquared() < 0.0001) return;
    player.rotation.y = Math.atan2(dir.x, dir.z);
}

/**
 * Walk, jump, stay on the island.
 * @param {number} dt
 */
function movePlayer(dt) {
    if (player.leftLeg && player.rightLeg) {
        if (sitting) {
            player.leftLeg.rotation.x = -1.2;
            player.rightLeg.rotation.x = -1.2;
        } else {
            player.leftLeg.rotation.x *= 0.7;
            player.rightLeg.rotation.x *= 0.7;
        }
    }
    if (sitting) {
        jumpQueued = false;
        return;
    }
    const forward = new BABYLON.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new BABYLON.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const wish = BABYLON.Vector3.Zero();
    if (keys.w) wish.addInPlace(forward);
    if (keys.s) wish.addInPlace(forward.scale(-1));
    if (keys.a) wish.addInPlace(right);
    if (keys.d) wish.addInPlace(right.scale(-1));
    if (wish.lengthSquared() > 0) {
        wish.normalize();
        facePlayer(wish);
    }

    const step = wish.scale(WALK_SPEED * dt);
    if (jumpQueued && grounded) {
        velY = JUMP_SPEED;
        grounded = false;
    }
    jumpQueued = false;
    velY -= GRAVITY * dt;
    step.y = velY * dt;
    player.moveWithCollisions(step);

    const origin = player.position.clone();
    const ray = new BABYLON.Ray(origin, new BABYLON.Vector3(0, -1, 0), PLAYER_HEIGHT / 2 + 0.12);
    const hit = scene.pickWithRay(ray, (m) => islands.indexOf(m) !== -1 || hills.indexOf(m) !== -1);
    if (hit && hit.hit && hit.distance <= PLAYER_HEIGHT / 2 + 0.08) {
        grounded = true;
        if (velY < 0) velY = 0;
    } else if (player.position.y <= GROUND_Y + PLAYER_HEIGHT / 2 + 0.02 && velY <= 0) {
        const onPad =
            Math.abs(player.position.x) < MAP_SIZE_X / 2 - 0.2 &&
            Math.abs(player.position.z) < MAP_SIZE_Z / 2 - 0.2;
        if (onPad) {
            player.position.y = GROUND_Y + PLAYER_HEIGHT / 2;
            velY = 0;
            grounded = true;
        } else {
            grounded = false;
        }
    } else {
        grounded = false;
    }

    const halfX = MAP_SIZE_X / 2 - PLAYER_RADIUS;
    const halfZ = MAP_SIZE_Z / 2 - PLAYER_RADIUS;
    player.position.x = Math.max(-halfX, Math.min(halfX, player.position.x));
    player.position.z = Math.max(-halfZ, Math.min(halfZ, player.position.z));
}

// ---- Loop ------------------------------------------------------------------

/** Last timestamp. */
let lastTime = performance.now();

scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    let dt = (now - lastTime) / 1000;
    if (dt > 0.05) dt = 0.05;
    lastTime = now;
    if (paused) return;
    movePlayer(dt);
    updateAnimals(dt);
    updatePlants(dt);
    updateDolphin(dt);
    updateBirds(dt);
    updateWave(dt);
    updateTreeSway();
    updateCamera();
});

/** FPS label in the top bar. */
const fpsLabel = document.getElementById("fps");

/** User cap — render will not exceed this. */
let fpsCap = 30;

/** Last actual draw time. */
let lastDraw = 0;

/** Draws in the current 1-second window. */
let drawsThisSec = 0;

/** Start of the 1-second FPS window. */
let fpsWindowStart = performance.now();

document.getElementById("selFps").addEventListener("change", () => {
    fpsCap = Number(document.getElementById("selFps").value) || 30;
});

engine.stopRenderLoop();

/**
 * Manual loop so FPS never goes above the cap.
 * Label counts our draws, not the browser 60 Hz clock.
 */
function cappedLoop() {
    requestAnimationFrame(cappedLoop);
    const now = performance.now();
    const minDt = 1000 / fpsCap;
    if (now - lastDraw < minDt) return;
    lastDraw += minDt;
    if (now - lastDraw > minDt * 2) lastDraw = now;
    scene.render();
    drawsThisSec += 1;
    if (now - fpsWindowStart >= 1000) {
        if (fpsLabel) fpsLabel.textContent = "FPS " + drawsThisSec;
        drawsThisSec = 0;
        fpsWindowStart = now;
    }
}

cappedLoop();

window.addEventListener("resize", () => {
    applyResolution();
});
