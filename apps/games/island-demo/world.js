import * as THREE from "three";
import { mapData } from "./map.js";

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#8ec8ea");
  scene.fog = new THREE.Fog("#8ec8ea", 28, 55);

  const hemi = new THREE.HemisphereLight("#f3fbff", "#c4a574", 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff4df", 1.35);
  sun.position.set(-8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  scene.add(sun);

  const half = mapData.bounds / 2;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(mapData.bounds, mapData.bounds),
    new THREE.MeshStandardMaterial({
      color: "#1f9eb8",
      roughness: 0.25,
      metalness: 0.05
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.receiveShadow = true;
  scene.add(water);

  const sand = new THREE.Mesh(
    new THREE.CircleGeometry(mapData.islandRadius, 64),
    new THREE.MeshStandardMaterial({ color: "#e4cf9e", roughness: 0.95 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = 0.02;
  sand.receiveShadow = true;
  scene.add(sand);

  const shore = new THREE.Mesh(
    new THREE.RingGeometry(mapData.islandRadius - 0.18, mapData.islandRadius + 0.08, 64),
    new THREE.MeshStandardMaterial({ color: "#f3e7c4", roughness: 1 })
  );
  shore.rotation.x = -Math.PI / 2;
  shore.position.y = 0.03;
  scene.add(shore);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(mapData.bounds, mapData.bounds)),
    new THREE.LineBasicMaterial({ color: "#0e3c48" })
  );
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.04;
  scene.add(edge);

  return { scene, sun, half };
}
