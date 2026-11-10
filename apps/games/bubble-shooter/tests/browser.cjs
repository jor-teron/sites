/* Run with the repo served at 127.0.0.1:8831 and puppeteer-core installed.
 * PUPPETEER_PATH and CHROME_BIN may override local tooling. Screenshots go to /tmp. */
const assert=require('node:assert/strict');
const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer-core');
const URL='http://127.0.0.1:8831/apps/games/bubble-shooter/';
(async()=>{
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage(),errors=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bubble-shooter.save')));
  async function button(label){await page.evaluate(label=>{const b=[...document.querySelectorAll('#cardButtons button')].find(b=>b.textContent===label);if(!b)throw Error('Missing '+label);b.click();},label);}
  async function load(s){const init=await page.evaluateOnNewDocument(s=>localStorage.setItem('bubble-shooter.save',JSON.stringify(s)),s);await page.reload({waitUntil:'networkidle0'});await page.removeScriptToEvaluateOnNewDocument(init.identifier);await button('Resume');}
  try{
    await page.setViewport({width:1280,height:900,deviceScaleFactor:2});await page.goto(URL,{waitUntil:'networkidle0'});
    check('index redirects to game',page.url().endsWith('/bubble-shooter.html'));
    const initial=await page.evaluate(()=>BubbleRules.create(1,BubbleLevels,123));await load(initial);
    check('shared theme defaults to Auto',await page.evaluate(()=>GameSettings.get('theme')==='auto'));
    await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','dark');dispatchEvent(new StorageEvent('storage',{key:'sites-hub.theme'}));});
    check('Auto follows Hub Dark',await page.evaluate(()=>document.documentElement.classList.contains('dark')));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:'/tmp/bub-desktop-dark.png'});
    await page.evaluate(()=>GameSettings.set('theme','light'));
    check('explicit Light overrides Hub Dark',await page.evaluate(()=>!document.documentElement.classList.contains('dark')));
    await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','light');GameSettings.set('theme','auto');dispatchEvent(new StorageEvent('storage',{key:'sites-hub.theme'}));});
    check('Auto follows Hub Light',await page.evaluate(()=>!document.documentElement.classList.contains('dark')));
    check('canvas is DPR crisp',await page.evaluate(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return Math.abs(c.width-r.width*2)<2&&Math.abs(c.height-r.height*2)<2;}));
    const sw={...initial,next:1};await load(sw);await page.click('#swapBtn');let s=await saved();
    check('swap changes current and next without consuming a shot',s.current===1&&s.next===0&&s.shots===0);
    await page.keyboard.press('x');s=await saved();check('X swaps back',s.current===0&&s.next===1);
    await page.click('#muteBtn');check('mute uses shared sfx setting',await page.evaluate(()=>GameSettings.get('sfx')===false));await page.click('#muteBtn');
    await load(initial);
    for(let n=0;n<12;n++){
      s=await saved();if(s.status!=='play')break;
      const plan=await page.evaluate(()=>{
        const B=BubbleRules,s=JSON.parse(localStorage.getItem('bubble-shooter.save'));let best;
        for(let swap=0;swap<2;swap++)for(let i=0;i<=240;i++){
          const angle=-Math.PI+.26+(Math.PI-.52)*i/240,t=B.trajectory(s.board,angle,s.ceiling);if(!t.cell)continue;
          const p=structuredClone(s);if(swap)[p.current,p.next]=[p.next,p.current];const out=B.settle(p,t.cell);
          const gain=out.popped.length+out.dropped.length*2,length=t.points.slice(1).reduce((v,q,i)=>v+Math.hypot(q.x-t.points[i].x,q.y-t.points[i].y),0);
          if(!best||gain>best.gain||gain===best.gain&&length<best.length)best={angle,swap,gain,length};
        }return best;
      });
      if(plan.swap)await page.click('#swapBtn');
      const r=await page.$eval('#board',c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
      await page.mouse.click(r.x+(200+Math.cos(plan.angle)*170)/400*r.w,r.y+(603+Math.sin(plan.angle)*170)/640*r.h);
      await page.waitForFunction(n=>JSON.parse(localStorage.getItem('bubble-shooter.save')).shots>n,{},s.shots);
    }
    s=await saved();check('scripted real-pointer clear of level 1',s.status==='won'&&s.board.length===0&&s.shots===3);
    check('three stars and level 2 unlock persist',await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('bubble-shooter.progress'));return p.stars[1]===3&&p.unlocked===2;}));
    check('best score persisted',await page.evaluate(()=>Number(localStorage.getItem('bubble-shooter.best'))>=785));
    await page.screenshot({path:'/tmp/bub-clear.png'});await button('Next level');check('next level starts', (await saved()).level===2);
    await page.keyboard.press('p');check('P pauses',await page.$eval('#overlay',e=>!e.hidden));
    await page.keyboard.press('Escape');check('Escape resumes',await page.$eval('#overlay',e=>e.hidden));
    await page.click('#helpBtn');check('How to play opens',await page.$eval('#cardTitle',e=>e.textContent==='How to play'));await button('Back');await button('Resume');
    await page.click('#levelsBtn');check('level selector locks future levels',await page.$eval('#levelGrid',e=>e.children.length===21&&e.children[2].disabled));await button('Back');await button('Resume');
    // Keyboard shot and a reload preserve the last settled board exactly.
    await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('bubble-shooter.save')).shots===1);
    const before=await saved();await page.reload({waitUntil:'networkidle0'});
    check('reload offers a paused resume',await page.$eval('#cardTitle',e=>e.textContent==='Paused'));
    check('save/resume preserves all settled state',JSON.stringify(await saved())===JSON.stringify(before));await button('Resume');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    check('hidden tab auto-pauses',await page.$eval('#cardTitle',e=>e.textContent==='Paused'));
    await page.evaluate(()=>{delete document.hidden;});await button('Resume');
    const loss=await page.evaluate(()=>{const B=BubbleRules,s=B.create(1,BubbleLevels,123);s.board=Array.from({length:14},(_,r)=>({r,c:4,color:1}));s.current=0;s.next=1;s.miss=s.limit-1;return s;});
    await load(loss);await page.keyboard.press('Space');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('bubble-shooter.save')).status==='lost');
    check('scripted ceiling-drop loss', (await saved()).ceiling>0&&await page.$eval('#cardTitle',e=>e.textContent==='Bottom line reached'));
    await page.screenshot({path:'/tmp/bub-loss.png'});
    for(const viewport of [{width:390,height:844},{width:844,height:390}]){
      await page.setViewport({...viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true});await load(initial);
      const metrics=await page.evaluate(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,iw:innerWidth,ih:innerHeight,buttons:[...document.querySelectorAll('header button,.controls button,.gs-gear')].every(e=>{const b=e.getBoundingClientRect();return b.x>=0&&b.right<=innerWidth&&b.y>=0&&b.bottom<=innerHeight;})};});
      check(`${viewport.width}×${viewport.height} board and controls fit`,metrics.x>=0&&metrics.y>=0&&metrics.right<=metrics.iw+.1&&metrics.bottom<=metrics.ih+.1&&metrics.buttons);
      check(`${viewport.width}×${viewport.height} has no page scroll`,metrics.sw<=metrics.iw&&metrics.sh<=metrics.ih);
      const cdp=await page.createCDPSession(),x=metrics.x+metrics.w/2,y=metrics.y+metrics.h*.7;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+15,y:y-40}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('bubble-shooter.save')).shots===1);
      check(`${viewport.width}×${viewport.height} touch drag fires without scrolling`,await page.evaluate(()=>scrollX===0&&scrollY===0));
      await page.screenshot({path:`/tmp/bub-${viewport.width}x${viewport.height}.png`});await cdp.detach();
    }
    check('shared clear-progress recognises all Bubble Shooter keys',await page.evaluate(()=>GameSettings.progressKeys().filter(k=>k.startsWith('bubble-shooter.')).length===3));
    // Missing settings is a supported fallback, not a runtime error.
    const context=await browser.createBrowserContext(),offline=await context.newPage();await offline.setRequestInterception(true);offline.on('request',r=>r.url().endsWith('/games-settings.js')?r.abort():r.continue());
    offline.on('pageerror',e=>errors.push(e.message));await offline.goto(URL,{waitUntil:'networkidle0'});
    check('game works without shared settings script',await offline.$eval('#levelName',e=>e.textContent==='First flight'));await context.close();
    check('no console errors',errors.length===0);console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
