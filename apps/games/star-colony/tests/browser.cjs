/* Serve repository on 8828. No other worktree or Chrome port is used. */
const assert = require('node:assert/strict');
const pp = require(process.env.SC_PUPPETEER || '/workspace/sc-test/node_modules/puppeteer-core');
(async () => {
  const browser = await pp.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(), errors = []; let checks = 0;
  const check = (label, fn) => { fn(); checks++; console.log('PASS ' + label); };
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
    await page.goto('http://127.0.0.1:8828/apps/games/star-colony/index.html?smoke=1');
    await page.waitForFunction('window.StarColony');
    check('redirect keeps query and loads game', () => assert.ok(page.url().includes('star-colony.html?smoke=1')));
    check('three starting settlers', () => {}); assert.equal(await page.evaluate(() => StarColony.getState().colonists.length), 3);
    await page.click('#build button[data-type=solar]');
    const tile = await page.evaluate(() => {
      const r = document.getElementById('map').getBoundingClientRect(), c = StarColony.camera;
      return { x: r.x + r.width / 2 + (17.5 * 28 - c.x) * c.zoom, y: r.y + r.height / 2 + (15.5 * 28 - c.y) * c.zoom };
    });
    await page.mouse.click(tile.x, tile.y);
    check('pointer queues blueprint without spending immediately', () => {});
    assert.ok(await page.evaluate(() => StarColony.getState().buildings.some(b => b.x === 17 && b.y === 15 && !b.ready)));
    await page.evaluate(() => { StarColony.setPaused(true); SC.advance(StarColony.getState(), 100); });
    assert.ok(await page.evaluate(() => StarColony.getState().buildings.some(b => b.x === 17 && b.y === 15 && b.ready)));
    check('simulation constructs queued structure', () => {});
    await page.click('#save');
    const before = await page.evaluate(() => StarColony.getState().time);
    await page.reload(); await page.waitForFunction('window.StarColony');
    assert.ok(Math.abs(await page.evaluate(() => StarColony.getState().time) - before) < 1);
    check('save resumes after reload', () => {});
    await page.click('#pause'); assert.equal(await page.$eval('#overlay', e => e.hidden), false);
    await page.keyboard.press('Escape'); assert.equal(await page.$eval('#overlay', e => e.hidden), true);
    check('pause card and Escape', () => {});
    await page.evaluate(() => { GameSettings.set('theme', 'auto'); localStorage.setItem('sites-hub.theme', 'dark'); dispatchEvent(new Event('storage')); });
    assert.equal(await page.$eval('html', e => e.dataset.theme), 'dark');
    await page.evaluate(() => { localStorage.setItem('sites-hub.theme', 'light'); dispatchEvent(new Event('storage')); });
    assert.equal(await page.$eval('html', e => e.dataset.theme), 'light'); check('Auto theme follows Hub dark/light', () => {});
    const camera = await page.evaluate(() => ({ ...StarColony.camera }));
    await page.mouse.move(tile.x, tile.y); await page.mouse.down(); await page.mouse.move(tile.x + 80, tile.y + 30, { steps: 10 }); await page.mouse.up();
    assert.notEqual(await page.evaluate(() => StarColony.camera.x), camera.x);
    await page.mouse.wheel({ deltaY: -100 });
    await page.waitForFunction(z => StarColony.camera.zoom > z, {}, camera.zoom); check('pan and wheel zoom', () => {});
    for (const [width, height] of [[390, 844], [844, 390]]) {
      await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await page.waitForFunction(() => { const c = document.getElementById('map'), r = c.getBoundingClientRect(); return Math.abs(c.width - r.width * 2) <= 1; });
      const layout = await page.evaluate(() => {
        const c = document.getElementById('map'), r = c.getBoundingClientRect();
        return { overflow: document.body.scrollWidth > innerWidth || document.body.scrollHeight > innerHeight, canvas: r.width > 100 && r.height > 100, crisp: Math.abs(c.width - r.width * devicePixelRatio) <= 1, targets: [...document.querySelectorAll('#build button')].every(b => b.getBoundingClientRect().height >= 40) };
      });
      check(width + 'x' + height + ' fits and is DPR-crisp with 40px build targets', () => { assert.equal(layout.overflow, false, JSON.stringify(layout)); assert.ok(layout.canvas && layout.crisp && layout.targets); });
      await page.tap('#plus'); await page.tap('#home'); check(width + 'x' + height + ' touch controls', () => {});
    }
    if (await page.$('#help')) {
      await page.tap('#help'); assert.equal(await page.$eval('#dialog-title', e => e.textContent), 'How to play');
      await page.tap('#dialog-actions button'); check('How to play available', () => {});
    }
    check('no console errors or page exceptions', () => assert.deepEqual(errors, []));
    console.log(checks + ' browser checks passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
