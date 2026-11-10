(function(root) {
  'use strict';
  const H=root.Hindi || (typeof require!=='undefined' ? require('./words.js') : {});
  H.shuffle=function(items,rng=Math.random) {
    const a=items.slice();
    for(let i=a.length-1;i>0;i--) {const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a;
  };
  H.units=function(word) {
    if(typeof Intl!=='undefined' && Intl.Segmenter) return [...new Intl.Segmenter('hi',{granularity:'grapheme'}).segment(word)].map(s=>s.segment);
    // Keep dependent marks AND consonants following a virama with their base.
    const result=[];
    for(const c of word) {
      if(result.length && (/\p{M}/u.test(c)||result[result.length-1].endsWith('्'))) result[result.length-1]+=c;
      else result.push(c);
    } return result;
  };
  H.localDay=function(date=new Date()) {
    return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  };
  H.activity=function(old={},day=H.localDay()) {
    const stamp=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'') ? Date.parse(s+'T00:00:00Z') : NaN;
    const gap=(stamp(day)-stamp(old.day))/86400000;
    const count=Number.isInteger(old.count)&&old.count>0 ? old.count : 0;
    if(gap<=0 && count) return {day:old.day,count,best:Math.max(old.best||0,count)};
    const next=gap===1 ? count+1 : 1;
    return {day,count:next,best:Math.max(Number(old.best)||0,next)};
  };
  H.gameStars=correct=>correct>=9?3:correct>=7?2:correct>=4?1:0;
  H.createGame=function(mode,rng=Math.random) {
    if(!['find','picture','build','listen'].includes(mode)) throw new Error('Unknown practice game');
    const listen=H.letters.filter(l=>(l.group==='vowels' && !['अं','अः'].includes(l.glyph)) || (H.basic.includes(l)&&!['ङ','ञ','ण','ष'].includes(l.glyph)));
    const pool=mode==='find'?H.letters:mode==='listen'?listen:mode==='build'?H.words.filter(w=>H.units(w.word).length>=2 && H.units(w.word).length<=5):H.words;
    const targets=H.shuffle(pool,rng).slice(0,10);
    const questions=targets.map(target=>{
      if(mode==='build') {
        const tiles=H.shuffle(H.units(target.word).map((text,id)=>({text,id})),rng);
        return {target,tiles,used:[],answered:false,correct:false};
      }
      // Emoji and meanings differ from the target so visual/semantic synonyms are not traps.
      const distractors=H.shuffle(pool.filter(x=>x.id!==target.id && (!target.word || (x.emoji!==target.emoji && x.meaning!==target.meaning))),rng).slice(0,3);
      return {target,options:H.shuffle([target,...distractors],rng),answered:false,correct:false};
    });
    return {mode,questions,index:0,correct:0,paused:false,finished:false};
  };
  H.current=g=>g.questions[g.index];
  H.answer=function(g,value) {
    const q=H.current(g); if(g.paused || g.finished || !q || q.answered) return null;
    q.answered=true; q.correct=g.mode==='build' ? value===q.target.word : value===q.target.id;
    if(q.correct) g.correct++; return q.correct;
  };
  H.next=function(g) {
    const q=H.current(g); if(g.paused || g.finished || !q || !q.answered) return false;
    if(g.index+1===g.questions.length) g.finished=true; else g.index++; return true;
  };
  H.tile=function(g,index) {
    const q=H.current(g); if(g.paused||g.finished||g.mode!=='build'||q.answered||!Number.isInteger(index)||!q.tiles[index]||q.used.includes(index)) return false;
    q.used.push(index); return true;
  };
  H.built=g=>H.current(g).used.map(i=>H.current(g).tiles[i].text).join('');
  if(typeof module!=='undefined') module.exports=H;
})(typeof window!=='undefined'?window:globalThis);
