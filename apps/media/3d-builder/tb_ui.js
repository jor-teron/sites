/* 3D Builder — tb_ui.js: toolbar, panels, keyboard, file, history glue. TD3 */

import { createScene } from './tb_scene.js';
import { createHistory } from './tb_history.js';
import * as Theme from './tb_theme.js';
import * as Dlg from './tb_dlg.js';
import {
  SHAPE_TYPES, LIGHT_TYPES, TYPE_LABELS, makeId, MAX_MODEL_BYTES,
  loadAutosaveAsync, saveAutosaveAsync, downloadH3d, parseProject, roundN, makeProject
} from './tb_io.js';
import { resizeImageToDataURL } from './tb_tex.js';
import { downloadBlob, downloadDataURL } from './tb_export.js';

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
    saveAutosaveAsync(scene.getProject());
  }

  function commit() {
    if (applying) return;
    if (history.push()) autosave();
    else autosave();
    refreshHistory();
  }

  history.onChange(function () { refreshHistory(); });

  loadAutosaveAsync().then(function (saved) {
    if (saved && saved.project && saved.project.objects && saved.project.objects.length) {
      scene.loadProject(saved.project);
    }
    history.reset();
    refreshAll();
  });

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
    const selIds = (scene.getSelection() || []).map(function (n) { return n.userData.id; });
    ul.textContent = '';
    items.forEach(function (it) {
      const li = document.createElement('li');
      li.tabIndex = 0;
      li.dataset.id = it.id;
      li.style.setProperty('--depth', String(it.depth || 0));
      let cls = 'obj-item';
      if (selIds.indexOf(it.id) >= 0) cls += ' on';
      if (!it.visible) cls += ' hidden-obj';
      if (it.locked) cls += ' locked-obj';
      li.className = cls;
      const lab = document.createElement('span');
      lab.className = 'obj-name';
      lab.textContent = it.name;
      const typ = document.createElement('span');
      typ.className = 'obj-type';
      typ.textContent = TYPE_LABELS[it.type] || it.type;
      const tools = document.createElement('span');
      tools.className = 'obj-tools';
      const eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'mini' + (it.visible ? '' : ' on');
      eye.title = it.visible ? 'Hide' : 'Show';
      eye.setAttribute('aria-label', eye.title);
      eye.textContent = it.visible ? '●' : '○';
      eye.addEventListener('click', function (e) {
        e.stopPropagation();
        scene.setVisible(it.id, !it.visible);
        commit();
        refreshAll();
      });
      const lock = document.createElement('button');
      lock.type = 'button';
      lock.className = 'mini' + (it.locked ? ' on' : '');
      lock.title = it.locked ? 'Unlock' : 'Lock';
      lock.setAttribute('aria-label', lock.title);
      lock.textContent = it.locked ? 'L' : 'l';
      lock.addEventListener('click', function (e) {
        e.stopPropagation();
        scene.setLocked(it.id, !it.locked);
        commit();
        refreshAll();
      });
      tools.appendChild(eye);
      tools.appendChild(lock);
      li.appendChild(lab);
      li.appendChild(typ);
      li.appendChild(tools);
      li.addEventListener('click', function (e) {
        scene.selectById(it.id, e.shiftKey || e.ctrlKey || e.metaKey);
      });
      li.addEventListener('dblclick', function (e) {
        e.preventDefault();
        renameSelected();
      });
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          scene.selectById(it.id, e.shiftKey || e.ctrlKey || e.metaKey);
        }
      });
      ul.appendChild(li);
    });
    if (empty) empty.hidden = items.length > 0;
  }

  function setVal(id, v, force) {
    const el = $(id);
    if (!el) return;
    if (!force && el === document.activeElement) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  }

  function setTxt(id, v) {
    const el = $(id);
    if (el) el.textContent = v;
  }

  function fillSky(force) {
    const sky = scene.getSky();
    setVal('skyCustom', sky.skyCustom, force);
    const col = sky.skyCustom ? sky.sky : (Theme.resolve() === 'dark' ? '#0f172a' : '#e8eef5');
    setVal('skyColor', col, force);
    setVal('skyHex', col, force);
    const sk = $('skyColor');
    const hx = $('skyHex');
    if (sk) sk.disabled = !sky.skyCustom;
    if (hx) hx.disabled = !sky.skyCustom;
  }

  function fillProps(live) {
    const form = $('propsForm');
    const empty = $('propsEmpty');
    const note = $('multiNote');
    const rec = scene.getProps();
    fillSky(!live);
    if (!form || !empty) return;
    if (!rec) {
      form.hidden = true;
      empty.hidden = false;
      if (note) note.hidden = true;
      return;
    }
    form.hidden = false;
    empty.hidden = true;
    if (note) {
      if (rec.selectedCount > 1) {
        note.hidden = false;
        note.textContent = rec.selectedCount + ' objects selected. Edits below apply to ' + rec.name + '.';
      } else {
        note.hidden = true;
      }
    }
    applying = true;
    const force = !live;
    const isLight = rec.type && rec.type.indexOf('light-') === 0;
    const isGroup = rec.type === 'group';
    const isShape = !isLight && !isGroup;
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
    if ($('scaleFields')) $('scaleFields').hidden = isLight;
    if ($('matFields')) $('matFields').hidden = !isShape;
    if ($('texFields')) $('texFields').hidden = !isShape;
    if ($('lightFields')) $('lightFields').hidden = !isLight;
    if (isShape && rec.material) {
      setVal('propRough', rec.material.roughness, force);
      setVal('propMetal', rec.material.metalness, force);
      setVal('propOpacity', rec.material.opacity, force);
      setTxt('propRoughV', Number(rec.material.roughness).toFixed(2));
      setTxt('propMetalV', Number(rec.material.metalness).toFixed(2));
      setTxt('propOpacityV', Number(rec.material.opacity).toFixed(2));
    }
    if (isShape) {
      const st = $('texStatus');
      if (st) {
        if (!rec.texture) st.textContent = 'None';
        else if (rec.texture.kind === 'image') st.textContent = 'Image';
        else if (rec.texture.kind === 'text') st.textContent = 'Text: ' + (rec.texture.text || '');
      }
    }
    if (isLight) {
      setVal('propIntensity', rec.intensity, force);
      setVal('propDistance', rec.distance, force);
      setVal('propAngle', rec.angle, force);
      setVal('propPenumbra', rec.penumbra, force);
      setTxt('propIntensityV', Number(rec.intensity).toFixed(2));
      setTxt('propDistanceV', String(rec.distance));
      setTxt('propAngleV', Math.round(rec.angle) + '°');
      setTxt('propPenumbraV', Number(rec.penumbra).toFixed(2));
      if ($('distRow')) $('distRow').hidden = rec.type === 'light-directional';
      if ($('angleRow')) $('angleRow').hidden = rec.type !== 'light-spot';
      if ($('penumbraRow')) $('penumbraRow').hidden = rec.type !== 'light-spot';
    }
    applying = false;
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
    const out = {
      name: nameEl ? nameEl.value : rec.name,
      position: [num('propPx', rec.position[0]), num('propPy', rec.position[1]), num('propPz', rec.position[2])],
      rotation: [num('propRx', rec.rotation[0]), num('propRy', rec.rotation[1]), num('propRz', rec.rotation[2])],
      scale: [num('propSx', rec.scale[0]), num('propSy', rec.scale[1]), num('propSz', rec.scale[2])],
      color: color
    };
    const isShape = rec.type && SHAPE_TYPES.indexOf(rec.type) >= 0;
    const isLight = rec.type && LIGHT_TYPES.indexOf(rec.type) >= 0;
    if (isShape) {
      out.material = {
        roughness: num('propRough', rec.material ? rec.material.roughness : 0.55),
        metalness: num('propMetal', rec.material ? rec.material.metalness : 0.12),
        opacity: num('propOpacity', rec.material ? rec.material.opacity : 1)
      };
    }
    if (isLight) {
      out.intensity = num('propIntensity', rec.intensity);
      out.distance = num('propDistance', rec.distance);
      out.angle = num('propAngle', rec.angle);
      out.penumbra = num('propPenumbra', rec.penumbra);
    }
    return out;
  }

  function applyForm(live) {
    if (applying) return;
    const p = readPropsFromForm();
    if (!p) return;
    scene.applyProps(p, !!live);
    if (!live) {
      refreshList();
      updateStatus();
    } else {
      if ($('propRough')) setTxt('propRoughV', num('propRough', 0).toFixed(2));
      if ($('propMetal')) setTxt('propMetalV', num('propMetal', 0).toFixed(2));
      if ($('propOpacity')) setTxt('propOpacityV', num('propOpacity', 0).toFixed(2));
      if ($('propIntensity')) setTxt('propIntensityV', num('propIntensity', 0).toFixed(2));
      if ($('propDistance')) setTxt('propDistanceV', String(num('propDistance', 0)));
      if ($('propAngle')) setTxt('propAngleV', Math.round(num('propAngle', 0)) + '°');
      if ($('propPenumbra')) setTxt('propPenumbraV', num('propPenumbra', 0).toFixed(2));
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
    const selN = (scene.getSelection() || []).length;
    const rec = scene.getProps();
    const mode = scene.getMode();
    const modeLab = mode === 'rotate' ? 'Rotate' : mode === 'scale' ? 'Scale' : 'Move';
    const snap = scene.getSnap() ? 'Snap on' : 'Snap off';
    const sel = selN > 1 ? (selN + ' selected') : (rec ? rec.name + ' selected' : 'Nothing selected');
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

  function closeMenus() {
    ['addMenu', 'alignMenu'].forEach(function (id) {
      const menu = $(id);
      if (menu) menu.hidden = true;
    });
    if ($('addBtn')) $('addBtn').setAttribute('aria-expanded', 'false');
    if ($('alignBtn')) $('alignBtn').setAttribute('aria-expanded', 'false');
  }

  function closeAddMenu() { closeMenus(); }

  function addShape(type) {
    closeMenus();
    closePanels();
    if (SHAPE_TYPES.indexOf(type) < 0 && LIGHT_TYPES.indexOf(type) < 0) return;
    scene.addObject(type);
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

  function wireMenu(btnId, menuId, wrapSel, onItem) {
    const btn = $(btnId);
    const menu = $(menuId);
    if (!btn || !menu) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const open = menu.hidden;
      closeMenus();
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.addEventListener('click', function (e) {
      const b = e.target.closest('button');
      if (b) onItem(b, e);
    });
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !e.target.closest(wrapSel)) closeMenus();
    });
  }

  wireMenu('addBtn', 'addMenu', '.add-wrap', function (b) {
    if (b.getAttribute('data-type')) addShape(b.getAttribute('data-type'));
  });
  wireMenu('alignBtn', 'alignMenu', '#alignWrap', function (b) {
    const a = b.getAttribute('data-align');
    if (!a) return;
    closeMenus();
    const parts = a.split(',');
    const axis = parseInt(parts[0], 10);
    const mode = parts[1];
    if (scene.alignSelected(axis, mode)) { commit(); refreshAll(); }
  });

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
  if ($('groupBtn')) {
    $('groupBtn').addEventListener('click', function () {
      if (scene.groupSelected()) { commit(); refreshAll(); }
    });
  }
  if ($('ungroupBtn')) {
    $('ungroupBtn').addEventListener('click', function () {
      if (scene.ungroupSelected()) { commit(); refreshAll(); }
    });
  }

  if ($('listToggle')) $('listToggle').addEventListener('click', function () { togglePanel('list'); });
  if ($('propsToggle')) $('propsToggle').addEventListener('click', function () { togglePanel('props'); });
  if ($('panelOverlay')) $('panelOverlay').addEventListener('click', closePanels);

  function applySky() {
    const custom = $('skyCustom') && $('skyCustom').checked;
    let color = ($('skyHex') && $('skyHex').value) || '';
    if ($('skyColor') && $('skyColor').value && custom) {
      if (!/^#([0-9a-fA-F]{6})$/.test(color.trim())) color = $('skyColor').value;
    }
    scene.setSky(color, custom);
  }

  if ($('skyCustom')) {
    $('skyCustom').addEventListener('change', function () { applySky(); commit(); refreshAll(); });
  }
  if ($('skyColor')) {
    $('skyColor').addEventListener('input', function () {
      if ($('skyHex')) $('skyHex').value = $('skyColor').value;
      applySky();
    });
    $('skyColor').addEventListener('change', function () { applySky(); commit(); });
  }
  if ($('skyHex')) {
    $('skyHex').addEventListener('change', function () {
      if (/^#([0-9a-fA-F]{6})$/.test($('skyHex').value.trim()) && $('skyColor')) {
        $('skyColor').value = $('skyHex').value.trim();
      }
      applySky();
      commit();
    });
  }

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

  if ($('texImageBtn') && $('texImageInput')) {
    $('texImageBtn').addEventListener('click', function () { $('texImageInput').click(); });
    $('texImageInput').addEventListener('change', function () {
      const f = $('texImageInput').files && $('texImageInput').files[0];
      $('texImageInput').value = '';
      if (!f) return;
      resizeImageToDataURL(f).then(function (res) {
        const id = makeId();
        scene.putTexture(id, res.dataURL);
        scene.applyProps({ texture: { kind: 'image', id: id } }, false);
        commit();
        refreshAll();
      }).catch(function (err) {
        Dlg.message('Image', (err && err.message) || 'Could not use that image.');
      });
    });
  }
  if ($('texClearBtn')) {
    $('texClearBtn').addEventListener('click', function () {
      scene.applyProps({ texture: null }, false);
      commit();
      refreshAll();
    });
  }
  if ($('texTextBtn')) {
    $('texTextBtn').addEventListener('click', function () {
      const rec = scene.getProps();
      const cur = (rec && rec.texture && rec.texture.kind === 'text') ? rec.texture : {};
      Dlg.open({
        title: 'Text texture',
        html: '<label class="dlg-field"><span>Text</span>' +
          '<input type="text" id="dlgTexText" maxlength="120" autocomplete="off"></label>' +
          '<label class="dlg-field"><span>Text colour</span>' +
          '<input type="text" id="dlgTexFg" maxlength="7" value="#ffffff"></label>' +
          '<label class="dlg-field"><span>Background</span>' +
          '<input type="text" id="dlgTexBg" maxlength="7" value="#1e293b"></label>' +
          '<label class="dlg-field"><span>Size</span>' +
          '<input type="number" id="dlgTexSize" min="12" max="128" value="48"></label>',
        actions: [
          { label: 'Cancel', cls: 'secondary-btn' },
          {
            label: 'Apply',
            cls: 'primary-btn',
            fn: function () {
              const text = ($('dlgTexText') && $('dlgTexText').value) || '';
              scene.applyProps({
                texture: {
                  kind: 'text',
                  text: text,
                  textColor: ($('dlgTexFg') && $('dlgTexFg').value) || '#ffffff',
                  bgColor: ($('dlgTexBg') && $('dlgTexBg').value) || '#1e293b',
                  fontSize: ($('dlgTexSize') && Number($('dlgTexSize').value)) || 48
                }
              }, false);
              commit();
              refreshAll();
            }
          }
        ],
        onOpen: function () {
          if ($('dlgTexText')) { $('dlgTexText').value = cur.text || 'Text'; $('dlgTexText').focus(); }
          if ($('dlgTexFg')) $('dlgTexFg').value = cur.textColor || '#ffffff';
          if ($('dlgTexBg')) $('dlgTexBg').value = cur.bgColor || '#1e293b';
          if ($('dlgTexSize')) $('dlgTexSize').value = cur.fontSize || 48;
        }
      });
    });
  }

  if ($('newBtn')) {
    $('newBtn').addEventListener('click', async function () {
      const ok = await Dlg.confirmDlg({
        title: 'New scene',
        text: 'Start a new empty scene? The current scene will be replaced in autosave. Use Save first if you want a copy on this device.',
        okLabel: 'New scene'
      });
      if (!ok) return;
      scene.loadProject(makeProject([]));
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


  if ($('importBtn') && $('importInput')) {
    $('importBtn').addEventListener('click', function () { $('importInput').click(); });
    $('importInput').addEventListener('change', function () {
      const f = $('importInput').files && $('importInput').files[0];
      $('importInput').value = '';
      if (!f) return;
      if (f.size > MAX_MODEL_BYTES) {
        Dlg.message('Import', 'That file is larger than 8 MB, which is too heavy for this app.');
        return;
      }
      const name = f.name || 'model.glb';
      const isJson = /\.gltf$/i.test(name) || (f.type && f.type.indexOf('json') >= 0);
      const reader = new FileReader();
      reader.onload = function () {
        const data = reader.result;
        Dlg.open({
          title: 'Importing',
          text: 'Reading ' + name + '…',
          dismissable: false,
          actions: []
        });
        scene.importModel(data, name).then(function () {
          Dlg.close();
          commit();
          refreshAll();
        }).catch(function (err) {
          Dlg.message('Could not import', (err && err.message) || 'This file could not be opened. Try a self-contained .glb.');
        });
      };
      reader.onerror = function () { Dlg.message('Could not import', 'The file could not be read.'); };
      if (isJson) reader.readAsText(f);
      else reader.readAsArrayBuffer(f);
    });
  }

  function offerDownload(title, note, doSave) {
    Dlg.open({
      title: title,
      text: note,
      actions: [
        { label: 'Cancel', cls: 'secondary-btn' },
        { label: 'Download', cls: 'primary-btn', fn: function () { doSave(); } }
      ]
    });
  }

  if ($('exportBtn')) {
    $('exportBtn').addEventListener('click', function () {
      Dlg.open({
        title: 'Export',
        html: '<p>Save the scene for other apps, or a picture of the current view. Use Save for a .h3d project you can open here again.</p>' +
          '<div class="prop-acts" id="exportChoices">' +
          '<button type="button" class="btn secondary-btn" data-fmt="glb">glTF (.glb)</button>' +
          '<button type="button" class="btn secondary-btn" data-fmt="obj">Wavefront (.obj)</button>' +
          '<button type="button" class="btn secondary-btn" data-fmt="stl">STL (.stl)</button>' +
          '<button type="button" class="btn secondary-btn" data-fmt="png">PNG screenshot</button>' +
          '</div>',
        actions: [{ label: 'Cancel', cls: 'secondary-btn' }],
        onOpen: function () {
          const box = $('exportChoices');
          if (!box) return;
          box.addEventListener('click', function (e) {
            const b = e.target.closest('button[data-fmt]');
            if (!b) return;
            const fmt = b.getAttribute('data-fmt');
            if (fmt === 'png') {
              const url = scene.capturePNG();
              offerDownload('Screenshot ready', 'A PNG of the current view is ready to save on this device.', function () {
                downloadDataURL(url, 'view.png');
              });
              return;
            }
            Dlg.open({
              title: 'Exporting',
              text: 'Preparing scene.' + fmt + '…',
              dismissable: false,
              actions: []
            });
            scene.exportScene(fmt).then(function (blob) {
              offerDownload('Export ready', 'scene.' + fmt + ' is ready to save on this device.', function () {
                downloadBlob(blob, 'scene.' + fmt);
              });
            }).catch(function (err) {
              Dlg.message('Export failed', (err && err.message) || 'Could not export that format.');
            });
          });
        }
      });
    });
  }

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
    if (ctrl && key.toLowerCase() === 'g') {
      e.preventDefault();
      if (e.shiftKey) {
        if (scene.ungroupSelected()) { commit(); refreshAll(); }
      } else if (scene.groupSelected()) { commit(); refreshAll(); }
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
      closeMenus();
      closePanels();
      scene.deselect();
      refreshAll();
    }
  });

  window.addEventListener('beforeunload', function () { autosave(); });
  refreshAll();
}
