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
  await page.click('.item input'); await page.click('#reset');
  assert.equal(await page.$$eval('.item input', inputs => inputs.some(i => i.checked)), false);
  await page.click('#add');
  await page.type('#item-name', 'Custom camp mug');
  await page.$eval('#item-grams', e => { e.value = '80'; });
  await page.click('#item-form button[type=submit]');
  assert(await page.$eval('#groups', e => e.textContent.includes('Custom camp mug')));
  await page.click('[aria-label="Edit Custom camp mug"]'); await page.$eval('#item-grams', e => { e.value = '777'; });
  await page.click('#item-form button[type=submit]');
  assert(await page.$$eval('.item', rows => rows.some(e => e.textContent.includes('Custom camp mug') && e.textContent.includes('777 g'))));
  await page.click('[aria-label="Delete Custom camp mug"]');
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
  // Planner through the real form, with editable group supplies and preserved checks.
  await page.click('#planner-panel summary');
  await page.$eval('#days', e => { e.value = '3'; });
  await page.$eval('#people', e => { e.value = '3'; });
  await page.select('#weather', 'hot'); await page.click('#planner-form button[type=submit]');
  assert(await page.$eval('#summary', e => e.textContent.includes('36 L')));
  assert(await page.$eval('#summary', e => e.textContent.includes('22,500')));
  await page.click('#before input');
  await page.reload(); await page.waitForSelector('.item');
  assert.equal(await page.$eval('#before input', e => e.checked), true);
  assert.equal(await page.$eval('#summary h2', e => e.textContent), '3-day hot trip · 3 people');
  await page.click('.item-tip summary');
  assert(await page.$eval('.item-tip', e => e.textContent.includes('Why you need it:')));
  // Export files, plus copy preview. No share/send action is invoked.
  const cdp = await page.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: '/workspace/cc-evidence' });
  await page.click('#export');
  assert(await page.$eval('#transfer-text', e => e.value.includes('Before you leave')));
  await page.click('#save-json'); await page.click('#save-text');
  await page.click('#transfer-dialog [data-close]');
  const exported = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('learn.camping-checklist.v1')); return CC.exportJSON(s.lists.find(l => l.id === s.selected));
  });
  await page.click('#import'); await page.$eval('#transfer-text', e => { e.value = 'null'; }); await page.click('#do-import');
  assert(await page.$eval('#transfer-status', e => e.textContent.includes('Import failed')));
  await page.$eval('#transfer-text', (e, text) => { e.value = text; }, exported); await page.click('#do-import');
  assert.equal(await page.$eval('#summary h2', e => e.textContent), '3-day hot trip · 3 people');
  assert.equal(await page.$eval('#before input', e => e.checked), true);
  // beforeprint builds the same compact sheet as the Print list button.
  await page.emulateMediaType('print');
  await page.pdf({ path: '/workspace/cc-evidence/camping-checklist-sample.pdf', preferCSSPageSize: true, printBackground: true });
  assert.equal(await page.$eval('.lrn', e => getComputedStyle(e).display), 'none');
  assert.equal(await page.$eval('#print-sheet', e => getComputedStyle(e).color), 'rgb(0, 0, 0)');
  assert.equal(await page.$eval('#print-sheet', e => getComputedStyle(e).backgroundColor), 'rgb(255, 255, 255)');
  assert(await page.$eval('#print-sheet', e => e.textContent.includes('Leave No Trace')));
  await page.emulateMediaType('screen');
  await page.click('#print-tips'); await page.emulateMediaType('print');
  await page.pdf({ path: '/workspace/cc-evidence/camping-checklist-tips.pdf', preferCSSPageSize: true });
  await page.emulateMediaType('screen');
  // Recheck final interface including planner/guide at both phone sizes.
  for (const [width,height] of [[390,844],[844,390]]) {
    await page.setViewport({ width,height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.$$eval('button', bs => bs.filter(b => b.getBoundingClientRect().width).every(b => b.getBoundingClientRect().height >= 44)));
    await page.screenshot({ path: `/workspace/cc-evidence/cc-final-${width}x${height}.png`, fullPage: true });
  }
  await page.setOfflineMode(true); await page.reload(); await page.waitForSelector('.item');
  assert.equal(await page.$eval('#summary h2', e => e.textContent), '3-day hot trip · 3 people');
  await page.setOfflineMode(false);
  assert.deepEqual(errors, []);
  console.log('CC-1a + CC-1b browser: persistence, custom CRUD, duplicate/rename, offline reload, 3 viewports, 44px buttons, Hub theme, trip planner, departure checks, text/JSON downloads and validated import, 2 print PDFs; 0 console errors.');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
