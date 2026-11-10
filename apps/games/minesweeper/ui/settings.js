/* Shared Games Settings bridge: Auto follows Hub light/dark then device. */
window.MineSettings=(()=>{
  const GS=window.GameSettings,defaults={theme:'auto',sfx:true,masterVolume:0.8};
  const get=key=>GS?GS.get(key):defaults[key];
  function applyTheme(){
    let hub='';try{hub=localStorage.getItem('sites-hub.theme')||'';}catch(_){/* storage blocked */}
    const theme=get('theme');
    const dark=theme==='dark'||(theme==='auto'&&(hub==='dark'||(!['dark','light'].includes(hub)&&matchMedia('(prefers-color-scheme: dark)').matches)));
    document.documentElement.classList.toggle('dark',dark);
  }
  if(GS){GS.mountGear(document.getElementById('gearSlot'),'minesweeper');GS.onChange(applyTheme);}
  addEventListener('storage',e=>{if(e.key==='sites-hub.theme'||e.key===null)applyTheme();});
  addEventListener('pageshow',()=>{dispatchEvent(new StorageEvent('storage',{key:'games.settings'}));applyTheme();});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);applyTheme();
  return {get};
})();
