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
      const { D } = drivingTest; document.getElementById('lessons').value = 'start'; drivingTest.reset(); const s = drivingTest.s; D.start(s.c); D.shift(s.c, 1); s.c.handbrake = false;
      for (let i = 0; i < 6000 && !s.l.done; i++) {
        const rem = 78 - s.c.x, target = Math.min(5, Math.sqrt(Math.max(0, rem) * 1.8));
        D.tick(s, { throttle: s.c.v < target && rem > 1 ? .65 : 0, brake: s.c.v > target || rem < .5 ? .55 : 0, clutch: rem < 4 ? 1 : 0 }, 1 / 60);
      }
      drivingTest.update(0); return { done: s.l.done, score: s.l.score };
    });
    assert(result.done); assert(result.score >= 80);
    const roadResult = await page.evaluate(() => {
      const { D } = drivingTest, s = D.session(D.roadLessons('left')[0], { auto: true, side: 'left' });
      D.start(s.c); D.shift(s.c, 1); s.c.handbrake = false;
      for (let i = 0; i < 6000 && !s.l.done; i++) D.tick(s, { throttle: s.c.v < 4 ? .7 : 0 }, 1/60);
      return { done: s.l.done, faults: s.l.faults };
    });
    assert(roadResult.done); assert.equal(roadResult.faults.length, 0);
    await page.select('#lessons', 'signals');
    for (const [width, height] of [[1280,800],[844,390],[390,844]]) {
      await page.setViewport({ width, height, deviceScaleFactor: 2 });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: '/workspace/ds-town-' + width + 'x' + height + '.png' });
      assert.equal(await page.$eval('#lessons', e => e.options.length), 14);
    }
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const bounds = await page.evaluate(() => [...document.querySelectorAll('.touch button,.switches button,#wheel')].map(e => ({id:e.id || e.textContent,bottom:e.getBoundingClientRect().bottom,height:e.getBoundingClientRect().height})));
    assert(bounds.every(b => b.bottom <= 390 && b.height >= 44), JSON.stringify(bounds));
    await page.screenshot({ path:'/workspace/ds-polished-844x390.png' });
    await page.select('#lessons','start');
    const client = await page.createCDPSession();
    const pedal = await page.$eval('[data-hold="throttle"]', e => { const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; });
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...pedal,id:1}]});
    assert.equal(await page.evaluate(() => drivingTest.input().throttle),1);
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.evaluate(() => drivingTest.input().throttle),0);
    const wheel = await page.$eval('#wheel',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...wheel,id:2}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:wheel.x+30,y:wheel.y,id:2}]});
    assert(await page.evaluate(() => drivingTest.input().steer > .5));
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.evaluate(() => drivingTest.input().steer),0);

    await page.click('#help'); assert(await page.$eval('#help-card', e => e.open)); await page.click('#close-help');
    await page.click('#quiz');
    for (let i = 0; i < 20; i++) {
      await page.click('.quiz-choices button');
      await page.evaluate(() => document.querySelector('#quiz-card > button').click());
    }
    assert((await page.$eval('#quiz-card h2', e => e.textContent)).includes('/20'));
    await page.evaluate(() => document.querySelector('#quiz-card > button:last-child').click());
    await page.select('#lessons','mock'); await page.click('#end-test');
    assert((await page.$eval('#report-card', e => e.textContent)).includes('NOT YET'));
    assert((await page.$eval('#report-card', e => e.textContent)).includes('SERIOUS'));
    await page.click('#report-card button');
    await page.click('#mute'); await page.click('#horn');
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem('learn.driving-school.settings')).muted));
    await page.click('#pause'); assert(await page.$eval('#pause-card', e => e.open));
    await page.click('#resume'); await page.click('#settings');
    await page.select('#theme', 'dark'); assert.equal(await page.$eval('html', e => e.dataset.theme), 'dark');
    await page.select('#theme', 'light'); assert.equal(await page.$eval('html', e => e.dataset.theme), 'light');
    await page.select('#theme', 'system'); await page.select('#side', 'right'); await page.click('#close-settings');
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.evaluate(() => drivingTest.prefs.side), 'right');
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem('learn.driving-school.best')).start >= 80));
    assert(await page.evaluate(() => localStorage.getItem('learn.driving-school.quiz-best') !== null));
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: desktop + 844x390 + 390x844; DPR, >=44px controls, keyboard, L1 + town autodrive, 14 lessons, town phone rendering, fitted landscape cockpit, touch pedal + wheel release, 20-question quiz, incomplete mock report, mute/horn/help, pause, theme, settings persistence; no console errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
