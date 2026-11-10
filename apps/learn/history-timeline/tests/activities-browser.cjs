const puppeteer=require(process.env.HT_PUPPETEER||'/workspace/gg-test/node_modules/puppeteer-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const errors=[];let checks=0,drawMs=0;
 const settle=page=>page.waitForFunction(()=>!HT.animating);
 const attach=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});};
 try{
  const page=await browser.newPage();attach(page);
  for(const [width,height]of [[1366,900],[390,844],[844,390]]){
   await page.setViewport({width,height,deviceScaleFactor:2,hasTouch:width<900,isMobile:width<900});
   await page.goto('http://127.0.0.1:8833/apps/learn/history-timeline/history-timeline.html',{waitUntil:'networkidle0'});
   await page.waitForFunction(()=>HT.tours?.length===4);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;
   for(const tour of await page.evaluate(()=>HT.tours)){
    await page.select('#tour-choice',tour.id);await page.click('#start-tour');await settle(page);
    assert.equal(await page.evaluate(()=>HT.state.selected),tour.ids[0]);checks++;
    const centred=await page.evaluate(()=>{const e=HT.events.find(e=>e.id===HT.state.selected),[a,b]=HT.range(HT.state.view);return e.year>=a&&e.year<=b;});assert(centred);checks++;
    await page.click('#pause-tour');assert.match(await page.$eval('#tour-status',e=>e.textContent),/paused/);checks++;
    await page.click('#tour-next');assert.equal(await page.evaluate(()=>HT.state.selected),tour.ids[1]);checks++;
    await page.click('#tour-prev');assert.equal(await page.evaluate(()=>HT.state.selected),tour.ids[0]);checks++;
    await page.click('#end-tour');assert(await page.$eval('#tour-next',e=>e.disabled));checks++;
   }
   await page.click('#help');assert(await page.$eval('#help-card',e=>e.open&&e.textContent.includes('no year zero')));checks++;await page.click('#close-help');
   if(width<700){assert(await page.evaluate(()=>document.querySelector('#card').getBoundingClientRect().top<document.querySelector('.results').getBoundingClientRect().top));checks++;}
   await page.click('#quiz');await page.click('#order-start');
   assert.equal(await page.$$eval('#quiz-order li',rows=>rows.length),5);checks++;
   // Pointer drag on desktop and portrait touch; landscape keeps keyboard/button fallback.
   if(height>500){
    const before=await page.$$eval('#quiz-order li',rows=>rows.map(e=>e.dataset.quizId));
    const [first,last]=await page.$$eval('#quiz-order li',rows=>[rows[0],rows[4]].map(e=>{const r=e.querySelector('.drag-handle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}));
    if(width>900){await page.mouse.move(last.x,last.y);await page.mouse.down();await page.mouse.move(first.x,first.y,{steps:10});await page.mouse.up();}
    else{const c=await page.createCDPSession();await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...last,id:1}]});await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...first,id:1}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();}
    const after=await page.$$eval('#quiz-order li',rows=>rows.map(e=>e.dataset.quizId));assert.notDeepEqual(before,after);checks++;
   }
   const answer=await page.evaluate(()=>HT.ordered([...document.querySelectorAll('#quiz-order li')].map(li=>HT.events.find(e=>e.id===li.dataset.quizId))).map(e=>e.id));
   for(let i=0;i<answer.length;i++){
    let pos=await page.$$eval('#quiz-order li',(rows,id)=>rows.findIndex(e=>e.dataset.quizId===id),answer[i]);
    while(pos-->i)await page.click(`[data-quiz-id="${answer[i]}"] [data-dir="-1"]`);
   }
   await page.click('#check-order');assert.match(await page.$eval('#quiz-feedback',e=>e.textContent),/100\/100/);checks++;
   assert.equal(await page.evaluate(()=>HT.read('best-order',0)),100);checks++;
   await page.keyboard.press('Escape');await page.click('#quiz');await page.click('#century-start');
   for(let round=0;round<5;round++){
    const n=await page.evaluate(()=>{const title=document.querySelector('#quiz-card h3').textContent;return HT.century(HT.events.find(e=>e.title===title).year);});
    await page.click(`[data-century="${n}"]`);await page.click('#century-next');
   }
   assert.match(await page.$eval('#quiz-card',e=>e.textContent),/Score 100\/100/);checks++;
   assert.equal(await page.evaluate(()=>HT.read('best-century',0)),100);checks++;
   await page.keyboard.press('Escape');await page.reload({waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>HT.read('best-order',0)+HT.read('best-century',0)),200);checks++;
   await page.select('#tour-choice','space');await page.click('#start-tour');await page.click('#pause-tour');
   for(let n=0;n<6;n++)await page.click('#tour-next');await settle(page);
   await page.screenshot({path:`/workspace/ht-build/HT-final-${width}x${height}.png`,fullPage:true});
   await page.click('#tour-next');assert.match(await page.$eval('#tour-status',e=>e.textContent),/complete/);checks++;assert(await page.$eval('#pause-tour',e=>e.disabled));checks++;
   await page.click('#end-tour');
  }
  // Real timed auto-advance, then canvas interaction pauses it.
  await page.setViewport({width:1366,height:900});await page.select('#tour-choice','space');await page.click('#start-tour');
  await page.waitForFunction(()=>HT.state.selected==='gagarin',{timeout:11000});checks++;
  await page.$eval('canvas',e=>e.scrollIntoView({block:'center'}));const r=await page.$eval('canvas',e=>{const r=e.getBoundingClientRect();return{x:r.x+100,y:r.y+100};});
  await page.mouse.move(r.x,r.y);await page.mouse.down();await page.mouse.move(r.x+40,r.y,{steps:3});await page.mouse.up();assert.match(await page.$eval('#tour-status',e=>e.textContent),/paused/);checks++;
  await page.click('#end-tour');
  drawMs=await page.evaluate(()=>{const start=performance.now();for(let i=0;i<200;i++)HT.draw(document.querySelector('canvas'),HT.state);return(performance.now()-start)/200;});assert(drawMs<33);checks++;
  await page.click('#all');await settle(page);await page.click('#in');assert(await page.evaluate(()=>HT.animating));checks++;await settle(page);
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await page.click('#all');assert.equal(await page.evaluate(()=>HT.animating),false);checks++;
  // Hub choice overrides OS; missing Hub choice follows OS; explicit app override wins.
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
  await page.evaluate(()=>{HubTheme.setOwn('system');localStorage.setItem('sites-hub.theme','light');window.dispatchEvent(new StorageEvent('storage',{key:'sites-hub.theme'}));});
  assert.equal(await page.$eval('html',e=>e.dataset.theme),'light');checks++;
  await page.evaluate(()=>{localStorage.removeItem('sites-hub.theme');window.dispatchEvent(new StorageEvent('storage',{key:'sites-hub.theme'}));});assert.equal(await page.$eval('html',e=>e.dataset.theme),'dark');checks++;
  await page.evaluate(()=>{localStorage.setItem('learn.history-timeline.bookmarks','{}');localStorage.setItem('learn.history-timeline.view','{"mode":"nope"}');});await page.reload({waitUntil:'networkidle0'});
  assert(await page.evaluate(()=>HT.bookmarks.length===0&&HT.state.view.mode==='log'));checks++;
  const blocked=await browser.newPage();attach(blocked);await blocked.evaluateOnNewDocument(()=>{Storage.prototype.getItem=function(){throw Error('unavailable');};Storage.prototype.setItem=function(){throw Error('unavailable');};});
  await blocked.goto('http://127.0.0.1:8833/apps/learn/history-timeline/history-timeline.html',{waitUntil:'networkidle0'});assert.equal(await blocked.evaluate(()=>HT.state.events.length),350);checks++;await blocked.close();
  const offline=await browser.newPage();attach(offline);await offline.goto('file:///workspace/sites_ht/apps/learn/history-timeline/history-timeline.html',{waitUntil:'load'});await offline.waitForFunction(()=>HT.state.events.length===350);checks++;await offline.close();
  assert.deepEqual(errors,[]);checks++;
  console.log(`Activities: ${checks} checks passed; 0 console/page errors; draw average ${drawMs.toFixed(2)} ms; 3 viewports @2x DPR; file:// and blocked storage checked`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
