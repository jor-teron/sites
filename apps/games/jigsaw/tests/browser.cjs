/* Run the site's HTTP server on 8827, then:
 * PUPPETEER_PATH=/path/to/puppeteer-core node apps/games/jigsaw/tests/browser.cjs
 * No browser/profile from another worker is reused. */
const assert=require('node:assert/strict');
const path=require('node:path');
const puppeteer=require(process.env.PUPPETEER_PATH || 'puppeteer-core');
(async()=>{
  const browser=await puppeteer.launch({executablePath:process.env.CHROME || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0']});
  const page=await browser.newPage(),errors=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('dialog',d=>d.accept());
  const base=process.env.JIG_URL || 'http://127.0.0.1:8827/apps/games/jigsaw/';
  const ready=()=>page.waitForFunction(()=>window.JigsawTest?.snapshot().state?.pieces.length>0);
  const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name);};
  try{
    await page.setViewport({width:1280,height:900,deviceScaleFactor:2});
    await page.goto(base+'?test=1');await ready();
    await check('index redirect and default shared Auto theme',async()=>{
      assert.ok(page.url().includes('jigsaw.html?test=1'));
      assert.equal(await page.evaluate(()=>GameSettings.get('theme')),'auto');
      assert.equal(await page.$eval('#size',el=>el.options.length),7);
      assert.equal(await page.$eval('#picture',el=>el.options.length),6);
      assert.ok((await page.$eval('#gear a',el=>el.href)).endsWith('?from=jigsaw'));
    });
    await check('six original built-in pictures render',async()=>{
      for(let i=0;i<6;i++){
        await page.evaluate(i=>JigsawTest.start(i,12),i);
        assert.equal(await page.evaluate(()=>JigsawTest.renderer.cache.size),12);
      }
    });
    await check('real mouse pointer drag snaps piece onto the board',async()=>{
      await page.evaluate(()=>JigsawTest.start(0,12));
      const coords=await page.evaluate(()=>{
        const {state}=JigsawTest.snapshot(),p=state.pieces.at(-1),v=JigsawTest.renderer.view,b=document.getElementById('board').getBoundingClientRect();
        return {from:{x:b.x+v.x+(p.x+state.w/2)*v.scale,y:b.y+v.y+(p.y+state.h/2)*v.scale},
          to:{x:b.x+v.x+(p.tx+state.w/2)*v.scale,y:b.y+v.y+(p.ty+state.h/2)*v.scale},id:p.id};
      });
      await page.mouse.move(coords.from.x,coords.from.y);await page.mouse.down();
      await page.mouse.move(coords.to.x,coords.to.y,{steps:10});await page.mouse.up();
      assert.ok(await page.evaluate(id=>JigsawTest.snapshot().state.pieces[id].locked,coords.id));
    });
    await check('off-board neighbour joining and group save/resume',async()=>{
      await page.evaluate(()=>JigsawTest.start(2,24));
      await page.evaluate(()=>{
        const {state}=JigsawTest.snapshot(),a=state.pieces[0],b=state.pieces[1],v=JigsawTest.renderer;
        const pt=v.world(v.width*.35,v.height*.8);
        JigsawTest.move(0,pt.x-a.x,pt.y-a.y);
        JigsawTest.drop(1,pt.x+(b.tx-a.tx)+2,pt.y+2);
      });
      let before=await page.evaluate(()=>JigsawTest.snapshot());
      assert.equal(before.state.pieces[0].group,before.state.pieces[1].group);
      assert.equal(before.state.pieces[0].locked,false);
      await page.reload();await ready();
      const after=await page.evaluate(()=>JigsawTest.snapshot());
      assert.deepEqual(after.state.pieces,before.state.pieces);
      assert.equal(after.picture,2);assert.ok((await page.$eval('#status',el=>el.textContent)).includes('resumed'));
    });
    await check('edges filter hides only interior loose groups and ghost toggle saves',async()=>{
      await page.click('#edges');await page.click('#ghost');
      const data=await page.evaluate(()=>{
        const {state}=JigsawTest.snapshot(),shown=JigsawTest.renderer.edgeGroups(state);
        return {all:state.count,visible:state.pieces.filter(p=>shown.has(p.group)).length,
          saved:JSON.parse(localStorage.getItem('jigsaw.save'))};
      });
      assert.ok(data.visible<data.all);assert.ok(data.visible>0);assert.ok(data.saved.edges && data.saved.ghost);
      await page.reload();await ready();assert.ok(await page.$eval('#edges',el=>el.checked));assert.ok(await page.$eval('#ghost',el=>el.checked));
    });
    await check('shared Hub Light/Dark and explicit theme override',async()=>{
      await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','dark');dispatchEvent(new StorageEvent('storage',{key:'sites-hub.theme'}));});
      assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('dark')));
      await page.evaluate(()=>GameSettings.set('theme','light'));
      assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),false);
      await page.evaluate(()=>GameSettings.set('theme','auto'));
      await page.evaluate(()=>GameSettings.set('showHints',false));assert.ok(await page.$eval('#hint',el=>el.hidden));
      await page.evaluate(()=>GameSettings.set('showHints',true));assert.equal(await page.$eval('#hint',el=>el.hidden),false);
    });
    await check('timer counts play and freezes while paused',async()=>{
      // First pointer drag already started the timer in the earlier puzzle; start this clock with a pointer.
      await page.evaluate(()=>JigsawTest.start(1,12));
      const pt=await page.evaluate(()=>{const {state}=JigsawTest.snapshot(),p=state.pieces.at(-1),v=JigsawTest.renderer.view,b=document.getElementById('board').getBoundingClientRect();return {x:b.x+v.x+(p.x+state.w/2)*v.scale,y:b.y+v.y+(p.y+state.h/2)*v.scale};});
      await page.mouse.move(pt.x,pt.y);await page.mouse.down();await page.mouse.up();
      await page.waitForFunction(()=>JigsawTest.snapshot().elapsed>=1.1);
      await page.click('#pauseBtn');const t=await page.evaluate(()=>JigsawTest.snapshot().elapsed);
      await page.waitForFunction(()=>document.getElementById('time').textContent.length>0);
      await new Promise(r=>setTimeout(r,1150));
      assert.equal(await page.evaluate(()=>JigsawTest.snapshot().elapsed),t);
      await page.click('#resume');assert.equal(await page.evaluate(()=>JigsawTest.snapshot().paused),false);
    });
    for(const viewport of [{width:390,height:844},{width:844,height:390}])await check(`phone ${viewport.width}×${viewport.height} fits and touch drags without scroll`,async()=>{
      await page.setViewport({...viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true});
      await page.evaluate(()=>JigsawTest.start(0,12));
      await page.waitForFunction(()=>document.getElementById('board').width===Math.round(document.getElementById('board').getBoundingClientRect().width*devicePixelRatio));
      const sizes=await page.evaluate(()=>{const b=document.getElementById('board').getBoundingClientRect();return {right:b.right,bottom:b.bottom,w:b.width,h:b.height,scroll:document.documentElement.scrollWidth,ih:innerHeight,iw:innerWidth};});
      assert.ok(sizes.w>200 && sizes.h>180);assert.ok(sizes.right<=sizes.iw+1 && sizes.bottom<=sizes.ih+1);assert.ok(sizes.scroll<=sizes.iw);
      const coords=await page.evaluate(()=>{
        const {state}=JigsawTest.snapshot(),p=state.pieces.at(-1),v=JigsawTest.renderer.view,b=document.getElementById('board').getBoundingClientRect();
        return {from:{x:b.x+v.x+(p.x+state.w/2)*v.scale,y:b.y+v.y+(p.y+state.h/2)*v.scale},to:{x:b.x+v.x+(p.tx+state.w/2)*v.scale,y:b.y+v.y+(p.ty+state.h/2)*v.scale},id:p.id};
      });
      const client=await page.createCDPSession();
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[coords.from]});
      for(let i=1;i<=8;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:coords.from.x+(coords.to.x-coords.from.x)*i/8,y:coords.from.y+(coords.to.y-coords.from.y)*i/8}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();
      assert.ok(await page.evaluate(id=>JigsawTest.snapshot().state.pieces[id].locked,coords.id));
      assert.equal(await page.evaluate(()=>scrollY),0);
      if(process.env.JIG_SHOTS)await page.screenshot({path:`${process.env.JIG_SHOTS}/jigsaw-${viewport.width}x${viewport.height}.png`});
    });
    await check('own photo stays local and resumes after reload',async()=>{
      await page.setViewport({width:1280,height:900,deviceScaleFactor:2});
      const requests=[];const listener=r=>{if(/^https?:/.test(r.url()) && (r.method()!=='GET' || !r.url().startsWith(new URL(base).origin+'/')))requests.push(r.url());};
      page.on('request',listener);
      const input=await page.$('#photo');await input.uploadFile(path.resolve(__dirname,'../jigsaw_icon.png'));
      await page.waitForFunction(()=>String(JigsawTest.snapshot().picture).startsWith('photo-'));
      const id=await page.evaluate(()=>JigsawTest.snapshot().picture);
      page.off('request',listener);assert.deepEqual(requests,[]);
      await page.reload();await ready();assert.equal(await page.evaluate(()=>JigsawTest.snapshot().picture),id);
    });
    await check('300-piece cached drawing performance and completion card via normal drops',async()=>{
      const metrics=await page.evaluate(async()=>{
        const begin=performance.now();await JigsawTest.start(4,300);const setup=performance.now()-begin;
        const times=[];for(let i=0;i<40;i++){const t=performance.now();JigsawTest.draw();times.push(performance.now()-t);}
        const frames=[];let previous=await new Promise(requestAnimationFrame);
        for(let i=0;i<35;i++){JigsawTest.move(299,i%2?1:-1,0);JigsawTest.draw();
          const now=await new Promise(requestAnimationFrame);frames.push(now-previous);previous=now;}frames.sort((a,b)=>a-b);
        times.sort((a,b)=>a-b);const cached=JigsawTest.renderer.cache.size,bitmaps=[...JigsawTest.renderer.cache.values()].reduce((n,b)=>n+b.bitmap.width*b.bitmap.height*4,0);
        for(const p of JigsawTest.snapshot().state.pieces)JigsawTest.drop(p.id,p.tx,p.ty);
        return {setup,median:times[20],p95:times[38],frameP95:frames[33],cached,bitmapMiB:bitmaps/1048576,
          complete:JigsawTest.snapshot().state.pieces.every(p=>p.locked),card:!document.getElementById('over').hidden,result:document.getElementById('result').textContent};
      });
      assert.equal(metrics.cached,300);assert.ok(metrics.complete && metrics.card);assert.ok(metrics.result.includes('300 pieces'));
      assert.ok(metrics.p95<80,`300-piece drawing p95 ${metrics.p95.toFixed(1)}ms`);
      assert.ok(metrics.frameP95<85,`300-piece frame p95 ${metrics.frameP95.toFixed(1)}ms`);console.log('PERFORMANCE',JSON.stringify(metrics));
      await page.reload();await ready();assert.equal(await page.$eval('#over',el=>el.hidden),false);
      assert.ok(await page.$eval('#best',el=>el.textContent!=='—'));
    });
    await check('all seven piece counts render at both phone sizes',async()=>{
      for(const v of [{width:390,height:844},{width:844,height:390}]){
        await page.setViewport({...v,deviceScaleFactor:2,isMobile:true,hasTouch:true});
        for(const n of [12,24,48,100,150,200,300]){await page.evaluate(n=>JigsawTest.start(0,n),n);
          assert.equal(await page.evaluate(()=>JigsawTest.renderer.cache.size),n);}
        const frames=await page.evaluate(async()=>{
          const samples=[];let previous=await new Promise(requestAnimationFrame);
          for(let i=0;i<25;i++){JigsawTest.move(299,i%2?1:-1,0);JigsawTest.draw();
            const now=await new Promise(requestAnimationFrame);samples.push(now-previous);previous=now;}
          samples.sort((a,b)=>a-b);return {median:samples[12],p95:samples[23]};
        });
        console.log('PHONE PERFORMANCE',JSON.stringify({...v,...frames}));assert.ok(frames.p95<85);
      }
    });
    await check('corrupt saved puzzle safely falls back to a new puzzle',async()=>{
      // Inject after pagehide, because the departing page intentionally autosaves there.
      const patch=await page.evaluateOnNewDocument(()=>localStorage.setItem('jigsaw.save','{"version":1,"count":300,"pieces":[]}'));
      await page.reload();await ready();await page.removeScriptToEvaluateOnNewDocument(patch.identifier);
      assert.equal(await page.evaluate(()=>JigsawTest.snapshot().state.count),24);
    });
    await check('storage quota failure does not break play',async()=>{
      const patch=await page.evaluateOnNewDocument(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError');};});
      await page.reload();await ready();await page.evaluate(()=>JigsawTest.start(0,12));
      assert.ok((await page.$eval('#status',el=>el.textContent)).includes('Storage unavailable'));
      const solved=await page.evaluate(()=>{for(const p of JigsawTest.snapshot().state.pieces)JigsawTest.drop(p.id,p.tx,p.ty);return !document.getElementById('over').hidden;});assert.ok(solved);
      await page.removeScriptToEvaluateOnNewDocument(patch.identifier);await page.reload();await ready();
    });
    await check('optional shared settings missing still allows game play',async()=>{
      await page.setRequestInterception(true);page.on('request',r=>{
        if(r.url().endsWith('/common/settings/games-settings.js'))r.respond({status:200,contentType:'text/javascript',body:'/* optional library unavailable */'});else r.continue();
      });
      await page.reload();await ready();await page.evaluate(()=>JigsawTest.start(0,12));
      assert.equal(await page.evaluate(()=>JigsawTest.snapshot().state.count),12);
    });
    await check('classic scripts also open directly from file URL',async()=>{
      const local=await browser.newPage();local.on('pageerror',e=>errors.push(e.message));
      await local.goto('file://'+path.resolve(__dirname,'../jigsaw.html')+'?test=1');
      await local.waitForFunction(()=>window.JigsawTest?.snapshot().state?.count===24);await local.close();
    });
    await check('no browser console errors or uncaught exceptions',async()=>assert.deepEqual(errors,[]));
    console.log(`Browser checks: ${results.length} passed`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
