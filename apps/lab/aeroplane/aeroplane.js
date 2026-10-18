/*
File: aeroplane.js
Project: aeroplane
Purpose: Main logic for the closed-sphere free-flight simulator.
- Third-person camera
- Altitude clamp 5–100 m (hard floor, soft ceiling)
- No gravity in v1
- Keyboard + optional touch controls
- Loads GLB models if present, falls back to simple geometries
Date: 2026-10-17
R1 (2026-10-18): planet centred, valid plane basis (nose +Z), plane scaled to
PLANE_LENGTH, spawn 30 m, sRGB output, auto camera zoom (plane ~50% of width).
*/

// Constants for planet and flight parameters
const PLANET_RADIUS = 1000; // 1 km radius in meters
const MIN_ALTITUDE = 5;     // hard floor in meters
const MAX_ALTITUDE = 100;   // soft ceiling in meters
const CRUISE_ALTITUDE = 30; // default spawn altitude (30 m above surface)
const PLANE_LENGTH = 5;     // approximate plane length in meters
const PLANE_WIDTH = 4;      // approximate plane width in meters (fallback box only)
const CAM_SCREEN_FRACTION = 0.5; // default zoom: wingspan fills ~50% of screen width
const CAM_MAX_SCREEN_Y = 0.9;     // ...but keep nose/tail inside 90% of the screen height

// Global state
let scene, camera, renderer, plane, planet;
let altitude = CRUISE_ALTITUDE;
let speed = 20;             // forward speed in m/s
let keys = {};              // keyboard state
let touchActive = false;    // whether touch controls are visible
let paused = false;         // pause flag
let camDistance = 25;       // camera follow distance, recomputed by updateAutoCamDistance()
let camZoom = 1;            // mouse-wheel zoom multiplier on top of the auto distance
let planeLocalBox = null;   // plane bounds in its own (scaled) frame, for auto zoom
let planeSamplePoints = []; // sampled plane vertices in its own frame, for auto zoom
let camOrbitYaw = 0;        // camera orbit offset yaw
let camOrbitPitch = 0.4;    // camera orbit offset pitch
let mouseDownLeft = false;
let mouseDownRight = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Spherical flight state
let radial = new THREE.Vector3(0, 1, 0);   // unit vector from planet center to plane
let forward = new THREE.Vector3(0, 0, 1);  // unit tangent forward direction

// Animation support for GLB
let mixer = null;
let clock = new THREE.Clock();

// Initialize the application
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // sky blue

    // Create perspective camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);

    // Create WebGL renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding; // glTF textures are sRGB
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Add basic lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(100, 200, 100);
    scene.add(directional);

    // Create or load planet (smooth sphere for v1)
    createPlanet();

    // Create or load plane
    createPlane();

    // Set up event listeners
    setupControls();
    updateHud();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Start animation loop
    animate();
}

// Create planet mesh - load GLB by default, fallback to sphere
function createPlanet() {
    const loader = new THREE.GLTFLoader();
    loader.load(
        'models/planet.glb',
        (gltf) => {
            planet = gltf.scene;
            // Scale planet so its radius matches PLANET_RADIUS
            const box = new THREE.Box3().setFromObject(planet);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                const scale = (PLANET_RADIUS * 2) / maxDim;
                planet.scale.setScalar(scale);
            }
            // Centre the planet on the origin: the GLB's mesh is offset +1000 Y,
            // but the flight code assumes the planet centre is (0,0,0).
            planet.updateMatrixWorld(true);
            const center = new THREE.Box3().setFromObject(planet).getCenter(new THREE.Vector3());
            planet.position.sub(center);
            scene.add(planet);
        },
        undefined,
        (error) => {
            // Fallback: simple sphere
            console.warn('Planet GLB not found, using fallback sphere', error);
            const geometry = new THREE.SphereGeometry(PLANET_RADIUS, 64, 64);
            const material = new THREE.MeshLambertMaterial({ color: 0x228b22 }); // green
            planet = new THREE.Mesh(geometry, material);
            scene.add(planet);
        }
    );
}

// Create plane mesh - load GLB by default, fallback to box
function createPlane() {
    const loader = new THREE.GLTFLoader();
    loader.load(
        'models/plane.glb',
        (gltf) => {
            plane = gltf.scene;
            // Scale so the nose-to-tail length (model Z axis, nose = +Z) is PLANE_LENGTH
            const size = new THREE.Box3().setFromObject(plane).getSize(new THREE.Vector3());
            const scale = size.z > 0 ? PLANE_LENGTH / size.z : 1;
            plane.scale.setScalar(scale);
            planeLocalBox = new THREE.Box3().setFromObject(plane);
            planeSamplePoints = samplePlanePoints(plane);
            scene.add(plane);

            // Play animations if the model has them (propellers, etc.)
            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(plane);
                gltf.animations.forEach((clip) => {
                    mixer.clipAction(clip).play();
                });
            }

            // Place plane at starting position, then fit the camera to it
            updatePlanePosition();
            updateAutoCamDistance();
        },
        undefined,
        (error) => {
            // Fallback: simple box representing the plane
            console.warn('Plane GLB not found, using fallback box', error);
            const geometry = new THREE.BoxGeometry(PLANE_WIDTH, 1, PLANE_LENGTH); // length along Z (nose +Z)
            const material = new THREE.MeshLambertMaterial({ color: 0xff0000 }); // red
            plane = new THREE.Mesh(geometry, material);
            planeLocalBox = new THREE.Box3().setFromObject(plane);
            planeSamplePoints = samplePlanePoints(plane);
            scene.add(plane);
            updatePlanePosition();
            updateAutoCamDistance();
        }
    );
}

