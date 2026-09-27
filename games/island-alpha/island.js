/*
    Island Game — Alpha v1.1
    Edit MODEL SCALES in the block marked EDIT HERE.
    Date: 2026-09-26
*/

const MAP_SIZE_X = 70;
const MAP_SIZE_Z = 35;
const WATER_SIZE_X = 110;
const WATER_SIZE_Z = 70;
const ISLAND_HEIGHT = 1.5;
const GROUND_Y = ISLAND_HEIGHT;
const WALK_SPEED = 5;
const JUMP_SPEED = 7.2;
const GRAVITY = 8;
const LOOK_SENSITIVITY = 0.01;
const PAN_SENSITIVITY = 0.12;
const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.8;
const EAT_TIME = 15;
const REST_TIME = 15;
const PLANT_RESPAWN = 25;

// ---- Model scale / height (EDIT HERE) --------------------------------------
const COW_SCALE = 0.25;
const FLOWER_SCALE = 5.0;
const GRASS_STEM_H = 1;
const GRASS_HEAD_D = 0.56;
const STORK_SCALE = 0.02;
const FLAMINGO_SCALE = 0.02;
const STORK_Y = 2.5;
const FLAMINGO_Y = 4.0;
const COW_FILE = "Cow.gltf";
const FLOWER_FILE = "Flower.glb";
const STORK_FILE = "Stork.glb";
const FLAMINGO_FILE = "Flamingo.glb";

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new BABYLON.Scene(engine);
scene.collisionsEnabled = true;
scene.clearColor = new BABYLON.Color4(0.45, 0.68, 0.92, 1);
let paused = false;
let quality = "low";

const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), scene);
hemiLight.intensity = 0.7;
hemiLight.groundColor = new BABYLON.Color3(0.22, 0.3, 0.18);
const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.35, -1, -0.2), scene);
sun.position = new BABYLON.Vector3(20, 40, 12);
sun.intensity = 0.65;

if (typeof BABYLON.SkyMaterial !== "undefined") {
    const skyMat = new BABYLON.SkyMaterial("skyMat", scene);
    skyMat.backFaceCulling = false;
    skyMat.inclination = 0.15;
    skyMat.azimuth = 0.25;
    skyMat.luminance = 0.9;
    const skybox = BABYLON.MeshBuilder.CreateBox("skybox", { size: 600 }, scene);
    skybox.material = skyMat;
    skybox.infiniteDistance = true;
}

const cloudMeshes = [];
(function createClouds() {
    const cloudMat = new BABYLON.StandardMaterial("cloudMat", scene);
    cloudMat.diffuseColor = new BABYLON.Color3(0.95, 0.96, 0.98);
    cloudMat.specularColor = new BABYLON.Color3(0, 0, 0);
    cloudMat.emissiveColor = new BABYLON.Color3(0.35, 0.38, 0.42);
    [[20, 28, -18], [-24, 30, 16], [32, 26, 22], [-10, 32, 34], [8, 27, -36]].forEach((p, i) => {
        const puff = BABYLON.MeshBuilder.CreateSphere("cloud" + i, { diameterX: 18, diameterY: 5, diameterZ: 10, segments: 6 }, scene);
        puff.position = new BABYLON.Vector3(p[0], p[1], p[2]);
        puff.material = cloudMat;
        puff.isPickable = false;
        cloudMeshes.push(puff);
    });
})();

