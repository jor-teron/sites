/* Serve this worktree on port 8834. HL_PUPPETEER can point at another puppeteer-core. */
const a=require('node:assert/strict');
const p=require(process.env.HL_PUPPETEER || '/workspace/gg-test/node_modules/puppeteer-core');
(async()=>{
  const browser=await p.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  let checks=0; const ok=(v,msg)=>{a.ok(v,msg);checks++;};
  try {
    const page=await browser.newPage(), errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR: '+e.stack);}); page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    await page.goto('http://127.0.0.1:8834/apps/learn/hindi-letters/',{waitUntil:'networkidle0'});
    await page.evaluate(()=>document.fonts.ready);
    ok(await page.$$eval('.letter',e=>e.length===49),'49 letter tiles');
    for(const [width,height] of [[1280,800],[390,844],[844,390]]) {
      await page.setViewport({width,height,deviceScaleFactor:1,hasTouch:true});
      await page.screenshot({path:'/workspace/hl-chart-'+width+'.png',fullPage:width===1280});
      ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
      ok(await page.$$eval('.letter',es=>es.every(e=>e.getBoundingClientRect().height>=44)),'large targets');
      await page.click('.letter');
      ok(await page.$eval('#trace',e=>e.getBoundingClientRect().width>200),'tracing visible');
      await page.screenshot({path:'/workspace/hl-trace-'+width+'.png'});
      await page.click('[data-close="letter-card"]');
    }
    await page.click('.letter');
    const grade=await page.evaluate(()=>{
      const t=Hindi.trace, c=t.ink.getContext('2d'); c.drawImage(t.mask,0,0); return t.grade();
    });
    ok(grade.stars===3 && grade.coverage===1 && grade.precision>.99,'scripted glyph trace earns three stars');
    ok(await page.evaluate(()=>Object.keys(Hindi.progress.traced).length===1),'trace saved');
    await page.evaluate(()=>Hindi.trace.clear());
    ok(await page.evaluate(()=>Hindi.trace.grade().stars===0),'clear removes ink');
    // Exercise real pointer events too; a little mark should not earn full credit.
    const bounds=await page.$eval('#trace',e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width};});
    await page.mouse.move(bounds.x+40,bounds.y+60); await page.mouse.down(); await page.mouse.move(bounds.x+70,bounds.y+80,{steps:4}); await page.mouse.up();
    ok(await page.evaluate(()=>Hindi.trace.grade().stars<3),'short pointer trace not full credit');
    await page.click('[data-close="letter-card"]');
    await page.click('#settings'); ok(await page.$eval('#theme',e=>e.value==='system'),'Auto default');
    await page.select('#theme','dark'); ok(await page.evaluate(()=>document.documentElement.dataset.theme==='dark'),'dark theme');
    await page.select('#theme','light'); ok(await page.evaluate(()=>document.documentElement.dataset.theme==='light'),'light theme');
    await page.select('#theme','system'); await page.click('[data-close="preferences"]');
    await page.evaluate(()=>{localStorage.setItem('sites-hub.theme','dark'); window.dispatchEvent(new Event('storage'));});
    ok(await page.evaluate(()=>document.documentElement.dataset.theme==='dark'),'follows Hub');
    await page.reload({waitUntil:'networkidle0'}); ok(await page.evaluate(()=>Object.keys(Hindi.progress.traced).length===1),'resume stored progress');
    if(await page.$('[data-mode="matras"]')) {
      await page.click('[data-mode="matras"]');
      ok(await page.$$eval('.study-card',es=>es.length===13),'13 matra forms');
      await page.select('#consonant','क');
      ok(await page.$$eval('.study-card .glyph',es=>es[2].textContent==='कि'),'pre-base i renders in logical order');
      await page.click('.study-card:nth-child(3)');
      ok((await page.$eval('#matra-hint',e=>e.textContent)).includes('AFTER'),'matra hint');
      for(const mode of ['matras','joins','numbers','words']) {
        await page.click('[data-mode="'+mode+'"]');
        if(mode==='find'||mode==='listen') ok(await page.evaluate(()=>{const q=Hindi.current(Hindi.game);return document.querySelector('[data-answer="'+q.target.id+'"]').textContent===q.target.glyph;}),'letter choices show letters, not example words');
        for(const [width,height] of [[390,844],[844,390]]) {
          await page.setViewport({width,height,deviceScaleFactor:1,hasTouch:true});
          ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),mode+' phone width');
          await page.screenshot({path:'/workspace/hl-'+mode+'-'+width+'.png'});
        }
      }
      ok(await page.$$eval('.picture-card',es=>es.length===200),'200 picture cards');
      await page.select('#word-theme','fruits'); ok(await page.$$eval('.picture-card',es=>es.length===25),'fruit filter');
      await page.type('#word-search','mango'); ok(await page.$$eval('.picture-card',es=>es.length===1 && es[0].textContent.includes('आम')),'English search');
      // Exercise speech selection without requiring an installed headless voice.
      const speech=await page.evaluate(()=>{
        const calls=[]; speechSynthesis.getVoices=()=>[{lang:'en-US',name:'English'},{lang:'hi-IN',name:'Hindi'}];
        speechSynthesis.speak=u=>calls.push({lang:u.lang,text:u.text,voice:u.voice.lang});
        // SpeechSynthesisUtterance.voice requires a native voice object; stub utterance for unit integration.
        window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
        speechSynthesis.dispatchEvent(new Event('voiceschanged')); Hindi.speak('आम');
        Hindi.prefs.audio=false; Hindi.speak('क'); Hindi.prefs.audio=true;
        return calls;
      });
      ok(speech.length===1 && speech[0].lang==='hi-IN' && speech[0].text==='आम','Hindi voice + audio off');
    }
    await page.setViewport({width:1280,height:900,deviceScaleFactor:1,hasTouch:true});
    await page.click('[data-mode="chart"]'); await page.click('.letter');
    ok(await page.evaluate(()=>{const t=Hindi.trace,c=t.ink.getContext('2d');c.fillRect(0,0,320,320);return t.grade().stars<3;}),'whole-box scribbling is not three stars');
    const strokes=await page.evaluate(()=>{
      Hindi.trace.clear(); document.getElementById('trace').scrollIntoView({block:'center'});
      const t=Hindi.trace,ctx=t.mask.getContext('2d'),w=320,d=ctx.getImageData(0,0,w,w).data,lines=[];
      for(let y=0;y<w;y+=6) {let start=-1;for(let x=0;x<=w;x++) {
        const on=x<w && d[(y*w+x)*4+3]>100;
        if(on && start<0) start=x;
        if(!on && start>=0) {lines.push([start,y,x-1,y]);start=-1;}
      }}return lines;
    });
    const box=await page.$eval('#trace',e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width};});
    for(const [x1,y1,x2,y2] of strokes) {
      await page.mouse.move(box.x+x1*box.w/320,box.y+y1*box.w/320);await page.mouse.down();
      await page.mouse.move(box.x+x2*box.w/320,box.y+y2*box.w/320);await page.mouse.up();
    }
    const pointerGrade=await page.evaluate(()=>Hindi.trace.grade());
    ok(pointerGrade.stars===3 && pointerGrade.coverage>.95,'scripted pointer trace follows glyph and earns three stars');
    await page.screenshot({path:'/workspace/hl-script-trace.png'});
    await page.click('[data-close="letter-card"]');
    if(await page.$('[data-mode="games"]')) {
      await page.evaluate(()=>{speechSynthesis.getVoices=()=>[];speechSynthesis.dispatchEvent(new Event('voiceschanged'));});
      for(const mode of ['find','picture','build','listen']) {
        await page.click('[data-mode="games"]');await page.click('[data-game="'+mode+'"]');
        if(mode==='find'||mode==='listen') ok(await page.evaluate(()=>{const q=Hindi.current(Hindi.game);return document.querySelector('[data-answer="'+q.target.id+'"]').textContent===q.target.glyph;}),'letter choices show letters, not example words');
        for(const [width,height] of [[390,844],[844,390]]) {
          await page.setViewport({width,height,hasTouch:true,deviceScaleFactor:1});
          await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
          ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),mode+' phone game width');
          ok(await page.$$eval('.answer,.word-tile,#check-word,.game-head button',es=>es.every(e=>{const b=e.getBoundingClientRect();return b.height>=44 && b.top>=0 && b.bottom<=innerHeight;})),mode+' phone game controls visible and tappable');
          await page.screenshot({path:'/workspace/hl-game-'+mode+'-'+width+'.png'});
        }
        if(mode==='listen') ok((await page.$eval('#game-prompt',e=>e.textContent)).includes('transliteration'),'listen fallback');
        await page.click('.game-head button');
        ok(await page.evaluate(()=>Hindi.game.paused && Hindi.answer(Hindi.game,Hindi.current(Hindi.game).target.id)===null),'pause freezes answers');
        await page.click('#resume-game');
        for(let i=0;i<10;i++) {
          if(mode==='build') {
            const order=await page.evaluate(()=>{
              const q=Hindi.current(Hindi.game),used=[];
              return Hindi.units(q.target.word).map(u=>{const n=q.tiles.findIndex((t,i)=>t.text===u&&!used.includes(i));used.push(n);return n;});
            });
            for(const n of order) await page.click('[data-tile="'+n+'"]');
            await page.click('#check-word');
          } else {
            const id=await page.evaluate(()=>Hindi.current(Hindi.game).target.id); await page.click('[data-answer="'+id+'"]');
          }
          await page.click('#next-question');
        }
        ok(await page.evaluate(mode=>Hindi.game.finished && Hindi.game.correct===10 && Hindi.rewards.best[mode]===3,mode),'ten correct rounds in '+mode);
      }
      ok(await page.evaluate(()=>Object.values(Hindi.rewards.best).reduce((s,n)=>s+n,0)===12),'12 game stars saved');
      ok(await page.evaluate(()=>Hindi.rewards.streak.count===1),'same-day activities count once');
      await page.click('[data-mode="games"]');await page.click('[data-game="find"]');
      const wrong=await page.evaluate(()=>Hindi.current(Hindi.game).options.find(x=>x.id!==Hindi.current(Hindi.game).target.id).id);
      await page.click('[data-answer="'+wrong+'"]');
      ok(await page.evaluate(()=>Hindi.game.correct===0 && Hindi.current(Hindi.game).answered),'wrong answer feedback locks round');
      await page.click('.game-head button');await page.click('#quit-game');
      ok(await page.evaluate(()=>Hindi.game===null && Hindi.rewards.best.find===3),'quit preserves best but awards nothing');
      await page.click('#mute');ok(await page.$eval('#mute',e=>e.getAttribute('aria-pressed')==='true'),'sound mute');
      await page.click('#help');ok(await page.$eval('#help-card',e=>e.open),'help opens');await page.click('[data-close="help-card"]');
      await page.reload({waitUntil:'networkidle0'});
      ok(await page.evaluate(()=>Hindi.prefs.muted && Hindi.rewards.best.build===3),'settings and game stars survive reload');
    }
    const storagePage=await browser.newPage();
    storagePage.on('pageerror',e=>errors.push(e.message));
    await storagePage.evaluateOnNewDocument(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage disabled');}});});
    await storagePage.goto('http://127.0.0.1:8834/apps/learn/hindi-letters/hindi-letters.html',{waitUntil:'networkidle0'});
    ok(await storagePage.$$eval('.letter',es=>es.length===49),'practice works with blocked storage');
    await storagePage.close();
    ok(errors.length===0,errors.join('\n')); console.log('HL browser: '+checks+' checks passed; zero console errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
