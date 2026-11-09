/**
 * Unblock UNB-1 — offline level generator.
 * Writes apps/games/unblock/assets/levels.json (1000 unique BFS-verified puzzles).
 *
 *   node apps/games/unblock/tools/gen-levels.mjs
 *
 * Reverse-BFS from won boards, sample per depth, verify true par, assign
 * hardest bands first. Deterministic seed. H-blocks on the red row allowed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'levels.json');

const { solve, layoutKey, serializeBlocks } = await import(
    pathToFileURL(path.join(ROOT, 'core/solver.js')).href
);
const { GameLogic } = await import(pathToFileURL(path.join(ROOT, 'core/gameLogic.js')).href);
const { createRNG } = await import(pathToFileURL(path.join(ROOT, 'core/seedrandom.js')).href);

const SEED = 20261109;
const TOTAL = 1000;
const SIZE = 6;
const PLAYER_ROW = 2;

const BANDS = [
    [3, 8],
    [5, 11],
    [7, 13],
    [9, 15],
    [11, 17],
    [13, 19],
    [15, 21],
    [17, 23],
    [19, 26],
    [20, 48]
];

function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
}
function mark(grid, b, val) {
    for (let i = 0; i < b.length; i++) {
        const cx = b.orientation === 'h' ? b.x + i : b.x;
        const cy = b.orientation === 'h' ? b.y : b.y + i;
        if (cy >= 0 && cy < SIZE && cx >= 0 && cx < SIZE) grid[cy][cx] = val;
    }
}
function canPlace(grid, x, y, length, o) {
    for (let i = 0; i < length; i++) {
        const cx = o === 'h' ? x + i : x;
        const cy = o === 'h' ? y : y + i;
        if (cy < 0 || cy >= SIZE || cx < 0 || cx >= SIZE || grid[cy][cx]) return false;
    }
    return true;
}

function winningSeed(rng, obstacles) {
    const player = {
        id: 'player', x: 4, y: PLAYER_ROW, length: 2, orientation: 'h', isPlayer: true
    };
    const grid = emptyGrid();
    mark(grid, player, true);
    grid[PLAYER_ROW][3] = true;
    grid[PLAYER_ROW][2] = true;
    if (rng() < 0.45) grid[PLAYER_ROW][1] = true;
    const blocks = [player];
    let id = 1, guard = 0;
    while (blocks.length - 1 < obstacles && guard++ < 700) {
        const length = rng() < 0.5 ? 2 : 3;
        const o = rng() < 0.38 ? 'h' : 'v';
        let x, y;
        if (o === 'h') {
            x = Math.floor(rng() * (SIZE - length + 1));
            y = Math.floor(rng() * SIZE);
        } else {
            x = Math.floor(rng() * SIZE);
            y = Math.floor(rng() * (SIZE - length + 1));
        }
        if (!canPlace(grid, x, y, length, o)) continue;
        const b = { id: `b${id++}`, x, y, length, orientation: o, isPlayer: false };
        mark(grid, b, true);
        blocks.push(b);
    }
    grid[PLAYER_ROW][3] = false;
    grid[PLAYER_ROW][2] = false;
    grid[PLAYER_ROW][1] = false;
    return blocks;
}

function neighbors(blocks) {
    const game = new GameLogic(blocks);
    const out = [];
    const seen = new Set();
    for (const block of blocks) {
        for (const dir of [-1, 1]) {
            const extent = game.getValidDeltaRange(block.id, dir * (SIZE + 1));
            if (!extent) continue;
            const step = extent > 0 ? 1 : -1;
            for (let d = step; step > 0 ? d <= extent : d >= extent; d += step) {
                const next = blocks.map(b => b.id !== block.id ? { ...b } : {
                    ...b,
                    x: b.orientation === 'h' ? b.x + d : b.x,
                    y: b.orientation === 'v' ? b.y + d : b.y
                });
                const k = serializeBlocks(next);
                if (seen.has(k)) continue;
                seen.add(k);
                out.push(next);
            }
        }
    }
    return out;
}

/** Per-depth capped samples so deep states are not crowded out by depth-12. */
function collectCandidates(seed, maxDepth, maxStates) {
    const depthOf = new Map([[serializeBlocks(seed), 0]]);
    const queue = [seed];
    let head = 0;
    const perDepth = new Map();
    const candidates = [];
    while (head < queue.length && depthOf.size < maxStates) {
        const cur = queue[head++];
        const d = depthOf.get(serializeBlocks(cur));
        if (d >= maxDepth) continue;
        for (const next of neighbors(cur)) {
            const nk = serializeBlocks(next);
            if (depthOf.has(nk)) continue;
            const nd = d + 1;
            depthOf.set(nk, nd);
            queue.push(next);
            if (nd < 3 || new GameLogic(next).isWon()) continue;
            const n = perDepth.get(nd) || 0;
            const cap = nd >= 18 ? 8 : nd >= 12 ? 6 : 4;
            if (n < cap) {
                perDepth.set(nd, n + 1);
                candidates.push({ depth: nd, blocks: next.map(b => ({ ...b })) });
            }
        }
    }
    return candidates;
}

function compact(blocks) {
    const player = blocks.find(b => b.isPlayer);
    const others = blocks.filter(b => !b.isPlayer).sort((a, b) =>
        a.orientation.localeCompare(b.orientation) || a.length - b.length || a.y - b.y || a.x - b.x
    );
    const out = [{ id: 'player', x: player.x, y: player.y, len: player.length, o: player.orientation, p: 1 }];
    others.forEach((b, i) => out.push({ id: `b${i + 1}`, x: b.x, y: b.y, len: b.length, o: b.orientation, p: 0 }));
    return out;
}

