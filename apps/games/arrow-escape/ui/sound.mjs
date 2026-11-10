// All sound is generated locally. No media downloads or autoplay.
let context;
export function sound(kind) {
  const gs=window.GameSettings;
  if(gs && (!gs.get('sfx') || !gs.get('masterVolume')))return;
  if(!gs) {try {if(localStorage.getItem('arrow-escape.muted')==='true')return;} catch {}}
  try {
    context ||= new (window.AudioContext||window.webkitAudioContext)();
    void context.resume().catch(()=>{});
    const notes=kind==='win'?[523,659,784,1047]:kind==='bump'?[135,95]:kind==='key'?[660,880]:[440,600];
    const volume=(gs?.get('masterVolume')??.8)*.12;
    notes.forEach((freq,i)=>{
      const osc=context.createOscillator(),gain=context.createGain(),t=context.currentTime+i*.065;
      osc.type=kind==='bump'?'triangle':'sine';osc.frequency.setValueAtTime(freq,t);
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume,t+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,t+.17);
      osc.connect(gain);gain.connect(context.destination);osc.start(t);osc.stop(t+.18);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    });
  } catch {/* Sound is optional, including unsupported or policy-blocked AudioContext. */}
}
