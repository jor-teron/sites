// ============================================
// REALISTIC HUMAN HEAD - Detailed Three.js Model
// ============================================
// Higher-poly head with facial anatomy:
// brow ridge, nose, lips, ears, eyes, jaw

const group = new THREE.Group();

// ---------- MATERIALS ----------
// Skin with subtle subsurface-like warmth
const skinMat = new THREE.MeshStandardMaterial({
  color: 0xc68642,
  roughness: 0.55,
  metalness: 0.0,
  flatShading: false
});

const skinShadowMat = new THREE.MeshStandardMaterial({
  color: 0xa06830,
  roughness: 0.65,
  metalness: 0.0
});

const lipMat = new THREE.MeshStandardMaterial({
  color: 0xb5655a,
  roughness: 0.35,
  metalness: 0.05
});

const eyebrowMat = new THREE.MeshStandardMaterial({
  color: 0x2a1a10,
  roughness: 0.95,
  metalness: 0.0
});

const hairMat = new THREE.MeshStandardMaterial({
  color: 0x1a1208,
  roughness: 0.85,
  metalness: 0.02
});

const scleraMat = new THREE.MeshStandardMaterial({
  color: 0xf2ede4,
  roughness: 0.15,
  metalness: 0.0
});

const irisMat = new THREE.MeshStandardMaterial({
  color: 0x4a2a1a,
  roughness: 0.2,
  metalness: 0.1
});

const pupilMat = new THREE.MeshStandardMaterial({
  color: 0x080404,
  roughness: 0.05,
  metalness: 0.0
});

const corneaMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.15,
  roughness: 0.05,
  metalness: 0.0,
  transmission: 0.9,
  thickness: 0.01
});

const clothMat = new THREE.MeshStandardMaterial({
  color: 0x2a2a30,
  roughness: 0.9,
  metalness: 0.0
});

// ---------- HEAD CORE ----------
// Base skull - ellipsoid for accurate head proportions
const skullGeo = new THREE.SphereGeometry(0.5, 64, 64);
const skull = new THREE.Mesh(skullGeo, skinMat);
skull.scale.set(0.82, 1.05, 0.92);
skull.position.y = 1.05;
skull.castShadow = true;
skull.receiveShadow = true;
group.add(skull);

// Cranium back (occipital)
const craniumGeo = new THREE.SphereGeometry(0.42, 32, 32);
const cranium = new THREE.Mesh(craniumGeo, skinMat);
cranium.position.set(0, 1.15, -0.12);
cranium.scale.set(0.95, 1.0, 0.95);
cranium.castShadow = true;
group.add(cranium);

// ---------- FOREHEAD ----------
const foreheadGeo = new THREE.SphereGeometry(0.38, 32, 32);
const forehead = new THREE.Mesh(foreheadGeo, skinMat);
forehead.position.set(0, 1.28, 0.15);
forehead.scale.set(0.9, 0.7, 0.6);
forehead.castShadow = true;
group.add(forehead);

// ---------- BROW RIDGE ----------
const browRidgeGeo = new THREE.SphereGeometry(0.32, 24, 24);
const browRidge = new THREE.Mesh(browRidgeGeo, skinMat);
browRidge.position.set(0, 1.18, 0.22);
browRidge.scale.set(1.0, 0.4, 0.5);
browRidge.castShadow = true;
group.add(browRidge);

// ---------- CHEEKBONES ----------
const cheekboneGeo = new THREE.SphereGeometry(0.14, 20, 20);
const cheekL = new THREE.Mesh(cheekboneGeo, skinMat);
cheekL.position.set(-0.24, 1.08, 0.22);
cheekL.scale.set(1.0, 0.7, 0.9);
cheekL.castShadow = true;
group.add(cheekL);

const cheekR = new THREE.Mesh(cheekboneGeo, skinMat);
cheekR.position.set(0.24, 1.08, 0.22);
cheekR.scale.set(1.0, 0.7, 0.9);
cheekR.castShadow = true;
group.add(cheekR);

// ---------- JAW ----------
const jawGeo = new THREE.SphereGeometry(0.28, 24, 24);
const jaw = new THREE.Mesh(jawGeo, skinMat);
jaw.position.set(0, 0.88, 0.13);
jaw.scale.set(0.95, 0.6, 0.85);
jaw.castShadow = true;
group.add(jaw);

