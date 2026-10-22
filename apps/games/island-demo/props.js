import { mapData } from "./map.js";
import { createPalm } from "./objects/palm.js";
import { createCoconut } from "./objects/coconut.js";
import { createRock } from "./objects/rock.js";

const makers = {
  palm: createPalm,
  coconut: createCoconut,
  rock: createRock
};

export function createProps(scene) {
  const placed = [];
  for (const item of mapData.props) {
    const make = makers[item.type];
    if (!make) continue;
    const mesh = make();
    mesh.position.set(item.x, 0, item.z);
    mesh.rotation.y = item.rot || 0;
    mesh.userData.prop = item;
    scene.add(mesh);
    placed.push(mesh);
  }
  return placed;
}
