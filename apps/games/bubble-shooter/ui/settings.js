/* Shared theme defaults to Auto: Hub Light/Dark first, device second.
 * Used: theme, fpsLimit, lowGraphics, sfx, volume, autoPause, showHints, vibration.
 * Music, difficulty, screenShake, joystick and 3D settings are not applicable. */
window.BubbleSettings=(()=>{
  const gs=window.GameSettings, fallback={theme:'auto',fpsLimit:30,lowGraphics:false,sfx:true,masterVolume:.8,autoPause:true,showHints:true,vibration:true};
  const get=k=>gs?gs.get(k):fallback[k];
  function theme(){let hub='';try{hub=localStorage.getItem('sites-hub.theme')||'';}catch(_){}
    const t=get('theme'),dark=t==='dark'||(t==='auto'&&(hub?hub==='dark':matchMedia('(prefers-color-scheme: dark)').matches));
    document.documentElement.classList.toggle('dark',dark);
  }
  theme();gs?.onChange(theme);window.addEventListener('storage',theme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);
  gs?.mountGear(document.getElementById('gear'),'bubble-shooter');
  return {get,theme,fx:()=>!get('lowGraphics')&&!matchMedia('(prefers-reduced-motion: reduce)').matches,
    vibrate:()=>{if(get('vibration')&&navigator.vibrate)try{navigator.vibrate(15);}catch(_){}},
    mute:()=>{if(gs)gs.set('sfx',!get('sfx'));else fallback.sfx=!fallback.sfx;}};
})();