const grassMat = new BABYLON.StandardMaterial("grassMat", scene);
grassMat.diffuseColor = new BABYLON.Color3(0.30, 0.55, 0.24);
grassMat.specularColor = new BABYLON.Color3(0.04, 0.04, 0.04);
const grassMatB = new BABYLON.StandardMaterial("grassMatB", scene);
grassMatB.diffuseColor = new BABYLON.Color3(0.48, 0.52, 0.20);
const dirtMat = new BABYLON.StandardMaterial("dirtMat", scene);
dirtMat.diffuseColor = new BABYLON.Color3(0.42, 0.32, 0.18);
const waterMat = new BABYLON.StandardMaterial("waterMat", scene);
waterMat.diffuseColor = new BABYLON.Color3(0.12, 0.38, 0.55);
waterMat.alpha = 0.92;
const barkMat = new BABYLON.StandardMaterial("barkMat", scene);
barkMat.diffuseColor = new BABYLON.Color3(0.38, 0.24, 0.12);
const leafMat = new BABYLON.StandardMaterial("leafMat", scene);
leafMat.diffuseColor = new BABYLON.Color3(0.18, 0.45, 0.16);
const tuftMat = new BABYLON.StandardMaterial("tuftMat", scene);
tuftMat.diffuseColor = new BABYLON.Color3(0.22, 0.62, 0.20);
const faceMat = new BABYLON.StandardMaterial("faceMat", scene);
faceMat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.1);
const animalMat = new BABYLON.StandardMaterial("animalMat", scene);
animalMat.diffuseColor = new BABYLON.Color3(0.72, 0.58, 0.38);
const woodMat = new BABYLON.StandardMaterial("woodMat", scene);
woodMat.diffuseColor = new BABYLON.Color3(0.55, 0.38, 0.22);
const roofMat = new BABYLON.StandardMaterial("roofMat", scene);
roofMat.diffuseColor = new BABYLON.Color3(0.62, 0.22, 0.16);
const dolphinMat = new BABYLON.StandardMaterial("dolphinMat", scene);
dolphinMat.diffuseColor = new BABYLON.Color3(0.45, 0.52, 0.62);
const flowerColors = [
    new BABYLON.Color3(0.92, 0.28, 0.42),
    new BABYLON.Color3(0.95, 0.82, 0.22),
    new BABYLON.Color3(0.72, 0.38, 0.88),
    new BABYLON.Color3(0.98, 0.55, 0.18)
];

const water = BABYLON.MeshBuilder.CreateGround("water", { width: WATER_SIZE_X, height: WATER_SIZE_Z }, scene);
water.position.y = 0;
water.material = waterMat;

function createIslandHalf(name, xCentre, mat) {
    const slab = BABYLON.MeshBuilder.CreateBox(name, { width: 35, height: ISLAND_HEIGHT, depth: MAP_SIZE_Z }, scene);
    slab.position.x = xCentre;
    slab.position.y = ISLAND_HEIGHT / 2;
    slab.material = mat;
    slab.checkCollisions = true;
    return slab;
}
const islands = [
    createIslandHalf("islandA", -17.5, grassMat),
    createIslandHalf("islandB", 17.5, grassMatB)
];

function createHill(name, x, z, sx, sy, sz) {
    const h = BABYLON.MeshBuilder.CreateSphere(name, { diameterX: sx, diameterY: sy, diameterZ: sz, segments: 8 }, scene);
    h.position = new BABYLON.Vector3(x, GROUND_Y - 1.2, z);
    h.material = dirtMat;
    h.checkCollisions = true;
    return h;
}
const hills = [
    createHill("hillA", -18, 8, 16, 8, 12),
    createHill("hillB", 22, -6, 14, 7, 11)
];

function createDolphin() {
    const root = new BABYLON.TransformNode("dolphin", scene);
    const body = BABYLON.MeshBuilder.CreateSphere("dolphinBody", { diameterX: 1.6, diameterY: 0.55, diameterZ: 0.5, segments: 6 }, scene);
    body.parent = root;
    body.material = dolphinMat;
    const nose = BABYLON.MeshBuilder.CreateSphere("dolphinNose", { diameterX: 0.7, diameterY: 0.22, diameterZ: 0.22, segments: 5 }, scene);
    nose.parent = root;
    nose.position.x = 0.9;
    nose.material = dolphinMat;
    const fin = BABYLON.MeshBuilder.CreateBox("dolphinFin", { width: 0.15, height: 0.45, depth: 0.08 }, scene);
    fin.parent = root;
    fin.position.y = 0.35;
    fin.material = dolphinMat;
    return root;
}
const dolphin = createDolphin();
const dolphinB = createDolphin();
let dolphinAngle = 0;
function updateDolphin(dt) {
    dolphinAngle += dt * 0.076;
    function place(node, ang) {
        node.position.x = Math.cos(ang) * 42;
        node.position.z = Math.sin(ang) * 24;
        node.position.y = 0.35;
        node.rotation.y = ang + Math.PI / 2;
    }
    place(dolphin, dolphinAngle);
    place(dolphinB, dolphinAngle + Math.PI);
}

