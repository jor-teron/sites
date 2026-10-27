// LandCraft LC4: water helpers.
// - isWater(world, x, y, z): is the block cell containing world point (x, y, z) water?
// - setupUnderwater(o): when the camera is inside water, swap the sky fog for a short blue fog, tint the
//   screen (#underwater overlay) and colour the background; switch back on leaving. setDry(near, far)
//   records the normal fog (it follows the render distance), update(world, camPos) runs once per frame.
// Swimming physics lives in player.js; water drawing (both sides, drawn before glass) in chunk.js.
import { WATER } from './blocks.js';

export function isWater(world, x, y, z) { return world.get(Math.floor(x), Math.floor(y), Math.floor(z)) === WATER; }

const UNDER = { color: 0x1d4c86, near: 0.5, far: 14 };

export function setupUnderwater(o) { // o: { scene, sky, canvas }
  const tint = document.createElement('div');
  tint.id = 'underwater'; tint.hidden = true;
  const c = o.canvas; c.parentNode.insertBefore(tint, c.nextSibling); // right above the 3D view, under the HUD
  let under = false, dry = { near: o.scene.fog.near, far: o.scene.fog.far };
  function apply() {
    const f = o.scene.fog;
    if (under) { f.color.setHex(UNDER.color); f.near = UNDER.near; f.far = UNDER.far; o.scene.background.setHex(UNDER.color); }
    else { f.color.setHex(o.sky); f.near = dry.near; f.far = dry.far; o.scene.background.setHex(o.sky); }
    tint.hidden = !under;
  }
  return {
    setDry: function (near, far) { dry = { near: near, far: far }; apply(); },
    update: function (world, cam) {
      const u = !!world && isWater(world, cam.x, cam.y, cam.z);
      if (u !== under) { under = u; apply(); }
    },
    isUnder: function () { return under; }
  };
}
