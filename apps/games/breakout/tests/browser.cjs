/* Serve repository root on 8824; PUPPETEER_PATH may point to puppeteer-core.
 * Run: node apps/games/breakout/tests/browser.cjs */
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  let count = 0;
  async function check(name, run) { await run(); count++; console.log('PASS', name); }
  const url = 'http://127.0.0.1:8824/apps/games/breakout/';
  try {
    await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1 });
    await page.goto(url + '?test=1'); await page.waitForFunction(() => !!window.breakoutTest);
    await check('index redirect preserves test query and loads without errors', async () => {
      assert.ok(page.url().includes('breakout.html?test=1')); assert.deepEqual(errors, []);
      assert.equal(await page.$eval('#gearSlot a', a => a.href.endsWith('?from=breakout')), true);
      assert.equal(await page.evaluate(() => GameSettings.get('theme')), 'auto');
    });
    await check('launch click keyboard movement pause and resume', async () => {
      await page.click('#launchBtn');
      assert.equal(await page.evaluate(() => breakoutTest.model.mode), 'playing');
      const before = await page.evaluate(() => breakoutTest.model.paddle.x);
      await page.keyboard.down('ArrowRight');
      await page.waitForFunction(x => breakoutTest.model.paddle.x > x + 10, {}, before);
      await page.keyboard.up('ArrowRight'); await page.keyboard.press('p');
      assert.equal(await page.evaluate(() => breakoutTest.paused), true);
      const snapshot = await page.evaluate(() => JSON.stringify(breakoutTest.model.balls));
      await new Promise(r => setTimeout(r, 150));
      assert.equal(await page.evaluate(() => JSON.stringify(breakoutTest.model.balls)), snapshot);
      await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => breakoutTest.paused), false);
      await page.evaluate(() => breakoutTest.pause(true));
    });
    await check('level clear actual collisions using test hook', async () => {
      assert.equal(await page.evaluate(() => {
        const m = new BRK.Model(() => .99); breakoutTest.setModel(m); m.launch();
        for (const b of [...m.bricks]) while (b.hp > 0) {
          m.balls = [{ x: b.x + 21, y: b.y + 28.2, vx: 0, vy: -650, speed: 650 }]; breakoutTest.step();
        }
        return m.level === 2 && m.mode === 'ready' && m.score > 0;
      }), true);
    });
    await check('all powers render and laser fires with no errors', async () => {
      const result = await page.evaluate(() => {
        const m = new BRK.Model(); breakoutTest.setModel(m); m.launch();
        for (const type of BRK.C.powerTypes) {
          m.drops.push({ x: m.paddle.x, y: BRK.C.paddleY - 10, type }); breakoutTest.step();
        }
        breakoutTest.step(); return { balls: m.balls.length, width: m.paddleWidth,
          slow: m.speedFactor, laser: m.shots.length, lives: m.lives };
      });
      assert.deepEqual(result, { balls: 3, width: 132, slow: .65, laser: 2, lives: 4 });
    });
    await check('save reload welcome card and exact resume state', async () => {
      const stored = await page.evaluate(() => { breakoutTest.save(); return localStorage.getItem('breakout.save'); });
      await page.reload(); await page.waitForFunction(() => !!window.breakoutTest);
      assert.equal(await page.$eval('#pauseTitle', el => el.textContent), 'Welcome back');
      assert.equal(await page.evaluate(() => breakoutTest.paused), true);
      const live = await page.evaluate(() => { breakoutTest.save(); return localStorage.getItem('breakout.save'); });
      assert.equal(live, stored);
      await page.click('#resumeBtn'); assert.equal(await page.evaluate(() => breakoutTest.paused), false);
    });
    await check('hidden tab event always pauses even autoPause disabled', async () => {
      await page.evaluate(() => {
        GameSettings.set('autoPause', false);
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange')); delete document.hidden;
      });
      assert.equal(await page.evaluate(() => breakoutTest.paused), true);
      await page.evaluate(() => GameSettings.set('autoPause', true));
    });
    await check('help preserves previous pause and mute uses shared sfx', async () => {
      await page.click('#pauseHelpBtn'); await page.click('#helpClose');
      assert.equal(await page.evaluate(() => breakoutTest.paused), true);
      await page.click('#resumeBtn'); await page.click('#helpBtn'); await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => breakoutTest.paused), false);
      await page.click('#muteBtn'); assert.equal(await page.evaluate(() => GameSettings.get('sfx')), false);
      await page.click('#muteBtn'); assert.equal(await page.evaluate(() => GameSettings.get('sfx')), true);
      await page.evaluate(() => breakoutTest.pause(true));
    });
    await check('life loss game over card replay and persisted best', async () => {
      await page.evaluate(() => {
        const m = new BRK.Model(); breakoutTest.setModel(m); m.score = 9999;
        for (let i = 0; i < 3; i++) { m.launch(); m.balls.forEach(b => b.y = 660); breakoutTest.step(); }
      });
      assert.equal(await page.$eval('#over', el => el.hidden), false);
      assert.equal(await page.evaluate(() => BRK.store.best()), 9999);
      await page.reload(); await page.waitForFunction(() => !!window.breakoutTest);
      assert.equal(await page.$eval('#over', el => el.hidden), false);
      await page.click('#againBtn'); assert.equal(await page.evaluate(() => breakoutTest.model.lives), 3);
      assert.equal(await page.evaluate(() => breakoutTest.model.score), 0);
    });
    await check('Auto follows Hub Light/Dark and explicit theme overrides', async () => {
      const result = await page.evaluate(() => {
        const result = [];
        GameSettings.set('theme', 'auto');
        for (const theme of ['dark', 'light']) {
          localStorage.setItem('sites-hub.theme', theme);
          dispatchEvent(new StorageEvent('storage', { key: 'sites-hub.theme' }));
          result.push(document.documentElement.classList.contains('dark'));
        }
        GameSettings.set('theme', 'dark'); result.push(document.documentElement.classList.contains('dark'));
        GameSettings.set('theme', 'auto'); return result;
      });
      assert.deepEqual(result, [true, false, true]);
    });
    for (const viewport of [{ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]) {
      await check(`phone ${viewport.width}x${viewport.height} DPR ${viewport.deviceScaleFactor} fit and drag`, async () => {
        await page.setViewport(viewport);
        await page.evaluate(() => { breakoutTest.fresh(); breakoutTest.renderer.fit(); });
        const box = await page.$eval('#board', el => { const r = el.getBoundingClientRect();
          return { x:r.x, y:r.y, w:r.width, h:r.height, pw:el.width, ph:el.height,
            scroll:document.documentElement.scrollHeight, height:innerHeight, width:innerWidth }; });
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= viewport.width + 1 && box.y + box.h <= viewport.height + 1, JSON.stringify(box));
        assert.ok(box.scroll <= viewport.height); assert.equal(box.width, viewport.width);
        // CSS border is outside the bitmap; account for 2 physical CSS pixels.
        assert.ok(Math.abs(box.pw - (box.w - 2) * viewport.deviceScaleFactor) <= 1.1);
        const client = await page.createCDPSession();
        const y = box.y + box.h * .8;
        await client.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:box.x + box.w * .3, y }] });
        await client.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:box.x + box.w * .7, y }] });
        await client.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
        assert.ok(await page.evaluate(() => breakoutTest.model.paddle.x > 280));
        assert.equal(await page.evaluate(() => scrollY), 0);
        await page.screenshot({ path:`/workspace/breakout-${viewport.width}x${viewport.height}.png` });
      });
    }
    await check('corrupt saves ignored and progress registry includes game', async () => {
      assert.equal(await page.evaluate(() => {
        localStorage.setItem('breakout.save', '{"version":1,"balls":[null]}');
        return BRK.store.load() === null && GameSettings.progressKeys().includes('breakout.save') &&
          GameSettings.progressKeys().includes('breakout.best');
      }), true);
    });
    await check('missing settings library and denied storage still allow play', async () => {
      const fallback = await browser.newPage(), fallbackErrors = [];
      fallback.on('pageerror', e => fallbackErrors.push(String(e)));
      await fallback.setRequestInterception(true);
      fallback.on('request', r => r.url().endsWith('/common/settings/games-settings.js')
        ? r.respond({ status: 200, contentType: 'application/javascript', body: '/* unavailable */' }) : r.continue());
      await fallback.evaluateOnNewDocument(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });
      });
      await fallback.goto(url + 'breakout.html?test=1');
      await fallback.waitForFunction(() => !!window.breakoutTest);
      await fallback.click('#launchBtn');
      assert.equal(await fallback.evaluate(() => breakoutTest.model.mode), 'playing');
      await fallback.click('#muteBtn');
      assert.equal(await fallback.$eval('#muteBtn', el => el.textContent), 'Unmute');
      assert.deepEqual(fallbackErrors, []); await fallback.close();
    });
    await check('no browser console errors or page errors', async () => assert.deepEqual(errors, []));
    console.log(`${count} browser checks passed`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
