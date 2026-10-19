/*
 * Storage tab (apps/tools/sysmon/sm_storage.js) — navigator.storage.estimate() (used / quota with
 * a bar; Chrome also splits it by kind), persisted() + a "Keep storage" button (persist()), and a
 * per-drive size: Local (OPFS) is walked once on open, added folders only when access is already
 * granted and only on "Calculate" (walking a big folder can take a while). Sizes: shared/fs.
 */
(function () {
  'use strict';
  const { el, btn, card, kv, bytes, na } = SM;
  let box = null, drivesBox = null;

  async function estimate() {
    if (!navigator.storage || !navigator.storage.estimate) { box.replaceChildren(na('Storage estimate is not available in this browser.')); return; }
    let e = {}, pers = null;
    try { e = await navigator.storage.estimate(); } catch (_) { e = {}; }
    try { pers = navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (_) { pers = null; }
    const used = e.usage || 0, quota = e.quota || 0, f = quota ? used / quota : 0;
    const bar = el('div', 'bar'); const fill = el('i'); fill.style.width = Math.max(0.5, f * 100).toFixed(2) + '%'; bar.appendChild(fill);
    const rows = [['Used by this site', bytes(used)], ['Allowed (quota)', bytes(quota)], ['Share used', quota ? (f * 100).toFixed(f < 0.01 ? 3 : 1) + '%' : '\u2014'],
      ['Kept when space is low', pers == null ? 'Unknown' : pers ? 'Yes (persistent)' : 'No (the browser may clear it)']];
    const d = e.usageDetails;
    if (d) Object.keys(d).forEach((k) => rows.push(['\u2003' + k, bytes(d[k])]));
    const out = [bar, kv(rows)];
    if (pers === false && navigator.storage.persist) {
      out.push(btn('Keep storage', 'primary', async () => { try { await navigator.storage.persist(); } catch (_) { /* refused */ } estimate(); }));
    }
    out.push(el('p', 'muted small', 'The quota is what the browser allows this site, not the size of your disk.'));
    box.replaceChildren(...out);
  }

  async function size(h, out, b) {
    out.textContent = 'Calculating\u2026'; if (b) b.disabled = true;
    try {
      const t0 = performance.now(), s = await FsOps.stats(h);
      out.textContent = bytes(s.bytes) + ' \u00B7 ' + s.files.toLocaleString() + ' files, ' + s.folders.toLocaleString() + ' folders' +
        ' \u00B7 ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s';
    } catch (err) { out.textContent = 'Could not read it (' + (err && err.name || 'error') + ')'; }
    if (b) b.disabled = false;
  }

  async function drives() {
    const D = window.FsDrives;
    if (!D || !window.FsOps) { drivesBox.replaceChildren(na('Drives are not available here.')); return; }
    const list = await D.list();
    if (!list.length) { drivesBox.replaceChildren(na('This browser has no file storage for web pages.')); return; }
    const rows = [];
    for (const d of list) {
      const r = el('div', 'drv');
      const out = el('span', 'drv-size muted');
      r.append(el('span', 'drv-ico', d.kind === 'local' ? '\uD83D\uDCBE' : '\uD83D\uDCC2'), el('b', 'drv-name', d.name), out);
      if (d.kind === 'local') {
        const h = await D.handle(d.id);
        const b = btn('Recalculate', '', () => size(h, out, b));
        r.appendChild(b);
        if (h) size(h, out, b); else out.textContent = 'Not available';
      } else {
        const ok = (await D.access(d.id)) === 'granted';
        if (ok) {
          out.textContent = 'Not calculated (big folders take a while)';
          const b = btn('Calculate', '', async () => size(await D.handle(d.id), out, b));
          r.appendChild(b);
        } else out.textContent = 'No access now \u2014 open it in Files (Allow access) first';
      }
      rows.push(r);
    }
    drivesBox.replaceChildren(...rows, el('p', 'muted small', 'Local is inside this site\u2019s quota above. Added folders are real folders on your computer.'));
  }

  SM.tab({
    id: 'storage', title: 'Storage', icon: '\uD83D\uDCBD',
    render(pane) {
      box = el('div'); drivesBox = el('div', 'drvs');
      pane.append(card('This site\u2019s storage', box), card('Drives', drivesBox));
      if (window.FsDrives) FsDrives.onChange(() => { if (SM.current && SM.current.id === 'storage') drives(); });
    },
    show() { estimate(); drives(); }
  });
})();
