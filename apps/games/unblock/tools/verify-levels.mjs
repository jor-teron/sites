/**
 * Re-verify assets/levels.json: uniqueness + each par matches BFS solve.
 * Prints par histogram per 100-level band.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'assets', 'levels.json');

const { solve, layoutKey } = await import(pathToFileURL(path.join(ROOT, 'core/solver.js')).href);

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
console.log(`Loaded ${data.levels.length} levels (seed=${data.seed})`);

function expand(c) {
    return c.map(b => ({
        id: b.id, x: b.x, y: b.y, length: b.len, orientation: b.o, isPlayer: !!b.p
    }));
}

const seen = new Set();
let mismatches = 0;
let unsolvable = 0;
const hist = Array.from({ length: 10 }, () => ({ min: Infinity, max: 0, sum: 0, n: 0 }));

for (let i = 0; i < data.levels.length; i++) {
    const entry = data.levels[i];
    const blocks = expand(entry.blocks);
    const key = layoutKey(blocks);
    if (seen.has(key)) {
        console.error(`DUPLICATE layout at level ${i}`);
        process.exit(1);
    }
    seen.add(key);

    const result = solve(blocks, { maxNodes: 250000, timeLimitMs: 4000 });
    if (!result.solvable) {
        unsolvable++;
        console.error(`UNSOLVABLE level ${i}`);
        continue;
    }
    if (result.moves !== entry.par) {
        mismatches++;
        if (mismatches <= 10) {
            console.error(`PAR MISMATCH level ${i}: file=${entry.par} solved=${result.moves}`);
        }
    }
    const bi = Math.floor(i / 100);
    const h = hist[bi];
    const par = entry.par;
    h.min = Math.min(h.min, par);
    h.max = Math.max(h.max, par);
    h.sum += par;
    h.n++;

    if ((i + 1) % 100 === 0) console.log(`  checked ${i + 1}…`);
}

console.log('\nPar histogram by band (from file):');
for (let i = 0; i < 10; i++) {
    const h = hist[i];
    console.log(
        `  ${String(i * 100).padStart(3, '0')}-${String(i * 100 + 99).padStart(3, '0')}: ` +
        `n=${h.n} min=${h.min} max=${h.max} avg=${(h.sum / h.n).toFixed(1)}`
    );
}
console.log(`\nUnique: ${seen.size}/${data.levels.length}`);
console.log(`Par mismatches: ${mismatches}, unsolvable: ${unsolvable}`);
process.exit(mismatches || unsolvable ? 1 : 0);
