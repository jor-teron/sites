/* Run a static HTTP server at 127.0.0.1:8836; see ../README.md. */
const puppeteer = require(process.env.PUPPETEER_MODULE || 'puppeteer-core');
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../../'), output = process.env.SI_SCREENSHOTS || path.join(require('node:os').tmpdir(), 'si-themes');
fs.mkdirSync(output,{recursive:true});
const baseline = cp.execFileSync('git', ['show','b1796837:apps/games/space-invader/core/logic.js'], {cwd:root,encoding:'utf8'});
const url = 'http://127.0.0.1:8836/apps/games/space-invader/space-invader.html';
const ids = ['classic','retro','gameboy','amber','neon','space','flat','cyber','paper','ocean'];
let runningBrowser;
(async()=>{
 const browser = await puppeteer.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 runningBrowser=browser;
 const page = await browser.newPage(); const errors=[];
 page.on('pageerror', e=>errors.push(String(e)));
 page.on('console', msg=>{if(msg.type()==='error') errors.push(msg.text());});
 page.on('response', res=>{if(res.status()>=400) errors.push(`${res.status()} ${res.url()}`);});
 await page.setViewport({width:390,height:844,deviceScaleFactor:2});
 await page.goto(url); await page.evaluate(()=>localStorage.clear()); await page.reload();
 assert.equal(await page.evaluate(()=>SpaceInvaderAppearance.current().id),'flat');
 await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','dark'); window.postMessage({type:'hub-prefs'},location.origin);});
 await page.waitForFunction(()=>SpaceInvaderAppearance.current().id==='classic');
 await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','light');window.dispatchEvent(new StorageEvent('storage',{key:'sites-hub.theme',newValue:'light'}));});
 await page.waitForFunction(()=>SpaceInvaderAppearance.current().id==='flat');
 await page.mouse.click(100,400);
 assert.equal(await page.evaluate(()=>state),'playing');
 for(const id of ids){
  await page.click('#theme-open'); assert.equal(await page.evaluate(()=>state),'paused');
  const before=await page.evaluate(()=>({score,lives,wave,invaders:JSON.stringify(invaders),player:JSON.stringify(player)}));
  await page.click(`input[value="${id}"]`);
  assert.deepEqual(await page.evaluate(()=>({score,lives,wave,invaders:JSON.stringify(invaders),player:JSON.stringify(player)})),before);
  assert.equal(await page.evaluate(()=>SpaceInvaderAppearance.current().id),id);
  if(id==='classic') await page.screenshot({path:`${output}/settings-mobile.png`});
  await page.click('[aria-label="Close settings"]');
  await page.waitForFunction(()=>state==='playing');
  for(const [name,width,height] of [['mobile',390,844],['desktop',1440,900]]){
   await page.setViewport({width,height,deviceScaleFactor:2});
   await page.evaluate(()=>{resetGame();state='playing';hideOverlay();invaders[5].alive=false;invaders[18].alive=false;invaders[30].alive=false;invaders.forEach(i=>{i.y+=70;});bullets=[{x:239,y:320,w:4,h:10},{x:239,y:430,w:4,h:10}];eBullets=[{x:164,y:350,w:4,h:10}];Visuals.burst(200,230,1);draw();state='paused';});
   await page.screenshot({path:`${output}/${id}-${name}.png`});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.evaluate(()=>{state='playing';invuln=1e8;});
 }
 // Persistence, cross-tab saved choices and Auto independent of explicit theme.
 await page.reload(); assert.equal(await page.evaluate(()=>SpaceInvaderAppearance.current().id),'ocean');
 await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','dark'); HubTheme.apply();});
 assert.equal(await page.evaluate(()=>SpaceInvaderAppearance.current().id),'ocean');
 await page.evaluate(()=>{localStorage.setItem('space-invader.visualTheme','auto');window.dispatchEvent(new StorageEvent('storage',{key:'space-invader.visualTheme'}));});
 assert.equal(await page.evaluate(()=>SpaceInvaderAppearance.current().id),'classic');
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 assert.equal(await page.evaluate(()=>SpaceInvaderThemes.motion.matches),true);
 await page.evaluate(()=>{Visuals.burst(100,100);resetGame();state='playing';invuln=500;draw();});
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
 // Render timings at a phone DPR, excluding one-time cache creation.
 await page.setViewport({width:390,height:844,deviceScaleFactor:2});
 const timings={};
 for(const id of ids){
  timings[id]=await page.evaluate(id=>{
   localStorage.setItem('space-invader.visualTheme',id);window.dispatchEvent(new StorageEvent('storage',{key:'space-invader.visualTheme'})); resetGame();state='paused';draw();
   const values=[];for(let i=0;i<180;i++){const start=performance.now();draw();values.push(performance.now()-start);}values.sort((a,b)=>a-b);
   return {mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values[Math.floor(values.length*.95)]};
  },id);
 }
 await page.setViewport({width:1440,height:900,deviceScaleFactor:2});
 await page.click('#theme-open'); await page.screenshot({path:`${output}/settings-desktop.png`}); await page.keyboard.press('Escape');
 const frameTimes={};
 await page.setViewport({width:390,height:844,deviceScaleFactor:2});
 for(const id of ids) frameTimes[id]=await page.evaluate(async id=>{
  localStorage.setItem('space-invader.visualTheme',id);window.dispatchEvent(new StorageEvent('storage',{key:'space-invader.visualTheme'}));
  resetGame();state='playing';invuln=1e8;
  const deltas=[];let last=0;
  await new Promise(resolve=>{function sample(t){if(last)deltas.push(t-last);last=t;deltas.length<90?requestAnimationFrame(sample):resolve();}requestAnimationFrame(sample);});
  deltas.sort((a,b)=>a-b);return {median:deltas[45],p95:deltas[85],over25ms:deltas.filter(v=>v>25).length};
 },id);
 // Deterministic comparison against the original simulation with fixed clock + RNG.
 async function simulation(original,theme){
  const p=await browser.newPage();
  await p.evaluateOnNewDocument(()=>{
   window.requestAnimationFrame=()=>0; let seed=673923;
   Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   window.testTime=0;performance.now=()=>window.testTime;
  });
  if(original){await p.setRequestInterception(true);p.on('request',r=>r.url().endsWith('/core/logic.js')?r.respond({status:200,contentType:'text/javascript',body:baseline}):r.continue());}
  await p.goto(url);
  const result=await p.evaluate(theme=>{
   if(!theme) theme='classic';localStorage.setItem('space-invader.visualTheme',theme);window.dispatchEvent(new StorageEvent('storage',{key:'space-invader.visualTheme'}));
   resetGame();state='playing';const snapshots=[];
   for(let i=0;i<900;i++){window.testTime=i*17;keys.shoot=true;keys.left=(i%120)<30;keys.right=(i%120)>=60&&(i%120)<90;update(17);if(i%30===0)snapshots.push({state,score,lives,wave,invuln,player:{...player},invaders:JSON.stringify(invaders),bullets:JSON.stringify(bullets),eBullets:JSON.stringify(eBullets)});}
   return snapshots;
  },theme);await p.close();return result;
 }
 const expected=await simulation(true);
 for(const id of ids) assert.deepEqual(await simulation(false,id),expected,`Gameplay changed for ${id}`);
 // Storage-denied initialization and invalid saved data gracefully fall back.
 const privatePage=await browser.newPage();
 await privatePage.evaluateOnNewDocument(()=>{Storage.prototype.getItem=()=>{throw new Error('blocked')};Storage.prototype.setItem=()=>{throw new Error('blocked')};});
 await privatePage.goto(url);assert.equal(await privatePage.evaluate(()=>SpaceInvaderAppearance.current().id),'flat');
 await privatePage.click('#theme-open');await privatePage.click('input[value="neon"]');assert.match(await privatePage.$eval('#theme-status',e=>e.textContent),/cannot be saved/);await privatePage.close();
 assert.deepEqual(errors,[]);
 fs.writeFileSync(`${output}/test-results.json`,JSON.stringify({consoleErrors:errors,timings,frameTimes,simulation:'10 themes × 900 frames identical to origin/main',screenshots:20,checks:'Auto/persistence/storage denied/modal pause-resume/reduced-motion/midgame switch/viewport overflow passed'},null,2));
 console.log(JSON.stringify({errors,timings,frameTimes,simulation:'PASS: original matches all 10 themes'},null,2));
 await browser.close();
})().catch(async e=>{console.error(e);if(runningBrowser)await runningBrowser.close();process.exitCode=1;});
