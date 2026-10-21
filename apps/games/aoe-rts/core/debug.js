/** AOE RTS - window.aoeTest test hook (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
function mapHash() { let h = 2166136261; for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) { const k = mapData[y][x] && mapData[y][x].kind !== 'fish' ? mapData[y][x] : null;   // R2a layout hash (animals excluded)
    const s = (k ? k.kind[0] + k.max : '.') + (water[y * MAP_SIZE + x] ? 'w' : ''); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; } return h.toString(16); }
/** Test hook: generate any map number (only valid for numbers with this page's size) without touching the scene */
window.aoeTest = {
    MAP_NUM, MAP_SIZE, mapSizeFor, mapHash, fairStartCounts,
    gen(n) { const sv = [mapData, townCenter, MAP_SIZE, water, deer, rock, hill, ford, ground]; MAP_SIZE = mapSizeFor(n); initMap(n); initWater(n); initTerrain(n); initAnimals(n); const r = { hash: mapHash(), thash: terrainHash(), terrain: terrainReport(), fair: fairStartCounts(), tc: Object.assign({}, townCenter), reach: reachReport(), animals: animalReport() }; r.size = MAP_SIZE; [mapData, townCenter, MAP_SIZE, water, deer, rock, hill, ford, ground] = sv; return r; },
    get villagers() { return villagers; }, get resources() { return resources; }, orderGather: (v, x, y) => orderGather(v, x, y), findNearest,
    get speed() { return speed; }, setSpeed: n => setSpeed(n), get water() { return water; }, get townCenter() { return townCenter; }, get mapData() { return mapData; },
    reachReport, isLand, tileCenter, findPath: (a, b, c, d) => findPath(a, b, c, d), orderMove: (v, x, y) => orderMove(v, x, y), pathStats: null, spawnVillager: (x, y) => spawnVillager(x, y),
    get deer() { return deer; }, terrainReport, terrainHash, get rock() { return rock; }, get ford() { return ford; }, get hill() { return hill; }, animalReport, orderHunt: (v, d) => orderHunt(v, d)
};
