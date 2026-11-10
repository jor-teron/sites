/* Tiny synthesized chimes; audio starts only after a player gesture. */
window.BubbleSound=(()=>{
  let ctx;
  function wake(){try{ctx ||= new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume().catch(()=>{});}catch(_){}}
  function play(kind){
    if(!BubbleSettings.get('sfx')||!BubbleSettings.get('masterVolume'))return;
    wake();if(!ctx)return;
    const notes={fire:[220],pop:[640,850],drop:[900,620,440],win:[523,659,784,1046],lose:[220,165,110],swap:[420,520]}[kind]||[400];
    notes.forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+i*.065;
      o.type='sine';o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.09*BubbleSettings.get('masterVolume'),t+.008);g.gain.exponentialRampToValueAtTime(.001,t+.15);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+.16);
    });
  }return {wake,play};
})();
