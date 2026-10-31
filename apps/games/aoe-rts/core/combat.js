/** AOE RTS - ARQ1b combat: HP, melee attacks, auto-retaliate / auto-aggro, destruction, win / lose (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order).
 *  Units (villagers + militia) live in `villagers`; buildings are Town Centers (tcs, .w) and houses / barracks (houses, .progress). */
let gameOver = null, aggroT = 0;
const isBld = e => !!e.w || e.progress !== undefined;
function maxHp(e) { return e.w ? HP.tc : isBld(e) ? (e.type ? HP.barracks : HP.house) : e.mil ? HP.mil : HP.v; }
function hpOf(e) { if (e.hp == null) e.hp = maxHp(e); return e.hp; }
function posOf(e) { return isBld(e) ? tileCenter(e.x + (e.w ? 0.5 : 0), e.y + (e.w ? 0.5 : 0)) : e; }
const reachOf = e => e.w ? 120 : isBld(e) ? 64 : MELEE_R;
function orderAttack(v, e) { v.house = null; v.prey = null; v.node = null; v.foe = e; v.state = 'attack'; v.route = null; v.timer = 0; }
/** Nearest enemy unit within r (iso px); then enemy buildings unless unitsOnly */
function nearestFoe(v, r, unitsOnly) {
    let best = null, bd = r; const o = own(v);
    villagers.forEach(u => { if (own(u) === o) return; const d = isoDist(v.x, v.y, u.x, u.y); if (d < bd) { bd = d; best = u; } });
    if (!best && !unitsOnly) [...tcs, ...houses].forEach(b => { if (own(b) === o) return; const p = posOf(b), d = isoDist(v.x, v.y, p.x, p.y) - reachOf(b); if (d < bd) { bd = d; best = b; } });
    return best;
}
function hurt(e, dmg, by) {
    e.hp = hpOf(e) - dmg; e.hitT = animT;
    if (!isBld(e) && by && e.state !== 'attack' && e.hp > 0) orderAttack(e, by);   // units hit back
    if (e.hp > 0) return;
    e.dead = true; e.selected = false; Sfx.play('hunt', 0.5);
    if (!isBld(e)) { villagers = villagers.filter(u => u !== e); return; }
    if (e.w) { tcs = tcs.filter(t => t !== e); for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) mapData[y][x] = null; return; }
    houses = houses.filter(h => h !== e); if (mapData[e.y][e.x] && mapData[e.y][e.x].house === e) mapData[e.y][e.x] = null;
    villagers.forEach(u => { if (u.house === e) { u.house = null; u.state = 'idle'; } });
}
/** 'attack' state: walk into reach, then hit every ATK_RATE s; militia en route to a building switch to a close enemy unit */
function fight(v, dt) {
    const e = v.foe;
    if (!e || e.dead) { v.foe = null; const n = v.mil && nearestFoe(v, AGGRO_R); if (n) orderAttack(v, n); else v.state = 'idle'; return; }
    const p = posOf(e), d = isoDist(v.x, v.y, p.x, p.y), reach = reachOf(e);
    v.swing = d <= reach;
    if (!v.swing) {
        if (isBld(e) && v.mil) { const u = nearestFoe(v, 180, true); if (u) { v.foe = u; return; } }
        if (!v.mil && !isBld(e) && d > 420) { v.foe = null; v.state = 'idle'; return; }   // villagers don't chase far
        const k = Math.max(1, Math.hypot(v.x - p.x, v.y - p.y)), r = isBld(e) ? reach - 24 : 0;
        stepTo(v, { x: p.x + (v.x - p.x) / k * r, y: p.y + (v.y - p.y) / k * r / 2 }, dt, isBld(e) ? 12 : MELEE_R / 2); v.timer = 0; return;
    }
    if (Math.abs(p.x - v.x) > 1) v.face = p.x > v.x ? 1 : -1;
    if ((v.timer += dt) >= ATK_RATE) { v.timer -= ATK_RATE; hurt(e, v.mil ? ATK.mil : ATK.v, v); Sfx.play('chop', 0.25); }
}
/** Twice a second: idle militia attack enemies in AGGRO_R, idle villagers fight enemy units right next to them; then check win / lose */
function updateCombat(dt) {
    if (MODE === 'open' || gameOver || (aggroT += dt) < 0.5) return; aggroT = 0;
    villagers.forEach(v => { if (v.state !== 'idle') return; const n = nearestFoe(v, v.mil ? AGGRO_R : 110, !v.mil); if (n) orderAttack(v, n); });
    const ids = ['p', ...Object.keys(factions)].filter(o => o !== 'p' || MODE === 'vs');
    if (ids.length < 2) return;
    const live = ids.filter(o => tcOf(o) || villagers.some(v => own(v) === o));
    if (live.length > 1) return;
    gameOver = MODE === 'vs' ? (live[0] === 'p' ? 'win' : 'lose') : (live[0] || 'none');
    showEnd(gameOver);
}
