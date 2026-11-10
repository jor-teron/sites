/* Run with node tests/browser.cjs. A local server must serve the worktree on 8833. */
const puppeteer = require(process.env.HT_PUPPETEER || '/workspace/gg-test/node_modules/puppeteer-core');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 let checks=0;const errors=[];
 try{
  const page=await browser.newPage(); page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const [width,height] of [[1366,900],[390,844],[844,390]]){
   await page.setViewport({width,height,deviceScaleFactor:2,isMobile:width<900,hasTouch:width<900});
   await page.goto('http://127.0.0.1:8833/apps/learn/history-timeline/history-timeline.html',{waitUntil:'networkidle0'});
   await page.waitForFunction(()=>window.HT?.state); await page.click('#all'); await page.waitForFunction(()=>!HT.animating); await page.waitForFunction(()=>HT.state.hits.length>0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);checks++;
   assert(await page.evaluate(()=>{const c=document.querySelector('canvas');return Math.abs(c.width-c.clientWidth*devicePixelRatio)<3;}));checks++;
   await page.select('#lanes','india'); assert(await page.evaluate(()=>HT.state.events.every(e=>e.region==='india')));checks++;
   await page.select('#lanes','both');
   await page.type('#search','Salt March'); await page.waitForFunction(()=>HT.state.events.length===1); await page.click('.event');
   assert.match(await page.$eval('#card',e=>e.textContent),/1930 CE/);checks++;
   await page.$eval('#search',e=>{e.value='';e.dispatchEvent(new Event('input'));});
   for(const mode of ['log','linear']){
    await page.select('#scale',mode); await page.click('#all'); await page.waitForFunction(()=>!HT.animating);
    const range=await page.evaluate(()=>HT.range(HT.state.view));assert(Math.abs(range[0]+300000)<1);checks++;
    await page.click('#decade'); await page.waitForFunction(()=>!HT.animating);const short=await page.evaluate(()=>HT.range(HT.state.view));assert(short[1]-short[0]<=10.1);checks++;
    await page.click('#all'); await page.waitForFunction(()=>!HT.animating); await page.$eval('canvas',e=>e.scrollIntoView({block:'center'})); const r=await page.$eval('canvas',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
    await page.mouse.move(r.x+r.w*.7,r.y+r.h*.6);await page.mouse.wheel({deltaY:-1000});
    await page.waitForFunction(()=>HT.range(HT.state.view)[0]>-299999);checks++;
    await page.click('#all'); await page.waitForFunction(()=>!HT.animating);await page.focus('canvas');await page.keyboard.press('+');assert((await page.evaluate(()=>HT.range(HT.state.view)[0]))>-300000);checks++;
   }
   if(await page.$('.filters')){
    await page.click('[data-topic=science]');assert(await page.evaluate(()=>HT.state.events.length>0&&HT.state.events.every(e=>e.topic==='science')));checks++;
    await page.click('[data-topic=""]');
    assert.equal(await page.evaluate(()=>HT.events.length),350);checks++;
    await page.evaluate(()=>HT.select(HT.events.find(e=>e.id==='independence')));
    if(await page.$('#contemporaries > button'))await page.click('#contemporaries > button');
    assert(await page.$eval('#contemporaries',e=>e.textContent.includes('United Nations founded')));checks++;
    assert.equal(await page.$$eval('.map svg circle',e=>e.length),2);checks++;
    await page.click('#bookmark-event');assert(await page.evaluate(()=>HT.bookmarks.includes('independence')));checks++;
    await page.click('[data-topic=bookmarks]');assert(await page.evaluate(()=>HT.state.events.length===1&&HT.state.events[0].id==='independence'));checks++;
    await page.reload({waitUntil:'networkidle0'});assert(await page.evaluate(()=>HT.bookmarks.includes('independence')));checks++;
    await page.evaluate(()=>HT.select(HT.events.find(e=>e.id==='independence')));await page.click('#bookmark-event');assert(await page.evaluate(()=>HT.bookmarks.length===0));checks++;
   }
   await page.select('#scale','log'); await page.click('#all'); await page.waitForFunction(()=>!HT.animating);
   await page.waitForFunction(()=>HT.state.hits.length>0);
   await page.$eval('canvas',e=>e.scrollIntoView({block:'center'}));
   const hit=await page.evaluate(()=>{const h=HT.state.hits[0],r=document.querySelector('canvas').getBoundingClientRect();return {id:h.e.id,x:r.x+h.x,y:r.y+h.y};});
   await page.mouse.click(hit.x,hit.y);assert.equal(await page.evaluate(()=>HT.state.selected),hit.id);checks++;
   if(width<900){
    const client=await page.createCDPSession();await page.$eval('canvas',e=>e.scrollIntoView({block:'center'}));
    const r=await page.$eval('canvas',e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
    const touch=(x,id)=>({x,y:r.y,id});
    const before=await page.evaluate(()=>HT.state.view.hi-HT.state.view.lo);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(r.x-20,1),touch(r.x+20,2)]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(r.x-90,1),touch(r.x+90,2)]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert((await page.evaluate(()=>HT.state.view.hi-HT.state.view.lo))<before);checks++;
    await client.detach();
   }
   await page.click('#settings');await page.select('#theme','dark');assert.equal(await page.$eval('html',e=>e.dataset.theme),'dark');checks++;
   await page.select('#theme','light');assert.equal(await page.$eval('html',e=>e.dataset.theme),'light');checks++;
   await page.select('#theme','system');await page.click('#close-settings');
   await page.select('#scale','log');await page.click('#all'); await page.waitForFunction(()=>!HT.animating);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
   await page.screenshot({path:`/workspace/ht-build/HT-${width}x${height}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);checks++;
  console.log(`Browser: ${checks} checks passed; 0 console/page errors; 3 viewports @2x DPR`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
