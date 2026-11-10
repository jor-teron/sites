/* SC-1c: code-only lighting, weather, utility views, cards and synthesized sound. */
window.SCFx = (() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let context, audio, muted = false, view = 'normal', latest = 0, drawnFeed = '', crewStamp = '', lastColony = null;
  const reduced = () => SCSettings.get('lowGraphics') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function unlock() {
    if (!audio) try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return; }
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  }
  function sound(kind) {
    if (!audio || audio.state !== 'running' || muted || !SCSettings.get('sfx') || SCSettings.get('masterVolume') <= 0) return;
    const now = audio.currentTime, osc = audio.createOscillator(), gain = audio.createGain();
    const frequency = { build: 330, good: 660, warning: 180, danger: 110, info: 440 }[kind] || 440;
    osc.type = kind === 'danger' ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(frequency * (kind === 'good' ? 1.5 : .75), now + .15);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.08 * SCSettings.get('masterVolume'), now + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .22);
    osc.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now + .24);
  }
  function help() {
    context.dialog('How to play', '<p><b>Build a thriving settlement on Pelora.</b> Start with three settlers and a working landing base. Expand rather than replacing your life support.</p>' +
      '<h3>Build and connect</h3><p>Choose a structure in the scrolling build bar, then tap a tile. A dotted blueprint costs nothing until a settler physically hauls materials from Storage. Build jobs come first; repairs have highest priority. Tap the same build button to cancel selection.</p>' +
      '<p>Adjacent buildings share power and oxygen. Corridors extend a network. Put Ice Drills on blue ice and Ore Mines on copper ore. Rock is impassable. All deposits are renewable. Buildings have walk-through airlocks.</p>' +
      '<h3>Keep settlers alive</h3><p>Solar Panels work only by day. Batteries store surplus for the night. Oxygen Generators use power and water to refill sealed domes. Settlers carry suit air outside and return to domes for oxygen and rest. Farms use water and power; their food must be hauled to Storage. Empty suits or stomachs damage health. Morale falls when needs are low.</p>' +
      '<h3>Grow and discover</h3><p>Use Research to select a discovery and build a powered Discovery Lab. Skills improve with work. Ships arrive every three days after docking: tap Ship and choose a cargo pack. Each dome gives five beds for arrivals. Care Stations cure spore illness; Hauler Nests launch helpers after research.</p>' +
      '<h3>Controls</h3><p>Drag to pan. Wheel or pinch to zoom; + / − also work. ⌂ centres the base. Arrow keys move the tile cursor; Enter builds or inspects. P pauses. Escape cancels a build selection or closes a card. The view selector shows power or dome oxygen. Crew lists settlers even when they overlap on the map.</p>' +
      '<p>Dust fronts reduce solar power; meteors and faults need repairs. Watch Alerts and the warning banner. Complete the four colony goals. If everyone dies the colony ends. Saves stay only on this device; hidden tabs always pause. No progress occurs while closed.</p>', [['Back to colony', context.resume]]);
  }
  function pause() {
    const s = context.get(), r = SC.totals(s);
    context.dialog('Colony paused', '<p>Day ' + (Math.floor(s.time / SCData.DAY) + 1) + ' · ' + s.colonists.length + ' settlers · ' + s.stats.built + ' structures built.</p><p>Food ' + Math.floor(r.food) + ' · Water ' + Math.floor(r.water) + ' · Ore ' + Math.floor(r.ore) + '</p><p>Simulation is stopped. Autosaves never advance time.</p>', [['Resume', context.resume], ['How to play', help], ['Save colony', context.persist]]);
  }
  function tab(key) {
    ['details', 'crew', 'alerts', 'growth-info'].forEach(id => { $(id).hidden = id !== key; });
    $('side-tabs').querySelectorAll('button').forEach(b => { b.classList.toggle('active', b.dataset.pane === key); b.setAttribute('aria-selected', String(b.dataset.pane === key)); });
  }
  function init(ctx) {
    context = ctx; latest = ctx.get().alerts.at(-1)?.id || 0;
    try { muted = localStorage.getItem('star-colony.muted') === '1'; } catch (_) {}
    const tools = $('map-tools');
    const select = document.createElement('select'); select.id = 'view'; select.setAttribute('aria-label', 'Utility overlay');
    select.innerHTML = '<option value="normal">Surface</option><option value="power">Power</option><option value="oxygen">Oxygen</option>';
    select.onchange = () => { view = select.value; $('legend').textContent = view === 'power' ? 'Power: green online · red disconnected or no supply · yellow battery charge' : view === 'oxygen' ? 'Oxygen: blue dome reserves · lines mark connected utilities' : 'Surface: drag to pan · pinch or wheel to zoom'; };
    const mute = document.createElement('button'); mute.id = 'mute'; mute.setAttribute('aria-label', 'Mute synthesized sounds');
    const refreshMute = () => { mute.textContent = muted ? '♪ off' : '♪ on'; mute.setAttribute('aria-pressed', String(muted)); };
    refreshMute(); mute.onclick = () => { unlock(); muted = !muted; refreshMute(); try { localStorage.setItem('star-colony.muted', muted ? '1' : '0'); } catch (_) {} sound('info'); };
    const helpButton = document.createElement('button'); helpButton.id = 'help'; helpButton.textContent = '?'; helpButton.setAttribute('aria-label', 'How to play'); helpButton.onclick = help;
    tools.append(select, mute, helpButton);
    const legend = document.createElement('p'); legend.id = 'legend'; legend.textContent = 'Surface: drag to pan · pinch or wheel to zoom'; $('world').append(legend);
    const warning = document.createElement('div'); warning.id = 'warning'; warning.hidden = true; warning.setAttribute('role', 'status'); $('world').append(warning);
    const sidebar = $('sidebar'), tabs = document.createElement('nav'); tabs.id = 'side-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Colony information');
    for (const [key, label] of [['details','Inspect'], ['crew','Crew'], ['alerts','Alerts'], ['growth-info','Goals']]) {
      const b = document.createElement('button'); b.textContent = label; b.dataset.pane = key; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', key); b.onclick = () => tab(key); tabs.append(b);
    }
    sidebar.prepend(tabs);
    const crew = document.createElement('section'); crew.id = 'crew'; crew.setAttribute('role', 'tabpanel'); sidebar.append(crew);
    const alerts = document.createElement('section'); alerts.id = 'alerts'; alerts.setAttribute('role', 'tabpanel'); sidebar.append(alerts);
    ['details', 'growth-info'].forEach(id => $(id).setAttribute('role', 'tabpanel')); tab('details');
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    $('overlay').addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const buttons = [...$('overlay').querySelectorAll('button:not(:disabled),a,select')];
      const first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('card'))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    });
  }
  function update(s) {
    if (lastColony !== s) { latest = s.alerts.at(-1)?.id || 0; drawnFeed = ''; crewStamp = ''; lastColony = s; }
    const stamp = s.alerts.at(-1)?.id + ':' + s.alerts.length;
    if (stamp !== drawnFeed) {
      const alerts = $('alerts'); alerts.replaceChildren();
      const h = document.createElement('h2'); h.textContent = 'Colony alerts'; alerts.append(h);
      for (const a of [...s.alerts].reverse().slice(0, 18)) {
        const p = document.createElement('p'); p.className = 'alert ' + a.type; p.textContent = 'Day ' + (Math.floor(a.time / SCData.DAY) + 1) + ' · ' + a.text; alerts.append(p);
        if (a.id > latest) sound(a.type);
      }
      latest = s.alerts.at(-1)?.id || latest; drawnFeed = stamp;
    }
    /* Keep buttons stable while people move, so touch and keyboard focus aren't lost. */
    const ids = s.colonists.map(c => c.id).join(',');
    if (ids !== crewStamp) {
      $('crew').replaceChildren();
      const h = document.createElement('h2'); h.textContent = 'Settlers'; $('crew').append(h);
      for (const c of s.colonists) {
        const b = document.createElement('button'); b.className = 'crew-person'; b.dataset.id = c.id;
        b.onclick = () => { window.StarColony.inspectColonist(c.id); tab('details'); }; $('crew').append(b);
      }
      crewStamp = ids;
    }
    $('crew').querySelectorAll('button').forEach(b => {
      const c = s.colonists.find(c => c.id === Number(b.dataset.id));
      b.textContent = c.name + ' · ' + (c.activity || 'Idle') + (c.illness > 0 ? ' · ill' : '');
    });
    const warning = s.events.warning;
    $('warning').hidden = !warning && !(s.events.stormUntil > s.time);
    $('warning').textContent = warning ? '⚠ ' + warning.kind + ' approaching · ' + Math.ceil(warning.at - s.time) + 's' : 'Dust front active — protect your power reserve';
  }
  function infoColonist(c) {
    const meters = ['air','food','rest','morale','health'].map(key => '<label class="need">' + (key === 'air' ? 'Oxygen' : key) + '<meter min="0" max="100" low="25" optimum="100" value="' + c[key] + '"></meter><b>' + Math.round(c[key]) + '</b></label>').join('');
    return '<h2>' + escape(c.name) + (c.illness > 0 ? ' · ill' : '') + '</h2><p>Job: ' + escape(c.activity || 'Rest') + '</p>' + meters + '<p class="skills">Skills: ' + Object.entries(c.skills || {}).map(([key, n]) => escape(key) + ' ' + n.toFixed(1)).join(' · ') + '</p>';
  }
  function buildingExtra(b) {
    return '<p class="inspect-extra">Network ' + (b.network < 0 ? 'disconnected' : b.network + 1) + ' · ' + b.x + ', ' + b.y + '</p><p>' + Object.entries(b.output).filter(([, n]) => n > 0).map(([key, n]) => 'Awaiting haul: ' + Math.floor(n) + ' ' + key).join(' · ') + (b.offlineUntil > context.get().time ? '<br>Equipment offline — repair requested' : '') + '</p>';
  }
  function draw(ctx, s, clock, selected) {
    const animate = !reduced(), z = 28, time = s.time;
    if (!SC.daylight(s)) {
      ctx.fillStyle = '#08172e55'; ctx.fillRect(0, 0, s.w * z, s.h * z);
      if (animate) for (const b of s.buildings.filter(b => b.ready && b.health > 0 && (b.type === 'dome' || b.powered))) {
        const x = (b.x + .5) * z, y = (b.y + .5) * z, glow = ctx.createRadialGradient(x, y, 2, x, y, 37);
        glow.addColorStop(0, '#8bebd338'); glow.addColorStop(1, '#8bebd300'); ctx.fillStyle = glow; ctx.fillRect(x - 37, y - 37, 74, 74);
      }
    }
    for (const b of s.buildings) {
      const x = b.x * z, y = b.y * z;
      if (b.ready && b.type === 'dome' && b.oxygen > 3) { ctx.strokeStyle = '#b8fff0'; ctx.globalAlpha = animate ? .45 + Math.sin(time * 2 + b.id) * .2 : .6; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + 14, y + 15, 10, Math.PI, 0); ctx.stroke(); ctx.globalAlpha = 1; }
      if (b.ready && b.health < 99) { ctx.fillStyle = '#e48d84'; ctx.fillRect(x + 2, y + 25, 24 * b.health / 100, 2); }
      if (view !== 'normal') {
        const isAir = view === 'oxygen'; ctx.strokeStyle = isAir ? '#7eeaff' : b.powered ? '#97f0a4' : '#ff8c92'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, 26, 26);
        if (b.ready && b.network >= 0) for (const next of s.buildings.filter(n => n.ready && n.network === b.network && ((n.x === b.x + 1 && n.y === b.y) || (n.y === b.y + 1 && n.x === b.x)))) {
          ctx.beginPath(); ctx.moveTo(x + 14, y + 14); ctx.lineTo((next.x + .5) * z, (next.y + .5) * z); ctx.stroke();
        }
        const percent = isAir ? (b.type === 'dome' ? b.oxygen / 180 : null) : b.type === 'battery' ? b.charge / 900 : null;
        if (percent !== null) { ctx.fillStyle = '#0b1e2a'; ctx.fillRect(x + 1, y + 20, 26, 7); ctx.fillStyle = isAir ? '#75ddff' : '#f3dc8c'; ctx.fillRect(x + 2, y + 21, 24 * percent, 5); }
      }
    }
    for (const c of s.colonists) {
      const x = c.x * z + 14, y = c.y * z + 14;
      if (animate && ['build', 'repair', 'mine', 'farm', 'research'].includes(c.activity) && !c.path?.length) {
        ctx.fillStyle = c.activity === 'farm' ? '#c1f5b2' : '#ffda85'; const p = time * 5 % 1; ctx.fillRect(x + 5 + p * 6, y - p * 8, 2, 2);
      }
      if (selected?.kind === 'colonist' && selected.id === c.id) { ctx.strokeStyle = '#fff1a7'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke(); }
    }
    for (const drone of s.drones) { const x = drone.x * z + 14, y = drone.y * z + 10; ctx.fillStyle = '#f1d79b'; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 5, y); ctx.fill(); }
    if (animate && s.events.stormUntil > s.time) {
      ctx.fillStyle = '#caad7833'; ctx.fillRect(0, 0, s.w * z, s.h * z);
      ctx.strokeStyle = '#e1c99877'; ctx.lineWidth = 1;
      for (let i = 0; i < 70; i++) { const x = (i * 179 + time * 190) % (s.w * z), y = (i * 71 + time * 28) % (s.h * z); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 15, y + 4); ctx.stroke(); }
    }
    const event = s.events.last;
    if (animate && event?.kind === 'meteor' && time - event.at < 2) {
      const t = Math.min(1, (time - event.at) / 1.2), x = (event.x + .5) * z, y = (event.y + .5) * z;
      ctx.strokeStyle = '#ffdba8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 180 * (1 - t), y - 150 * (1 - t)); ctx.lineTo(x - 180 * (1 - t) - 60, y - 150 * (1 - t) - 50); ctx.stroke();
    }
  }
  return { init, update, draw, sound, unlock, help, pause, reduced, infoColonist, buildingExtra, tab, getView: () => view };
})();
