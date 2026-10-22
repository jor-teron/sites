import * as THREE from "three";

export const rock = {
  id: "rock",
  height: 0.7
};

export function createRock() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#9a958c", roughness: 0.95 });
  const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), mat);
  stone.scale.set(1.3, 0.7, 1);
  stone.position.y = 0.28;
  stone.castShadow = true;
  stone.receiveShadow = true;
  g.add(stone);
  return g;
}