// Chin
const chinGeo = new THREE.SphereGeometry(0.1, 16, 16);
const chin = new THREE.Mesh(chinGeo, skinMat);
chin.position.set(0, 0.82, 0.28);
chin.scale.set(1.0, 0.7, 0.9);
chin.castShadow = true;
group.add(chin);

// ---------- NOSE ----------
// Bridge (upper)
const noseBridgeGeo = new THREE.SphereGeometry(0.07, 20, 20);
const noseBridge = new THREE.Mesh(noseBridgeGeo, skinMat);
noseBridge.position.set(0, 1.15, 0.32);
noseBridge.scale.set(0.7, 1.2, 1.0);
noseBridge.castShadow = true;
group.add(noseBridge);

// Mid-nose
const noseMidGeo = new THREE.SphereGeometry(0.07, 20, 20);
const noseMid = new THREE.Mesh(noseMidGeo, skinMat);
noseMid.position.set(0, 1.05, 0.36);
noseMid.scale.set(0.85, 1.0, 1.1);
noseMid.castShadow = true;
group.add(noseMid);

// Nose tip
const noseTipGeo = new THREE.SphereGeometry(0.075, 20, 20);
const noseTip = new THREE.Mesh(noseTipGeo, skinMat);
noseTip.position.set(0, 0.98, 0.42);
noseTip.scale.set(1.0, 0.9, 1.0);
noseTip.castShadow = true;
group.add(noseTip);

// Nostrils (left & right)
const nostrilGeo = new THREE.SphereGeometry(0.04, 12, 12);
const nostrilL = new THREE.Mesh(nostrilGeo, skinShadowMat);
nostrilL.position.set(-0.07, 0.96, 0.4);
nostrilL.scale.set(1.0, 0.7, 0.8);
group.add(nostrilL);

const nostrilR = new THREE.Mesh(nostrilGeo, skinShadowMat);
nostrilR.position.set(0.07, 0.96, 0.4);
nostrilR.scale.set(1.0, 0.7, 0.8);
group.add(nostrilR);

// ---------- EYES ----------
const eyeSocketGeo = new THREE.SphereGeometry(0.11, 20, 20);
const eyeballGeo = new THREE.SphereGeometry(0.095, 24, 24);
const irisGeo = new THREE.SphereGeometry(0.05, 24, 24);
const pupilGeo = new THREE.SphereGeometry(0.025, 16, 16);
const corneaGeo = new THREE.SphereGeometry(0.096, 24, 24);

function buildEye(x) {
  const eyeGroup = new THREE.Group();

  // Eye socket (dark shadow behind)
  const socket = new THREE.Mesh(eyeSocketGeo, skinShadowMat);
  socket.position.set(x * 0.98, 1.14, 0.31);
  eyeGroup.add(socket);

  // Eyeball
  const eyeball = new THREE.Mesh(eyeballGeo, scleraMat);
  eyeball.position.set(x, 1.15, 0.35);
  eyeGroup.add(eyeball);

  // Iris
  const iris = new THREE.Mesh(irisGeo, irisMat);
  iris.position.set(x, 1.15, 0.395);
  iris.scale.set(1.0, 1.0, 0.6);
  eyeGroup.add(iris);

  // Pupil
  const pupil = new THREE.Mesh(pupilGeo, pupilMat);
  pupil.position.set(x, 1.15, 0.415);
  pupil.scale.set(1.0, 1.0, 0.5);
  eyeGroup.add(pupil);

  // Cornea (glossy layer over the front of the eye)
  const cornea = new THREE.Mesh(corneaGeo, corneaMat);
  cornea.position.set(x, 1.15, 0.35);
  cornea.scale.set(1.0, 1.0, 1.0);
  eyeGroup.add(cornea);

  return eyeGroup;
}

group.add(buildEye(-0.16));
group.add(buildEye(0.16));

// Upper eyelid
const eyelidGeo = new THREE.SphereGeometry(0.1, 20, 20);
const eyelidL = new THREE.Mesh(eyelidGeo, skinMat);
eyelidL.position.set(-0.16, 1.19, 0.34);
eyelidL.scale.set(1.0, 0.55, 0.9);
eyelidL.castShadow = true;
group.add(eyelidL);

const eyelidR = new THREE.Mesh(eyelidGeo, skinMat);
eyelidR.position.set(0.16, 1.19, 0.34);
eyelidR.scale.set(1.0, 0.55, 0.9);
eyelidR.castShadow = true;
group.add(eyelidR);

