/*
 * Battery tab (apps/system/sysmon/sm_battery.js) — navigator.getBattery() (Chrome / Edge / Android):
 * level with a bar, charging, time to full / empty; live on the battery's events.
 * Firefox / Safari: "Not available". A desktop without a battery reports 100% charging.
 */
(function () {
  'use strict';
  const { el, card, kv, na } = SM;
  let box = null, bat = null, asked = false;
  const mins = (s) => (s == null || !isFinite(s) || s <= 0 ? '\u2014' : s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.round((s % 3600) / 60) + ' min' : Math.round(s / 60) + ' min');
  function draw() {
    if (!box) return;
    if (!navigator.getBattery) { box.replaceChildren(na('Battery status is not available in this browser.')); return; }
    if (!bat) {
      box.replaceChildren(el('p', 'muted', 'Reading\u2026'));
      if (!asked) {
        asked = true;
        navigator.getBattery().then((b) => {
          bat = b;
          ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach((n) => b.addEventListener(n, draw));
          draw();
        }, () => box.replaceChildren(na('Battery status was refused.')));
      }
      return;
    }
    const lv = bat.level;
    const bar = el('div', 'bar' + (lv < 0.2 && !bat.charging ? ' low' : '')); const f = el('i'); f.style.width = (lv * 100) + '%'; bar.appendChild(f);
    box.replaceChildren(el('p', 'big', Math.round(lv * 100) + '%' + (bat.charging ? ' \u26A1' : '')), bar, kv([
      ['Charging', bat.charging ? 'Yes' : 'No'],
      ['Time to full', bat.charging ? mins(bat.chargingTime) : '\u2014'],
      ['Time left', !bat.charging ? mins(bat.dischargingTime) : '\u2014']
    ]), el('p', 'muted small', 'A computer without a battery usually shows 100% and charging.'));
  }
  SM.tab({
    id: 'battery', title: 'Battery', icon: '\uD83D\uDD0B',
    render(pane) { box = el('div'); pane.append(card('Battery', box)); },
    show: draw
  });
})();
