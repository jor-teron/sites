/* Run from repo root with GG_PUPPETEER=/path/to/puppeteer-core. Serve repo on 8826. */
const assert=require('node:assert/strict');
const path=require('node:path');
const out=process.env.GG_ARTIFACTS || '/workspace/gg-test';require('node:fs').mkdirSync(out,{recursive:true});
const pp=require(process.env.GG_PUPPETEER || 'puppeteer-core');
(async()=>{
  const browser=await pp.launch({executablePath:process.env.CHROME || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage(),errors=[]; let checks=0;
  const check=(label,fn)=>{fn();checks++;console.log('CHECK '+label);};
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const base='http://127.0.0.1:8826/apps/games/garden-guard/';
  const hook=()=>page.waitForFunction('GardenGuard.test');
  try {
    await page.setViewport({width:1280,height:800,deviceScaleFactor:2});
    await page.goto(base+'index.html?test=1');await hook();
    check('redirect preserves test query',()=>assert.ok(page.url().includes('garden-guard.html?test=1')));
    check('initial sun and five seeds',()=>{});
    assert.deepEqual(await page.evaluate(()=>[GardenGuard.test.game.sun,document.querySelectorAll('.seed').length]),[50,5]);
    await page.click('.seed[data-kind=sun]');
    async function tile(row,col) {
      const r=await page.$eval('#board',c=>{const r=c.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};});
      return{x:r.x+(22+(col+.5)*100)/932*r.w,y:r.y+(28+(row+.5)*100)/540*r.h};
    }
    let t=await tile(2,0);await page.mouse.click(t.x,t.y);
    check('pointer plants and pays cost',()=>{});assert.deepEqual(await page.evaluate(()=>[GardenGuard.test.game.plants.length,GardenGuard.test.game.sun]),[1,0]);
    await page.mouse.click(t.x,t.y);check('occupied placement blocked',()=>{});assert.equal(await page.evaluate(()=>GardenGuard.test.game.plants.length),1);
    await page.evaluate(()=>GardenGuard.test.advance(8.1));
    const sun=await page.evaluate(()=>{const c=document.getElementById('board').getBoundingClientRect(),s=GardenGuard.test.game.suns[0];return{x:c.x+(22+s.x*100)/932*c.width,y:c.y+(28+s.y*100)/540*c.height};});
    await page.mouse.click(sun.x,sun.y);check('pointer collects sun',()=>{});assert.equal(await page.evaluate(()=>GardenGuard.test.game.sun),25);
    await page.addScriptTag({path:path.resolve('apps/games/garden-guard/tests/strategy.js')});
    await page.evaluate(()=>GardenGuard.test.advance(62,defendGarden));
    const before=await page.evaluate(()=>{GardenGuard.test.save();return GardenGuard.test.game.snapshot();});
    await page.reload();await hook();
    check('full simulation restores paused',()=>{});assert.deepEqual(await page.evaluate(()=>GardenGuard.test.game.snapshot()),before);assert.equal(await page.evaluate(()=>GardenGuard.test.paused),true);
    await page.evaluate(()=>GardenGuard.test.advance(30));check('paused time does not advance',()=>{});assert.equal(await page.evaluate(()=>GardenGuard.test.game.time),before.time);
    await page.click('#card-actions button');await page.keyboard.press('p');
    check('P pauses and Escape resumes',()=>{});assert.equal(await page.evaluate(()=>GardenGuard.test.paused),true);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>GardenGuard.test.paused),false);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
    check('hidden-tab handler auto pauses',()=>{});assert.equal(await page.evaluate(()=>GardenGuard.test.paused),true);
    await page.click('#card-actions button');await page.click('#help');check('How to play is available and pauses',()=>{});assert.equal(await page.$eval('#card-title',e=>e.textContent),'How to play');assert.equal(await page.evaluate(()=>GardenGuard.test.paused),true);
    await page.click('#card-actions button');await page.click('#card-actions button');
    await page.addScriptTag({path:path.resolve('apps/games/garden-guard/tests/strategy.js')});
    await page.evaluate(()=>{GardenGuard.test.start(0);GardenGuard.test.advance(300,defendGarden);});
    check('legal autoplay wins level 1 and unlocks level 2',()=>{});assert.deepEqual(await page.evaluate(()=>[GardenGuard.test.game.status,GardenGuard.test.unlocked]),['won',2]);assert.equal(await page.$eval('#level option[value="1"]',e=>e.disabled),false);
    await page.screenshot({path:path.join(out,'gg-win.png')});
    await page.reload();await hook();check('win and unlock persist after reload',()=>{});assert.deepEqual(await page.evaluate(()=>[GardenGuard.test.game.status,GardenGuard.test.unlocked]),['won',2]);
    await page.click('#card-actions button');check('Next level starts level 2 with fresh economy',()=>{});assert.deepEqual(await page.evaluate(()=>[GardenGuard.test.game.level,GardenGuard.test.game.sun]),[1,50]);
    await page.evaluate(()=>{GardenGuard.test.start(0);GardenGuard.test.advance(300);});check('no plants loses and Retry resets',()=>{});assert.equal(await page.evaluate(()=>GardenGuard.test.game.status),'lost');assert.equal(await page.$eval('#card-actions button',e=>e.textContent),'Retry');await page.click('#card-actions button');assert.equal(await page.evaluate(()=>GardenGuard.test.game.sun),50);
    await page.evaluate(()=>{GameSettings.set('theme','auto');localStorage.setItem('sites-hub.theme','dark');dispatchEvent(new Event('storage'));});check('Auto theme follows Hub dark and light',()=>{});assert.equal(await page.$eval('html',e=>e.dataset.theme),'dark');
    await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','light');dispatchEvent(new Event('storage'));});assert.equal(await page.$eval('html',e=>e.dataset.theme),'light');
    for(const [width,height] of [[844,390],[390,844]]) {
      await page.setViewport({width,height,deviceScaleFactor:2,isMobile:true,hasTouch:true});
      await page.evaluate(()=>{GardenGuard.test.start(0);GardenGuard.test.resume();});
      const layout=await page.evaluate(()=>{const b=document.getElementById('board'),r=b.getBoundingClientRect();return{scroll:document.body.scrollHeight>innerHeight||document.body.scrollWidth>innerWidth,cell:r.width/932*100,controls:[...document.querySelectorAll('header button,header a,header select,.seed')].every(e=>{const r=e.getBoundingClientRect();return r.width>=40&&r.height>=40;}),crisp:Math.abs(b.width-r.width*devicePixelRatio)<=1,fit:r.y>=0&&r.bottom<=innerHeight};});
      check(`${width}x${height}: no scroll; board fits; 40px targets; DPR crisp`,()=>{assert.equal(layout.scroll,false);assert.ok(layout.cell>=40,JSON.stringify(layout));assert.ok(layout.controls);assert.ok(layout.crisp);assert.ok(layout.fit);});
      await page.tap('.seed[data-kind=sun]');t=await tile(2,0);await page.touchscreen.tap(t.x,t.y);
      check(`${width}x${height}: touch planting`,()=>{});assert.equal(await page.evaluate(()=>GardenGuard.test.game.plants.length),1);
      await page.screenshot({path:path.join(out,`gg-${width}x${height}.png`)});
    }
    check('no browser console errors or uncaught exceptions',()=>assert.deepEqual(errors,[]));
    const fallback=await browser.newPage(),fallbackErrors=[];fallback.on('pageerror',e=>fallbackErrors.push(String(e)));
    await fallback.setRequestInterception(true);fallback.on('request',r=>r.url().endsWith('games-settings.js')?r.abort():r.continue());
    await fallback.goto(base+'garden-guard.html?test=1');await fallback.waitForFunction('GardenGuard.test');
    await fallback.evaluate(()=>GardenGuard.test.start(0));check('shared-settings failure still allows play with fallback gear',()=>{});assert.equal(await fallback.evaluate(()=>GardenGuard.test.game.sun),50);assert.ok(await fallback.$('#gear a'));assert.deepEqual(fallbackErrors,[]);await fallback.close();
    const live=await browser.newPage(),liveErrors=[]; live.on('pageerror',e=>liveErrors.push(String(e)));
    await live.evaluateOnNewDocument(()=>localStorage.removeItem('garden-guard.save'));
    await live.goto(base+'garden-guard.html');await live.bringToFront();
    await live.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem('garden-guard.save')).game.time>=3;}catch(_){return false;}},{timeout:10000});
    check('production RAF loop advances and autosaves without test hook',()=>{});assert.equal(await live.evaluate(()=>!!GardenGuard.test),false);assert.deepEqual(liveErrors,[]);await live.close();
    const file=await browser.newPage(),fileErrors=[];file.on('pageerror',e=>fileErrors.push(String(e)));
    await file.goto(require('node:url').pathToFileURL(path.resolve('apps/games/garden-guard/garden-guard.html')).href+'?test=1');await file.waitForFunction('GardenGuard.test');
    check('classic-script file URL works without a server',()=>{});await file.evaluate(()=>{GardenGuard.test.start(0);GardenGuard.test.game.plant('sun',2,0);});assert.equal(await file.evaluate(()=>GardenGuard.test.game.plants.length),1);assert.deepEqual(fileErrors,[]);await file.close();
    console.log(`Browser: ${checks} checks passed`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
