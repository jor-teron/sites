/* Run with NODE_PATH=/workspace/arw-test-deps/node_modules node .../tests/browser.cjs.
   Serve the repository on 127.0.0.1:8826 first. Artifacts stay in /workspace/np_review. */
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:8826/apps/learn/nutrition-plate/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.food');
  assert.equal(await page.$eval('#theme', e => e.value), 'system');
  assert(await page.$eval('.notice', e => /not medical advice/i.test(e.textContent)));
  assert.equal(await page.$eval('#sex', e => e.value), 'unspecified');
  const start = await page.$$eval('.food', els => els.length);
  assert.ok(start >= 100, 'library should list most foods');
  await page.click('.food');
  await page.waitForSelector('.served');
  const afterOne = await page.$eval('#totals', e => e.textContent);
  assert.match(afterOne, /[1-9]\d* kcal/);
  await page.type('#search', 'roti');
  await page.waitForFunction(() => [...document.querySelectorAll('.food strong')].some(e => /roti/i.test(e.textContent)));
  await page.$eval('#search', e => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.select('#diet', 'veg');
  assert.ok(await page.$$eval('.food', els => els.length) < start);
  await page.click('#chips button[data-group="fruits"]');
  assert.ok(await page.$$eval('.food strong', els => els.length > 0));
  await page.click('#chips button[data-group="all"]'); await page.select('#diet', 'all');
  await page.evaluate(() => {
    const banana = [...document.querySelectorAll('.food')].find(b => b.dataset.id === 'banana');
    banana.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  assert.ok(await page.$$eval('.served', els => els.length >= 2));
  // NP-1b: meals, targets, save/load, persistence.
  await page.click('.meals button[data-m="lunch"]');
  assert.equal(await page.$eval('#plate-title', e => e.textContent), 'Lunch');
  assert.equal(await page.$$eval('#plate .served', els => els.length), 0);
  await page.evaluate(() => {
    const dal = [...document.querySelectorAll('.food')].find(b => b.dataset.id === 'dal_tadka');
    dal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForSelector('#plate .served');
  await page.select('#age', 'teen'); await page.select('#activity', 'active');
  assert.match(await page.$eval('#target-note', e => e.textContent), /3000 kcal/);
  await page.select('#sex', 'female');
  assert.match(await page.$eval('#target-note', e => e.textContent), /30 mg iron/);
  await page.select('#sex', 'male');
  assert.match(await page.$eval('#target-note', e => e.textContent), /22 mg iron/);
  await page.select('#sex', 'unspecified');
  assert.match(await page.$eval('#tips', e => e.textContent), /add vegetables/i);
  assert.match(await page.$eval('#progress', e => e.textContent), /Energy/);
  await page.click('#save-plate');
  await page.waitForSelector('#name-dialog[open]');
  await page.$eval('#save-name', e => { e.value = 'Lunch dal'; });
  await page.click('#name-form button[type=submit]');
  await page.click('#save-day');
  await page.waitForSelector('#name-dialog[open]');
  await page.$eval('#save-name', e => { e.value = 'Busy Tuesday'; });
  await page.click('#name-form button[type=submit]');
  assert(await page.$eval('#saved-plates', e => e.textContent.includes('Lunch dal')));
  assert(await page.$eval('#saved-days', e => e.textContent.includes('Busy Tuesday')));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.food');
  assert.equal(await page.$eval('#age', e => e.value), 'teen');
  assert.equal(await page.$eval('#activity', e => e.value), 'active');
  assert.equal(await page.$eval('#sex', e => e.value), 'unspecified');
  assert(await page.$eval('#saved-days', e => e.textContent.includes('Busy Tuesday')));
  await page.click('.meals button[data-m="lunch"]');
  assert(await page.$eval('#plate', e => e.textContent.includes('Toor dal tadka')));
  // NP-1c: How to use, games, compact phone library.
  await page.click('#mode-help');
  assert.equal(await page.$eval('#view-help', e => e.hidden), false);
  assert(await page.$eval('#view-help', e => /not medical advice/i.test(e.textContent) && /sex/i.test(e.textContent)));
  await page.click('#mode-games');
  await page.click('.game-card[data-game="guess"]');
  await page.waitForSelector('#game-play .choices button');
  await page.click('#game-play .choices button');
  assert(await page.$eval('#status', e => e.textContent.length > 0));
  await page.click('.game-card[data-game="fix"]');
  await page.waitForSelector('#game-play .bank button');
  assert(await page.$eval('#game-play .tips', e => e.textContent.length > 0));
  await page.click('#game-play .bank button');
  await page.click('.game-card[data-game="swaps"]');
  await page.waitForSelector('#game-play .choices button');
  await page.click('#game-play .choices button');
  await page.click('#mode-plate');
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForSelector('.food-group, .food');
  assert(await page.$('#chips button[data-group="grains"]'));
  assert(await page.$$eval('.food-group', els => els.length >= 8));
  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => { localStorage.setItem('sites-hub.theme', t); HubTheme.apply(); }, theme);
    assert.equal(await page.$eval('html', e => e.dataset.theme), theme);
    for (const [width, height] of [[390, 844], [844, 390], [1280, 800]]) {
      await page.setViewport({ width, height });
      if (width <= 800) await page.waitForSelector('.food-group, .food-list');
      else await page.waitForSelector('.food-grid .food, .food');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'overflow ' + width + 'x' + height + ' ' + theme);
      assert(await page.$$eval('button', buttons => buttons.filter(b => {
        const r = b.getBoundingClientRect();
        return r.width && r.height && r.bottom > 0 && r.top < innerHeight;
      }).every(b => b.getBoundingClientRect().height >= 44)), '44px buttons ' + width + 'x' + height);
      await page.screenshot({ path: `/workspace/np_review/np-1c-${theme}-${width}x${height}.png`, fullPage: true });
    }
  }
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluate(() => { localStorage.setItem('sites-hub.theme', 'light'); HubTheme.apply(); });
  await page.click('#mode-games');
  await page.click('.game-card[data-game="fix"]');
  await page.screenshot({ path: '/workspace/np_review/np-1c-light-games-390x844.png', fullPage: true });
  await page.click('#mode-help');
  await page.screenshot({ path: '/workspace/np_review/np-1c-light-help-390x844.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('NP-1c browser: sex targets, chips, How to use, games, meals, save/load, 3 viewports, light and dark, 44px buttons; 0 console errors.');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
