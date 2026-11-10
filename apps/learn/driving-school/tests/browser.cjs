/* Run against this checkout served on 8829. No remote resources needed. */
const assert = require('node:assert/strict');
const puppeteer = require(process.env.DS_PUPPETEER || '/workspace/gg-test/node_modules/puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://127.0.0.1:8829/apps/learn/driving-school/?test', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !!window.drivingTest);
    for (const [width, height] of [[1280, 800], [844, 390], [390, 844]]) {
      await page.setViewport({ width, height, deviceScaleFactor: 2, hasTouch: true });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const geometry = await page.evaluate(() => {
        const c = document.getElementById('road'), b = c.getBoundingClientRect();
        return { w: document.documentElement.scrollWidth, vw: innerWidth, cw: c.width, css: b.width,
          sizes: [...document.querySelectorAll('.touch button,.switches button')].map(e => e.getBoundingClientRect().height) };
      });
      assert(geometry.w <= width + 1, JSON.stringify(geometry));
      assert(Math.abs(geometry.cw - geometry.css * 2) < 2, 'DPR crisp');
      assert(geometry.sizes.every(h => h >= 44));
      await page.screenshot({ path: '/workspace/ds-' + width + 'x' + height + '.png' });
    }
    await page.setViewport({ width: 1280, height: 800 });
    await page.click('#engine'); await page.keyboard.down('c');
    await new Promise(r => setTimeout(r, 350)); await page.keyboard.press('e');
    assert.equal(await page.evaluate(() => drivingTest.s.c.gear), 1);
    await page.keyboard.press('h'); await page.keyboard.down('w'); await page.keyboard.up('c');
    await new Promise(r => setTimeout(r, 1000)); await page.keyboard.up('w');
    assert(await page.evaluate(() => drivingTest.s.c.distance > .1));
    const result = await page.evaluate(() => {
      const { D } = drivingTest; const s = D.session(D.basics[0]); D.start(s.c); D.shift(s.c, 1); s.c.handbrake = false;
      for (let i = 0; i < 6000 && !s.l.done; i++) {
        const rem = 78 - s.c.x, target = Math.min(5, Math.sqrt(Math.max(0, rem) * 1.8));
        D.tick(s, { throttle: s.c.v < target && rem > 1 ? .65 : 0, brake: s.c.v > target || rem < .5 ? .55 : 0, clutch: rem < 4 ? 1 : 0 }, 1 / 60);
      }
      return { done: s.l.done, score: s.l.score };
    });
    assert(result.done); assert(result.score >= 80);
    await page.click('#pause'); assert(await page.$eval('#pause-card', e => e.open));
    await page.click('#resume'); await page.click('#settings');
    await page.select('#theme', 'dark'); assert.equal(await page.$eval('html', e => e.dataset.theme), 'dark');
    await page.select('#theme', 'light'); assert.equal(await page.$eval('html', e => e.dataset.theme), 'light');
    await page.select('#theme', 'system'); await page.select('#side', 'right'); await page.click('#close-settings');
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.evaluate(() => drivingTest.prefs.side), 'right');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: desktop + 844x390 + 390x844; DPR, >=44px controls, keyboard, L1 autodrive, pause, theme, settings persistence; no console errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
