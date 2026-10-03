/*
 * Photo Editor v2 — pe_ui.js
 * Slim toolbar (bottom in portrait, right side in landscape), the crop / adjust
 * panels (in a dock next to the toolbar, so the photo refits instead of being
 * covered), the save menu, toast, zoom pill, empty screen — and the start-up.
 */
(function (PE) {
  'use strict';

  const U = PE.ui = { panel: null };
  const S = PE.state;
  const $ = (id) => document.getElementById(id);
  let toastTimer = 0, busyMsg = '';

  // Act on pointerup instead of click: a tap right after a drag on the photo can lose its
  // synthesized click on some browsers. Keyboard / programmatic clicks still work.
  U.onTap = (el, fn) => {
    let downId = null, handled = 0;
    el.addEventListener('pointerdown', (e) => { if (e.button > 0) return; downId = e.pointerId; });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== downId) return;
      downId = null;
      if (el.disabled) return;
      handled = Date.now();
      fn(e);
    });
    el.addEventListener('pointercancel', () => { downId = null; });
    el.addEventListener('pointerleave', () => { downId = null; });
    el.addEventListener('click', (e) => { if (Date.now() - handled < 700 || el.disabled) return; fn(e); });
  };

  U.toast = (msg, ms) => {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); if (busyMsg) U.busy(busyMsg); }, ms || 1800);
  };
  U.busy = (msg) => {
    busyMsg = msg || '';
    const t = $('toast');
    clearTimeout(toastTimer);
    if (busyMsg) { t.textContent = busyMsg; t.classList.add('show'); } else t.classList.remove('show');
    document.body.classList.toggle('busy', !!busyMsg);
  };

  U.closePopovers = () => { if (!$('pop-save').hidden) { $('pop-save').hidden = true; U.sync(); } };

  U.act = (a) => {
    const C = PE.crop, T = PE.transform, has = !!S.photo;
    if (a !== 'save' && a !== 'saveJpeg' && a !== 'savePng') $('pop-save').hidden = true;
    switch (a) {
      case 'open': PE.io.pick(); break;
      case 'undo': if (!C.active) S.undo(); break;
      case 'redo': if (!C.active) S.redo(); break;
      case 'rotl': T.rotate(-1); break;
      case 'rotr': T.rotate(1); break;
      case 'fliph': T.flip('h'); break;
      case 'flipv': T.flip('v'); break;
      case 'crop':
        if (!has) break;
        if (C.active) C.apply(); else { U.panel = null; C.start(); }
        break;
      case 'cropApply': C.apply(); break;
      case 'cropCancel': C.cancel(); break;
      case 'adjust':
        if (!has) break;
        if (C.active) C.cancel();
        U.panel = U.panel === 'adjust' ? null : 'adjust';
        break;
      case 'save':
        if (!has) break;
        $('pop-save').hidden = !$('pop-save').hidden;
        break;
      case 'saveJpeg': $('pop-save').hidden = true; PE.io.save('jpeg'); break;
      case 'savePng': $('pop-save').hidden = true; PE.io.save('png'); break;
      case 'saveDefault': PE.io.save(); break;
      case 'resetZoom': PE.view.resetZoom(); break;
      case 'cancel':
        if (C.active) C.cancel();
        else if (U.panel) U.panel = null;
        else PE.view.resetZoom();
        break;
      default: return;
    }
    U.sync();
  };

  U.sync = () => {
    const C = PE.crop, has = !!S.photo;
    document.body.classList.toggle('has-photo', has);
    document.body.classList.toggle('cropping', C.active);
    $('empty').hidden = has;
    for (const b of document.querySelectorAll('#toolbar [data-act]')) {
      const a = b.dataset.act;
      let dis = !has;
      if (a === 'open') dis = false;
      if (a === 'undo') dis = !S.canUndo() || C.active;
      if (a === 'redo') dis = !S.canRedo() || C.active;
      b.disabled = dis;
    }
    $('tb-crop').classList.toggle('active', C.active);
    $('tb-adjust').classList.toggle('active', U.panel === 'adjust' && !C.active);
    $('tb-save').classList.toggle('active', !$('pop-save').hidden);
    const cropOn = C.active, adjOn = !C.active && U.panel === 'adjust' && has;
    $('panel-crop').hidden = !cropOn;
    $('panel-adjust').hidden = !adjOn;
    $('dock').hidden = !(cropOn || adjOn);
    if (has) {
      const O = PE.transform.outputSize();
      $('save-info').textContent = O.w + ' × ' + O.h + (S.photo.scaled ? ' (reduced)' : '');
    }
  };

  function syncZoomPill() {
    const pill = $('zoom-pill'), V = PE.view;
    const show = !!S.photo && !PE.crop.active && (V.zoom > 1.01 || Math.abs(V.panX) > 1 || Math.abs(V.panY) > 1);
    pill.hidden = !show;
    if (show) pill.textContent = Math.round(V.zoom * 100) + '% ⟲';
  }

  U.init = () => {
    for (const b of document.querySelectorAll('[data-act]')) U.onTap(b, () => U.act(b.dataset.act));
    U.onTap($('zoom-pill'), () => U.act('resetZoom'));
    PE.view.onRender = syncZoomPill;
    PE.on((kind) => { if (kind !== 'adjlive') U.sync(); });
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('#pop-save, #tb-save')) U.closePopovers();
    });
    U.sync();
  };

  function boot() {
    PE.view.init();
    PE.crop.init();
    PE.adjust.init();
    PE.io.init();
    PE.input.init();
    U.init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.PE);
