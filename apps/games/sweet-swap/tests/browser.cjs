/* Run with puppeteer-core available: NODE_PATH=/path/to/node_modules node .../tests/browser.cjs
 * Serve repository on 127.0.0.1:8825 first. Optional SWAP_SHOTS points outside the repo. */
'use strict';
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const url = 'http://127.0.0.1:8825/apps/games/sweet-swap/sweet-swap.html';
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  let checks = 0;
  const pass = name => { console.log(`PASS ${++checks} ${name}`); };
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('sweet-swap.save')));
  const move = () => page.evaluate(() => SweetRules.findMove(JSON.parse(localStorage.getItem('sweet-swap.save')).board));
  const point = async i => page.$eval(`[data-cell="${i}"]`, e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  async function click(i) { const p = await point(i); await page.mouse.click(p.x, p.y); }
  async function settled(moves) {
    await page.waitForFunction(n => document.getElementById('board').getAttribute('aria-busy') === 'false' &&
      JSON.parse(localStorage.getItem('sweet-swap.save')).moves === n, { timeout: 15000 }, moves);
  }
  async function fixture(options) {
    await page.evaluate(opts => {
      const s = SweetProgress.fresh(opts.level || 1); Object.assign(s, opts);
      localStorage.setItem('sweet-swap.save', JSON.stringify(s));
    }, options);
    await page.reload({ waitUntil: 'networkidle0' });
  }
  async function layout(width, height, touch = false) {
    await page.setViewport({ width, height, deviceScaleFactor: 3, isMobile: touch, hasTouch: touch });
    await page.waitForFunction(() => document.getElementById('board').clientWidth > 10);
    const rect = await page.evaluate(() => {
      const b = document.getElementById('board').getBoundingClientRect();
      const main = document.querySelector('main');
      return { x: b.x, y: b.y, w: b.width, h: b.height, pageW: document.documentElement.scrollWidth,
        pageH: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight,
        controls: [...main.querySelectorAll('button:not(.cell),select,a')].map(e => {
          const r = e.getBoundingClientRect(); return [r.x, r.y, r.right, r.bottom];
        }) };
    });
    assert.equal(rect.w, rect.h); assert.ok(rect.w >= 200, JSON.stringify(rect));
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= width && rect.y + rect.h <= height, JSON.stringify(rect));
    assert.equal(rect.pageW, rect.vw); assert.equal(rect.pageH, rect.vh);
    for (const r of rect.controls) assert.ok(r[0] >= 0 && r[1] >= 0 && r[2] <= width && r[3] <= height, JSON.stringify(r));
    if (process.env.SWAP_SHOTS) await page.screenshot({ path: `${process.env.SWAP_SHOTS}/${width}x${height}.png` });
  }
  try {
    await page.setViewport({ width: 1100, height: 850 });
    await page.goto(url, { waitUntil: 'networkidle0' });
    assert.equal(await page.title(), 'Sweet Swap SWAP-1a');
    assert.equal(await page.$$eval('.cell', c => c.length), 64);
    assert.equal(await page.evaluate(() => GameSettings.get('theme')), 'auto');
    assert.equal(await page.evaluate(() => SweetRules.findMatches(JSON.parse(localStorage.getItem('sweet-swap.save')).board).length), 0);
    pass('fresh playable board and Auto default');
    await layout(390, 844, true); pass('390x844 portrait at DPR 3 fits with no page scroll');
    await layout(844, 390, true); pass('844x390 landscape fits with no page scroll');
    await layout(320, 568, true); pass('320x568 small portrait fits');
    await layout(1100, 850); pass('desktop board fits');

    await page.evaluate(() => { localStorage.setItem('sites-hub.theme', 'dark'); dispatchEvent(new StorageEvent('storage', { key: 'sites-hub.theme' })); });
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains('dark')));
    await page.evaluate(() => { localStorage.setItem('sites-hub.theme', 'light'); dispatchEvent(new StorageEvent('storage', { key: 'sites-hub.theme' })); });
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false);
    await page.evaluate(() => GameSettings.set('theme', 'dark'));
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains('dark')));
    await page.evaluate(() => { GameSettings.set('theme', 'auto'); localStorage.removeItem('sites-hub.theme'); });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
    pass('Auto follows live Hub Light/Dark and system fallback; explicit override works');

    let pair = await move(); await click(pair[0]);
    assert.equal(await page.$eval(`[data-cell="${pair[0]}"]`, e => e.classList.contains('selected')), true);
    await click(pair[1]); await settled(24);
    assert.ok((await saved()).score >= 180); pass('tap-tap valid swap animates and spends one move');
    const before = await saved();
    const bad = await page.evaluate(() => {
      const b = JSON.parse(localStorage.getItem('sweet-swap.save')).board;
      for (let a = 0; a < 64; a++) for (const c of [a + 1, a + 8])
        if (SweetRules.adjacent(a, c) && !SweetRules.trySwap(b.slice(), a, c).length) return [a, c];
    });
    await click(bad[0]); await click(bad[1]);
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('no move used'));
    assert.deepEqual(await saved(), before); pass('invalid swap animates back and preserves board score and moves');

    // Pick an RNG seed that causes at least two cascades and independently predict all scoring.
    const expected = await page.evaluate(() => {
      const original = JSON.parse(localStorage.getItem('sweet-swap.save')), R = SweetRules;
      const pair = R.findMove(original.board);
      function rng(seed) { return () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296); }
      for (let seed = 0; seed < 1000; seed++) {
        const b = original.board.slice(), rand = rng(seed); let groups = R.trySwap(b, ...pair), score = 0, combo = 0;
        while (groups.length && combo < 40) { score += R.clearMatches(b, groups) * 60 * ++combo; R.gravityAndRefill(b, rand); groups = R.findMatches(b); }
        if (combo >= 2 && combo < 40 && R.findMove(b)) {
          window.originalRandom = Math.random; Math.random = rng(seed);
          return { pair, score: original.score + score, combo, board: b };
        }
      }
    });
    assert.ok(expected);
    const a = await point(expected.pair[0]), b = await point(expected.pair[1]);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
    await settled(23); assert.equal((await saved()).score, expected.score); assert.deepEqual((await saved()).board, expected.board);
    await page.evaluate(() => { Math.random = window.originalRandom; });
    pass(`mouse drag and exact ×1..×${expected.combo} cascade scoring`);

    await layout(390, 844, true); pair = await move();
    const start = await point(pair[0]), finish = await point(pair[1]);
    const cdp = await page.createCDPSession();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: finish.x, y: finish.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settled(22); assert.equal(await page.evaluate(() => scrollY), 0); pass('real touch swipe swaps without page scrolling');
    const stable = await saved(); await page.reload({ waitUntil: 'networkidle0' });
    assert.deepEqual(await saved(), stable); assert.ok(await page.$eval('#best', e => Number(e.textContent.replace(/,/g, '')) > 0));
    pass('exact board score moves and per-level best resume on reload');

    await page.waitForFunction(() => document.querySelectorAll('.hint').length === 2, { timeout: 7500 });
    pass('5-second idle hint glows on a legal move');
    await page.evaluate(() => GameSettings.set('showHints', false));
    await page.waitForFunction(() => !document.querySelector('.hint')); pass('shared showHints disables hint');
    await page.click('#pauseBtn'); assert.ok(await page.$eval('main', e => e.inert));
    await page.click('#resumeBtn'); assert.equal(await page.$eval('main', e => e.inert), false);
    await page.click('#helpBtn'); assert.equal(await page.$eval('#help', e => e.hidden), false);
    await page.click('#helpClose'); assert.deepEqual(await saved(), stable); pass('pause and help cards lock input without changing progress');
    await layout(1100, 850);
    pair = await move(); await page.focus(`[data-cell="${pair[0]}"]`); await page.keyboard.press('Enter');
    const direction = pair[1] - pair[0] === 1 ? 'ArrowRight' : 'ArrowDown'; await page.keyboard.press(direction); await page.keyboard.press('Enter');
    await settled(21); pass('keyboard selection and arrow neighbour swap');

    // Leaving in the middle of a fall must never persist a half-resolved board.
    const beforeInterrupted = await saved(); pair = await move();
    await click(pair[0]); await click(pair[1]);
    await page.waitForFunction(() => document.getElementById('board').getAttribute('aria-busy') === 'true' &&
      Number(document.getElementById('moves').textContent) === 20);
    await page.reload({ waitUntil: 'networkidle0' });
    assert.deepEqual(await saved(), beforeInterrupted); pass('reload mid-cascade restores the atomic pre-turn save');

    // Force only the controller's dead-board branch; the real reshuffler still verifies its result.
    await page.evaluate(() => {
      const original = SweetRules.findMove, shuffle = SweetRules.reshuffle;
      SweetRules.findMove = board => { SweetRules.findMove = original; return null; };
      window.shuffleCount = 0;
      SweetRules.reshuffle = board => { window.shuffleCount++; return shuffle(board); };
    });
    pair = require('../core/matches.js').findMove((await saved()).board);
    await click(pair[0]); await click(pair[1]); await settled(20);
    assert.equal(await page.evaluate(() => window.shuffleCount), 1);
    assert.ok(await page.evaluate(() => SweetProgress.valid(JSON.parse(localStorage.getItem('sweet-swap.save')))));
    pass('controller reshuffles for free and saves only a stable playable board');

    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    assert.equal(await page.evaluate(() => SweetSettings.motion()), false);
    await page.emulateMediaFeatures([]); pass('reduced-motion preference disables movement');
    await page.evaluate(() => GameSettings.set('lowGraphics', true));
    await fixture({ level: 3, moves: 1, score: 5759 });
    pair = await move(); await click(pair[0]); await click(pair[1]); await settled(0);
    await page.waitForFunction(() => !document.getElementById('over').hidden);
    assert.equal(await page.$eval('#endStars', e => e.textContent), '★★★');
    assert.equal(await page.$eval('#nextBtn', e => e.hidden), false); pass('last move resolves before 3-star end card and Next');
    const ended = await saved(); await page.reload({ waitUntil: 'networkidle0' });
    assert.deepEqual(await saved(), ended); assert.equal(await page.$eval('#over', e => e.hidden), false); pass('finished level resumes into its end card');
    await page.click('#retryBtn'); assert.equal((await saved()).level, 3); assert.equal((await saved()).score, 0); assert.equal((await saved()).moves, 25);
    assert.ok(await page.$eval('#best', e => Number(e.textContent.replace(/,/g, '')) >= 5759)); pass('Retry resets board but retains level best');
    await fixture({ level: 3, moves: 0, score: 4000 }); await page.click('#nextBtn');
    assert.equal((await saved()).level, 4); assert.equal((await saved()).moves, 25); pass('Next starts the rising next-level challenge');
    await fixture({ level: 1, moves: 0, score: 0 });
    assert.equal(await page.$eval('#nextBtn', e => e.hidden), true); assert.equal(await page.$eval('#endStars', e => e.textContent), '☆☆☆');
    pass('failed level has zero stars and Retry only');
    await page.click('#retryBtn'); await page.select('#level', '7'); assert.equal((await saved()).level, 7); assert.equal((await saved()).score, 0);
    pass('level selector opens generated levels');
    assert.ok(await page.$eval('.gs-gear', e => e.href.endsWith('games-settings.html?from=sweet-swap')));
    assert.ok(await page.evaluate(() => GameSettings.progressKeys().includes('sweet-swap.save') && GameSettings.progressKeys().includes('sweet-swap.best')));
    pass('settings gear and clear-progress prefixes wired');
    await page.evaluate(() => localStorage.setItem('sweet-swap.save', '{bad'));
    await page.reload({ waitUntil: 'networkidle0' }); assert.equal((await saved()).level, 1); pass('corrupt save recovers safely');
    await page.goto('http://127.0.0.1:8825/apps/games/sweet-swap/?test=redirect#keep', { waitUntil: 'networkidle0' });
    assert.ok(page.url().endsWith('sweet-swap.html?test=redirect#keep')); pass('index redirect preserves query and hash');
    const fallback = await browser.newPage();
    fallback.on('pageerror', e => errors.push(e.message));
    fallback.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await fallback.setRequestInterception(true);
    fallback.on('request', request => request.url().endsWith('/games-settings.js')
      ? request.respond({ status: 200, contentType: 'application/javascript', body: '/* optional settings unavailable */' }) : request.continue());
    await fallback.evaluateOnNewDocument(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked for test'); } }));
    await fallback.goto(url, { waitUntil: 'networkidle0' });
    assert.equal(await fallback.evaluate(() => window.GameSettings), undefined);
    assert.ok(await fallback.$eval('#status', e => e.textContent.includes('Storage unavailable')));
    assert.equal(await fallback.$$eval('.cell', c => c.length), 64);
    pass('optional settings absent and localStorage blocked still render without exceptions');
    await fallback.close();
    const local = await browser.newPage();
    local.on('pageerror', e => errors.push(e.message));
    await local.goto(`file://${require('node:path').resolve(__dirname, '../sweet-swap.html')}`);
    assert.equal(await local.$$eval('.cell', c => c.length), 64);
    pass('classic scripts also boot directly from file://');
    await local.close();
    assert.deepEqual(errors, []); pass('no console errors or page exceptions');
    console.log(`${checks} browser checks passed`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
