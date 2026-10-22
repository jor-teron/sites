/*
 * Viewer core (apps/system/viewer/viewer_core.js) — the namespace window.VW: open the file named
 * in the URL hash (shared/fs/fs_ref.js), list the pictures and videos of its folder (sorted like
 * Files: its remembered sort 'sites-files.sort' / 'sites-files.dir'), step ‹ › through them, show
 * each with VW.image (viewer_image.js) or VW.video (viewer_video.js). One object URL at a time:
 * it is revoked, and a video stopped, on every switch and when the page goes (window closed).
 *
 * VW: $, st { ref, dir, items, i, url, kind, token }, say(text), toast(text), go(delta), show(i),
 *     start() (from the hash; again on hashchange), close() (release everything).
 */
window.VW = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const T = window.FileTypes;
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const st = { ref: null, dir: null, items: [], i: -1, url: '', kind: '', token: 0 };
  let toastT = 0;

  function say(text) { const m = $('msg'); m.textContent = text || ''; m.hidden = !text; }
  function toast(text) {
    const t = $('toast'); t.textContent = text; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1600);
  }
  const pref = (k, d) => { try { return localStorage.getItem('sites-files.' + k) || d; } catch (_) { return d; } };
  function sortLikeFiles(arr) {
    const k = pref('sort', 'name'), d = pref('dir', '1') === '-1' ? -1 : 1;
    return arr.sort((a, b) => {
      let r = 0;
      if (k === 'size') r = a.size - b.size;
      else if (k === 'modified') r = a.modified - b.modified;
      if (!r) r = coll.compare(a.name, b.name);
      return r * d;
    });
  }
  const media = (e) => { const k = T.kind(e.name, e.type); return k === 'image' || k === 'video'; };

  /** Let go of the shown file: stop the video, drop the picture, revoke the object URL. */
  function release() {
    if (VW.video) VW.video.stop();
    if (VW.image) VW.image.clear();
    if (st.url) URL.revokeObjectURL(st.url);
    st.url = ''; st.kind = '';
    $('img-tools').hidden = true; $('vid-tools').hidden = true;
  }
  function bar() {
    const n = st.items.length, e = st.items[st.i];
    $('count').textContent = n > 1 ? (st.i + 1) + ' / ' + n : '';
    $('prev').disabled = $('next').disabled = n < 2;
    $('name').textContent = e ? e.name : '';
    $('name').title = e ? e.name : '';
    document.title = (e ? e.name + ' \u2014 ' : '') + 'Viewer';
  }
  function setHash() {
    const e = st.items[st.i]; if (!e || !st.ref) return;
    st.ref = Object.assign({}, st.ref, { name: e.name });
    const h = '#' + FsRef.hash(st.ref);
    if (location.hash !== h) {
      history.replaceState(null, '', location.pathname + location.search + h);
      try { if (window.parent !== window) window.parent.postMessage({ type: 'hub-wm-save' }, location.origin); } catch (_) { /* ignore */ }
    }
  }

  async function show(i) {
    const n = st.items.length; if (!n) return;
    st.i = ((i % n) + n) % n;
    const tok = ++st.token, e = st.items[st.i];
    release(); say(''); bar(); setHash();
    const k = T.kind(e.name, e.type);
    if (k !== 'image' && k !== 'video') { say('Viewer can\u2019t open .' + (T.ext(e.name) || 'this kind of') + ' files'); return; }
    let f;
    try { f = await e.handle.getFile(); } catch (err) { if (tok === st.token) say('Could not read \u201c' + e.name + '\u201d: ' + (err.message || err)); return; }
    if (tok !== st.token) return;   // switched again while reading
    // Some drives give no type: tell the browser what it is from the name
    const blob = f.type ? f : new Blob([f], { type: T.mime(e.name) });
    st.url = URL.createObjectURL(blob); st.kind = k;
    if (k === 'image') { $('img-tools').hidden = false; VW.image.show(st.url, e); }
    else { $('vid-tools').hidden = false; VW.video.show(st.url, e, resumeKey(e, f)); }
  }
  const resumeKey = (e, f) => [st.ref.drive, st.ref.path, e.name, f.size].join('|');
  const go = (d) => { if (st.items.length > 1) show(st.i + d); };

  async function start() {
    const ref = FsRef.parse(location.hash);
    if (!ref) { release(); st.items = []; bar(); say('Open a picture or video from Files.'); return; }
    if (st.ref && st.dir && ref.drive === st.ref.drive && ref.path === st.ref.path) {   // same folder: just move
      const j = st.items.findIndex((x) => x.name === ref.name);
      if (j >= 0) { if (j !== st.i) show(j); return; }
    }
    const tok = ++st.token;
    release(); st.items = []; bar(); say('Opening\u2026');
    let r;
    try { r = await FsRef.resolve(ref); } catch (err) { if (tok === st.token) { $('name').textContent = ref.name; say(err.message || String(err)); } return; }
    let list = [];
    try { list = (await FsOps.list(r.dir)).filter((x) => x.kind === 'file' && media(x)); } catch (_) { list = []; }
    if (tok !== st.token) return;
    sortLikeFiles(list);
    let j = list.findIndex((x) => x.name === ref.name);
    if (j < 0) {   // not a picture / video (or not listed): show just it, with the message
      let size = 0; try { size = (await r.file.getFile()).size; } catch (_) { /* unreadable */ }
      list = [{ name: ref.name, kind: 'file', size, modified: 0, type: '', handle: r.file }];
      j = 0;
    }
    st.ref = ref; st.dir = r.dir; st.items = list;
    show(j);
  }

  return { $, st, say, toast, go, show, start, release };
})();
