/*
 * PDF Tools P5 — fill AcroForm fields, a light page editor (text, highlight,
 * box, signature), and signatures saved on this device.
 */
PT.Sign = (() => {
  const { S } = PT;
  const SIGKEY = 'pdf-tools-signatures-v1';
  const COLORS = { black: [0, 0, 0], red: [0.75, 0.1, 0.1], blue: [0.1, 0.25, 0.7] };

  function safe(fn, fallback) {
    try { const v = fn(); return v == null ? fallback : v; } catch (_) { return fallback; }
  }

  function readFields(lib) {
    try {
      const form = lib.getForm();
      return form.getFields().map((f) => {
        const name = f.getName();
        if (typeof f.setText === 'function') return { name, type: 'text', value: safe(() => f.getText(), '') || '' };
        if (typeof f.check === 'function') return { name, type: 'check', value: !!safe(() => f.isChecked(), false) };
        if (typeof f.select === 'function') {
          const options = (safe(() => f.getOptions && f.getOptions(), []) || []).map((o) => (typeof o === 'string' ? o : (o && (o.name || o)) || String(o)));
          let value = safe(() => f.getSelected && f.getSelected(), '') || '';
          if (Array.isArray(value)) value = value[0] || '';
          return { name, type: 'select', value, options };
        }
        return { name, type: 'other', value: '' };
      }).filter((f) => f.type !== 'other');
    } catch (_) { return []; }
  }

  function applyFields(doc, srcId, flatten) {
    const vals = S.formValues && S.formValues[srcId];
    if (!vals && !flatten) return;
    try {
      const form = doc.getForm();
      if (vals) {
        Object.keys(vals).forEach((name) => {
          const value = vals[name];
          try {
            const f = form.getField(name);
            if (typeof f.setText === 'function') f.setText(PTUtil.winAnsiSafe(String(value == null ? '' : value)));
            else if (typeof f.check === 'function') {
              if (value === true || value === 'true' || value === 'Yes' || value === 'On' || value === '1') f.check();
              else if (typeof f.uncheck === 'function') f.uncheck();
            } else if (typeof f.select === 'function' && value !== '' && value != null) f.select(String(value));
          } catch (err) { console.info('PDF Tools: field ' + name + ':', err && err.message); }
        });
      }
      if (flatten) form.flatten();
    } catch (err) { console.info('PDF Tools: form fill:', err && err.message); }
  }

  function hasFields() {
    return (S.sources || []).some((s) => s.fields && s.fields.length);
  }

  async function formDialog() {
    if (!S.doc) return;
    const groups = (S.sources || []).filter((s) => s.fields && s.fields.length);
    if (!groups.length) {
      await PT.ask({ title: 'No fillable form', text: 'This file has no fillable form fields. You can still type, highlight or sign on a page from Sign & annotate.', no: false });
      return;
    }
    const fields = [{ type: 'heading', label: 'Form fields' }];
    groups.forEach((src) => {
      if (groups.length > 1) fields.push({ type: 'heading', label: src.name });
      const saved = (S.formValues && S.formValues[src.id]) || {};
      src.fields.forEach((f) => {
        const key = 'f_' + src.id + '_' + f.name;
        const value = Object.prototype.hasOwnProperty.call(saved, f.name) ? saved[f.name] : f.value;
        if (f.type === 'check') fields.push({ name: key, type: 'check', label: f.name, value: !!value });
        else if (f.type === 'select') fields.push({ name: key, type: 'select', label: f.name, value: value || '', options: [''].concat(f.options || []) });
        else fields.push({ name: key, type: 'text', label: f.name, value: value == null ? '' : value });
      });
    });
    fields.push({ type: 'heading', label: 'Save' });
    fields.push({ name: 'flatten', type: 'check', label: 'Flatten fields when saving (they become part of the page and cannot be filled later)', value: !!S.formFlatten });
    const values = await PT.form({
      title: 'Fill form',
      text: 'Values are kept until you close the file, and are written when you Save.',
      yes: 'OK',
      fields,
    });
    if (!values) return;
    S.formValues = S.formValues || {};
    groups.forEach((src) => {
      S.formValues[src.id] = S.formValues[src.id] || {};
      src.fields.forEach((f) => {
        const key = 'f_' + src.id + '_' + f.name;
        S.formValues[src.id][f.name] = values[key];
      });
    });
    S.formFlatten = !!values.flatten;
    PT.Edit.touch();
    PT.toast('Form values ready — they are written when you Save');
  }

  /* ---- signatures on this device ---- */
  function loadSigs() {
    try {
      const list = JSON.parse(localStorage.getItem(SIGKEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (_) { return []; }
  }
  function storeSigs(list) {
    const slim = (list || []).slice(-8);
    try { localStorage.setItem(SIGKEY, JSON.stringify(slim)); return true; }
    catch (err) {
      console.info('PDF Tools: could not save signatures:', err && err.message);
      return false;
    }
  }

  function paintTyped(canvas, text) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 64;
    ctx.font = 'italic ' + size + 'px Georgia,"Times New Roman",Times,serif';
    const t = String(text || '').trim();
    if (!t) return;
    while (size > 16 && ctx.measureText(t).width > w - 16) {
      size -= 2;
      ctx.font = 'italic ' + size + 'px Georgia,"Times New Roman",Times,serif';
    }
    ctx.fillText(t, w / 2, h / 2);
  }

  async function signaturePad() {
    return new Promise((resolve) => {
      const back = PT.$('sigpad');
      const canvas = PT.$('sigpad-c');
      const typed = PT.$('sigpad-text');
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(400 * dpr);
      canvas.height = Math.round(160 * dpr);
      canvas.style.width = '100%';
      canvas.style.height = '160px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
      ctx.clearRect(0, 0, 400, 160);
      typed.value = '';
      let drawing = false, mode = 'draw', dirty = false;
      function pos(e) {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (400 / r.width), y: (e.clientY - r.top) * (160 / r.height) };
      }
      const onDown = (e) => {
        if (mode !== 'draw' || e.button) return;
        drawing = true; dirty = true; canvas.setPointerCapture(e.pointerId);
        const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
        e.preventDefault();
      };
      const onMove = (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
      const onUp = (e) => { drawing = false; };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      const done = (url) => {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        back.hidden = true;
        resolve(url || null);
      };
      PT.$('sigpad-clear').onclick = () => { ctx.clearRect(0, 0, 400, 160); typed.value = ''; dirty = false; };
      PT.$('sigpad-type').onclick = () => {
        mode = 'type';
        typed.hidden = false;
        typed.focus();
      };
      typed.oninput = () => { mode = 'type'; paintTyped(canvas, typed.value); dirty = !!typed.value.trim(); };
      PT.$('sigpad-cancel').onclick = () => done(null);
      PT.$('sigpad-save').onclick = () => {
        if (!dirty) { done(null); return; }
        if (mode === 'type') paintTyped(canvas, typed.value);
        done(canvas.toDataURL('image/png'));
      };
      typed.hidden = true;
      back.hidden = false;
    });
  }

  async function makeSignature() {
    const url = await signaturePad();
    if (!url) return null;
    const list = loadSigs();
    const sig = { id: Date.now() + Math.random(), name: 'Signature ' + (list.length + 1), dataUrl: url };
    list.push(sig);
    if (!storeSigs(list)) {
      await PT.ask({ title: 'Could not keep this signature', text: 'The browser would not store it (storage may be full). You can still place it on this page for now.', no: false });
    }
    return sig;
  }

  async function pickSignature() {
    const list = loadSigs();
    if (!list.length) return makeSignature();
    const values = await PT.form({
      title: 'Choose a signature',
      yes: 'Use',
      fields: [
        { name: 'which', type: 'select', label: 'Saved on this device', value: String(list[list.length - 1].id),
          options: list.map((s) => [String(s.id), s.name]) },
        { name: 'fresh', type: 'check', label: 'Draw or type a new signature instead', value: false },
        { name: 'forget', type: 'check', label: 'Delete the selected saved signature', value: false },
      ],
    });
    if (!values) return null;
    if (values.forget) {
      storeSigs(list.filter((s) => String(s.id) !== String(values.which)));
      PT.toast('Signature deleted');
      return pickSignature();
    }
    if (values.fresh) return makeSignature();
    return list.find((s) => String(s.id) === String(values.which)) || null;
  }

  /* ---- draw annotations onto a pdf-lib page (media coordinates) ---- */
  async function drawOn(out, pg, page) {
    const annots = page.annots || [];
    if (!annots.length) return;
    const { rgb } = PDFLib;
    const font = await out.embedFont(PDFLib.StandardFonts.Helvetica);
    for (const a of annots) {
      const col = COLORS[a.color] || COLORS.black;
      const color = rgb(col[0], col[1], col[2]);
      try {
        if (a.type === 'highlight') {
          pg.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, color: rgb(1, 0.92, 0.2), opacity: 0.4, borderWidth: 0 });
        } else if (a.type === 'box') {
          pg.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, borderColor: color, borderWidth: 1.5, borderOpacity: 1 });
        } else if (a.type === 'text') {
          const size = Math.max(6, Number(a.size) || 12);
          pg.drawText(PTUtil.winAnsiSafe(a.text || ''), { x: a.x, y: a.y, size, font, color });
        } else if (a.type === 'sign' && a.dataUrl) {
          const parsed = PTUtil.dataUrlToBytes(a.dataUrl);
          if (!parsed) continue;
          const img = parsed.mime.indexOf('png') >= 0 ? await out.embedPng(parsed.bytes) : await out.embedJpg(parsed.bytes);
          pg.drawImage(img, { x: a.x, y: a.y, width: a.w, height: a.h });
        }
      } catch (err) { console.info('PDF Tools: annot skipped:', err && err.message); }
    }
  }

  /* ---- light page editor ---- */
  let ed = null;

  function isOpen() { return !!(ed && !PT.$('editor').hidden); }

  function mediaInfo(page) {
    const src = PT.sourceOf(page);
    if (src && src.kind === 'pdf' && src.sizes && src.sizes[page.src]) {
      const s = src.sizes[page.src];
      return { W: s.w, H: s.h, rot: (((s.baseRot || 0) + (page.rot || 0)) % 360 + 360) % 360 };
    }
    if (src && src.kind === 'image' && src.layout) {
      return { W: src.layout.pageW, H: src.layout.pageH, rot: (((page.rot || 0) % 360) + 360) % 360 };
    }
    if (src && src.kind === 'blank') {
      return { W: src.width || PTUtil.PAPER.a4.w, H: src.height || PTUtil.PAPER.a4.h, rot: (((page.rot || 0) % 360) + 360) % 360 };
    }
    const d = PTUtil.displaySize(src, { ...page, rot: 0 });
    return { W: d.w, H: d.h, rot: page.rot || 0 };
  }

  function visSize(info) {
    const v = PTUtil.mediaToVisual(0, 0, info.W, info.H, info.rot);
    return { w: v.w, h: v.h };
  }

  function layerRect() {
    return PT.$('ed-layer').getBoundingClientRect();
  }

  function eventToVisual(e, info) {
    const r = layerRect();
    const vis = visSize(info);
    const vx = ((e.clientX - r.left) / Math.max(1, r.width)) * vis.w;
    const vy = (1 - (e.clientY - r.top) / Math.max(1, r.height)) * vis.h;
    return { x: vx, y: vy };
  }

  function nextAnnotId() {
    return Date.now() + Math.random();
  }

  function renderLayer() {
    if (!ed) return;
    const layer = PT.$('ed-layer');
    const vis = visSize(ed.info);
    const r = layer.getBoundingClientRect();
    layer.innerHTML = '';
    ed.annots.forEach((a) => {
      const vr = PTUtil.mediaRectToVisual(
        a.type === 'text' ? { x: a.x, y: a.y, w: a.w || 80, h: a.h || (a.size || 12) } : { x: a.x, y: a.y, w: a.w, h: a.h },
        ed.info.W, ed.info.H, ed.info.rot
      );
      const el = document.createElement('div');
      el.className = 'ed-ann' + (ed.sel === a.id ? ' on' : '') + ' t-' + a.type;
      el.dataset.id = a.id;
      el.style.left = (vr.x / vis.w * 100) + '%';
      el.style.top = ((vis.h - vr.y - vr.h) / vis.h * 100) + '%';
      el.style.width = (vr.w / vis.w * 100) + '%';
      el.style.height = (vr.h / vis.h * 100) + '%';
      if (a.type === 'text') {
        el.textContent = a.text || '';
        el.style.fontSize = Math.max(8, (a.size || 12) * (r.height / vis.h)) + 'px';
        el.style.color = a.color === 'red' ? '#c00' : a.color === 'blue' ? '#1a4aad' : '#111';
      } else if (a.type === 'sign' && a.dataUrl) {
        const img = document.createElement('img');
        img.alt = 'Signature';
        img.src = a.dataUrl;
        el.appendChild(img);
      }
      if (ed.sel === a.id) {
        ['nw', 'ne', 'sw', 'se'].forEach((h) => {
          const k = document.createElement('span');
          k.className = 'ed-h ' + h;
          k.dataset.h = h;
          el.appendChild(k);
        });
      }
      layer.appendChild(el);
    });
  }

  function setTool(tool) {
    if (!ed) return;
    ed.tool = tool;
    ed.sel = tool === 'select' ? ed.sel : null;
    document.querySelectorAll('#ed-tools .rb, #ed-tools button').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    PT.$('ed-layer').style.cursor = tool === 'select' ? 'default' : 'crosshair';
    renderLayer();
  }

  async function addTextAt(media) {
    const values = await PT.form({
      title: 'Add text',
      yes: 'Add',
      fields: [
        { name: 'text', type: 'text', label: 'Text', value: '', placeholder: 'Type here' },
        { name: 'size', type: 'select', label: 'Size', value: '12', options: [['10', 'Small'], ['12', 'Normal'], ['18', 'Large'], ['28', 'Title']] },
        { name: 'color', type: 'select', label: 'Colour', value: 'black', options: [['black', 'Black'], ['red', 'Red'], ['blue', 'Blue']] },
      ],
      validate: (v) => (v.text && String(v.text).trim() ? null : 'Type some text.'),
    });
    if (!values) return;
    const size = Number(values.size) || 12;
    const text = String(values.text);
    /* width estimate in points (Helvetica ~0.5 em) */
    const w = Math.max(20, text.length * size * 0.5);
    ed.annots.push({ id: nextAnnotId(), type: 'text', x: media.x, y: media.y, w, h: size + 2, text, size, color: values.color || 'black' });
    ed.dirty = true;
    setTool('select');
    ed.sel = ed.annots[ed.annots.length - 1].id;
    renderLayer();
  }

  async function addSignAt(rectMedia) {
    const sig = await pickSignature();
    if (!sig) return;
    let w = rectMedia.w, h = rectMedia.h;
    if (w < 8 || h < 8) { w = 140; h = 56; }
    ed.annots.push({ id: nextAnnotId(), type: 'sign', x: rectMedia.x, y: rectMedia.y, w, h, dataUrl: sig.dataUrl, sigId: sig.id });
    ed.dirty = true;
    setTool('select');
    ed.sel = ed.annots[ed.annots.length - 1].id;
    renderLayer();
  }

  function hit(e) {
    const t = e.target.closest && e.target.closest('.ed-ann');
    return t ? t.dataset.id : null;
  }

  function onDown(e) {
    if (!ed || e.button) return;
    if (e.target.closest && e.target.closest('#ed-tools, #ed-done, #ed-cancel, .dlg-back, #sigpad')) return;
    const vis = eventToVisual(e, ed.info);
    if (ed.tool === 'select') {
      const handle = e.target.dataset && e.target.dataset.h;
      const id = handle ? ed.sel : hit(e);
      ed.sel = id ? (id.indexOf && id ? +id || id : id) : null;
      /* dataset ids are strings of numbers-with-decimals; keep as original type */
      if (id) ed.sel = ed.annots.some((a) => String(a.id) === String(id)) ? ed.annots.find((a) => String(a.id) === String(id)).id : null;
      if (!ed.sel) { renderLayer(); return; }
      const a = ed.annots.find((x) => x.id === ed.sel);
      ed.drag = { kind: handle ? 'resize' : 'move', handle, x: vis.x, y: vis.y, start: { x: a.x, y: a.y, w: a.w, h: a.h } };
      e.preventDefault();
      renderLayer();
      return;
    }
    if (ed.tool === 'text') {
      const m = PTUtil.visualToMedia(vis.x, vis.y, ed.info.W, ed.info.H, ed.info.rot);
      addTextAt(m);
      return;
    }
    ed.drag = { kind: 'draw', x: vis.x, y: vis.y, cur: vis };
    e.preventDefault();
  }

  function onMove(e) {
    if (!ed || !ed.drag) return;
    const vis = eventToVisual(e, ed.info);
    if (ed.drag.kind === 'draw') {
      ed.drag.cur = vis;
      const layer = PT.$('ed-layer');
      let ghost = PT.$('ed-ghost');
      if (!ghost) {
        ghost = document.createElement('div');
        ghost.id = 'ed-ghost';
        ghost.className = 'ed-ann t-' + (ed.tool === 'sign' ? 'box' : ed.tool);
        layer.appendChild(ghost);
      }
      const visS = visSize(ed.info);
      const x = Math.min(ed.drag.x, vis.x), y = Math.min(ed.drag.y, vis.y);
      const w = Math.abs(vis.x - ed.drag.x), h = Math.abs(vis.y - ed.drag.y);
      ghost.style.left = (x / visS.w * 100) + '%';
      ghost.style.top = ((visS.h - y - h) / visS.h * 100) + '%';
      ghost.style.width = (w / visS.w * 100) + '%';
      ghost.style.height = (h / visS.h * 100) + '%';
      return;
    }
    const a = ed.annots.find((x) => x.id === ed.sel);
    if (!a) return;
    const p0 = PTUtil.visualToMedia(ed.drag.x, ed.drag.y, ed.info.W, ed.info.H, ed.info.rot);
    const p1 = PTUtil.visualToMedia(vis.x, vis.y, ed.info.W, ed.info.H, ed.info.rot);
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    if (ed.drag.kind === 'move') {
      a.x = ed.drag.start.x + dx;
      a.y = ed.drag.start.y + dy;
    } else {
      const h = ed.drag.handle;
      const vr = PTUtil.mediaRectToVisual(ed.drag.start, ed.info.W, ed.info.H, ed.info.rot);
      let x = vr.x, y = vr.y, w = vr.w, hh = vr.h;
      const dvx = vis.x - ed.drag.x, dvy = vis.y - ed.drag.y;
      if (h.indexOf('e') >= 0) w = Math.max(8, w + dvx);
      if (h.indexOf('w') >= 0) { x = x + dvx; w = Math.max(8, w - dvx); }
      if (h.indexOf('n') >= 0) hh = Math.max(8, hh + dvy);
      if (h.indexOf('s') >= 0) { y = y + dvy; hh = Math.max(8, hh - dvy); }
      const back = PTUtil.visualRectToMedia({ x, y, w, h: hh }, ed.info.W, ed.info.H, ed.info.rot);
      a.x = back.x; a.y = back.y; a.w = back.w; a.h = back.h;
    }
    ed.dirty = true;
    renderLayer();
  }

  function onUp(e) {
    if (!ed || !ed.drag) return;
    const drag = ed.drag;
    ed.drag = null;
    const ghost = PT.$('ed-ghost');
    if (ghost) ghost.remove();
    if (drag.kind !== 'draw') return;
    const x = Math.min(drag.x, drag.cur.x), y = Math.min(drag.y, drag.cur.y);
    const w = Math.abs(drag.cur.x - drag.x), h = Math.abs(drag.cur.y - drag.y);
    const rect = PTUtil.visualRectToMedia({ x, y, w, h }, ed.info.W, ed.info.H, ed.info.rot);
    if (ed.tool === 'sign') {
      if (w < 4 && h < 4) { rect.w = 0; rect.h = 0; }
      addSignAt(rect);
      return;
    }
    if (w < 4 || h < 4) return;
    if (ed.tool === 'highlight' || ed.tool === 'box') {
      ed.annots.push({ id: nextAnnotId(), type: ed.tool, x: rect.x, y: rect.y, w: rect.w, h: rect.h, color: 'black' });
      ed.dirty = true;
      setTool('select');
      ed.sel = ed.annots[ed.annots.length - 1].id;
      renderLayer();
    }
  }

  function close(save) {
    if (!ed) return;
    const state = ed;
    ed = null;
    PT.$('editor').hidden = true;
    PT.$('ed-stage-page').replaceChildren();
    if (save && state.dirty) {
      const annots = state.annots.map((a) => Object.assign({}, a));
      const id = state.pageId;
      PT.Edit.setPages(S.pages.map((p) => (p.id === id ? Object.assign({}, p, { annots }) : Object.assign({}, p))), 'Annotated page');
    }
  }

  async function open(pageId) {
    const page = S.pages.find((p) => p.id === pageId);
    if (!page) {
      await PT.ask({ title: 'Select a page', text: 'Select one page first, then open Sign & annotate.', no: false });
      return;
    }
    if (ed && ed.dirty) {
      const ok = await PT.ask({ title: 'Leave this page?', text: 'Your marks on this page have not been applied yet.', yes: 'Leave', danger: true });
      if (!ok) return;
    }
    PT.menu(false);
    if (PT.Images && PT.Images.isOpen()) PT.Images.close();
    const info = mediaInfo(page);
    ed = { pageId: page.id, tool: 'select', annots: (page.annots || []).map((a) => Object.assign({}, a)), sel: null, info, dirty: false, drag: null };
    PT.$('editor').hidden = false;
    PT.$('ed-cap').textContent = 'Page ' + (S.pages.indexOf(page) + 1);
    setTool('select');
    const holder = PT.$('ed-stage-page');
    holder.replaceChildren();
    PT.busy('Opening page…');
    try {
      const canvas = await PT.Images.renderPage(page, PTUtil.RENDER_MAX);
      if (!ed || ed.pageId !== page.id) return;
      canvas.id = 'ed-page';
      holder.replaceChildren(canvas);
      renderLayer();
    } catch (err) {
      console.info('PDF Tools: editor failed:', err && err.message);
      await PT.ask({ title: 'Couldn\'t open this page', text: 'Try another page, or close and open the file again.', no: false });
      close(false);
    } finally { PT.busy(null); }
  }

  function openSelected() {
    const id = S.sel.size === 1 ? [...S.sel][0] : (S.sel.size ? S.pages.find((p) => S.sel.has(p.id)).id : (S.pages[0] && S.pages[0].id));
    return open(id);
  }

  function delSel() {
    if (!ed || ed.sel == null) return;
    ed.annots = ed.annots.filter((a) => a.id !== ed.sel);
    ed.sel = null;
    ed.dirty = true;
    renderLayer();
  }

  function init() {
    const layer = PT.$('ed-layer');
    if (!layer) return;
    layer.addEventListener('pointerdown', onDown);
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onUp);
    PT.$('ed-tools').addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-tool]');
      if (b) setTool(b.dataset.tool);
    });
    PT.$('ed-del').addEventListener('click', delSel);
    PT.$('ed-done').addEventListener('click', () => close(true));
    PT.$('ed-cancel').addEventListener('click', async () => {
      if (ed && ed.dirty && !(await PT.ask({ title: 'Discard marks?', text: 'This page\'s new marks will be lost.', yes: 'Discard', danger: true }))) return;
      close(false);
    });
    const ann = PT.$('preview-ann');
    if (ann) ann.addEventListener('click', () => { if (previewId != null) open(previewId); });
  }

  /* preview "Write or sign" uses last previewed page via a hook */
  let previewId = null;
  const _preview = PT.Images && PT.Images.preview;
  function reset() { S.formValues = {}; S.formFlatten = false; }

  return {
    readFields, applyFields, hasFields, formDialog, drawOn, open, openSelected, close, isOpen, delSel, init, reset,
    setPreviewId: (id) => { previewId = id; },
    openPreview: () => open(previewId),
    loadSigs,
  };
})();
