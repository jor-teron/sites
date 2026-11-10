// Run with ARW_PUPPETEER=/absolute/path/to/node_modules/puppeteer if needed.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const puppeteer=require(process.env.ARW_PUPPETEER||'puppeteer-core');
const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage(),errors=[];let checks=0;
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const url='http://127.0.0.1:8830/apps/games/arrow-escape/';
async function ready(){await page.waitForFunction(()=>!!window.arrowEscape);}
async function boot(number=1){
  await page.goto(url);await ready();
  await page.evaluate(number=>{localStorage.setItem('arrow-escape.save.v1',JSON.stringify({version:1,progress:{unlocked:500,stars:{}},number}));},number);
  await page.reload();await ready();
  assert.equal(await page.evaluate(()=>arrowEscape.level.number),number);checks++;
}
async function tap(id) {
  const cell=await page.$(`[data-id="${id}"] rect.hit:last-of-type`);assert.ok(cell);
  await cell.evaluate(e=>e.scrollIntoView({block:'nearest',inline:'nearest'}));await cell.click();
  await page.waitForFunction(()=>!window.arrowEscape.busy);
}
try {
  await page.setViewport({width:1100,height:850,deviceScaleFactor:2});await boot();
  assert.ok(page.url().endsWith('arrow-escape.html'));checks++;
  assert.equal(await page.evaluate(()=>GameSettings.get('theme')),'auto');checks++;
  assert.ok((await page.$eval('#gear a',a=>a.href)).includes('from=arrow-escape'));checks++;
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  for(const number of [1,245,500]) {
    await boot(number);
    const order=await page.evaluate(async()=>{const {solve}=await import('./core/rules.mjs');return solve(arrowEscape.level);});
    for(let i=0;i<order.length;i++) {
      await tap(order[i]);
      if(i===0){
        const state=await page.evaluate(()=>arrowEscape.state);await page.reload();await ready();
        assert.deepEqual(await page.evaluate(()=>arrowEscape.state),state);checks++;
      }
    }
    assert.equal(await page.evaluate(()=>arrowEscape.state.arrows.length),0);checks++;
    assert.equal(await page.$eval('#modal',e=>e.open),true);checks++;
    assert.ok(await page.$eval('.stars',e=>e.textContent==='★★★'));checks++;
  }
  await boot(180);
  const blocked=await page.evaluate(async()=>{const {route}=await import('./core/rules.mjs');const s=arrowEscape.state;return s.arrows.find(a=>route(a,s.arrows,arrowEscape.level.n).reason==='blocked')?.id;});
  assert.notEqual(blocked,undefined);await tap(blocked);assert.equal(await page.evaluate(()=>arrowEscape.state.lives),2);checks++;
  await page.click('#undo');assert.equal(await page.evaluate(()=>arrowEscape.state.lives),3);checks++;
  await page.click('#hint');assert.equal(await page.evaluate(()=>arrowEscape.state.hints),1);checks++;
  await page.click('#hint');assert.equal(await page.evaluate(()=>arrowEscape.state.hints),1);checks++;
  for(let i=0;i<3;i++)await tap(blocked);
  assert.equal(await page.$eval('#modal-title',e=>e.textContent),'Out of lives');checks++;
  await page.click('#recover');assert.equal(await page.evaluate(()=>arrowEscape.state.lives),1);checks++;
  await tap(blocked);await page.click('#retry');
  assert.equal(await page.evaluate(()=>arrowEscape.state.lives),3);checks++;
  assert.equal(await page.evaluate(()=>arrowEscape.state.moves),0);checks++;
  // Matching locks are free to inspect and undoing the key relocks them.
  await boot(500);
  const pair=await page.evaluate(()=>arrowEscape.state.arrows.find(a=>a.lock!==undefined));
  assert.ok(pair);await tap(pair.id);
  assert.equal(await page.evaluate(()=>arrowEscape.state.moves),0);checks++;
  const prefix=await page.evaluate(async key=>{const {solve}=await import('./core/rules.mjs');const o=solve(arrowEscape.level);return o.slice(0,o.indexOf(key)+1);},pair.lock);
  for(const id of prefix)await tap(id);
  assert.equal(await page.$eval(`[data-id="${pair.id}"]`,g=>g.classList.contains('locked')),false);checks++;
  await page.click('#undo');
  assert.equal(await page.$eval(`[data-id="${pair.id}"]`,g=>g.classList.contains('locked')),true);checks++;
  // Pause, all five themes, sound mute, help, daily and preserved campaign session.
  const campaign=await page.evaluate(()=>arrowEscape.state);
  await page.click('#pause');assert.equal(await page.$eval('#modal-title',e=>e.textContent),'Paused');checks++;
  for(const theme of ['classic','wood','carbus','floor','stone']) {
    await page.select('#board-theme',theme);
    assert.equal(await page.$eval('html',e=>e.dataset.boardTheme),theme);checks++;
  }
  await page.reload();await ready();
  assert.equal(await page.$eval('html',e=>e.dataset.boardTheme),'stone');checks++;
  await page.click('#pause');
  await page.click('#mute');assert.equal(await page.evaluate(()=>GameSettings.get('sfx')),false);checks++;
  await page.click('#help');assert.ok((await page.$eval('#modal-body',e=>e.textContent)).includes('uncoils'));checks++;
  await page.click('#help-back');await page.click('#daily');
  assert.equal(await page.evaluate(()=>arrowEscape.mode),'daily');checks++;
  let dailyOrder=await page.evaluate(async()=>{const {solve}=await import('./core/rules.mjs');return solve(arrowEscape.level);});
  await tap(dailyOrder[0]);const dailyState=await page.evaluate(()=>arrowEscape.state);
  await page.reload();await ready();assert.deepEqual(await page.evaluate(()=>arrowEscape.state),dailyState);checks++;
  for(const id of dailyOrder.slice(1))await tap(id);
  let streak=await page.evaluate(()=>JSON.parse(localStorage.getItem('arrow-escape.save.v1')).daily.streak);
  assert.equal(streak,1);checks++;
  await page.click('#replay');
  dailyOrder=await page.evaluate(async()=>{const {solve}=await import('./core/rules.mjs');return solve(arrowEscape.level);});
  for(const id of dailyOrder)await tap(id);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('arrow-escape.save.v1')).daily.streak),1);checks++;
  await page.click('#next');assert.equal(await page.evaluate(()=>arrowEscape.mode),'campaign');checks++;
  assert.deepEqual(await page.evaluate(()=>arrowEscape.state),campaign);checks++;
  await page.click('#pause');await page.select('#board-theme','classic');await page.click('#resume');
  // Real (non-reduced) animation must be busy in flight, then persist completion.
  await boot(1);await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
  const safeId=await page.evaluate(async()=>{const {solve}=await import('./core/rules.mjs');return solve(arrowEscape.level)[0];});
  await page.click(`[data-id="${safeId}"] rect.hit:last-of-type`);
  assert.equal(await page.evaluate(()=>arrowEscape.busy),true);checks++;
  await page.waitForFunction(()=>!arrowEscape.busy);assert.equal(await page.evaluate(()=>arrowEscape.state.moves),1);checks++;
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  // Locked level-select states on a clean progression.
  await page.evaluate(()=>localStorage.setItem('arrow-escape.save.v1',JSON.stringify({version:1,progress:{unlocked:1,stars:{}},number:1})));
  await page.reload();await ready();await page.click('#levels');
  assert.equal(await page.$$eval('.level-cell:disabled',buttons=>buttons.length),49);checks++;
  await page.click('#close');
  for(const viewport of [{width:390,height:844},{width:844,height:390}]) {
    await page.setViewport({...viewport,deviceScaleFactor:3});await boot(500);
    const layout=await page.evaluate(()=>{
      const b=document.querySelector('#board').getBoundingClientRect();
      return {noOverflow:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight,
        cell:b.width/arrowEscape.level.n,
        targets:[...document.querySelectorAll('header button,footer button,#back,#gear a')].map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height,r.x,r.y];})};
    });
    assert.ok(layout.noOverflow);assert.ok(layout.cell>=40);checks+=2;
    for(const [w,h,x,y] of layout.targets){assert.ok(w>=40&&h>=40&&x>=0&&y>=0&&x+w<=viewport.width+1&&y+h<=viewport.height+1);checks++;}
    await page.screenshot({path:`/workspace/arw-${viewport.width}.png`});
  }
  await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','dark');dispatchEvent(new StorageEvent('storage',{key:'sites-hub.theme'}));});
  assert.equal(await page.$eval('html',e=>e.classList.contains('dark')),true);checks++;
  await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','light');dispatchEvent(new StorageEvent('storage',{key:'sites-hub.theme'}));});
  assert.equal(await page.$eval('html',e=>e.classList.contains('dark')),false);checks++;
  assert.deepEqual(errors,[]);checks++;
  console.log(`Browser: ${checks} assertions passed; solved 1/245/500 + daily twice; locks/undo, themes, pause, mute, help, resume, animation; 390x844 + 844x390 DPR3; no console errors.`);
} finally {await browser.close();}
