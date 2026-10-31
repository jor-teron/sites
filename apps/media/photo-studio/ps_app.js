/*
 * Hub Photo Studio (HPS2) — ps_app.js, the Studio layer. Loaded LAST, after Photo Editor v2's
 * pe_ui.js (which boots the shared engine on DOMContentLoaded). It adds what makes Studio its own app:
 *  - PE.ui.notify: in-app message box (pe_send.js uses it instead of alert() when present)
 *  - PE.studio.ask({ title, text, input, ok, danger }): in-app confirm / prompt (HPS2) → Promise
 *    (true / false, or the typed string / null when `input` is given)
 *  - Settings + About sheet (theme, Ctrl+S format, JPEG quality), saved by ps_save.js under Studio's own keys
 *  - light / dark theme for the photo background
 *  - PE.studio: the slot where the heavy features (layers, selections, retouch, pro adjustments) plug in.
 *
 * Adding a feature later (one file per feature, e.g. ps_layers.js, loaded before this file or after it):
 *   PE.studio.feature({ id: 'layers', init() { ... } });             // init runs once the engine has booted
 *   PE.studio.addTool({ id: 'layers', title: 'Layers (L)', key: 'l', svg: '<path d=…/>', onTap() { ... } });
 * Tools appear in the toolbar slot #ps-tools (before Save); their key works when nothing else used it.
 * Features that must change the preview or the saved pixels will need a render / save hook in the
 * engine; that hook is added (backward compatible) in the release that first needs it.
 */
