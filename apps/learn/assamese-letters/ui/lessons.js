(function() {
  'use strict';
  const H=window.Assamese, {el,button}=H, out=document.getElementById('content');
  function heading(title,note) { out.replaceChildren(el('h2',title),el('p',note,'intro')); }
  function soundButton(glyph,caption,spoken) {
    const b=button('',()=>H.speak(spoken||glyph),'study-card'); b.append(el('span',glyph,'glyph'),el('small',caption));
    b.setAttribute('aria-label',glyph+' · '+caption+' · hear'); return b;
  }
  H.views.matras=function() {
    heading('কাৰ · Explore vowel signs','Choose a consonant. Tap a syllable to hear it. Practice includes the 11 vowel forms plus anusvara, visarga and chandrabindu. Not every practice syllable is an everyday word.');
    const label=el('label','Consonant '),select=el('select'); select.id='consonant';
    H.basic.forEach(l=>{const o=el('option',l.glyph+' · '+l.roman);o.value=l.glyph;select.append(o);}); label.append(select);
    const grid=el('div',undefined,'study-grid'),detail=el('p','','intro'); detail.id='matra-hint'; detail.setAttribute('aria-live','polite');
    function render() {
      grid.replaceChildren(); H.barakhadi(select.value).forEach(m=>{
        const b=soundButton(m.glyph,m.roman+' · '+m.vowel);
        b.onclick=()=>{H.speak(m.glyph); detail.textContent=m.glyph+' = '+select.value+' + '+(m.sign||'no added sign')+' · '+m.hint;};grid.append(b);
      }); detail.textContent='ি ে ৈ are typed after the consonant but drawn before it: ক + ি = কি. ো and ৌ wrap around it: ক + ো = কো. A vowel sign replaces the inherent অ; it does not add another syllable.';
    }
    select.onchange=render; out.append(label,grid,detail); render();
  };
  H.views.joins=function() {
    heading('Joined letters · যুক্তাক্ষৰ','A hasanta (্) removes the inherent অ: ক → ক্. Joined to the next consonant it often makes a new shape (ক্ + ষ = ক্ষ). ৰ্ on top becomes a small mark (ৰেফ); য and ৰ after a consonant become ফলা signs. Fonts may draw some joins differently. Tap a card to hear its example word.');
    const grid=el('div',undefined,'study-grid');
    H.halves.concat(H.joins).forEach(j=>{
      const b=soundButton(j.glyph,j.parts,j.word); b.append(el('span',j.emoji+' '+j.word,'as'),el('small',j.meaning)); if(j.roman) b.append(el('small',j.roman)); grid.append(b);
    }); out.append(grid);
  };
  H.views.numbers=function() {
    heading('০–১০ · Assamese numerals','Read the numeral, name and English value together. Tap to hear the Assamese number name.');
    const grid=el('div',undefined,'study-grid');
    H.numbers.forEach(n=>{const b=soundButton(n.glyph,n.name+' · '+n.roman,n.name); b.append(el('small','Value '+n.value),el('span',n.value?'●'.repeat(n.value):'○','count-dots'));grid.append(b);});out.append(grid);
  };
  let theme='all',query='';
  H.views.words=function() {
    heading('Picture words · '+H.words.length+' words','Browse by theme or search in Assamese or English. Emoji are memory cues, not exact pictures; the English meaning tells you the word. Tap to hear it.');
    const bar=el('div',undefined,'word-filters'),label=el('label','Theme '),select=el('select'); select.id='word-theme';
    const all=el('option','All themes');all.value='all';select.append(all);
    H.themes.forEach(t=>{const o=el('option',t.label);o.value=t.id;select.append(o);});select.value=theme; label.append(select);
    const searchLabel=el('label','Find a word '),search=el('input');search.type='search';search.placeholder='Assamese or English';search.value=query;search.id='word-search';searchLabel.append(search);
    const count=el('p'),grid=el('div',undefined,'word-grid');
    function render() {
      grid.replaceChildren(); const q=query.trim().toLowerCase();
      const words=H.words.filter(w=>(theme==='all'||w.theme===theme)&&(!q||w.word.includes(q.normalize('NFC'))||w.meaning.toLowerCase().includes(q)));
      count.textContent=words.length+' words';
      words.forEach(w=>{const b=button('',()=>H.speak(w.word),'picture-card'); b.append(el('span',w.emoji,'emoji'),el('strong',w.word,'as'),el('small',w.meaning));b.setAttribute('aria-label',w.word+' · '+w.meaning+' · hear');grid.append(b);});
      if(!words.length) grid.append(el('p','No matches. Try another word or theme.'));
    }
    select.onchange=()=>{theme=select.value;render();};search.oninput=()=>{query=search.value;render();};
    bar.append(label,searchLabel);out.append(bar,count,grid);render();
  };
})();
