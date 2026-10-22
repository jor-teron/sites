// ============================================
// BASIC HUMAN BUST - Procedural Three.js Model
// ============================================

// --- Setup model group ---
const group = new THREE.Group();
group.position.y = 0.0;

// --- Materials ---
const skinMat = new THREE.MeshStandardMaterial({
  color: 0xd4a574,
  roughness: 0.6,
  metalness: 0.05,
  emissive: new THREE.Color(0x221100)
});

const hairMat = new THREE.MeshStandardMaterial({
  color: 0x3a2a1a,
  roughness: 0.9,
  metalness: 0.0
});

const eyeWhiteMat = new THREE.MeshStandardMaterial({
  color: 0xf0f0f0,
  roughness: 0.3,
  metalness: 0.0
});

const eyeIrisMat = new THREE.MeshStandardMaterial({
  color: 0x224466,
  roughness: 0.2,
  metalness: 0.1,
  emissive: new THREE.Color(0x112233)
});

const eyePupilMat = new THREE.MeshStandardMaterial({
  color: 0x000000,
  roughness: 0.1,
  metalness: 0.0
});

const lipMat = new THREE.MeshStandardMaterial({
  color: 0xaa6655,
  roughness: 0.5,
  metalness: 0.0
});

const clothMat = new THREE.MeshStandardMaterial({
  color: 0x2a3a5a,
  roughness: 0.8,
  metalness: 0.1
});

const baseMat = new THREE.MeshStandardMaterial({
  color: 0x555566,
  roughness: 0.4,
  metalness: 0.3
});

// ========== NECK ==========
const neckGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.45, 12);
const neck = new THREE.Mesh(neckGeo, skinMat);
neck.position.y = 0.45;
neck.castShadow = true;
neck.receiveShadow = true;
group.add(neck);

// ========== HEAD ==========
const headGeo = new THREE.SphereGeometry(0.42, 32, 32);
const head = new THREE.Mesh(headGeo, skinMat);
head.position.y = 1.05;
head.scale.set(0.85, 1.0, 0.9);
head.castShadow = true;
head.receiveShadow = true;
group.add(head);

// ========== JAW / CHIN ==========
const jawGeo = new THREE.SphereGeometry(0.3, 16, 16);
const jaw = new THREE.Mesh(jawGeo, skinMat);
jaw.position.set(0, 0.88, 0.12);
jaw.scale.set(0.9, 0.55, 0.8);
jaw.castShadow = true;
jaw.receiveShadow = true;
group.add(jaw);

// ========== CHEEKS ==========
const cheekGeo = new THREE.SphereGeometry(0.15, 12, 12);
const cheekL = new THREE.Mesh(cheekGeo, skinMat);
cheekL.position.set(-0.22, 1.0, 0.22);
cheekL.scale.set(0.8, 0.6, 0.7);
cheekL.castShadow = true;
group.add(cheekL);

const cheekR = new THREE.Mesh(cheekGeo, skinMat);
cheekR.position.set(0.22, 1.0, 0.22);
cheekR.scale.set(0.8, 0.6, 0.7);
cheekR.castShadow = true;
group.add(cheekR);

// ========== NOSE ==========
const noseGeo = new THREE.ConeGeometry(0.08, 0.28, 8);
const nose = new THREE.Mesh(noseGeo, skinMat);
nose.position.set(0, 1.02, 0.38);
nose.rotation.x = Math.PI * 0.5;
nose.rotation.z = Math.PI * 0.5;
nose.scale.set(1, 1, 0.8);
nose.castShadow = true;
group.add(nose);

const bridgeGeo = new THREE.SphereGeometry(0.06, 8, 8);
const bridge = new THREE.Mesh(bridgeGeo, skinMat);
bridge.position.set(0, 1.12, 0.32);
bridge.scale.set(0.6, 1.0, 0.8);
group.add(bridge);

// ========== EYES ==========
const eyeGeo = new THREE.SphereGeometry(0.09, 16, 16);
const irisGeo = new THREE.SphereGeometry(0.055, 16, 16);
const pupilGeo = new THREE.SphereGeometry(0.03, 12, 12);

const eyeL = new THREE.Mesh(eyeGeo, eyeWhiteMat);
eyeL.position.set(-0.15, 1.12, 0.36);
eyeL.scale.set(1.0, 0.9, 0.7);
eyeL.castShadow = true;
group.add(eyeL);

const irisL = new THREE.Mesh(irisGeo, eyeIrisMat);
irisL.position.set(-0.15, 1.12, 0.43);
irisL.scale.set(1.0, 0.9, 0.5);
group.add(irisL);

const pupilL = new THREE.Mesh(pupilGeo, eyePupilMat);
pupilL.position.set(-0.15, 1.12, 0.465);
pupilL.scale.set(1.0, 0.9, 0.5);
group.add(pupilL);

const eyeR = new THREE.Mesh(eyeGeo, eyeWhiteMat);
eyeR.position.set(0.15, 1.12, 0.36);
eyeR.scale.set(1.0, 0.9, 0.7);
eyeR.castShadow = true;
group.add(eyeR);

const irisR = new THREE.Mesh(irisGeo, eyeIrisMat);
irisR.position.set(0.15, 1.12, 0.43);
irisR.scale.set(1.0, 0.9, 0.5);
group.add(irisR);

