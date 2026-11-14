(function () {
  'use strict';
  const H=window.Hindi, $=id=>document.getElementById(id);
  const raw=H.read('progress',{});
  H.progress={ learned:raw.learned && typeof raw.learned==='object' ? raw.learned : {}, traced:raw.traced && typeof raw.traced==='object' ? raw.traced : {} };
  H.el=function(tag,text,cls) { const e=document.createElement(tag); if(text!==undefined) e.textContent=text; if(cls) e.className=cls; return e; };
  H.button=function(text,fn,cls) { const b=H.el('button',text,cls); b.onclick=fn; return b; };
  const {el,button}=H;
  function progress() {
    $('progress').textContent=Object.keys(H.progress.learned).length+'/'+H.letters.length+' learned · '+Object.keys(H.progress.traced).length+' traced';
    H.write('progress',H.progress);
  }
  H.updateProgress=progress;
  H.showLetter=function(letter) {
    H.stopSpeech(); const box=$('letter-detail'); box.replaceChildren(); $('letter-title').textContent=letter.roman+' · '+letter.glyph;
    const layout=el('div',undefined,'detail-grid'), info=el('section',undefined,'letter-info');
    const glyph=el('p',letter.glyph,'big-letter hi'); glyph.lang='hi'; info.append(glyph);
    const example=el('div'); example.append(el('span',letter.emoji+' ','emoji'),el('strong',letter.word,'hi example'),el('p',letter.meaning)); info.append(example);
    const controls=el('div',undefined,'row'); controls.append(button('Hear letter',()=>H.speak(letter.glyph)),button('Hear word',()=>H.speak(letter.word)));
    info.append(controls,el('p',letter.hint),el('p',letter.note,'note'));
    const learned=button(H.progress.learned[letter.id]?'✓ Learned':'Mark learned',()=>{H.progress.learned[letter.id]=true; learned.textContent='✓ Learned'; if(H.recordActivity) H.recordActivity(); progress(); H.renderChart();},'primary'); info.append(learned);
    const practice=el('section'); practice.append(el('h3','Trace with a finger or mouse'));
    const wrap=el('div',undefined,'trace-wrap'),canvas=el('canvas'); canvas.id='trace'; canvas.tabIndex=0; canvas.setAttribute('aria-label','Trace '+letter.glyph+' over the faint guide'); wrap.append(canvas);
    const row=el('div',undefined,'row trace-buttons'), result=el('p','Follow the faint letter, then add the top line.'); result.id='trace-result'; result.setAttribute('role','status');
    let trace;
    row.append(button('1 Body ↓',()=>trace.setPhase(1)),button('2 Top line →',()=>trace.setPhase(2)),button('Clear',()=>trace.clear()));
    const bars=el('div',undefined,'trace-bars'); bars.setAttribute('aria-hidden','true');
    const bar=(name,kind)=>{const r=el('div',undefined,'trace-bar '+kind),track=el('span',undefined,'track'),fill=el('span',undefined,'fill'),val=el('span','0%','val');track.append(fill);r.append(el('span',name,'name'),track,val);bars.append(r);return (v)=>{fill.style.width=v+'%';val.textContent=v+'%';};};
    const setCover=bar('Covered','cover'),setGuide=bar('On the guide','guide');
    practice.append(wrap,row,result,bars,el('p','Numbered arrows show simplified phases: curves and stems first; add the शिरोरेखा (headline) left to right last. Dot/signs also need tracing. These are shape hints, not exact handwriting strokes; font shapes vary.','note'));
    layout.append(info,practice); box.append(layout);
    trace=H.createTrace(canvas,letter.glyph,r=>{
      const c=Math.round(r.coverage*100),g=Math.round(r.precision*100); setCover(c); setGuide(g);
      result.replaceChildren(el('span','★'.repeat(r.stars)+'☆'.repeat(3-r.stars),'trace-stars'),el('span',' · '+c+'% covered · '+g+'% on the guide','sr-only'));
      if(r.stars) { if(H.recordActivity) H.recordActivity(); H.progress.traced[letter.id]=Math.max(H.progress.traced[letter.id]||0,r.stars); progress(); H.renderChart(); }
    });
    H.trace=trace;
    if(!$('letter-card').open) $('letter-card').showModal();
  };
  H.renderChart=function() {
    if(H.mode!=='chart') return;
    const out=$('content'); out.replaceChildren();
    out.append(el('p','13 vowel/sign entries + 33 basic consonants + 3 joined forms = 49 chart entries. The traditional “36 consonants” count includes क्ष त्र ज्ञ. अं and अः are signs added to अ, not separate vowel sounds.','intro'));
    H.groups.forEach(([id,label])=>{
      const section=el('section',undefined,'group'); section.append(el('h2',label)); const grid=el('div',undefined,'letter-grid');
      H.letters.filter(l=>l.group===id).forEach(l=>{
        const b=button('',()=>H.showLetter(l),'letter'); b.setAttribute('aria-label',l.glyph+' · '+l.roman+' · '+l.meaning);
        b.append(el('span',l.glyph,'glyph'),el('small',l.roman));
        if(H.progress.learned[l.id]||H.progress.traced[l.id]) b.append(el('span',H.progress.traced[l.id]?'★'.repeat(H.progress.traced[l.id]):'✓','badge')); grid.append(b);
      }); section.append(grid); out.append(section);
    });
  };
  H.views={chart:H.renderChart};
  H.navigate=function(mode) { H.stopSpeech(); H.mode=mode; document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===mode)); (H.views[mode]||H.views.chart)(); };
  $('modes').onclick=e=>{const b=e.target.closest('[data-mode]'); if(b) H.navigate(b.dataset.mode);};
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  $('letter-card').addEventListener('close',H.stopSpeech);
  if(HubTheme.own()!=='system') HubTheme.setOwn('system'); // HL-2: no Settings; theme always follows System / Hub
  function syncTheme() {
    if(HubTheme.own()!=='system') return;
    let theme='',auto=''; try {theme=localStorage.getItem('sites-hub.theme'); auto=localStorage.getItem('sites-hub.themeAuto');} catch(_){}
    if(!theme||auto==='1') {const dark=matchMedia('(prefers-color-scheme: dark)').matches; document.documentElement.classList.toggle('light',!dark); document.documentElement.dataset.theme=dark?'dark':'light'; document.documentElement.style.colorScheme=dark?'dark':'light';}
  }
  HubTheme.onChange(syncTheme); window.addEventListener('storage',syncTheme); window.addEventListener('focus',syncTheme);
  window.addEventListener('message',e=>{if(e.origin===location.origin && e.data?.type==='hub-prefs') syncTheme();});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',syncTheme); syncTheme();
  window.addEventListener('pagehide',H.stopSpeech); document.addEventListener('visibilitychange',()=>{if(document.hidden) H.stopSpeech();});
  LearnHubBar.attach(document.querySelector('.lrn-head'),{buttons:'#help,#mute'});
  H.navigate('chart'); progress();
})();
