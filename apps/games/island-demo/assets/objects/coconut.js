import * as THREE from "three";

export const coconut = {
  id: "coconut",
  height: 3.4
};

export function createCoconut() {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#6e5438", roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: "#3d9a55", roughness: 0.7 });
  const nutMat = new THREE.MeshStandardMaterial({ color: "#6b4a2a", roughness: 0.8 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.4, 7), trunkMat);
  trunk.position.y = 1.2;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 4), leafMat);
    leaf.scale.set(1.4, 0.22, 0.45);
    leaf.position.set(Math.cos(i) * 0.35, 2.45, Math.sin(i) * 0.35);
    leaf.castShadow = true;
    g.add(leaf);
  }
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), nutMat);
    nut.position.set(Math.cos(i * 2) * 0.12, 2.15, Math.sin(i * 2) * 0.12);
    g.add(nut);
  }
  return g;
}