const treeSpots = [];
const treeCanopies = [];
function createTree(name, x, z, scale) {
    const trunkH = 3.4 * scale;
    const trunk = BABYLON.MeshBuilder.CreateCylinder(name + "_trunk", { height: trunkH, diameter: 0.55 * scale, tessellation: 8 }, scene);
    trunk.position = new BABYLON.Vector3(x, GROUND_Y + trunkH / 2, z);
    trunk.material = barkMat;
    trunk.checkCollisions = true;
    function addBranch(id, yaw, heightOnTrunk) {
        const len = 1.3 * scale;
        const br = BABYLON.MeshBuilder.CreateCylinder(name + "_br_" + id, { height: len, diameter: 0.16 * scale, tessellation: 6 }, scene);
        br.material = barkMat;
        const midY = GROUND_Y + heightOnTrunk;
        br.position = new BABYLON.Vector3(x + Math.sin(yaw) * (len / 2), midY, z + Math.cos(yaw) * (len / 2));
        br.rotation.z = Math.PI / 2.4;
        br.rotation.y = yaw;
        const ball = BABYLON.MeshBuilder.CreateSphere(name + "_brleaf_" + id, { diameter: 1.6 * scale, segments: 6 }, scene);
        ball.position = new BABYLON.Vector3(x + Math.sin(yaw) * len, midY + 0.35 * scale, z + Math.cos(yaw) * len);
        ball.material = leafMat;
    }
    addBranch("a", 0.4, 2.1 * scale);
    addBranch("b", 3.4, 2.4 * scale);
    const leaves = BABYLON.MeshBuilder.CreateSphere(name + "_leaves", { diameter: 3.2 * scale, segments: 7 }, scene);
    leaves.position = new BABYLON.Vector3(x, GROUND_Y + trunkH + 0.2 * scale, z);
    leaves.material = leafMat;
    treeSpots.push({ x: x, z: z, busy: false });
    treeCanopies.push(leaves);
}
createTree("t1", 24, -10, 1.0);
createTree("t2", 18, 8, 0.9);
createTree("t3", -22, -8, 1.05);
createTree("t4", 6, 10, 0.95);
createTree("t5", -14, 12, 0.85);
function updateTreeSway() {
    const t = performance.now() * 0.001;
    treeCanopies.forEach((leaf, i) => {
        leaf.rotation.z = Math.sin(t * 0.8 + i) * 0.06;
        leaf.rotation.x = Math.cos(t * 0.6 + i * 0.4) * 0.04;
    });
}

(function createHut() {
    const hut = BABYLON.MeshBuilder.CreateBox("hut", { width: 3.2, height: 2.2, depth: 2.8 }, scene);
    hut.position = new BABYLON.Vector3(26, GROUND_Y + 1.1, 8);
    hut.material = woodMat;
    hut.checkCollisions = true;
    const roof = BABYLON.MeshBuilder.CreateCylinder("hutRoof", { diameter: 4.2, height: 1.4, tessellation: 4 }, scene);
    roof.position = new BABYLON.Vector3(26, GROUND_Y + 2.7, 8);
    roof.rotation.y = Math.PI / 4;
    roof.material = roofMat;
})();
(function createDock() {
    const dock = BABYLON.MeshBuilder.CreateBox("dock", { width: 4.5, height: 0.18, depth: 1.6 }, scene);
    dock.position = new BABYLON.Vector3(36.2, GROUND_Y - 0.05, 0);
    dock.material = woodMat;
    const postA = BABYLON.MeshBuilder.CreateBox("dockPostA", { width: 0.16, height: 1.1, depth: 0.16 }, scene);
    postA.position = new BABYLON.Vector3(38.1, GROUND_Y - 0.55, 0.6);
    postA.material = woodMat;
    const postB = BABYLON.MeshBuilder.CreateBox("dockPostB", { width: 0.16, height: 1.1, depth: 0.16 }, scene);
    postB.position = new BABYLON.Vector3(38.1, GROUND_Y - 0.55, -0.6);
    postB.material = woodMat;
})();