console.log(`UNB-1 level gen seed=${SEED}`);
const t0 = Date.now();
const pool = new Map();
const parHist = new Map();

function addVerified(blocks) {
    const key = layoutKey(blocks);
    if (pool.has(key)) return null;
    const verified = solve(blocks, { maxNodes: 250000, timeLimitMs: 3000 });
    if (!verified.solvable || verified.moves < 3) return null;
    pool.set(key, { par: verified.moves, blocks, key });
    parHist.set(verified.moves, (parHist.get(verified.moves) || 0) + 1);
    return verified.moves;
}

const maxSeeds = 500;
for (let seedAttempt = 0; seedAttempt < maxSeeds; seedAttempt++) {
    const rng = createRNG(SEED + seedAttempt * 7919);
    const seed = winningSeed(rng, 7 + Math.floor(rng() * 6));
    if (seed.length < 7) continue;

    const candidates = collectCandidates(seed, 48, 90000);
    // Verify deepest first, then a spread of mid/shallow
    candidates.sort((a, b) => b.depth - a.depth);
    const deep = candidates.filter(c => c.depth >= 12).slice(0, 24);
    const mid = candidates.filter(c => c.depth >= 6 && c.depth < 12).slice(0, 10);
    const shallow = candidates.filter(c => c.depth < 6).slice(0, 6);
    for (const c of [...deep, ...mid, ...shallow]) addVerified(c.blocks);

    if ((seedAttempt + 1) % 15 === 0) {
        const maxP = Math.max(0, ...parHist.keys());
        const buckets = { '3-8': 0, '9-12': 0, '13-16': 0, '17-20': 0, '21+': 0 };
        for (const [p, n] of parHist) {
            const b = p <= 8 ? '3-8' : p <= 12 ? '9-12' : p <= 16 ? '13-16' : p <= 20 ? '17-20' : '21+';
            buckets[b] += n;
        }
        console.log(
            `  seeds=${seedAttempt + 1} pool=${pool.size} maxPar=${maxP} ` +
            `${JSON.stringify(buckets)} ${((Date.now() - t0) / 1000).toFixed(1)}s`
        );
        const byBand = BANDS.map(([lo, hi]) =>
            [...pool.values()].filter(c => c.par >= lo && c.par <= hi).length
        );
        if (byBand.every(n => n >= 110)) {
            console.log('  early stop', byBand.join(' '));
            break;
        }
        if (seedAttempt >= 250 && byBand.slice(0, 5).every(n => n >= 110) && maxP >= 20 && buckets['17-20'] + buckets['21+'] >= 120) {
            console.log('  practical stop', byBand.join(' '));
            break;
        }
    }
}

console.log('Par distribution:');
[...parHist.entries()].sort((a, b) => a[0] - b[0]).forEach(([p, n]) => console.log(`  par ${p}: ${n}`));

const used = new Set();
const levels = new Array(TOTAL);
const hist = Array.from({ length: 10 }, () => ({ min: Infinity, max: 0, sum: 0, n: 0 }));

for (let bi = 9; bi >= 0; bi--) {
    const [lo, hi] = BANDS[bi];
    let softLo = lo, softHi = hi, eligible = [];
    while (true) {
        eligible = [...pool.values()]
            .filter(c => !used.has(c.key) && c.par >= softLo && c.par <= softHi)
            .sort((a, b) => a.par - b.par || a.key.localeCompare(b.key));
        if (eligible.length >= 100 || (softLo <= 3 && softHi >= 60)) break;
        softLo = Math.max(3, softLo - 1);
        softHi = Math.min(60, softHi + 1);
    }
    if (eligible.length < 100) {
        console.error(`Band ${bi} only ${eligible.length} (window ${softLo}-${softHi}) pool=${pool.size}`);
        process.exit(1);
    }
    if (softLo !== lo || softHi !== hi) console.log(`Band ${bi}: softened ${lo}-${hi} → ${softLo}-${softHi}`);

    const picked = [];
    for (let i = 0; i < 100; i++) {
        const t = i / 99;
        const bias = bi >= 7 ? Math.pow(t, 0.65) : t;
        const idx = Math.min(eligible.length - 1, Math.floor(bias * (eligible.length - 1)));
        let j = idx;
        while (j < eligible.length && used.has(eligible[j].key)) j++;
        if (j >= eligible.length) j = eligible.findIndex(c => !used.has(c.key));
        if (j < 0) { console.error(`Band ${bi} exhausted`); process.exit(1); }
        used.add(eligible[j].key);
        picked.push(eligible[j]);
    }
    picked.sort((a, b) => a.par - b.par || a.key.localeCompare(b.key));
    for (let i = 0; i < 100; i++) {
        const c = picked[i];
        levels[bi * 100 + i] = { par: c.par, blocks: compact(c.blocks) };
        const h = hist[bi];
        h.min = Math.min(h.min, c.par); h.max = Math.max(h.max, c.par); h.sum += c.par; h.n++;
    }
    console.log(`Band ${bi}: par ${picked[0].par}..${picked[99].par}`);
}

fs.writeFileSync(OUT, JSON.stringify({
    version: 1, seed: SEED, grid: SIZE, count: TOTAL,
    generated: new Date().toISOString(), levels
}));

console.log('\nPar histogram by band:');
for (let i = 0; i < 10; i++) {
    const h = hist[i];
    console.log(
        `  ${String(i * 100).padStart(3, '0')}-${String(i * 100 + 99).padStart(3, '0')}: ` +
        `n=${h.n} min=${h.min} max=${h.max} avg=${(h.sum / h.n).toFixed(1)} target=${BANDS[i][0]}-${BANDS[i][1]}`
    );
}
console.log(`\nWrote ${OUT} (${fs.statSync(OUT).size} bytes)`);
console.log(`Elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
