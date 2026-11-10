/* Start `python3 -m http.server 8835 --bind 127.0.0.1` at the repo root.
   Run with PUPPETEER_MODULE=/path/to/puppeteer-core node .../print.browser.cjs
   PDFs/screenshots stay outside the repository in SUDOKU_SAMPLES. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const puppeteer = require(process.env.PUPPETEER_MODULE || 'puppeteer-core');
const gen = require('../core/gen.js');
(async () => {
  const output = process.env.SUDOKU_SAMPLES || '/workspace/sudoku_print_samples';
  await fs.mkdir(output, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:8835/apps/games/sudoku/sudoku.html', { waitUntil: 'networkidle0' });
    // A saved user entry must never leak into the printed givens.
    const empty = gen.generate(0).puzzle.indexOf(0);
    await page.click('.sd-cell[data-i="' + empty + '"]'); await page.keyboard.press('9');
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    await page.click('#sd-print');
    assert.equal(await page.$eval('#sp-answers', e => e.checked), false);
    for (const selector of ['#sp-puzzle','#sp-answer','#sp-current','#sp-current-answer']) assert(await page.$(selector));
    await page.screenshot({ path: path.join(output, 'phone-390x844.png') });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.$eval('#sp-dialog', e => e.scrollWidth <= e.clientWidth));
    await page.evaluate(() => { window.print = () => { window.printCalls = (window.printCalls || 0) + 1; }; });
    async function settings(perPage, pages = 1, paper = 'A4') {
      await page.evaluate(({ perPage, pages, paper }) => {
        document.querySelector('#sp-count').value = perPage;
        document.querySelector('#sp-pages').value = pages;
        document.querySelector('#sp-paper').value = paper;
        document.querySelector('#sp-band').value = 'Mixed';
        const seed = document.querySelector('#sp-seed'); seed.value = 'paper-2026';
        seed.dispatchEvent(new Event('input', { bubbles: true }));
      }, { perPage, pages, paper });
      await page.waitForFunction(() => !document.querySelector('#sp-puzzle').disabled);
    }
    async function pdf(name, expectedPages) {
      await page.emulateMediaType('print');
      const measurements = await page.$$eval('#sp-print-root .sp-sheet', sheets => sheets.map(sheet => {
        const r = sheet.getBoundingClientRect();
        return { width: r.width, height: r.height, grids: [...sheet.querySelectorAll('.sp-grid')].map(grid => {
          const g = grid.getBoundingClientRect();
          return g.left >= r.left - 1 && g.right <= r.right + 1 && g.top >= r.top && g.bottom <= r.bottom - 25;
        }) };
      }));
      assert(measurements.every(p => p.grids.every(Boolean)), 'every grid fits intact within its sheet');
      assert.equal(measurements.length, expectedPages);
      const file = path.join(output, name + '.pdf');
      await page.pdf({ path: file, preferCSSPageSize: true, printBackground: false, displayHeaderFooter: false });
      const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
      assert.equal(+/^Pages:\s+(\d+)/m.exec(info)[1], expectedPages);
      const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
      assert(!text.includes('Printable Sudoku')); assert(!text.includes('Tap a cell'));
      const sheets = text.split('\f').filter(s => s.trim());
      assert.equal(sheets.length, expectedPages);
      for (const text of sheets) assert.match(text, /ID \/ seed:/);
      console.log(name, expectedPages + ' pages; intact grids and footer IDs');
      await page.emulateMediaType('screen');
      return sheets;
    }
    for (const perPage of [1,2,4,6]) {
      await settings(perPage);
      await page.$eval('#sp-answers', e => { e.checked = true; e.dispatchEvent(new Event('change')); });
      await page.click('#sp-puzzle');
      const text = await pdf('sudoku-a4-' + perPage + '-per-page-with-answers', 2);
      assert.equal((text[0].match(/Puzzle #/g) || []).length, perPage);
      assert.equal((text[1].match(/Answer #/g) || []).length, perPage);
    }
    // Independent buttons use precisely the same set ID and puzzle numbering.
    await settings(6, 2);
    await page.$eval('#sp-answers', e => { e.checked = false; e.dispatchEvent(new Event('change')); });
    await page.click('#sp-puzzle');
    const puzzleIds = await page.$$eval('#sp-print-root footer', es => es.map(e => e.innerText.split('ID / seed: ')[1]));
    await pdf('sudoku-a4-puzzles-only', 2);
    await page.click('#sp-answer');
    const answerIds = await page.$$eval('#sp-print-root footer', es => es.map(e => e.innerText.split('ID / seed: ')[1]));
    assert.equal(puzzleIds[0], answerIds[0]);
    const answers = await pdf('sudoku-a4-answers-only', 2);
    assert.equal((answers.join('').match(/Answer #/g) || []).length, 12);
    const id = answerIds[0];
    await page.$eval('#sp-seed', (e, id) => { e.value = id; e.dispatchEvent(new Event('input')); }, id);
    await page.waitForFunction(() => !document.querySelector('#sp-answer').disabled);
    assert.equal(await page.$eval('#sp-count', e => e.value), '6');
    assert.equal(await page.$eval('#sp-pages', e => e.value), '2');
    await page.click('#sp-answer');
    assert.equal(await page.$eval('#sp-print-root footer', e => e.innerText.split('ID / seed: ')[1]), id);
    // This puzzle / this answer match the active level, NOT the saved entry.
    await page.click('#sp-current');
    assert.deepEqual(await page.$$eval('#sp-print-root .sp-grid span', es => es.map(e => +e.textContent)), gen.generate(0).puzzle);
    await pdf('sudoku-current-puzzle', 1);
    await page.click('#sp-current-answer');
    assert.deepEqual(await page.$$eval('#sp-print-root .sp-grid span', es => es.map(e => +e.textContent)), gen.generate(0).solution);
    await pdf('sudoku-current-answer', 1);
    for (const perPage of [1,2,4,6]) {
      await settings(perPage, 1, 'Letter');
      await page.$eval('#sp-answers', e => { e.checked = true; e.dispatchEvent(new Event('change')); });
      await page.click('#sp-puzzle'); await pdf('sudoku-letter-' + perPage + '-per-page-with-answers', 2);
    }
    await settings(6, 20);
    await page.click('#sp-puzzle'); await pdf('sudoku-a4-120-puzzles-with-answers', 34);
    for (const colorScheme of ['dark','light']) {
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: colorScheme }]);
      assert.equal(await page.$eval('.sp-sheet', e => getComputedStyle(e).backgroundColor), 'rgb(255, 255, 255)');
    }
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storage);
    await page.click('#sp-close'); assert.equal(await page.$eval('#sp-dialog', e => e.open), false);
    await page.click('#sd-print'); await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#sp-dialog', e => e.open), false);
    assert.deepEqual(errors, []);
    console.log('PASS: phone layout, 20-page stress, seed lookup, separate puzzle/answer buttons, current givens, keyboard, no storage mutation; no console errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