const plants = [];
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
function createPlant(kind, x, z, colorIndex) {
    const stemH = kind === "grass" ? GRASS_STEM_H : 0.62;
    const stem = BABYLON.MeshBuilder.CreateCylinder(kind + "_s_" + x + "_" + z, { height: stemH, diameter: kind === "grass" ? 0.16 : 0.04, tessellation: 5 }, scene);
    stem.position = new BABYLON.Vector3(x, GROUND_Y + stemH / 2, z);
    stem.material = kind === "grass" ? tuftMat : leafMat;
    const head = BABYLON.MeshBuilder.CreateSphere(kind + "_h_" + x + "_" + z, { diameter: kind === "grass" ? GRASS_HEAD_D : 0.22, segments: 5 }, scene);
    head.position = new BABYLON.Vector3(x, GROUND_Y + stemH + 0.06, z);
    if (kind === "grass") head.material = tuftMat;
    else {
        const mat = new BABYLON.StandardMaterial("fm_" + x + "_" + z, scene);
        mat.diffuseColor = flowerColors[colorIndex % flowerColors.length];
        head.material = mat;
    }
    plants.push({ kind: kind, x: x, z: z, available: true, respawn: 0, reserved: false, stem: stem, head: head, model: null });
}
[
    ["grass", 8, -6], ["grass", 10, -5], ["flower", 9, -7],
    ["grass", 14, 10], ["flower", 15, 12], ["flower", 13, 11],
    ["grass", -12, -14], ["grass", -10, -12], ["flower", -11, -13],
    ["grass", 6, -16], ["flower", 8, -15],
    ["grass", -14, 6], ["flower", -16, 8],
    ["flower", 4, 14], ["grass", 5, 16],
    ["grass", 12, 2], ["flower", -8, -8]
].forEach((p, i) => createPlant(p[0], p[1], p[2], i));

let flowerTemplate = null;
function attachFlowerModel(plant, i) {
    if (!flowerTemplate || plant.kind !== "flower") return;
    const model = flowerTemplate.clone("plantGlb_" + i);
    model.setEnabled(true);
    model.position = new BABYLON.Vector3(plant.x, GROUND_Y, plant.z);
    model.scaling = new BABYLON.Vector3(FLOWER_SCALE, FLOWER_SCALE, FLOWER_SCALE);
    model.rotation.y = (i * 0.7) % (Math.PI * 2);
    plant.model = model;
    plant.stem.setEnabled(false);
    plant.head.setEnabled(false);
}
function loadFlowerGlb() {
    if (typeof BABYLON.SceneLoader === "undefined") return;
    BABYLON.SceneLoader.ImportMesh("", "./", FLOWER_FILE, scene, (meshes) => {
        if (!meshes.length) return;
        flowerTemplate = meshes[0];
        flowerTemplate.setEnabled(false);
        plants.forEach((p, i) => attachFlowerModel(p, i));
    });
}
loadFlowerGlb();

function updatePlants(dt) {
    plants.forEach((p) => {
        if (p.available || p.reserved) return;
        p.respawn -= dt;
        if (p.respawn <= 0) {
            p.available = true;
            setPlantVisible(p, true);
        }
    });
}
function findFreePlant(x, z) {
    let best = null, bestD = 1e9;
    plants.forEach((p) => {
        if (!p.available || p.reserved) return;
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < bestD) { bestD = d; best = p; }
    });
    return best;
}
function findFreeTree(x, z) {
    let best = null, bestD = 1e9;
    treeSpots.forEach((t) => {
        if (t.busy) return;
        const d = (t.x - x) * (t.x - x) + (t.z - z) * (t.z - z);
        if (d < bestD) { bestD = d; best = t; }
    });
    return best;
}