// Helper: set plane position and orientation from radial + forward + altitude
function updatePlanePosition() {
    if (!plane) return;
    const radius = PLANET_RADIUS + altitude;
    plane.position.copy(radial).multiplyScalar(radius);

    // Build orientation: up = radial, forward = tangent forward.
    // Right-handed basis (right x up = forward) so the matrix is a pure rotation;
    // the plane model's nose points along its local +Z.
    const up = radial.clone();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    // Re-orthonormalize forward
    forward.crossVectors(right, up).normalize();

    const m = new THREE.Matrix4().makeBasis(right, up, forward);
    plane.quaternion.setFromRotationMatrix(m);
}

// Set up keyboard, mouse, touch, and pause listeners
function setupControls() {
    // Keyboard
    window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

    // Mouse for pan (left drag orbit) and zoom (wheel)
    const canvas = renderer.domElement;
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) mouseDownLeft = true;
        if (e.button === 2) mouseDownRight = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) mouseDownLeft = false;
        if (e.button === 2) mouseDownRight = false;
    });
    canvas.addEventListener('mousemove', (e) => {
        if (mouseDownRight) {
            // Right mouse hold + drag: pan / orbit camera
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            camOrbitYaw -= dx * 0.005;
            camOrbitPitch = Math.max(-0.8, Math.min(1.4, camOrbitPitch - dy * 0.005));
        } else if (mouseDownLeft) {
            // Left mouse hold + drag: also orbit (optional secondary)
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            camOrbitYaw -= dx * 0.005;
            camOrbitPitch = Math.max(-0.8, Math.min(1.4, camOrbitPitch - dy * 0.005));
        }
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => {
        // Zoom
        camZoom = Math.max(0.6, Math.min(8, camZoom * (1 + e.deltaY * 0.001)));
        updateAutoCamDistance();
        e.preventDefault();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // prevent right-click menu

    // Right mouse button action: slow down while held
    // Left mouse button action: speed up while held (in addition to orbit)
    // These are checked in updatePlane

    // Touch toggle button
    const toggleBtn = document.getElementById('touch-toggle');
    const touchDiv = document.getElementById('touch-controls');
    toggleBtn.addEventListener('click', () => {
        touchActive = !touchActive;
        touchDiv.style.display = touchActive ? 'flex' : 'none';
        toggleBtn.textContent = touchActive ? 'Hide Controls' : 'Show Controls';
    });

    // Pause button
    const pauseBtn = document.getElementById('pause-btn');
    pauseBtn.addEventListener('click', () => {
        paused = !paused;
        pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    });

    // Touch buttons (simple press-and-hold simulation via mouse events for demo)
    setupTouchButton('btn-up', () => { keys['w'] = true; }, () => { keys['w'] = false; });
    setupTouchButton('btn-down', () => { keys['s'] = true; }, () => { keys['s'] = false; });
    setupTouchButton('btn-left', () => { keys['a'] = true; }, () => { keys['a'] = false; });
    setupTouchButton('btn-right', () => { keys['d'] = true; }, () => { keys['d'] = false; });
    setupTouchButton('btn-speed-up', () => { keys['shift'] = true; }, () => { keys['shift'] = false; });
    setupTouchButton('btn-speed-down', () => { keys['control'] = true; }, () => { keys['control'] = false; });
}

// Helper to wire a touch/mouse button to key state
function setupTouchButton(id, onDown, onUp) {
    const btn = document.getElementById(id);
    btn.addEventListener('mousedown', onDown);
    btn.addEventListener('mouseup', onUp);
    btn.addEventListener('mouseleave', onUp);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); onUp(); });
}

