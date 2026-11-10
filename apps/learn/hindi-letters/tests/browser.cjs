/* Serve this worktree on port 8834. HL_PUPPETEER can point at another puppeteer-core. */
const a=require('node:assert/strict');
const p=require(process.env.HL_PUPPETEER || '/workspace/gg-test/node_modules/puppeteer-core');
(async()=>{
  const browser=await p.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  let checks=0; const ok=(v,msg)=>{a.ok(v,msg);checks++;};
  try {
    const page=await browser.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
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
    ok(errors.length===0,errors.join('\n')); console.log('HL browser: '+checks+' checks passed; zero console errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
