/* npm install --prefix .test-tools puppeteer-core; serve root on 8823 before running. */
const assert=require('node:assert/strict'),path=require('node:path');
const puppeteer=require(process.env.MINE_PUPPETEER||path.resolve(__dirname,'../../../../.test-tools/node_modules/puppeteer-core'));
const URL='http://127.0.0.1:8823/apps/games/minesweeper/',delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('minesweeper.save'))),cell=i=>`[data-index="${i}"]`;
    await page.setViewport({width:1280,height:900});await page.goto(URL);await page.waitForSelector('.cell');
    assert.ok(page.url().endsWith('minesweeper.html'));assert.equal(await page.evaluate(()=>GameSettings.get('theme')),'auto');
    await page.click(cell(40));let s=await state();assert.equal(s.game.cells[40].number,0);assert.ok(s.game.opened>1);
    const target=s.game.cells.findIndex(c=>!c.open);await page.click(cell(target),{button:'right'});assert.equal(await page.$eval('#remaining',e=>e.textContent),'9');
    await page.click('#questions');await page.click(cell(target),{button:'right'});assert.equal((await state()).game.cells[target].mark,2);assert.equal(await page.$eval('#remaining',e=>e.textContent),'10');
    await page.click(cell(target),{button:'right'});assert.equal((await state()).game.cells[target].mark,0);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('minesweeper.save')).elapsed>=1000);
    s=await state();await page.reload();await page.waitForSelector('.cell');assert.deepEqual((await state()).game,s.game);assert.match(await page.$eval('#status',e=>e.textContent),/resumed/);
    const theme=await browser.newPage();await theme.goto(URL+'minesweeper.html');await theme.evaluate(()=>localStorage.setItem('sites-hub.theme','dark'));
    await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));await theme.evaluate(()=>localStorage.setItem('sites-hub.theme','light'));
    await page.waitForFunction(()=>!document.documentElement.classList.contains('dark'));await theme.close();await page.bringToFront();
    async function fixture(kind){
      const data=await page.evaluate(kind=>{
        const R=MineRules;let g,n;
        for(let seed=1;seed<100;seed++){
          let z=seed;const rng=()=>{z^=z<<13;z^=z>>>17;z^=z<<5;return(z>>>0)/4294967296;};
          g=R.create();R.reveal(g,40,rng);n=g.cells.findIndex((c,i)=>c.open&&c.number&&R.neighbours(g,i).some(j=>!g.cells[j].open&&!g.cells[j].mine));if(n>=0)break;
        }
        if(kind==='win'){
          const last=g.cells.findIndex(c=>!c.mine&&!c.open);R.flag(g,last);
          for(let i=0;i<g.cells.length;i++)if(!g.cells[i].mine&&!g.cells[i].open&&i!==last)R.reveal(g,i);R.flag(g,last);n=last;
          if(g.status!=='playing'||g.opened!==g.cells.length-g.mines-1)throw Error('bad win fixture');
        }else{
          const around=R.neighbours(g,n),mines=around.filter(i=>g.cells[i].mine);
          for(const i of mines.slice(kind==='wrong'?1:0))R.flag(g,i);
          if(kind==='wrong')R.flag(g,around.find(i=>!g.cells[i].mine&&!g.cells[i].open));
        }
        return{n,save:JSON.stringify({version:1,game:g,elapsed:12000})};
      },kind);
      // Outgoing pagehide saves before the next document's injection.
      const hook=await page.evaluateOnNewDocument(save=>localStorage.setItem('minesweeper.save',save),data.save);
      await page.reload();await page.waitForSelector('.cell');await page.removeScriptToEvaluateOnNewDocument(hook.identifier);return data.n;
    }
    let n=await fixture('chord');s=await state();await page.click(cell(n));assert.ok((await state()).game.opened>s.game.opened);assert.notEqual((await state()).game.status,'lost');
    n=await fixture('wrong');await page.click(cell(n));assert.equal((await state()).game.status,'lost');assert.equal(await page.$$eval('.cell.mine',a=>a.length),10);assert.equal(await page.$$eval('.cell.wrong',a=>a.length),1);
    n=await fixture('win');await page.click(cell(n));assert.equal((await state()).game.status,'won');assert.equal(await page.$eval('#remaining',e=>e.textContent),'0');
    assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('minesweeper.best')).easy>=12000));
    await page.reload();await page.waitForSelector('.cell');assert.match(await page.$eval('#best',e=>e.textContent),/0:12/);
    await page.select('#difficulty','custom');await page.$eval('#width',e=>e.value=-20);await page.$eval('#height',e=>e.value=100);await page.$eval('#mines',e=>e.value=99999);await page.click('#custom button');
    s=await state();assert.deepEqual([s.game.width,s.game.height,s.game.mines],[5,30,141]);
    await page.select('#difficulty','easy');await page.click(cell(40));
    await Promise.all([page.waitForNavigation(),page.click('#gearSlot a')]);assert.ok(page.url().includes('from=minesweeper'));
    await page.goBack();await page.waitForSelector('.cell');assert.equal((await state()).game.status,'playing');assert.ok((await state()).game.opened>0);
    await page.click('#mute');await page.reload();await page.waitForSelector('.cell');assert.equal(await page.$eval('#mute',e=>e.textContent),'Unmute');
    await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});await page.select('#difficulty','easy');
    const cdp=await page.createCDPSession();const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
    let rect=await page.$eval(cell(40),e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
    await touch('touchStart',rect.x,rect.y);await delay(470);await touch('touchEnd');await delay(100);
    s=await state();assert.equal(s.game.status,'ready');assert.equal(s.game.cells[40].mark,1);assert.equal(s.game.opened,0);
    await page.click('#reset');await page.click('#flagMode');await page.tap(cell(0));assert.equal((await state()).game.cells[0].mark,1);
    await page.click('#flagMode');await page.tap(cell(40));assert.ok((await state()).game.opened>0);
    for(const[width,height]of[[390,844],[844,390]]){
      await page.setViewport({width,height,isMobile:true,hasTouch:true,deviceScaleFactor:1});
      for(const level of['easy','medium','hard']){
        await page.select('#difficulty',level);await delay(50);
        const layout=await page.evaluate(()=>{
          const w=document.getElementById('boardWrap'),r=w.getBoundingClientRect();return{fits:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight,
            visible:r.height>100&&r.width>100&&r.right<=innerWidth&&r.bottom<=innerHeight,cell:document.querySelector('.cell').offsetWidth,scrolls:w.scrollWidth>w.clientWidth||w.scrollHeight>w.clientHeight};
        });
        assert.ok(layout.fits&&layout.visible,JSON.stringify({width,height,level,layout}));assert.ok(layout.cell>=20);if(level==='hard')assert.ok(layout.scrolls);
      }
    }
    await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});await page.select('#difficulty','easy');await page.select('#difficulty','hard');
    rect=await page.$eval(cell(8),e=>{const r=e.getBoundingClientRect();return{x:r.x+10,y:r.y+10};});
    await touch('touchStart',rect.x,rect.y);await touch('touchMove',rect.x-100,rect.y);await touch('touchEnd');await delay(100);
    s=await state();assert.equal(s.game.opened,0);assert.equal(s.game.cells.filter(c=>c.mark).length,0);assert.ok(await page.$eval('#boardWrap',e=>e.scrollLeft>0));assert.equal(await page.evaluate(()=>scrollY),0);
    await page.select('#difficulty','easy');await delay(700);await page.click(cell(40));await page.click('#helpBtn');await delay(1100);
    const duringHelp=(await state()).elapsed;await delay(1100);assert.ok(Math.abs((await state()).elapsed-duringHelp)<20);await page.click('#helpClose');
    // Keyboard flag and reveal still work after touch synthetic-click suppression expires.
    await page.click('#reset');await page.focus(cell(0));await page.keyboard.press('f');assert.equal((await state()).game.cells[0].mark,1);
    await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.ok((await state()).game.opened>0);
    const isolated=await browser.newPage();isolated.on('pageerror',e=>errors.push(e.message));
    await isolated.evaluateOnNewDocument(()=>{Storage.prototype.getItem=()=>{throw Error('blocked');};Storage.prototype.setItem=()=>{throw Error('blocked');};});
    await isolated.goto(URL+'minesweeper.html');await isolated.waitForSelector('.cell');await isolated.click(cell(40));assert.match(await isolated.$eval('#status',e=>e.textContent),/Clear every safe/);await isolated.close();
    assert.deepEqual(errors,[]);console.log('PASS: desktop, 390x844 and 844x390; first opening, flags/?/counter, timer/resume, Hub theme, correct/wrong chording, win/loss/mines/wrong flags, records, Custom clamps, settings return, mute, touch hold/tap/flag mode/Hard drag, keyboard, help pause, blocked storage; no console/page/network errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