// Update plane position, altitude, and orientation each frame
function updatePlane(delta) {
    if (paused || !plane) return;

    // Altitude control (W/S or touch up/down)
    if (keys['w'] || keys['arrowup']) altitude += 15 * delta;
    if (keys['s'] || keys['arrowdown']) altitude -= 15 * delta;
    altitude = Math.max(MIN_ALTITUDE, Math.min(MAX_ALTITUDE, altitude));

    // Yaw (A/D or left/right) — rotate forward around radial
    const yawRate = 1.2;
    if (keys['a'] || keys['arrowleft']) {
        forward.applyAxisAngle(radial, yawRate * delta);
    }
    if (keys['d'] || keys['arrowright']) {
        forward.applyAxisAngle(radial, -yawRate * delta);
    }
    forward.normalize();

    // Throttle (keyboard + optional mouse buttons — right is now reserved for pan)
    if (keys['shift']) speed = Math.min(80, speed + 20 * delta);
    if (keys['control']) speed = Math.max(0, speed - 20 * delta);

    // Move along the sphere: rotate radial around the axis perpendicular to forward
    if (speed > 0.1) {
        const distance = speed * delta;
        const angle = distance / (PLANET_RADIUS + altitude);
        const axis = new THREE.Vector3().crossVectors(radial, forward).normalize();
        radial.applyAxisAngle(axis, angle);
        radial.normalize();
        // Keep forward tangent
        forward.sub(radial.clone().multiplyScalar(forward.dot(radial))).normalize();
    }

    // Apply position and orientation
    updatePlanePosition();

    updateHud();
}

// Write current altitude and speed to the HUD
function updateHud() {
    document.getElementById('alt-display').textContent = Math.round(altitude);
    document.getElementById('speed-display').textContent = Math.round(speed);
}

// Collect up to ~600 vertices of the plane in its own local frame, so the auto zoom measures the real
// silhouette instead of the much wider bounding-box corners.
function samplePlanePoints(root) {
    root.updateMatrixWorld(true);
    let total = 0;
    root.traverse((o) => { if (o.isMesh) total += o.geometry.attributes.position.count; });
    const step = Math.max(1, Math.floor(total / 600));
    const toRoot = root.matrixWorld.clone().invert(); // points in root's local frame
    const pts = [];
    root.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += step) {
            pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(toRoot));
        }
    });
    return pts;
}

// Default zoom: find the camera distance at which the plane covers
// CAM_SCREEN_FRACTION of the screen width, measured by projecting the plane's
// vertices through the real follow camera (so perspective, fov,
// aspect and camera pitch are all accounted for, on phone and desktop alike).
function planeTooClose(dist) {
    placeCamera(dist);
    camera.updateMatrixWorld();
    plane.updateMatrixWorld(true);
    let minX = Infinity, maxX = -Infinity, maxY = 0;
    const v = new THREE.Vector3();
    for (const p of planeSamplePoints) {
        v.copy(p).applyMatrix4(plane.matrixWorld).project(camera);
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, Math.abs(v.y));
    }
    // NDC spans 2 units across the screen
    return (maxX - minX) / 2 > CAM_SCREEN_FRACTION || maxY > CAM_MAX_SCREEN_Y;
}

function updateAutoCamDistance() {
    if (!camera || !plane || !planeLocalBox) return;
    // Never put the camera inside the plane's bounding sphere
    let lo = planeLocalBox.getBoundingSphere(new THREE.Sphere()).radius * 1.1;
    let hi = 500;
    if (planeTooClose(lo)) {
        for (let i = 0; i < 30; i++) { // width shrinks as distance grows
            const mid = (lo + hi) / 2;
            if (planeTooClose(mid)) lo = mid; else hi = mid;
        }
    }
    camDistance = lo * camZoom;
    placeCamera(camDistance);
}

// Third-person camera that follows the plane and keeps the planet "below"
function updateCamera() {
    if (!plane) return;
    placeCamera(camDistance);
}

// Put the follow camera at distance dist behind/above the plane
function placeCamera(dist) {
    const upDir = radial.clone();
    const fwd = forward.clone();

    // Base offset behind and a bit above
    const backDist = dist;
    const upDist = dist * 0.35;

    // Apply mouse orbit offsets
    const orbit = new THREE.Quaternion()
        .setFromAxisAngle(upDir, camOrbitYaw)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), camOrbitPitch));

    // Normalise so the camera sits exactly camDistance from the plane
    const offset = new THREE.Vector3(0, upDist, -backDist).applyQuaternion(orbit).setLength(dist);

    // Transform offset into world using plane basis
    const right = new THREE.Vector3().crossVectors(upDir, fwd).normalize();
    const worldOffset = new THREE.Vector3()
        .addScaledVector(right, offset.x)
        .addScaledVector(upDir, offset.y)
        .addScaledVector(fwd, offset.z);

    camera.position.copy(plane.position).add(worldOffset);
    camera.up.copy(upDir); // set before lookAt so it applies this frame
    camera.lookAt(plane.position);
}

// Animation loop
let lastTime = 0;
function animate(time = 0) {
    requestAnimationFrame(animate);
    const delta = Math.min((time - lastTime) / 1000, 0.1); // cap delta
    lastTime = time;

    if (!paused) {
        updatePlane(delta);
        // Update GLB animations (propellers etc.)
        if (mixer) mixer.update(delta);
    }
    updateCamera();
    renderer.render(scene, camera);
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    updateAutoCamDistance();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start when DOM is ready
window.addEventListener('load', init);