// Lower eyelid
const lowerLidGeo = new THREE.SphereGeometry(0.1, 20, 20);
const lowerLidL = new THREE.Mesh(lowerLidGeo, skinMat);
lowerLidL.position.set(-0.16, 1.11, 0.34);
lowerLidL.scale.set(1.0, 0.4, 0.9);
group.add(lowerLidL);

const lowerLidR = new THREE.Mesh(lowerLidGeo, skinMat);
lowerLidR.position.set(0.16, 1.11, 0.34);
lowerLidR.scale.set(1.0, 0.4, 0.9);
group.add(lowerLidR);

// ---------- EYEBROWS ----------
const eyebrowGeo = new THREE.BoxGeometry(0.18, 0.025, 0.06);

const eyebrowL = new THREE.Mesh(eyebrowGeo, eyebrowMat);
eyebrowL.position.set(-0.16, 1.24, 0.35);
eyebrowL.rotation.z = 0.12;
eyebrowL.rotation.y = 0.15;
eyebrowL.castShadow = true;
group.add(eyebrowL);

const eyebrowR = new THREE.Mesh(eyebrowGeo, eyebrowMat);
eyebrowR.position.set(0.16, 1.24, 0.35);
eyebrowR.rotation.z = -0.12;
eyebrowR.rotation.y = -0.15;
eyebrowR.castShadow = true;
group.add(eyebrowR);

// ---------- PHILTRUM (area between nose and lips) ----------
const philtrumGeo = new THREE.SphereGeometry(0.08, 16, 16);
const philtrum = new THREE.Mesh(philtrumGeo, skinMat);
philtrum.position.set(0, 0.9, 0.36);
philtrum.scale.set(1.2, 0.7, 0.6);
group.add(philtrum);

// ---------- LIPS ----------
// Upper lip (with cupid's bow)
const upperLipGeo = new THREE.SphereGeometry(0.09, 20, 20);
const upperLip = new THREE.Mesh(upperLipGeo, lipMat);
upperLip.position.set(0, 0.855, 0.36);
upperLip.scale.set(1.4, 0.4, 0.6);
upperLip.castShadow = true;
group.add(upperLip);

// Cupid's bow hint
const cupidGeo = new THREE.SphereGeometry(0.04, 12, 12);
const cupid = new THREE.Mesh(cupidGeo, lipMat);
cupid.position.set(0, 0.87, 0.4);
cupid.scale.set(1.0, 0.6, 0.6);
group.add(cupid);

// Lower lip (fuller)
const lowerLipGeo = new THREE.SphereGeometry(0.1, 20, 20);
const lowerLip = new THREE.Mesh(lowerLipGeo, lipMat);
lowerLip.position.set(0, 0.81, 0.37);
lowerLip.scale.set(1.3, 0.5, 0.7);
lowerLip.castShadow = true;
group.add(lowerLip);

// Mouth line (dark crease between lips)
const mouthLineGeo = new THREE.BoxGeometry(0.22, 0.008, 0.02);
const mouthLine = new THREE.Mesh(mouthLineGeo, new THREE.MeshStandardMaterial({
  color: 0x3a1a15,
  roughness: 0.8
}));
mouthLine.position.set(0, 0.833, 0.4);
mouthLine.castShadow = true;
group.add(mouthLine);

// ---------- EARS ----------
function buildEar(side) {
  const earGroup = new THREE.Group();

  // Outer ear
  const outerGeo = new THREE.SphereGeometry(0.09, 20, 20);
  const outer = new THREE.Mesh(outerGeo, skinMat);
  outer.scale.set(0.35, 1.2, 0.75);
  outer.castShadow = true;
  earGroup.add(outer);

  // Inner ear (shadow)
  const innerGeo = new THREE.SphereGeometry(0.055, 16, 16);
  const inner = new THREE.Mesh(innerGeo, skinShadowMat);
  inner.position.set(0.02 * side, 0, 0.02);
  inner.scale.set(0.3, 1.1, 0.6);
  earGroup.add(inner);

  // Earlobe
  const lobeGeo = new THREE.SphereGeometry(0.04, 16, 16);
  const lobe = new THREE.Mesh(lobeGeo, skinMat);
  lobe.position.set(0, -0.1, 0);
  lobe.scale.set(0.5, 0.7, 0.8);
  lobe.castShadow = true;
  earGroup.add(lobe);

  earGroup.position.set(0.4 * side, 1.08, -0.02);
  earGroup.rotation.z = -0.12 * side;
  earGroup.rotation.y = 0.2 * side;

  return earGroup;
}

