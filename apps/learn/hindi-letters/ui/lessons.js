(function() {
  'use strict';
  const H=window.Hindi, {el,button}=H, out=document.getElementById('content');
  function heading(title,note) { out.replaceChildren(el('h2',title),el('p',note,'intro')); }
  function soundButton(glyph,caption,spoken) {
    const b=button('',()=>H.speak(spoken||glyph),'study-card'); b.append(el('span',glyph,'glyph'),el('small',caption));
    b.setAttribute('aria-label',glyph+' · '+caption+' · hear'); return b;
  }
  H.views.matras=function() {
    heading('मात्रा · Explore vowel signs','Choose a consonant. Tap a syllable to hear it. Barakhadi practice includes 11 vowel forms plus anusvara and visarga. Not every practice syllable is an everyday word.');
    const label=el('label','Consonant '),select=el('select'); select.id='consonant';
    H.basic.forEach(l=>{const o=el('option',l.glyph+' · '+l.roman);o.value=l.glyph;select.append(o);}); label.append(select);
    const grid=el('div',undefined,'study-grid'),detail=el('p','','intro'); detail.id='matra-hint'; detail.setAttribute('aria-live','polite');
    function render() {
      grid.replaceChildren(); H.barakhadi(select.value).forEach(m=>{
        const b=soundButton(m.glyph,m.roman+' · '+m.vowel);
        b.onclick=()=>{H.speak(m.glyph); detail.textContent=m.glyph+' = '+select.value+' + '+(m.sign||'no added sign')+' · '+m.hint;};grid.append(b);
      }); detail.textContent='The short इ sign (ि) is typed after the consonant but appears before it: क + ि = कि. A matra replaces the inherent अ; it does not add another syllable.';
    }
    select.onchange=render; out.append(label,grid,detail); render();
  };
  H.views.joins=function() {
    heading('Half letters & joined letters','A halant / virama (्) removes the inherent अ: क → क्. Combining it with a consonant can change the shape. Fonts may draw a joined form or a visible halant. Tap a card to hear its example word.');
    const grid=el('div',undefined,'study-grid');
    H.halves.concat(H.joins).forEach(j=>{
      const b=soundButton(j.glyph,j.parts,j.word); b.append(el('span',j.emoji+' '+j.word,'hi'),el('small',j.meaning)); if(j.roman) b.append(el('small',j.roman)); grid.append(b);
    }); out.append(grid);
  };
  H.views.numbers=function() {
    heading('१–१० · Hindi numerals','Read the numeral, name and English value together. Tap to hear the Hindi number name.');
    const grid=el('div',undefined,'study-grid');
    H.numbers.forEach(n=>{const b=soundButton(n.glyph,n.name+' · '+n.roman,n.name); b.append(el('small','Value '+n.value),el('span','●'.repeat(n.value),'count-dots'));grid.append(b);});out.append(grid);
  };
  let theme='all',query='';
  H.views.words=function() {
    heading('Picture words · 200 words','Browse by theme or search in Hindi or English. Emoji are memory cues, not exact pictures; the English meaning tells you the word. Tap to hear it.');
    const bar=el('div',undefined,'word-filters'),label=el('label','Theme '),select=el('select'); select.id='word-theme';
    const all=el('option','All themes');all.value='all';select.append(all);
    H.themes.forEach(t=>{const o=el('option',t.label);o.value=t.id;select.append(o);});select.value=theme; label.append(select);
    const searchLabel=el('label','Find a word '),search=el('input');search.type='search';search.placeholder='Hindi or English';search.value=query;search.id='word-search';searchLabel.append(search);
    const count=el('p'),grid=el('div',undefined,'word-grid');
    function render() {
      grid.replaceChildren(); const q=query.trim().toLowerCase();
      const words=H.words.filter(w=>(theme==='all'||w.theme===theme)&&(!q||w.word.includes(q)||w.meaning.toLowerCase().includes(q)));
      count.textContent=words.length+' words';
      words.forEach(w=>{const b=button('',()=>H.speak(w.word),'picture-card'); b.append(el('span',w.emoji,'emoji'),el('strong',w.word,'hi'),el('small',w.meaning));b.setAttribute('aria-label',w.word+' · '+w.meaning+' · hear');grid.append(b);});
      if(!words.length) grid.append(el('p','No matches. Try another word or theme.'));
    }
    select.onchange=()=>{theme=select.value;render();};search.oninput=()=>{query=search.value;render();};
    bar.append(label,searchLabel);out.append(bar,count,grid);render();
  };
})();