(function (PE) {
  'use strict';
  const S = PE.state, C = PE.config;
  const $ = (id) => document.getElementById(id);
  const pending = (PE.studio && PE.studio._queue) || [], pendingTools = (PE.studio && PE.studio._tools) || [];
  let booted = false;

  const ST = PE.studio = {
    features: [],
    tools: [],
    open: false,                 // settings sheet open
    feature(def) {
      if (!def || !def.id || ST.features.some((f) => f.id === def.id)) return;
      ST.features.push(def);
      if (booted && def.init) def.init(PE);
    },
    addTool(def) {
      if (!def || !def.id) return null;
      ST.tools.push(def);
      if (!booted) return null;
      return mountTool(def);
    }
  };
  for (const d of pending) ST.feature(d);
  for (const d of pendingTools) ST.addTool(d);

  function mountTool(def) {
    const b = document.createElement('button');
    b.className = 'tb'; b.type = 'button'; b.tabIndex = -1; b.id = 'tb-' + def.id; b.dataset.ps = def.id;
    b.title = def.title || def.id;
    b.innerHTML = '<svg viewBox="0 0 24 24">' + (def.svg || '<circle cx="12" cy="12" r="6"/>') + '</svg>';
    PE.ui.onTap(b, () => { if (!PE.resize.open && !ST.open && def.onTap) def.onTap(PE); });
    $('ps-tools').appendChild(b);
    syncTools();
    return b;
  }
  function syncTools() {
    for (const def of ST.tools) {
      const b = $('tb-' + def.id); if (!b) continue;
      b.disabled = def.needsPhoto !== false && !S.photo;
    }
  }

  // ---------- in-app message box (replaces alert) ----------
  let msgDone = null;
  PE.ui.notify = (text) => new Promise((res) => {
    $('ps-msg-text').textContent = String(text);
    $('dlg-msg').hidden = false;
    msgDone = res;
  });
  // ---------- in-app confirm / prompt (HPS2) ----------
  let askDone = null;
  ST.ask = (o) => new Promise((res) => {
    o = o || {};
    if (askDone) { const r = askDone; askDone = null; r(o.input != null ? null : false); }
    $('ask-title').textContent = o.title || '';
    $('ask-text').textContent = o.text || ''; $('ask-text').hidden = !o.text;
    const inp = $('ask-input'), withInput = o.input != null;
    inp.hidden = !withInput; inp.value = withInput ? String(o.input) : '';
    $('ask-ok').textContent = o.ok || 'OK';
    $('ask-ok').classList.toggle('danger', !!o.danger);
    $('dlg-ask').hidden = false;
    askDone = (v) => res(v);
    ST._askInput = withInput;
    if (withInput) setTimeout(() => { try { inp.focus(); inp.select(); } catch (_) { /* ignore */ } }, 30);
  });
  function closeAsk(ok) {
    if (!askDone) return;
    const r = askDone; askDone = null;
    $('dlg-ask').hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    r(ST._askInput ? (ok ? $('ask-input').value : null) : !!ok);
  }

  function closeMsg() { if ($('dlg-msg').hidden) return; $('dlg-msg').hidden = true; const r = msgDone; msgDone = null; if (r) r(); }

  // ---------- settings sheet ----------
  function syncSettings() {
    const P = PSSave.settings();
    for (const seg of document.querySelectorAll('#dlg-settings .seg')) {
      const v = String(P[seg.dataset.key]);
      for (const b of seg.children) b.classList.toggle('sel', b.dataset.v === v);
    }
  }
  ST.showSettings = () => {
    if (PE.resize.open) return;
    if (PE.crop.active) PE.crop.cancel();
    PE.ui.closePopovers();
    syncSettings();
    $('dlg-settings').hidden = false; ST.open = true;
    $('tb-settings').classList.add('active');
  };
  ST.closeSettings = () => {
    $('dlg-settings').hidden = true; ST.open = false;
    $('tb-settings').classList.remove('active');
  };
  function applySave(P) { C.save.defaultFormat = P.format; C.save.jpegQuality = P.quality; }

  function applyTheme(dark) {
    C.colors.stage = dark ? C.studio.stageDark : C.studio.stageLight;
    if (PE.view && PE.view.requestRender) PE.view.requestRender();
  }

  function init() {
    const onTap = PE.ui.onTap;
    $('ps-ver').textContent = C.release + ' · v' + C.version;
    onTap($('tb-settings'), () => (ST.open ? ST.closeSettings() : ST.showSettings()));
    onTap($('ps-set-close'), ST.closeSettings);
    onTap($('dlg-settings'), (e) => { if (e && e.target === $('dlg-settings')) ST.closeSettings(); });
    for (const seg of document.querySelectorAll('#dlg-settings .seg')) {
      for (const b of seg.children) onTap(b, () => {
        const k = seg.dataset.key, v = k === 'quality' ? +b.dataset.v : b.dataset.v;
        applySave(PSSave.set(k, v));
        syncSettings();
        if (PE.ui.sync) PE.ui.sync();
      });
    }
    onTap($('ps-msg-ok'), closeMsg);
    onTap($('ask-ok'), () => closeAsk(true));
    onTap($('ask-cancel'), () => closeAsk(false));
    onTap($('dlg-ask'), (e) => { if (e && e.target === $('dlg-ask')) closeAsk(false); });
    onTap($('dlg-msg'), (e) => { if (e && e.target === $('dlg-msg')) closeMsg(); });

    PSSave.onTheme(applyTheme);
    applyTheme(PSSave.isDark());

    // remember the Adjust chip in Studio's own state key
    const last = PSSave.state().adj;
    const chip = document.querySelector('#adj-chips .chip[data-id="' + last + '"]');
    if (chip && PE.adjust.current() !== last) chip.click();
    $('adj-chips').addEventListener('click', () => setTimeout(rememberChip, 0));
    $('adj-chips').addEventListener('pointerup', () => setTimeout(rememberChip, 0));

    // modal sheets: swallow the editor's keys while open (capture runs before pe_input.js)
    window.addEventListener('keydown', (e) => {
      if (!$('dlg-ask').hidden && $('dlg-msg').hidden) {
        if (e.key === 'Escape') { closeAsk(false); e.preventDefault(); }
        else if (e.key === 'Enter') { closeAsk(true); e.preventDefault(); }
        else if (e.target !== $('ask-input') && e.key !== 'Tab') e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (!$('dlg-msg').hidden) {
        if (e.key === 'Escape' || e.key === 'Enter') closeMsg();
        if (e.key !== 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      if (ST.open) {
        if (e.key === 'Escape' || e.key === C.studio.keys.settings) ST.closeSettings();
        if (e.key !== 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); }
      }
    }, true);
    // Studio keys: only when the engine did not use the key
    window.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || PE.resize.open) return;
      const t = e.target;
      if (t && ((t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = (e.key || '').toLowerCase();
      if (k === C.studio.keys.settings) { ST.showSettings(); e.preventDefault(); return; }
      const tool = ST.tools.find((d) => d.key && d.key === k);
      if (tool && tool.onTap && (tool.needsPhoto === false || S.photo)) { tool.onTap(PE); e.preventDefault(); }
    });

    PE.on((kind) => { if (kind !== 'adjlive') syncTools(); });
    booted = true;
    for (const def of ST.tools) mountTool(def);
    for (const f of ST.features) if (f.init) f.init(PE);
  }
  function rememberChip() { const c = PE.adjust.current(); if (c !== PSSave.state().adj) PSSave.setState('adj', c); }

  // HPS4-F1: keep the floating option bars (Select / Mask / Retouch) off the paintable photo.
  // When a bar is shown, #stage gets a top margin so it starts just below the bar; the engine's
  // ResizeObserver on #stage refits the photo. Strokes that start on the bar hit the bar, never the photo.
  function barFit() {
    const stage = $('stage'); if (!stage) return;
    let bottom = 0;
    document.querySelectorAll('.ps-bar').forEach((b) => { if (!b.hidden) bottom = Math.max(bottom, b.getBoundingClientRect().bottom); });
    const cur = parseFloat(stage.style.marginTop) || 0;
    const natTop = stage.getBoundingClientRect().top - cur;
    const need = bottom ? Math.max(0, Math.ceil(bottom + 4 - natTop)) : 0;
    if (need !== cur) stage.style.marginTop = need ? need + 'px' : '';
  }
  function watchBars() {
    const mo = new MutationObserver(() => requestAnimationFrame(barFit));
    const ro = window.ResizeObserver ? new ResizeObserver(() => requestAnimationFrame(barFit)) : null;
    const hook = () => document.querySelectorAll('.ps-bar').forEach((b) => {
      if (b._psFit) return; b._psFit = 1;
      mo.observe(b, { attributes: true, attributeFilter: ['hidden'] }); if (ro) ro.observe(b);
    });
    hook(); new MutationObserver(() => { hook(); requestAnimationFrame(barFit); }).observe(document.body, { childList: true });
    window.addEventListener('resize', () => requestAnimationFrame(barFit));
    barFit();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchBars);
  else watchBars();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.PE);
