/* 3D Builder — tb_ui.js: toolbar, panels, keyboard, file, history glue. TD1 */

import { createScene } from './tb_scene.js';
import { createHistory } from './tb_history.js';
import * as Theme from './tb_theme.js';
import * as Dlg from './tb_dlg.js';
import {
  TYPES, TYPE_LABELS, loadAutosave, saveAutosave, downloadH3d, parseProject, roundN
} from './tb_io.js';

function $(id) { return document.getElementById(id); }

function inField(el) {
  if (!el) return false;
  const t = (el.tagName || '').toLowerCase();
  if (t === 'input' || t === 'textarea' || t === 'select') return true;
  return !!el.isContentEditable;
}

export function boot() {
  const viewport = $('viewport');
  if (!viewport) return;

  const scene = createScene(viewport, {
    onSelect: function () { refreshAll(); },
    onObjectChange: function () { fillProps(true); updateStatus(); },
    onChange: function () { /* history.push is called by the action */ }
  });

  Theme.onChange(function (eff) { scene.setTheme(eff); });
  scene.setTheme(Theme.resolve());

  if (!scene.webglOk()) {
    Dlg.message('3D Builder', 'This browser could not start WebGL, so the 3D view cannot open.');
  }

  let applying = false;

  const history = createHistory({
    getState: function () { return scene.getState(); },
    setState: function (s) {
      applying = true;
      scene.setState(s);
      applying = false;
      refreshAll();
    }
  });

  function autosave() {
    saveAutosave(scene.getProject());
  }

  function commit() {
    if (applying) return;
    if (history.push()) autosave();
    else autosave();
    refreshHistory();
  }

  history.onChange(function () {
    refreshHistory();
  });

  const saved = loadAutosave();
  if (saved && saved.project && saved.project.objects && saved.project.objects.length) {
    scene.loadProject(saved.project);
  }
  history.reset();
  refreshAll();

  function refreshHistory() {
    const u = $('undoBtn');
    const r = $('redoBtn');
    if (u) u.disabled = !history.canUndo();
    if (r) r.disabled = !history.canRedo();
  }

  function refreshList() {
    const ul = $('objectList');
    const empty = $('listEmpty');
    if (!ul) return;
    const items = scene.listObjects();
    const sel = scene.getSelected();
    const selId = sel ? sel.userData.id : null;
    ul.textContent = '';
    items.forEach(function (it) {
      const li = document.createElement('li');
      li.tabIndex = 0;
      li.dataset.id = it.id;
      li.className = 'obj-item' + (it.id === selId ? ' on' : '');
      const lab = document.createElement('span');
      lab.className = 'obj-name';
      lab.textContent = it.name;
      const typ = document.createElement('span');
      typ.className = 'obj-type';
      typ.textContent = TYPE_LABELS[it.type] || it.type;
      li.appendChild(lab);
      li.appendChild(typ);
      li.addEventListener('click', function () {
        scene.selectById(it.id);
      });
      li.addEventListener('dblclick', function (e) {
        e.preventDefault();
        renameSelected();
      });
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); scene.selectById(it.id); }
      });
      ul.appendChild(li);
    });
    if (empty) empty.hidden = items.length > 0;
  }

  function fillProps(live) {
    const form = $('propsForm');
    const empty = $('propsEmpty');
    const rec = scene.getProps();
    if (!form || !empty) return;
    if (!rec) {
      form.hidden = true;
      empty.hidden = false;
      return;
    }
    form.hidden = false;
    empty.hidden = true;
    applying = true;
    const force = !live;
    setVal('propName', rec.name, force);
    setVal('propPx', roundN(rec.position[0], 3), force);
    setVal('propPy', roundN(rec.position[1], 3), force);
    setVal('propPz', roundN(rec.position[2], 3), force);
    setVal('propRx', roundN(rec.rotation[0], 2), force);
    setVal('propRy', roundN(rec.rotation[1], 2), force);
    setVal('propRz', roundN(rec.rotation[2], 2), force);
    setVal('propSx', roundN(rec.scale[0], 3), force);
    setVal('propSy', roundN(rec.scale[1], 3), force);
    setVal('propSz', roundN(rec.scale[2], 3), force);
    setVal('propColor', rec.color, force);
    setVal('propHex', rec.color, force);
    applying = false;
  }

  function setVal(id, v, force) {
    const el = $(id);
    if (!el) return;
    if (!force && el === document.activeElement) return;
    el.value = v;
  }

  function num(id, fallback) {
    const el = $(id);
    const n = el ? parseFloat(el.value) : NaN;
    return isFinite(n) ? n : fallback;
  }

  function readPropsFromForm() {
    const rec = scene.getProps();
    if (!rec) return null;
    const hex = $('propHex');
    const col = $('propColor');
    let color = rec.color;
    if (hex && /^#([0-9a-fA-F]{6})$/.test(hex.value.trim())) color = hex.value.trim();
    else if (col) color = col.value;
    const nameEl = $('propName');
    return {
      name: nameEl ? nameEl.value : rec.name,
      position: [num('propPx', rec.position[0]), num('propPy', rec.position[1]), num('propPz', rec.position[2])],
      rotation: [num('propRx', rec.rotation[0]), num('propRy', rec.rotation[1]), num('propRz', rec.rotation[2])],
      scale: [num('propSx', rec.scale[0]), num('propSy', rec.scale[1]), num('propSz', rec.scale[2])],
      color: color
    };
  }

  function applyForm(live) {
    if (applying) return;
    const p = readPropsFromForm();
    if (!p) return;
    scene.applyProps(p, !!live);
    if (!live) {
      refreshList();
      updateStatus();
    }
  }

  function updateModeSeg() {
    const mode = scene.getMode();
    const seg = $('modeSeg');
    if (!seg) return;
    seg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === mode);
    });
  }

  function updateViewSeg() {
    const v = scene.getView();
    const seg = $('viewSeg');
    if (!seg) return;
    seg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === v);
    });
  }

  function updateSnapBtn() {
    const b = $('snapBtn');
    if (!b) return;
    const on = scene.getSnap();
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function updateStatus() {
    const el = $('status');
    if (!el) return;
    const n = scene.listObjects().length;
    const rec = scene.getProps();
    const mode = scene.getMode();
    const modeLab = mode === 'rotate' ? 'Rotate' : mode === 'scale' ? 'Scale' : 'Move';
    const snap = scene.getSnap() ? 'Snap on' : 'Snap off';
    const sel = rec ? rec.name + ' selected' : 'Nothing selected';
    el.textContent = n + (n === 1 ? ' object' : ' objects') + ' · ' + snap + ' · ' + modeLab + ' · ' + sel;
  }

  function refreshAll() {
    refreshList();
    fillProps(false);
    refreshHistory();
    updateModeSeg();
    updateViewSeg();
    updateSnapBtn();
    updateStatus();
  }

  function closeAddMenu() {
    const menu = $('addMenu');
    if (menu) menu.hidden = true;
    const btn = $('addBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function addShape(type) {
    closeAddMenu();
    closePanels();
    if (TYPES.indexOf(type) < 0) return;
    scene.addPrimitive(type);
    commit();
    refreshAll();
  }

  async function renameSelected() {
    const rec = scene.getProps();
    if (!rec) return;
    const name = await Dlg.promptDlg({
      title: 'Rename',
      label: 'Name',
      value: rec.name,
      required: true
    });
    if (name == null || name === rec.name) return;
    scene.applyProps({ name: name }, false);
    commit();
    refreshAll();
  }

  function closePanels() {
    const lp = $('listPanel');
    const pp = $('propsPanel');
    const ov = $('panelOverlay');
    if (lp) lp.classList.remove('open');
    if (pp) pp.classList.remove('open');
    if (ov) ov.hidden = true;
    const lt = $('listToggle');
    const pt = $('propsToggle');
    if (lt) lt.classList.remove('on');
    if (pt) pt.classList.remove('on');
  }

  function togglePanel(which) {
    const lp = $('listPanel');
    const pp = $('propsPanel');
    const ov = $('panelOverlay');
    const target = which === 'list' ? lp : pp;
    if (!target) return;
    const willOpen = !target.classList.contains('open');
    if (lp) lp.classList.remove('open');
    if (pp) pp.classList.remove('open');
    if (willOpen) {
      target.classList.add('open');
      if (ov) ov.hidden = false;
    } else if (ov) ov.hidden = true;
    const lt = $('listToggle');
    const pt = $('propsToggle');
    if (lt) lt.classList.toggle('on', !!(lp && lp.classList.contains('open')));
    if (pt) pt.classList.toggle('on', !!(pp && pp.classList.contains('open')));
  }
  /* Add menu */
  const addBtn = $('addBtn');
  const addMenu = $('addMenu');
  if (addBtn && addMenu) {
    addBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const open = addMenu.hidden;
      addMenu.hidden = !open;
      addBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    addMenu.addEventListener('click', function (e) {
      const b = e.target.closest('button[data-type]');
      if (b) addShape(b.getAttribute('data-type'));
    });
    document.addEventListener('click', function (e) {
      if (!addMenu.hidden && !e.target.closest('.add-wrap')) closeAddMenu();
    });
  }

  /* Mode / view / snap */
  const modeSeg = $('modeSeg');
  if (modeSeg) {
    modeSeg.addEventListener('click', function (e) {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      scene.setMode(b.getAttribute('data-v'));
      updateModeSeg();
      updateStatus();
    });
  }
  const viewSeg = $('viewSeg');
  if (viewSeg) {
    viewSeg.addEventListener('click', function (e) {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      scene.setView(b.getAttribute('data-v'));
      updateViewSeg();
    });
  }
  if ($('snapBtn')) {
    $('snapBtn').addEventListener('click', function () {
      scene.setSnap(!scene.getSnap());
      updateSnapBtn();
      updateStatus();
    });
  }
  if ($('frameBtn')) $('frameBtn').addEventListener('click', function () { scene.frameSelected(); });
  if ($('undoBtn')) $('undoBtn').addEventListener('click', function () { history.undo(); autosave(); });
  if ($('redoBtn')) $('redoBtn').addEventListener('click', function () { history.redo(); autosave(); });

  if ($('listToggle')) $('listToggle').addEventListener('click', function () { togglePanel('list'); });
  if ($('propsToggle')) $('propsToggle').addEventListener('click', function () { togglePanel('props'); });
  if ($('panelOverlay')) $('panelOverlay').addEventListener('click', closePanels);

  /* Properties */
  const form = $('propsForm');
  if (form) {
    form.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'propColor') {
        const hex = $('propHex');
        if (hex) hex.value = e.target.value;
      }
      if (e.target && e.target.id === 'propHex' && /^#([0-9a-fA-F]{6})$/.test(e.target.value.trim())) {
        const col = $('propColor');
        if (col) col.value = e.target.value.trim();
      }
      applyForm(true);
    });
    form.addEventListener('change', function () {
      applyForm(false);
      commit();
      refreshAll();
    });
  }
  if ($('renameBtn')) $('renameBtn').addEventListener('click', renameSelected);
  if ($('dupBtn')) {
    $('dupBtn').addEventListener('click', function () {
      if (scene.duplicateSelected()) { commit(); refreshAll(); }
    });
  }
  if ($('delBtn')) {
    $('delBtn').addEventListener('click', function () {
      if (scene.deleteSelected()) { commit(); refreshAll(); closePanels(); }
    });
  }

  /* Project */
  if ($('newBtn')) {
    $('newBtn').addEventListener('click', async function () {
      const ok = await Dlg.confirmDlg({
        title: 'New scene',
        text: 'Start a new empty scene? The current scene will be replaced in autosave. Use Save first if you want a copy on this device.',
        okLabel: 'New scene'
      });
      if (!ok) return;
      scene.loadProject({ format: 'h3d', version: 1, objects: [] });
      history.reset();
      autosave();
      refreshAll();
      closePanels();
    });
  }
  if ($('saveBtn')) {
    $('saveBtn').addEventListener('click', function () {
      downloadH3d(scene.getProject(), 'scene.h3d');
    });
  }
  const fileInput = $('fileInput');
  if ($('openBtn') && fileInput) {
    $('openBtn').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        const r = parseProject(String(reader.result || ''));
        if (!r.ok) {
          Dlg.message('Could not open', r.error || 'This is not a valid .h3d project.');
          return;
        }
        scene.loadProject(r.project);
        history.reset();
        autosave();
        refreshAll();
        closePanels();
      };
      reader.onerror = function () {
        Dlg.message('Could not open', 'The file could not be read.');
      };
      reader.readAsText(f);
    });
  }

  /* Keyboard */
  document.addEventListener('keydown', function (e) {
    if (Dlg.isOpen()) return;
    if (inField(e.target)) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y' || e.key === 'Z')) {
        /* let fields keep their own undo */
      }
      return;
    }
    const key = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      history.undo();
      autosave();
      return;
    }
    if (ctrl && (key.toLowerCase() === 'y' || (key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      history.redo();
      autosave();
      return;
    }
    if (ctrl && key.toLowerCase() === 'd') {
      e.preventDefault();
      if (scene.duplicateSelected()) { commit(); refreshAll(); }
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      if (scene.deleteSelected()) { commit(); refreshAll(); }
      return;
    }
    if (key === 'w' || key === 'W') {
      scene.setMode('translate'); updateModeSeg(); updateStatus(); return;
    }
    if (key === 'e' || key === 'E') {
      scene.setMode('rotate'); updateModeSeg(); updateStatus(); return;
    }
    if (key === 'r' || key === 'R') {
      scene.setMode('scale'); updateModeSeg(); updateStatus(); return;
    }
    if (key === 'f' || key === 'F') {
      e.preventDefault();
      scene.frameSelected();
      return;
    }
    if (key === 'Escape') {
      closeAddMenu();
      closePanels();
      scene.deselect();
      refreshAll();
    }
  });

  window.addEventListener('beforeunload', function () { autosave(); });
}
