/*
 * Hub Photo Studio (HPS6) — ps_close.js: Close project (Ctrl+W, Alt+W, Save menu "Close project").
 *  - Closes the open photo / project, never the app: back to the start card (#empty), app stays open.
 *  - Unsaved changes (edits differ from the last open / .hps save) → in-app dialog #dlg-close:
 *    Save (saves the .hps, then closes) / Don't save / Cancel. Enter = Save, Esc = Cancel. No native confirm.
 *  - "Saved" = the edits as they were when the photo / project was opened or last saved as .hps
 *    (a PNG / JPEG export is not a project save, so it still asks).
 *  - Close resets the engine state (S.photo = null) and emits 'photo'; the Studio features already treat
 *    'photo' with no photo as "closed" (tools off, layer images freed, selection cleared).
 *  - Shortcuts live in ps_keys.js (they call PE.closeProject.request()). Browsers keep Ctrl+W in a normal
 *    tab (it closes the tab); preventDefault works in an installed app window, so Alt+W is the backup.
 */
(function (PE) {
  'use strict';
  const S = PE.state;
  const $ = (id) => document.getElementById(id);
  const modal = () => !!document.querySelector('.dlg-wrap:not([hidden])');
  const snap = () => { try { return JSON.stringify(S.edits); } catch (_) { return ''; } };
  let clean = null, done = null;

  const CP = PE.closeProject = {
    open: false,
    isDirty: () => !!S.photo && snap() !== clean,
    markSaved: () => { clean = S.photo ? snap() : null; },
    // close now, no questions (also used after Save / Don't save)
    now() {
      if (!S.photo) return false;
      if (PE.crop.active) PE.crop.cancel();
      if (PE.resize.open) PE.resize.close();
      PE.ui.panel = null;
      const pop = $('pop-save'); if (pop) pop.hidden = true;
      if (PE.layers && PE.layers.open && PE.layers.toggle) PE.layers.toggle(false);
      const old = S.photo;
      S.photo = null; S.edits = null; S.history = []; S.index = -1;
      PE.emit('photo');
      if (old && old.bitmap && old.bitmap.close) { try { old.bitmap.close(); } catch (_) { /* already closed */ } }
      clean = null;
      PE.ui.sync();
      PE.ui.toast('Project closed', 1400);
      return true;
    },
    // ask first when there are unsaved changes → Promise<boolean> closed
    async request() {
      if (!S.photo || CP.open || modal()) return false;
      if ((PE.project && PE.project.busy) || (PE.io.isBusy && PE.io.isBusy())) return false;
      if (PE.crop.active) PE.crop.cancel();
      if (!CP.isDirty()) return CP.now();
      const a = await ask();
      if (a === 'cancel') return false;
      if (a === 'save') {
        const r = PE.project && PE.project.save ? await PE.project.save() : null;
        if (!r) return false;               // save failed or was busy: keep the work open
      }
      return CP.now();
    }
  };

  function ask() {
    return new Promise((res) => {
      const name = (S.photo && S.photo.name) || 'this photo';
      $('cl-text').textContent = 'Your changes to "' + name.replace(/\.[^.\/]+$/, '') + '" are not saved. Save them as a Photo Studio project (.hps) before closing?';
      $('dlg-close').hidden = false; CP.open = true; done = res;
    });
  }
  function answer(v) {
    if (!done) return;
    const r = done; done = null;
    $('dlg-close').hidden = true; CP.open = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    r(v);
  }

  // dialog keys first (this file loads before ps_keys.js): Enter = Save, Esc = Cancel, swallow the rest
  window.addEventListener('keydown', (e) => {
    if (!CP.open) return;
    if (e.key === 'Escape') answer('cancel');
    else if (e.key === 'Enter') answer('save');
    if (e.key !== 'Tab') e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  function init() {
    const on = PE.ui.onTap;
    on($('cl-save'), () => answer('save'));
    on($('cl-discard'), () => answer('discard'));
    on($('cl-cancel'), () => answer('cancel'));
    on($('dlg-close'), (e) => { if (e && e.target === $('dlg-close')) answer('cancel'); });
    on($('ps-close'), () => { $('pop-save').hidden = true; PE.ui.sync(); CP.request(); });
    // the clean point: a new photo / blank page, an opened .hps (after its edits are in), a saved .hps
    PE.on((kind) => {
      if (kind === 'photo' && S.photo && !(PE.layers && PE.layers.loadingProject)) CP.markSaved();
      if (kind !== 'adjlive') $('ps-close').disabled = !S.photo;
    });
    const P_ = PE.project;
    if (P_) {
      const open = P_.open, save = P_.save;
      P_.open = async (...a) => { const r = await open(...a); if (r) CP.markSaved(); return r; };
      P_.save = async (...a) => { const r = await save(...a); if (r) CP.markSaved(); return r; };
    }
    $('ps-close').disabled = !S.photo;
  }
  PE.studio.feature({ id: 'close', init: init });
})(window.PE);
