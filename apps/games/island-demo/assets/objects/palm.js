import * as THREE from "three";

export const palm = {
  id: "palm",
  height: 4.2
};

export function createPalm() {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#8a6a45", roughness: 0.85 });
  const leafMat = new THREE.MeshStandardMaterial({ color: "#2f8f4e", roughness: 0.7 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 3.2, 7), trunkMat);
  trunk.position.y = 1.6;
  trunk.rotation.z = 0.08;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.6, 4), leafMat);
    leaf.position.y = 3.15;
    leaf.rotation.z = 1.15;
    leaf.rotation.y = (i / 6) * Math.PI * 2;
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}