group.add(buildEar(-1));
group.add(buildEar(1));

// ---------- HAIR ----------
// Cap on top of skull
const hairCapGeo = new THREE.SphereGeometry(0.46, 32, 32);
const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
hairCap.position.set(0, 1.16, -0.02);
hairCap.scale.set(0.92, 0.65, 0.98);
hairCap.castShadow = true;
hairCap.receiveShadow = true;
group.add(hairCap);

// Hairline (front)
const hairlineGeo = new THREE.SphereGeometry(0.36, 24, 24);
const hairline = new THREE.Mesh(hairlineGeo, hairMat);
hairline.position.set(0, 1.34, 0.1);
hairline.scale.set(0.95, 0.4, 0.9);
hairline.castShadow = true;
group.add(hairline);

// Hair sides
const hairSideGeo = new THREE.SphereGeometry(0.14, 20, 20);
const hairSideL = new THREE.Mesh(hairSideGeo, hairMat);
hairSideL.position.set(-0.38, 1.15, -0.05);
hairSideL.scale.set(0.6, 1.4, 1.0);
hairSideL.castShadow = true;
group.add(hairSideL);

const hairSideR = new THREE.Mesh(hairSideGeo, hairMat);
hairSideR.position.set(0.38, 1.15, -0.05);
hairSideR.scale.set(0.6, 1.4, 1.0);
hairSideR.castShadow = true;
group.add(hairSideR);

// Hair back
const hairBackGeo = new THREE.SphereGeometry(0.4, 24, 24);
const hairBack = new THREE.Mesh(hairBackGeo, hairMat);
hairBack.position.set(0, 1.1, -0.22);
hairBack.scale.set(0.92, 1.05, 0.75);
hairBack.castShadow = true;
group.add(hairBack);

// ---------- NECK ----------
const neckGeo = new THREE.CylinderGeometry(0.2, 0.26, 0.5, 24);
const neck = new THREE.Mesh(neckGeo, skinMat);
neck.position.y = 0.5;
neck.castShadow = true;
neck.receiveShadow = true;
group.add(neck);

// Adam's apple hint
const adamGeo = new THREE.SphereGeometry(0.05, 12, 12);
const adam = new THREE.Mesh(adamGeo, skinMat);
adam.position.set(0, 0.7, 0.22);
adam.scale.set(0.9, 1.0, 0.7);
group.add(adam);

// ---------- SHOULDERS ----------
const shouldersGeo = new THREE.CylinderGeometry(0.75, 0.85, 0.4, 24);
const shoulders = new THREE.Mesh(shouldersGeo, clothMat);
shoulders.position.y = 0.08;
shoulders.castShadow = true;
shoulders.receiveShadow = true;
group.add(shoulders);

// Chest
const chestGeo = new THREE.CylinderGeometry(0.6, 0.75, 0.4, 20);
const chest = new THREE.Mesh(chestGeo, clothMat);
chest.position.y = -0.2;
chest.castShadow = true;
chest.receiveShadow = true;
group.add(chest);

// Collar
const collarGeo = new THREE.TorusGeometry(0.42, 0.05, 12, 32);
const collar = new THREE.Mesh(collarGeo, new THREE.MeshStandardMaterial({
  color: 0x1a1a20,
  roughness: 0.7,
  metalness: 0.05
}));
collar.position.y = 0.28;
collar.rotation.x = Math.PI * 0.5;
collar.castShadow = true;
group.add(collar);

// ---------- PEDESTAL ----------
const pedestalGeo = new THREE.CylinderGeometry(0.7, 0.75, 0.2, 32);
const pedestal = new THREE.Mesh(pedestalGeo, new THREE.MeshStandardMaterial({
  color: 0x3a3a45,
  roughness: 0.35,
  metalness: 0.4
}));
pedestal.position.y = -0.5;
pedestal.castShadow = true;
pedestal.receiveShadow = true;
group.add(pedestal);

const pedestalTrimGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.04, 32);
const pedestalTrim = new THREE.Mesh(pedestalTrimGeo, new THREE.MeshStandardMaterial({
  color: 0x1a1a25,
  roughness: 0.2,
  metalness: 0.7
}));
pedestalTrim.position.y = -0.39;
pedestalTrim.castShadow = true;
group.add(pedestalTrim);

// ---------- ADD TO SCENE ----------
setModel(group);
setStatus('✅ Realistic human head loaded!');