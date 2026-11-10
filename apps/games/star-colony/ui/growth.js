/* Growth controls use simulation actions, never duplicate its rules. */
window.SCGrowthUI = (() => {
  let context, panel, last = '', researchButton, shipButton;
  function researchCard() {
    const s = context.get();
    const body = '<p>Discovery points: <b>' + Math.floor(s.research.points) + '</b>. Build and connect a Discovery Lab; settlers research there when it is powered.</p>' + Object.entries(SCGrowth.tree).map(([key, def]) => '<p><b>' + def.name + '</b> · ' + def.cost + ' points<br>' + def.text + '<br><small>' + (s.research.done.includes(key) ? 'Complete' : s.research.active === key ? 'Active' : def.requires.length ? 'Needs: ' + def.requires.map(k => SCGrowth.tree[k].name).join(' · ') : 'Available') + '</small></p>').join('');
    const actions = Object.entries(SCGrowth.tree).filter(([key, def]) => !s.research.done.includes(key) && def.requires.every(k => s.research.done.includes(k))).map(([key, def]) => ['Research ' + def.name, () => { SCGrowth.selectResearch(s, key); context.resume(); }]);
    context.dialog('Discoveries', body, [...actions, ['Close', context.resume]]);
  }
  function shipCard() {
    const s = context.get();
    if (!s.ship.waiting) return;
    context.dialog('Supply ship in orbit', '<p>Up to two settlers can join if you have beds. Free beds: ' + Math.max(0, SCGrowth.availableBeds(s)) + '.</p><p>Choose one cargo pack. The ship returns three days after docking.</p><p>Pantry: 45 food / 15 water / 10 ore.<br>Water: 65 water / 15 food / 10 ore.<br>Materials: 55 ore / 15 food / 15 water.</p>', [['Pantry', () => dock('pantry')], ['Water', () => dock('water')], ['Materials', () => dock('materials')], ['Later', context.resume]]);
  }
  function dock(choice) { SCGrowth.chooseSupply(context.get(), choice); context.resume(); context.hud(); }
  function init(ctx) {
    context = ctx; SCGrowth.init(ctx.get());
    researchButton = document.createElement('button'); researchButton.id = 'research'; researchButton.textContent = 'Research'; researchButton.onclick = researchCard;
    shipButton = document.createElement('button'); shipButton.id = 'ship'; shipButton.textContent = 'Ship'; shipButton.onclick = shipCard;
    document.querySelector('footer').prepend(researchButton, shipButton);
    panel = document.createElement('section'); panel.id = 'growth-info'; document.getElementById('sidebar').append(panel);
  }
  function update(s) {
    if (!panel) return;
    shipButton.disabled = !s.ship.waiting; shipButton.textContent = s.ship.waiting ? 'Dock ship' : 'Ship';
    researchButton.textContent = s.research.active ? 'Lab ' + Math.floor(s.research.points) + '/' + SCGrowth.tree[s.research.active].cost : 'Research';
    document.querySelectorAll('#build button').forEach(b => { const def = SCData.buildings[b.dataset.type]; b.disabled = !!def.unlock && !s.research.done.includes(def.unlock); });
    const html = '<h3>Colony goals</h3><p>' + [[s.goals.ten, '10 settlers'], [s.goals.twenty, '20 settlers'], [s.goals.sufficient, 'Self-sufficient 5 days (' + s.goals.streak + '/5)'], [s.goals.research, 'All discoveries']].map(([done, text]) => (done ? '✓ ' : '○ ') + text).join('<br>') + '</p><p>' + (s.events.warning ? '⚠ ' + s.events.warning.kind + ' approaching' : s.events.stormUntil > s.time ? '⚠ Dust front active' : 'Skies clear') + '</p>';
    if (html !== last) { panel.innerHTML = html; last = html; }
  }
  return { init, update };
})();
