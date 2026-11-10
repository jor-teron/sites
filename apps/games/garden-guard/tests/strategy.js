/* Legal autoplay policy: ordinary sun collection and paid planting. No state edits. */
(function(root) {
  function defend(g) {
    for(const sun of [...g.suns]) g.collect(sun.id);
    if(!g.at(2,0) && g.plant('sun',2,0)) return;
    const danger=[...g.enemies].sort((a,b)=>a.x-b.x);
    for(const e of danger) if(!g.at(e.row,2) && g.plant('pea',e.row,2)) return;
    if(g.time>45 && g.sun>=100) for(const row of [0,4,1,3]) if(!g.at(row,0) && g.plant('sun',row,0)) return;
    for(const e of danger) if(!g.at(e.row,3) && g.plant('pea',e.row,3)) return;
  }
  if(typeof module!=='undefined') module.exports=defend;
  else root.defendGarden=defend;
})(typeof window==='undefined'?globalThis:window);
