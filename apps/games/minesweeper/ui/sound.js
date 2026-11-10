/* Original synthesised cues; shared sfx/volume plus local mute. No downloaded audio. */
window.MineSound=(()=>{
  let context;
  return function(kind,muted){
    if(muted||!MineSettings.get('sfx')||!MineSettings.get('masterVolume'))return;
    try{
      context=context||new(window.AudioContext||window.webkitAudioContext)();
      if(context.state==='suspended')context.resume().catch(()=>{});
      const notes={reveal:[520],flag:[330,440],won:[523,659,784,1046],lost:[180,120,70]}[kind];
      notes.forEach((hz,i)=>{
        const osc=context.createOscillator(),gain=context.createGain(),t=context.currentTime+i*.075;
        osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(.06*MineSettings.get('masterVolume'),t);
        gain.gain.exponentialRampToValueAtTime(.001,t+.12);osc.connect(gain);gain.connect(context.destination);osc.start(t);osc.stop(t+.13);
      });
    }catch(_){/* silent if WebAudio is unavailable */}
  };
})();