function addFace(head, scale) {
    const eyeL = BABYLON.MeshBuilder.CreateBox(head.name + "_el", { width: 0.07 * scale, height: 0.07 * scale, depth: 0.04 * scale }, scene);
    eyeL.parent = head;
    eyeL.position = new BABYLON.Vector3(-0.1 * scale, 0.06 * scale, 0.22 * scale);
    eyeL.material = faceMat;
    const eyeR = BABYLON.MeshBuilder.CreateBox(head.name + "_er", { width: 0.07 * scale, height: 0.07 * scale, depth: 0.04 * scale }, scene);
    eyeR.parent = head;
    eyeR.position = new BABYLON.Vector3(0.1 * scale, 0.06 * scale, 0.22 * scale);
    eyeR.material = faceMat;
    const mouth = BABYLON.MeshBuilder.CreateBox(head.name + "_m", { width: 0.16 * scale, height: 0.04 * scale, depth: 0.04 * scale }, scene);
    mouth.parent = head;
    mouth.position = new BABYLON.Vector3(0, -0.08 * scale, 0.22 * scale);
    mouth.material = faceMat;
    return { eyeL: eyeL, eyeR: eyeR, mouth: mouth };
}

const animals = [];
function createAnimal(id, x, z) {
    const root = new BABYLON.TransformNode("animal_" + id, scene);
    root.position = new BABYLON.Vector3(x, GROUND_Y, z);
    const body = BABYLON.MeshBuilder.CreateBox("animalBody_" + id, { width: 0.7, height: 0.4, depth: 1.1 }, scene);
    body.parent = root;
    body.position.y = 0.55;
    body.material = animalMat;
    const head = BABYLON.MeshBuilder.CreateBox("animalHead_" + id, { width: 0.36, height: 0.32, depth: 0.36 }, scene);
    head.parent = root;
    head.position = new BABYLON.Vector3(0, 0.72, 0.65);
    head.material = animalMat;
    const face = addFace(head, 1);
    [[0.22, 0.35], [-0.22, 0.35], [0.22, -0.35], [-0.22, -0.35]].forEach((o, i) => {
        const leg = BABYLON.MeshBuilder.CreateBox("animalLeg_" + id + "_" + i, { width: 0.12, height: 0.4, depth: 0.12 }, scene);
        leg.parent = root;
        leg.position = new BABYLON.Vector3(o[0], 0.2, o[1]);
        leg.material = animalMat;
    });
    animals.push({ root: root, state: "seekFood", targetPlant: null, targetTree: null, timer: 0, speed: 1.6, face: face, chewT: 0, dummy: [body, head], anims: null, clip: "" });
}
createAnimal(1, 8, 8);
createAnimal(2, -12, 10);
createAnimal(3, 20, -10);
createAnimal(4, -22, -8);
createAnimal(5, 4, -12);

function loadCowGltf() {
    if (typeof BABYLON.SceneLoader === "undefined") return;
    BABYLON.SceneLoader.ImportMesh("", "./", COW_FILE, scene, (meshes, _ps, _sk, animationGroups) => {
        if (!meshes.length) return;
        const template = meshes[0];
        template.setEnabled(false);
        const srcGroups = animationGroups || [];
        srcGroups.forEach((g) => g.stop());
        animals.forEach((a, i) => {
            const cow = template.clone("cow_" + i);
            cow.setEnabled(true);
            cow.parent = a.root;
            cow.position = BABYLON.Vector3.Zero();
            cow.scaling = new BABYLON.Vector3(COW_SCALE, COW_SCALE, COW_SCALE);
            a.cow = cow;
            a.anims = {};
            srcGroups.forEach((g) => {
                const ng = g.clone("cow" + i + "_" + g.name, (target) => {
                    if (!target || !target.name) return cow;
                    const kids = cow.getChildMeshes(true);
                    const hit = kids.find((m) => m.name === target.name || m.name.indexOf(target.name) !== -1);
                    return hit || cow;
                });
                if (ng) { ng.stop(); a.anims[g.name] = ng; }
            });
            a.root.getChildMeshes().forEach((m) => { if (m.name.indexOf("animal") === 0) m.setEnabled(false); });
            if (a.dummy) a.dummy.forEach((m) => m.setEnabled(false));
        });
    });
}
loadCowGltf();

