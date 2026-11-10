/* Run with NODE_PATH=/workspace/arw-test-deps/node_modules node .../tests/browser.cjs.
   Serve the repository on 127.0.0.1:8839 first. Artifacts stay outside the repository. */
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', async d => { if (d.type() === 'prompt') await d.accept('Weekend kit'); else await d.accept(); });
  await page.goto('http://127.0.0.1:8839/apps/learn/camping-checklist/');
  await page.waitForSelector('.item');
  await page.waitForFunction(() => document.getElementById('offline').textContent.includes('Available offline'));
  assert.equal(await page.$eval('#theme', e => e.value), 'system');
  await page.click('.item input');
  await page.reload(); await page.waitForSelector('.item');
  assert.equal(await page.$eval('.item input', e => e.checked), true);
  await page.click('#duplicate'); await page.click('#rename');
  assert.equal(await page.$eval('#summary h2', e => e.textContent), 'Weekend kit');
  assert.equal(await page.$eval('.item input', e => e.checked), false);
  await page.click('#add');
  await page.type('#item-name', 'Custom camp mug');
  await page.$eval('#item-grams', e => { e.value = '80'; });
  await page.click('#item-form button[type=submit]');
  assert(await page.$eval('#groups', e => e.textContent.includes('Custom camp mug')));
  await page.click('.item button'); await page.$eval('#item-grams', e => { e.value = '777'; });
  await page.click('#item-form button[type=submit]');
  assert(await page.$eval('.item', e => e.textContent.includes('777 g')));
  await page.click('.item button:last-child');
  assert.equal(await page.$$eval('.item', e => e.length), 33);
  await page.reload(); await page.waitForSelector('.item');
  assert.equal(await page.$eval('#summary h2', e => e.textContent), 'Weekend kit');
  for (const [width, height] of [[390,844], [844,390], [1280,900]]) {
    await page.setViewport({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    assert(await page.$$eval('button', buttons => buttons.filter(b => b.getBoundingClientRect().width).every(b => b.getBoundingClientRect().height >= 44)), '44px buttons');
    await page.screenshot({ path: `/workspace/cc-evidence/cc-${width}x${height}.png`, fullPage: true });
  }
  await page.evaluate(() => { localStorage.setItem('sites-hub.theme', 'dark'); HubTheme.apply(); });
  assert.equal(await page.$eval('html', e => e.dataset.theme), 'dark');
  await page.evaluate(() => { localStorage.setItem('sites-hub.theme', 'light'); HubTheme.apply(); });
  assert.equal(await page.$eval('html', e => e.dataset.theme), 'light');
  await page.setOfflineMode(true); await page.reload(); await page.waitForSelector('.item');
  assert.equal(await page.$eval('#summary h2', e => e.textContent), 'Weekend kit');
  await page.setOfflineMode(false);
  assert.deepEqual(errors, []);
  console.log('CC-1a browser: persistence, custom CRUD, duplicate/rename, offline reload, 3 viewports, 44px buttons, Hub theme; 0 console errors.');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
