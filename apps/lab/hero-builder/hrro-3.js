// build-hero.mjs
import { Document, NodeIO } from '@gltf-transform/core'
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions'

const doc = new Document()
const buffer = doc.createBuffer()

// ---- Scene ----
const scene = doc.createScene('HeroScene')

// ---- Material helper ----
function makeMaterial(name, color, metallic = 0, roughness = 0.6, emissive = null) {
  const mat = doc.createMaterial(name)
    .setBaseColorFactor(color)
    .setMetallicFactor(metallic)
    .setRoughnessFactor(roughness)
  if (emissive) mat.setEmissiveFactor(emissive)
  return mat
}

const skinMat    = makeMaterial('Skin',    [0.91, 0.72, 0.54, 1], 0, 0.7)
const armorBlue  = makeMaterial('ArmorBlue', [0.16, 0.35, 0.84, 1], 0.3, 0.5)
const armorRed   = makeMaterial('ArmorRed',  [0.83, 0.23, 0.16, 1], 0.8, 0.3)
const darkMat    = makeMaterial('Dark',     [0.10, 0.10, 0.18, 1], 0.6, 0.5)
const eyeMat     = makeMaterial('Eye',      [0.0, 0.9, 1.0, 1],   0, 0.2, [0, 0.5, 1])

// ---- Box mesh helper ----
function makeBox(name, size, position, material) {
  const [w, h, d] = size
  const [x, y, z] = position
  const hw = w / 2, hh = h / 2, hd = d / 2

  // 8 corners
  const positions = new Float32Array([
    -hw,-hh,-hd,  hw,-hh,-hd,  hw, hh,-hd, -hw, hh,-hd, // back
    -hw,-hh, hd,  hw,-hh, hd,  hw, hh, hd, -hw, hh, hd, // front
  ])

  // 12 triangles (36 indices)
  const indices = new Uint16Array([
    0,1,2, 0,2,3,       // back
    4,6,5, 4,7,6,       // front
    0,4,5, 0,5,1,       // bottom
    3,2,6, 3,6,7,       // top
    0,3,7, 0,7,4,       // left
    1,5,6, 1,6,2,       // right
  ])

  // Normals per vertex (simplified: point outward from center)
  const normals = new Float32Array(24)
  for (let i = 0; i < 8; i++) {
    const px = positions[i*3], py = positions[i*3+1], pz = positions[i*3+2]
    const len = Math.hypot(px, py, pz) || 1
    normals[i*3]   = px / len
    normals[i*3+1] = py / len
    normals[i*3+2] = pz / len
  }

  const posAcc = doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer)
  const nrmAcc = doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer)
  const idxAcc = doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer)

  const prim = doc.createPrimitive()
    .setAttribute('POSITION', posAcc)
    .setAttribute('NORMAL', nrmAcc)
    .setIndices(idxAcc)
    .setMaterial(material)

  const mesh = doc.createMesh(name).addPrimitive(prim)
  const node = doc.createNode(name).setMesh(mesh).setTranslation([x, y, z])
  return node
}

// ---- Build the hero from parts ----
const parts = [
  makeBox('Torso',       [0.9, 1.1, 0.5],  [0,   1.2,  0],    armorBlue),
  makeBox('ChestArmor',  [0.95, 0.6, 0.15],[0,   1.4,  0.28], armorRed),
  makeBox('Head',        [0.55, 0.55, 0.55],[0,  2.05, 0],    skinMat),
  makeBox('Helmet',      [0.65, 0.35, 0.65],[0,  2.25, 0],    darkMat),
  makeBox('EyeL',        [0.08, 0.08, 0.02],[-0.14, 2.08, 0.29], eyeMat),
  makeBox('EyeR',        [0.08, 0.08, 0.02],[ 0.14, 2.08, 0.29], eyeMat),
  makeBox('ArmL_Upper',  [0.28, 0.95, 0.28],[-0.65, 1.35, 0], armorBlue),
  makeBox('ArmL_Hand',   [0.32, 0.32, 0.32],[-0.65, 0.75, 0], skinMat),
  makeBox('ArmR_Upper',  [0.28, 0.95, 0.28],[ 0.65, 1.35, 0], armorBlue),
  makeBox('ArmR_Hand',   [0.32, 0.32, 0.32],[ 0.65, 0.75, 0], skinMat),
  makeBox('LegL',        [0.32, 1.0, 0.32], [-0.25, 0.25, 0], darkMat),
  makeBox('LegR',        [0.32, 1.0, 0.32], [ 0.25, 0.25, 0], darkMat),
]

// Wrap in a root node
const root = doc.createNode('HeroRoot')
parts.forEach(p => root.addChild(p))
scene.addChild(root)

// ---- Write the .glb ----
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS)
await io.write('hero.glb', doc)
console.log('✅ Wrote hero.glb')