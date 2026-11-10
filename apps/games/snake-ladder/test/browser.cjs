/* NODE_PATH=/workspace/snl-tools/node_modules node apps/games/snake-ladder/test/browser.cjs
   Serve the repository on 8832 first. Optional BASE_URL / SHOTS / CHROME_BIN overrides. */
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PNG } = require('pngjs');
const base = process.env.BASE_URL || 'http://127.0.0.1:8832';
const url = `${base}/apps/games/snake-ladder/`;
const shots = process.env.SHOTS || '/workspace/snl_review';
let checks = 0;
const check = (ok, message) => {
  checks++;
  assert.ok(ok, message);
};
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage(),
      errors = [],
      badRequests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url()}`);
    });
    await page.goto(`${url}index.html?check=1#board`);
    await page.waitForSelector('#btn-start');
    check(page.url().endsWith('snake-ladder.html?check=1#board'), 'redirect preserves URL context');
    for (const [view, width, height] of [
      ['portrait', 390, 844],
      ['landscape', 844, 390],
    ])
      for (const theme of ['light', 'dark']) {
        await page.setViewport({ width, height });
        await page.goto(url);
        await page.evaluate((theme) => {
          GameSettings.set('theme', theme);
          GameSettings.set('lowGraphics', false);
          SNLSave.clear();
        }, theme);
        for (let i = 0; i < 4; i++) await page.select(`#seat-${i}`, 'human');
        await page.$eval('#seed-input', (e) => (e.value = 7));
        await page.click('#btn-start');
        await page.evaluate(async () => {
          Math.random = () => 0.7;
          await Engine.roll();
        });
        const shape = await page.evaluate(() => {
          const r = document.getElementById('board').getBoundingClientRect();
          const lum = (rgb) => {
            const c = rgb
              .match(/[\d.]+/g)
              .slice(0, 3)
              .map(Number)
              .map((v) => {
                v /= 255;
                return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
              });
            return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
          };
          const contrasts = ['.cell:not(.alt)', '.cell.alt'].map((sel) => {
            const css = getComputedStyle(document.querySelector(sel)),
              a = lum(css.color),
              b = lum(css.backgroundColor);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          });
          const die = document.getElementById('dice');
          const pawn = document.querySelector('.token').getBoundingClientRect();
          const cell = document.querySelector('.cell').getBoundingClientRect();
          return {
            numberContrast: Math.min(...contrasts),
            width: r.width,
            bottom: r.bottom,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            verticalOverflow: document.documentElement.scrollHeight > innerHeight,
            tokenRatio: pawn.width / cell.width,
            dieValue: die.dataset.value,
            snakes: document.querySelectorAll('.snake-body').length,
            first: document.querySelector('[data-cell="0"]').textContent,
            last: document.querySelector('[data-cell="99"]').textContent,
            theme: document.documentElement.dataset.theme,
            live: document.getElementById('log').getAttribute('aria-live'),
          };
        });
        check(!shape.horizontalOverflow, `${view} has no horizontal overflow`);
        check(shape.numberContrast >= 4.5, 'square numbers have at least 4.5:1 contrast');
        check(shape.width > (view === 'portrait' ? 340 : 280), `${view} board fills space`);
        if (view === 'landscape') {
          check(shape.bottom < height, 'landscape board fits height');
          check(!shape.verticalOverflow, 'landscape also fits header and captions');
        }
        check(shape.tokenRatio >= 0.4, 'pawns at least 40% of cell');
        check(shape.dieValue === '5', 'settled die is five');
        check(shape.first === '1' && shape.last === '100', '1–100 labels');
        check(shape.snakes === 8, 'eight illustrated snakes');
        check(shape.theme === theme, 'theme applied');
        check(shape.live === 'polite', 'accessible live log');
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const clip = await page.$eval('#dice', (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        const face = PNG.sync.read(Buffer.from(await page.screenshot({ clip })));
        let pipPixels = 0;
        for (let y = Math.floor(face.height * 0.15); y < face.height * 0.8; y++)
          for (let x = Math.floor(face.width * 0.15); x < face.width * 0.85; x++) {
            const i = (y * face.width + x) * 4;
            if (face.data[i] < 100 && face.data[i + 1] < 120 && face.data[i + 2] < 100) pipPixels++;
          }
        check(pipPixels > 50, 'settled pips are present in actual screenshot pixels');
        await page.screenshot({ path: `${shots}/after-${view}-${theme}.png` });
      }
    await page.evaluate(() => Ui.quit());
    await page.evaluate(() => {
      localStorage.setItem('sites-hub.theme', 'dark');
      GameSettings.set('theme', 'auto');
    });
    check(await page.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'Auto uses Hub dark');
    await page.evaluate(() => {
      localStorage.setItem('sites-hub.theme', 'light');
      dispatchEvent(new StorageEvent('storage', { key: 'sites-hub.theme' }));
    });
    check(
      await page.evaluate(() => document.documentElement.dataset.theme === 'light'),
      'Auto follows Hub theme changes',
    );
    await page.evaluate(() => localStorage.removeItem('sites-hub.theme'));
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'dark' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await page.evaluate(() => SNLSettings.apply());
    check(
      await page.evaluate(() => document.documentElement.dataset.theme === 'dark' && SNLSettings.reduced()),
      'device theme and reduced motion fallback',
    );
    await page.emulateMediaFeatures([]);
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => GameSettings.set('theme', 'light'));
    await page.click('#btn-help');
    check(await page.$eval('#help', (e) => e.open), 'help opens');
    await page.click('#motion-toggle');
    check(
      await page.evaluate(() => GameSettings.get('lowGraphics')),
      'motion toggle uses shared lowGraphics',
    );
    await page.screenshot({ path: `${shots}/after-help.png` });
    await page.click('#help-close');
    await page.click('#mute-toggle');
    check(await page.evaluate(() => !GameSettings.get('sfx')), 'mute uses shared sfx');
    await page.click('#mute-toggle');
    check(await page.evaluate(() => GameSettings.get('sfx')), 'unmute works');
    check(
      (await page.$eval('#gear a', (a) => a.href)).includes('games-settings.html?from=snake-ladder'),
      'shared gear',
    );
    // Validation and Human / CPU / Off controls.
    for (let i = 0; i < 4; i++) await page.select(`#seat-${i}`, 'off');
    await page.click('#btn-start');
    check(
      (await page.$eval('#lobby-error', (e) => e.textContent)).includes('two'),
      'at least two seats required',
    );
    for (let i = 0; i < 2; i++) await page.select(`#seat-${i}`, 'human');
    await page.click('#btn-start');
    const race = await page.evaluate(async () => {
      const before = JSON.stringify(Engine.snapshot());
      const pending = Engine.roll();
      Ui.quit();
      await pending;
      return {
        same: before === JSON.stringify(Engine.snapshot()),
        rolling: Engine.state.rolling,
        saved: before === JSON.stringify(SNLSave.load()),
      };
    });
    check(race.same && !race.rolling && race.saved, 'Quit during die returns to saved complete turn');
    await page.click('#btn-start');
    const resetRace = await page.evaluate(async () => {
      const pending = Engine.roll();
      Ui.quit();
      Ui.start();
      const current = Engine.state;
      const before = JSON.stringify(Engine.snapshot());
      await pending;
      return (
        current === Engine.state && before === JSON.stringify(Engine.snapshot()) && !Engine.state.rolling
      );
    });
    check(resetRace, 'Start while old roll pending is isolated');
    // Real DOM hop cancellation as well as the die wait.
    await page.evaluate(() => {
      CONFIG.DICE_MS = 0;
      CONFIG.HOP_MS = 450;
      GameSettings.set('lowGraphics', false);
      Math.random = () => 0.4;
      window.oldRoll = Engine.roll();
    });
    await page.waitForFunction(() => Engine.state.rolling && Engine.state.players[0].pos > 0);
    const hopRace = await page.evaluate(async () => {
      Ui.quit();
      const fresh = JSON.stringify(Engine.snapshot());
      await window.oldRoll;
      return fresh === JSON.stringify(Engine.snapshot()) && !Engine.state.rolling;
    });
    check(hopRace, 'Quit during visible hop cancels the old DOM animation');
    await page.evaluate(() => {
      CONFIG.HOP_MS = 130;
      GameSettings.set('lowGraphics', true);
      Ui.start();
    });
    await page.evaluate(async () => {
      Math.random = () => 0.7;
      await Engine.roll();
    });
    const save = await page.evaluate(() => JSON.stringify(Engine.snapshot()));
    check(
      await page.evaluate(() => GameSettings.progressKeys().includes(SNLSave.KEY)),
      'save is registered for Clear all progress',
    );
    await page.reload();
    await page.waitForSelector('#btn-resume');
    check(!(await page.$eval('#btn-resume', (e) => e.hidden)), 'resume offered on reload');
    await page.click('#btn-resume');
    check(
      (await page.evaluate(() => JSON.stringify(Engine.snapshot()))) === save,
      'resume preserves positions, turn, seats and house rules',
    );
    // Real automatic scheduler, with all timers accelerated to 2ms (not a mocked engine).
    await page.evaluate(() => {
      Ui.quit();
      SNLSave.clear();
      GameSettings.set('lowGraphics', true);
      GameSettings.set('sfx', false);
      window.originalTimeout = setTimeout;
      window.setTimeout = (fn, ms, ...args) => originalTimeout(fn, Math.min(ms, 2), ...args);
      Math.random = Board.rng(1234);
      for (let id = 0; id < 4; id++) {
        document.getElementById(`seat-${id}`).value = 'cpu';
        document.getElementById(`level-${id}`).value = ['easy', 'medium', 'hard', 'hard'][id];
      }
      document.getElementById('rule-start').checked = true;
      document.getElementById('rule-again').checked = true;
      Ui.start();
    });
    await page.waitForFunction(
      () => Engine.state.over && !document.getElementById('screen-result').classList.contains('hidden'),
      { timeout: 45000 },
    );
    const full = await page.evaluate(() => ({
      winner: Engine.state.players.find((p) => p.finished)?.name,
      rolls: Engine.state.players.reduce((n, p) => n + p.rolls, 0),
      saved: SNLSave.load(),
    }));
    check(!!full.winner && full.rolls > 0 && !full.saved, 'full all-CPU game finishes and clears save');
    await page.screenshot({ path: `${shots}/after-cpu-win.png` });
    await page.evaluate(() => {
      window.setTimeout = window.originalTimeout;
      GameSettings.set('lowGraphics', false);
      Render.confetti();
    });
    check((await page.$$eval('.confetti i', (es) => es.length)) === 64, 'win confetti');
    // Missing shared library must not break the game or local mute/motion controls.
    const fallback = await browser.newPage();
    const fallbackErrors = [];
    fallback.on('pageerror', (e) => fallbackErrors.push(e.message));
    await fallback.setRequestInterception(true);
    fallback.on('request', (req) =>
      req.url().endsWith('/common/settings/games-settings.js')
        ? req.respond({
            status: 200,
            contentType: 'text/javascript',
            body: '/* intentionally unavailable library */',
          })
        : req.continue(),
    );
    await fallback.goto(url);
    await fallback.click('#btn-start');
    check(await fallback.evaluate(() => !!Engine.state), 'game works without shared library');
    await fallback.click('#mute-toggle');
    check(await fallback.evaluate(() => !SNLSettings.get('sfx')), 'fallback mute works');
    check(fallbackErrors.length === 0, 'no fallback JS errors');
    await fallback.close();
    check(errors.length === 0, `no console or JS errors: ${errors.join('; ')}`);
    check(badRequests.length === 0, `no broken resources: ${badRequests.join('; ')}`);
    console.log(
      `PASS ${checks} browser checks; full 4-CPU game: ${full.winner} wins in ${full.rolls} total rolls; no JS/console/resource errors. Screenshots: ${shots}`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
