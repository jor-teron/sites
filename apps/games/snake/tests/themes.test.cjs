/* Run a static HTTP server at 127.0.0.1:8824; see ../README.md. */
const puppeteer = require(process.env.PUPPETEER_MODULE || 'puppeteer-core');
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../../'), output = process.env.SNK_SCREENSHOTS || path.join(require('node:os').tmpdir(), 'snk-themes');
fs.mkdirSync(output,{recursive:true});
const baseline = cp.execFileSync('git', ['show','b1796837:apps/games/snake/core/game.js'], {cwd:root,encoding:'utf8'});
const url = 'http://127.0.0.1:8824/apps/games/snake/snake.html';
const ids = ['nokia','arcade','gameboy','neon','garden','desert','jungle','ocean','flat','paper'];
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
 assert.equal(await page.evaluate(()=>SnakeAppearance.current().id),'flat');
 await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','dark'); window.postMessage({type:'hub-prefs'},location.origin);});
 await page.waitForFunction(()=>SnakeAppearance.current().id==='nokia');
 await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','light');window.dispatchEvent(new StorageEvent('storage',{key:'sites-hub.theme',newValue:'light'}));});
 await page.waitForFunction(()=>SnakeAppearance.current().id==='flat');
 await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>SN.G.state),'play');
 for(const id of ids){
  await page.click('#theme-open'); assert.equal(await page.evaluate(()=>SN.G.state),'pause');
  const before=await page.evaluate(()=>({score:SN.G.score,dir:SN.G.dir,wrap:SN.G.wrap,len:SN.G.snake.length,snake:JSON.stringify(SN.G.snake),food:JSON.stringify(SN.G.food),queue:JSON.stringify(SN.G.dirQueue)}));
  await page.click(`input[value="${id}"]`);
  assert.deepEqual(await page.evaluate(()=>({score:SN.G.score,dir:SN.G.dir,wrap:SN.G.wrap,len:SN.G.snake.length,snake:JSON.stringify(SN.G.snake),food:JSON.stringify(SN.G.food),queue:JSON.stringify(SN.G.dirQueue)})),before);
  assert.equal(await page.evaluate(()=>SnakeAppearance.current().id),id);
  if(id==='nokia') await page.screenshot({path:`${output}/settings-mobile.png`});
  await page.click('[aria-label="Close settings"]');
  await page.waitForFunction(()=>SN.G.state==='play');
  for(const [name,width,height] of [['mobile',390,844],['desktop',1440,900]]){
   await page.setViewport({width,height,deviceScaleFactor:2});
   await page.evaluate(()=>{
     SN.resize(); SN.game.resetGame(); SN.G.state='play'; SN.game.hideOverlay();
     SN.G.snake=[[12,9],[11,9],[10,9],[9,9],[8,9],[7,9],[6,9]]; SN.G.dir='right'; SN.G.nextDir='right';
     SN.G.food=[16,6]; SN.G.score=12; SN.el.score.textContent='12'; SN.G.wrap=false; SN.game.setWrapInd?SN.game.setWrapInd():(SN.el.wrapInd.className='wrap-off');
     SN.render.draw(); SN.G.state='pause';
   });
   await page.screenshot({path:`${output}/${id}-${name}.png`});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.evaluate(()=>{SN.G.state='play';SN.game.hideOverlay();});
 }
 await page.reload(); assert.equal(await page.evaluate(()=>SnakeAppearance.current().id),'paper');
 await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','dark'); HubTheme.apply();});
 assert.equal(await page.evaluate(()=>SnakeAppearance.current().id),'paper');
 await page.evaluate(()=>{localStorage.setItem('snake.visualTheme','auto');window.dispatchEvent(new StorageEvent('storage',{key:'snake.visualTheme'}));});
 assert.equal(await page.evaluate(()=>SnakeAppearance.current().id),'nokia');
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 assert.equal(await page.evaluate(()=>SnakeThemes.motion.matches),true);
 await page.evaluate(()=>{SN.game.resetGame();SN.G.state='play';SN.render.draw();});
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
 await page.setViewport({width:390,height:844,deviceScaleFactor:2});
 const timings={};
 for(const id of ids){
  timings[id]=await page.evaluate(id=>{
   localStorage.setItem('snake.visualTheme',id);window.dispatchEvent(new StorageEvent('storage',{key:'snake.visualTheme'}));
   SN.game.resetGame(); SN.G.state='pause'; SN.resize(); SN.render.draw();
   const values=[];for(let i=0;i<180;i++){const start=performance.now();SN.render.draw();values.push(performance.now()-start);}values.sort((a,b)=>a-b);
   return {mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values[Math.floor(values.length*.95)]};
  },id);
 }
 await page.setViewport({width:1440,height:900,deviceScaleFactor:2});
 await page.click('#theme-open'); await page.screenshot({path:`${output}/settings-desktop.png`}); await page.keyboard.press('Escape');
 const frameTimes={};
 await page.setViewport({width:390,height:844,deviceScaleFactor:2});
 for(const id of ids) frameTimes[id]=await page.evaluate(async id=>{
  localStorage.setItem('snake.visualTheme',id);window.dispatchEvent(new StorageEvent('storage',{key:'snake.visualTheme'}));
  SN.game.resetGame(); SN.G.state='play'; SN.game.hideOverlay();
  const deltas=[];let last=0;
  await new Promise(resolve=>{function sample(t){if(last)deltas.push(t-last);last=t;deltas.length<90?requestAnimationFrame(sample):resolve();}requestAnimationFrame(sample);});
  deltas.sort((a,b)=>a-b);return {median:deltas[45],p95:deltas[85],over25ms:deltas.filter(v=>v>25).length};
 },id);
 async function simulation(original,theme){
  const p=await browser.newPage();
  await p.evaluateOnNewDocument(()=>{
   window.requestAnimationFrame=()=>0; let seed=673923;
   Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   window.testTime=0;performance.now=()=>window.testTime;
  });
  if(original){await p.setRequestInterception(true);p.on('request',r=>r.url().endsWith('/core/game.js')?r.respond({status:200,contentType:'text/javascript',body:baseline}):r.continue());}
  await p.goto(url);
  const result=await p.evaluate(theme=>{
   if(theme){localStorage.setItem('snake.visualTheme',theme);window.dispatchEvent(new StorageEvent('storage',{key:'snake.visualTheme'}));}
   SN.game.resetGame(); SN.G.state='play'; const snapshots=[];
   for(let i=0;i<900;i++){
    window.testTime=i*17; SN.G.boost=(i%80)<20;
    if(i%40===10) SN.game.queueDir('up'); if(i%40===20) SN.game.queueDir('left');
    if(i%40===30) SN.game.queueDir('down'); if(i%40===0) SN.game.queueDir('right');
    SN.game.step();
    if(i%30===0) snapshots.push({state:SN.G.state,score:SN.G.score,dir:SN.G.dir,wrap:SN.G.wrap,acc:SN.G.acc,snake:JSON.stringify(SN.G.snake),food:JSON.stringify(SN.G.food),queue:JSON.stringify(SN.G.dirQueue)});
    if(SN.G.state!=='play'){SN.game.resetGame();SN.G.state='play';}
   }
   return snapshots;
  },theme);await p.close();return result;
 }
 const expected=await simulation(true);
 for(const id of ids) assert.deepEqual(await simulation(false,id),expected,`Gameplay changed for ${id}`);
 const privatePage=await browser.newPage();
 await privatePage.evaluateOnNewDocument(()=>{Storage.prototype.getItem=()=>{throw new Error('blocked')};Storage.prototype.setItem=()=>{throw new Error('blocked')};});
 await privatePage.goto(url);assert.equal(await privatePage.evaluate(()=>SnakeAppearance.current().id),'flat');
 await privatePage.click('#theme-open');await privatePage.click('input[value="neon"]');assert.match(await privatePage.$eval('#theme-status',e=>e.textContent),/cannot be saved/);await privatePage.close();
 assert.deepEqual(errors,[]);
 fs.writeFileSync(`${output}/test-results.json`,JSON.stringify({consoleErrors:errors,timings,frameTimes,simulation:'10 themes × 900 frames identical to origin/main',screenshots:22,checks:'Auto/persistence/storage denied/modal pause-resume/reduced-motion/midgame switch/viewport overflow passed'},null,2));
 console.log(JSON.stringify({errors,timings,frameTimes,simulation:'PASS: original matches all 10 themes'},null,2));
 await browser.close();
})().catch(async e=>{console.error(e);if(runningBrowser)await runningBrowser.close();process.exitCode=1;});