function playCowClip(a, clip) {
    if (!a.anims) return;
    if (a.clip === clip) return;
    a.clip = clip;
    Object.keys(a.anims).forEach((k) => { try { a.anims[k].stop(); } catch (e) {} });
    const ks = Object.keys(a.anims);
    const found = ks.find((k) => k.toLowerCase() === clip.toLowerCase()) ||
        ks.find((k) => k.toLowerCase().indexOf(clip.toLowerCase()) !== -1);
    if (found) a.anims[found].start(true);
}

function walkToward(a, tx, tz, dt, arrive) {
    const dx = tx - a.root.position.x;
    const dz = tz - a.root.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < arrive) return true;
    const yaw = Math.atan2(dx, dz);
    a.root.rotation.y = yaw;
    a.root.position.x += Math.sin(yaw) * a.speed * dt;
    a.root.position.z += Math.cos(yaw) * a.speed * dt;
    a.root.position.y = GROUND_Y;
    return false;
}

function updateAnimalFace(a, mode, dt) {
    if (!a.face) return;
    if (mode === "eat") {
        a.chewT += dt * 8;
        a.face.mouth.scaling.y = 1.2 + Math.abs(Math.sin(a.chewT)) * 2.2;
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
            if (walkToward(a, a.targetPlant.x, a.targetPlant.z, dt, 0.7)) {
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
            if (a.timer <= 0) a.state = "seekTree";
            return;
        }
        if (a.state === "seekTree") {
            if (!a.targetTree) {
                a.targetTree = findFreeTree(a.root.position.x, a.root.position.z);
                if (a.targetTree) a.targetTree.busy = true;
            }
            if (!a.targetTree) { a.state = "seekFood"; return; }
            updateAnimalFace(a, "idle", dt);
            playCowClip(a, "Walk");
            if (walkToward(a, a.targetTree.x, a.targetTree.z, dt, 1.2)) {
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

const stork = { node: null, t: 0 };
const flamingo = { node: null, x: -32, dir: 1, speed: 1.6 };
function loadBirds() {
    if (typeof BABYLON.SceneLoader === "undefined") return;
    BABYLON.SceneLoader.ImportMesh("", "./", STORK_FILE, scene, (meshes) => {
        if (!meshes.length) return;
        stork.node = meshes[0];
        stork.node.position = new BABYLON.Vector3(8, STORK_Y, 4);
        stork.node.scaling = new BABYLON.Vector3(STORK_SCALE, STORK_SCALE, STORK_SCALE);
    });
    BABYLON.SceneLoader.ImportMesh("", "./", FLAMINGO_FILE, scene, (meshes) => {
        if (!meshes.length) return;
        flamingo.node = meshes[0];
        flamingo.node.position = new BABYLON.Vector3(flamingo.x, FLAMINGO_Y, -4);
        flamingo.node.scaling = new BABYLON.Vector3(FLAMINGO_SCALE, FLAMINGO_SCALE, FLAMINGO_SCALE);
    });
}
loadBirds();
function updateBirds(dt) {
    if (stork.node) {
        stork.t += dt;
        stork.node.position.y = STORK_Y + Math.sin(stork.t * 2) * 0.08;
    }
    if (flamingo.node) {
        flamingo.x += flamingo.dir * flamingo.speed * dt;
        if (flamingo.x > 32) { flamingo.x = 32; flamingo.dir = -1; }
        if (flamingo.x < -32) { flamingo.x = -32; flamingo.dir = 1; }
        flamingo.node.position.x = flamingo.x;
        flamingo.node.position.y = FLAMINGO_Y;
        flamingo.node.position.z = -4;
        flamingo.node.rotation.y = flamingo.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
}

function createPlayer() {
    const root = BABYLON.MeshBuilder.CreateBox("playerRoot", { width: 0.7, height: PLAYER_HEIGHT, depth: 0.5 }, scene);
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
    torso.parent = root; torso.position.y = 0.05; torso.material = shirtMat;
    const head = BABYLON.MeshBuilder.CreateBox("head", { width: 0.42, height: 0.42, depth: 0.42 }, scene);
    head.parent = root; head.position.y = 0.58; head.material = skinMat;
    addFace(head, 1.05);
    const leftArm = BABYLON.MeshBuilder.CreateBox("leftArm", { width: 0.18, height: 0.65, depth: 0.18 }, scene);
    leftArm.parent = root; leftArm.position = new BABYLON.Vector3(-0.46, 0.05, 0); leftArm.material = skinMat;
    const rightArm = BABYLON.MeshBuilder.CreateBox("rightArm", { width: 0.18, height: 0.65, depth: 0.18 }, scene);
    rightArm.parent = root; rightArm.position = new BABYLON.Vector3(0.46, 0.05, 0); rightArm.material = skinMat;
    rightArm.setPivotPoint(new BABYLON.Vector3(0, 0.28, 0));
    root.rightArm = rightArm;
    const leftLeg = BABYLON.MeshBuilder.CreateBox("leftLeg", { width: 0.22, height: 0.7, depth: 0.22 }, scene);
    leftLeg.parent = root; leftLeg.position = new BABYLON.Vector3(-0.18, -0.55, 0); leftLeg.material = pantMat;
    root.leftLeg = leftLeg;
    const rightLeg = BABYLON.MeshBuilder.CreateBox("rightLeg", { width: 0.22, height: 0.7, depth: 0.22 }, scene);
    rightLeg.parent = root; rightLeg.position = new BABYLON.Vector3(0.18, -0.55, 0); rightLeg.material = pantMat;
    root.rightLeg = rightLeg;
    return root;
}
const player = createPlayer();
let velY = 0;
let grounded = true;
let sitting = false;

const camera = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(0, 10, -14), scene);
camera.minZ = 0.1;
camera.inertia = 0;
camera.inputs.clear();
camera.attachControl(canvas, false);
let camYaw = 0;
let camPitch = 0.38;
let CAM_DISTANCE = 10;
const panOffset = new BABYLON.Vector3(0, 0, 0);
let lmb = false;
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
canvas.addEventListener("pointercancel", () => { lmb = false; rmb = false; });
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
        panOffset.x = Math.max(-MAP_SIZE_X * 0.45, Math.min(MAP_SIZE_X * 0.45, panOffset.x));
        panOffset.z = Math.max(-MAP_SIZE_Z * 0.45, Math.min(MAP_SIZE_Z * 0.45, panOffset.z));
    }
}
canvas.addEventListener("pointermove", onDrag);
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

const keys = { w: false, a: false, s: false, d: false, g: false };
let jumpQueued = false;
function setPaused(next) {
    paused = next;
    const ov = document.getElementById("pauseOverlay");
    const btn = document.getElementById("btnPause");
    if (ov) ov.hidden = !paused;
    if (btn) btn.textContent = paused ? "Resume" : "Pause";
}
function setKey(ev, isDown) {
    const k = ev.key.toLowerCase();
    if (k === "w" || k === "arrowup") keys.w = isDown;
    if (k === "s" || k === "arrowdown") keys.s = isDown;
    if (k === "a" || k === "arrowleft") keys.a = isDown;
    if (k === "d" || k === "arrowright") keys.d = isDown;
    if (k === "g") keys.g = isDown;
    if (k === "c" && isDown) sitting = !sitting;
    if ((k === " " || k === "spacebar") && isDown) { jumpQueued = true; ev.preventDefault(); }
    if (isDown && (k === "p" || k === "escape")) setPaused(!paused);
}
window.addEventListener("keydown", (ev) => setKey(ev, true));
window.addEventListener("keyup", (ev) => setKey(ev, false));
const btnPause = document.getElementById("btnPause");
if (btnPause) btnPause.addEventListener("click", () => setPaused(!paused));
function applyResolution() {
    const sel = document.getElementById("selRes");
    if (!sel) return;
    const w = canvas.clientWidth || window.innerWidth;
    const val = sel.value;
    const target = val === "native" ? w : Number(val);
    engine.setHardwareScalingLevel(Math.max(1, w / target));
    engine.resize();
}
const selRes = document.getElementById("selRes");
if (selRes) selRes.addEventListener("change", applyResolution);
function applyQuality() {
    const sel = document.getElementById("selQual");
    if (!sel) return;
    quality = sel.value;
    cloudMeshes.forEach((c) => c.setEnabled(quality !== "low"));
}
const selQual = document.getElementById("selQual");
if (selQual) selQual.addEventListener("change", applyQuality);
applyQuality();
applyResolution();
const btnReset = document.getElementById("btnResetView");
if (btnReset) btnReset.addEventListener("click", () => {
    panOffset.set(0, 0, 0);
    camYaw = 0;
    camPitch = 0.38;
    CAM_DISTANCE = 10;
});
let isNight = false;
const btnDay = document.getElementById("btnDayNight");
if (btnDay) btnDay.addEventListener("click", () => {
    isNight = !isNight;
    hemiLight.intensity = isNight ? 0.28 : 0.7;
    sun.intensity = isNight ? 0.12 : 0.65;
    scene.clearColor = isNight ? new BABYLON.Color4(0.05, 0.07, 0.14, 1) : new BABYLON.Color4(0.45, 0.68, 0.92, 1);
});

let waveT = 0;
function updateWave(dt) {
    const arm = player.rightArm;
    if (!arm) return;
    if (keys.g && !paused) {
        waveT += dt * 8;
        arm.rotation.x = -1.1 + Math.sin(waveT) * 0.7;
        arm.rotation.z = 0.15;
        return;
    }
    waveT = 0;
    arm.rotation.x *= 0.75;
    arm.rotation.z *= 0.75;
}
function facePlayer(dir) {
    if (dir.lengthSquared() < 0.0001) return;
    player.rotation.y = Math.atan2(dir.x, dir.z);
}
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
    if (sitting) { jumpQueued = false; return; }
    const forward = new BABYLON.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new BABYLON.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const wish = BABYLON.Vector3.Zero();
    if (keys.w) wish.addInPlace(forward);
    if (keys.s) wish.addInPlace(forward.scale(-1));
    if (keys.a) wish.addInPlace(right);
    if (keys.d) wish.addInPlace(right.scale(-1));
    if (wish.lengthSquared() > 0) { wish.normalize(); facePlayer(wish); }
    const step = wish.scale(WALK_SPEED * dt);
    if (jumpQueued && grounded) { velY = JUMP_SPEED; grounded = false; }
    jumpQueued = false;
    velY -= GRAVITY * dt;
    step.y = velY * dt;
    player.moveWithCollisions(step);
    const ray = new BABYLON.Ray(player.position.clone(), new BABYLON.Vector3(0, -1, 0), PLAYER_HEIGHT / 2 + 0.12);
    const hit = scene.pickWithRay(ray, (m) => islands.indexOf(m) !== -1 || hills.indexOf(m) !== -1);
    if (hit && hit.hit && hit.distance <= PLAYER_HEIGHT / 2 + 0.08) {
        grounded = true;
        if (velY < 0) velY = 0;
    } else if (player.position.y <= GROUND_Y + PLAYER_HEIGHT / 2 + 0.02 && velY <= 0) {
        const onPad = Math.abs(player.position.x) < MAP_SIZE_X / 2 - 0.2 && Math.abs(player.position.z) < MAP_SIZE_Z / 2 - 0.2;
        if (onPad) {
            player.position.y = GROUND_Y + PLAYER_HEIGHT / 2;
            velY = 0;
            grounded = true;
        } else grounded = false;
    } else grounded = false;
    player.position.x = Math.max(-MAP_SIZE_X / 2 + PLAYER_RADIUS, Math.min(MAP_SIZE_X / 2 - PLAYER_RADIUS, player.position.x));
    player.position.z = Math.max(-MAP_SIZE_Z / 2 + PLAYER_RADIUS, Math.min(MAP_SIZE_Z / 2 - PLAYER_RADIUS, player.position.z));
}

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

const fpsLabel = document.getElementById("fps");
let fpsCap = 30;
let lastDraw = 0;
let drawsThisSec = 0;
let fpsWindowStart = performance.now();
const selFps = document.getElementById("selFps");
if (selFps) selFps.addEventListener("change", () => { fpsCap = Number(selFps.value) || 30; });
engine.stopRenderLoop();
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
window.addEventListener("resize", applyResolution);