const pupilR = new THREE.Mesh(pupilGeo, eyePupilMat);
pupilR.position.set(0.15, 1.12, 0.465);
pupilR.scale.set(1.0, 0.9, 0.5);
group.add(pupilR);

// ========== EYEBROWS ==========
const browGeo = new THREE.BoxGeometry(0.16, 0.03, 0.05);
const browL = new THREE.Mesh(browGeo, hairMat);
browL.position.set(-0.15, 1.22, 0.38);
browL.rotation.z = 0.1;
group.add(browL);

const browR = new THREE.Mesh(browGeo, hairMat);
browR.position.set(0.15, 1.22, 0.38);
browR.rotation.z = -0.1;
group.add(browR);

// ========== MOUTH / LIPS ==========
const lipGeo = new THREE.SphereGeometry(0.07, 12, 12);
const upperLip = new THREE.Mesh(lipGeo, lipMat);
upperLip.position.set(0, 0.9, 0.38);
upperLip.scale.set(1.4, 0.35, 0.5);
upperLip.castShadow = true;
group.add(upperLip);

const lowerLip = new THREE.Mesh(lipGeo, lipMat);
lowerLip.position.set(0, 0.86, 0.38);
lowerLip.scale.set(1.2, 0.3, 0.5);
lowerLip.castShadow = true;
group.add(lowerLip);

// ========== EARS ==========
const earGeo = new THREE.SphereGeometry(0.1, 12, 12);
const earL = new THREE.Mesh(earGeo, skinMat);
earL.position.set(-0.4, 1.05, 0.0);
earL.scale.set(0.4, 1.0, 0.7);
earL.castShadow = true;
group.add(earL);

const earR = new THREE.Mesh(earGeo, skinMat);
earR.position.set(0.4, 1.05, 0.0);
earR.scale.set(0.4, 1.0, 0.7);
earR.castShadow = true;
group.add(earR);

// ========== HAIR ==========
const hairCapGeo = new THREE.SphereGeometry(0.45, 24, 24);
const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
hairCap.position.y = 1.08;
hairCap.scale.set(0.9, 0.7, 0.95);
hairCap.castShadow = true;
hairCap.receiveShadow = true;
group.add(hairCap);

const hairSideGeo = new THREE.SphereGeometry(0.15, 12, 12);
const hairL = new THREE.Mesh(hairSideGeo, hairMat);
hairL.position.set(-0.35, 1.12, -0.05);
hairL.scale.set(0.7, 1.2, 0.8);
hairL.castShadow = true;
group.add(hairL);

const hairR = new THREE.Mesh(hairSideGeo, hairMat);
hairR.position.set(0.35, 1.12, -0.05);
hairR.scale.set(0.7, 1.2, 0.8);
hairR.castShadow = true;
group.add(hairR);

const hairBackGeo = new THREE.SphereGeometry(0.35, 16, 16);
const hairBack = new THREE.Mesh(hairBackGeo, hairMat);
hairBack.position.set(0, 1.0, -0.25);
hairBack.scale.set(0.9, 1.1, 0.6);
hairBack.castShadow = true;
group.add(hairBack);

const tuftGeo = new THREE.SphereGeometry(0.12, 8, 8);
const tuft = new THREE.Mesh(tuftGeo, hairMat);
tuft.position.set(0, 1.3, 0.25);
tuft.scale.set(1.2, 0.5, 0.8);
tuft.castShadow = true;
group.add(tuft);

// ========== SHOULDERS / BUST BASE ==========
const shouldersGeo = new THREE.CylinderGeometry(0.7, 0.8, 0.35, 16);
const shoulders = new THREE.Mesh(shouldersGeo, clothMat);
shoulders.position.y = 0.1;
shoulders.castShadow = true;
shoulders.receiveShadow = true;
group.add(shoulders);

const torsoGeo = new THREE.CylinderGeometry(0.55, 0.7, 0.4, 12);
const torso = new THREE.Mesh(torsoGeo, clothMat);
torso.position.y = -0.15;
torso.castShadow = true;
torso.receiveShadow = true;
group.add(torso);

const collarGeo = new THREE.TorusGeometry(0.38, 0.06, 8, 24);
const collar = new THREE.Mesh(collarGeo, new THREE.MeshStandardMaterial({
  color: 0x1a2a4a,
  roughness: 0.5,
  metalness: 0.2
}));
collar.position.y = 0.28;
collar.rotation.x = Math.PI * 0.5;
collar.castShadow = true;
group.add(collar);

// ========== PEDESTAL BASE ==========
const pedestalGeo = new THREE.CylinderGeometry(0.6, 0.65, 0.15, 16);
const pedestal = new THREE.Mesh(pedestalGeo, baseMat);
pedestal.position.y = -0.4;
pedestal.castShadow = true;
pedestal.receiveShadow = true;
group.add(pedestal);

const pedestalTopGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16);
const pedestalTop = new THREE.Mesh(pedestalTopGeo, baseMat);
pedestalTop.position.y = -0.32;
pedestalTop.castShadow = true;
pedestalTop.receiveShadow = true;
group.add(pedestalTop);

// ========== ADD TO SCENE ==========
setModel(group);
setStatus('✅ Human bust model loaded!');