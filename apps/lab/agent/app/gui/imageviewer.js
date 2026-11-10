/* Agent — app/gui/imageviewer.js: AG20 full-screen picture viewer for the Image page (replaces the AG14 #imgView dialog).
   HR.imgviewer.open(items, index, opt): items = [{rec, url}] in gallery order; opt.fname(rec) -> download name,
   opt.onDownload(rec, name), opt.onDelete(rec) -> Promise (viewer then shows the next picture, closes when none left).
   AG42: onDelete resolves to the fresh [{rec, url}] list (new object URLs). The viewer rebuilds from that list
   (next picture, or the previous one if the last was deleted, or closes when none are left). Delete asks HR.confirm.
   A <dialog id="imgView"> filling the viewport, dark backdrop, image object-fit:contain. Top: 'n / total' and ✕.
   Bottom bar: prompt (two lines, ellipsis), ⬇ Download, 🗑 Delete. Keys: ← / → browse, Esc closes (native dialog).
   Phone: swipe left / right (pointer events, 50 px threshold) and big ‹ › side buttons. No wrap: ‹ hides on the first
   picture, › on the last. Light bouncy pop on open and a small slide on each browse (ui/imagepage.css). */
HR.imgviewer = (function () {
  var dlg, img, items = [], i = 0, o = {}, x0 = null, $ = function (id) { return document.getElementById(id); };
  function show(dir) {
    var it = items[i]; if (!it) { dlg.close(); return; }
    img.src = it.url; img.alt = it.rec.prompt || '';
    img.classList.remove('sl', 'sr'); void img.offsetWidth; if (dir) img.classList.add(dir > 0 ? 'sl' : 'sr');
    $('ivCount').textContent = (i + 1) + ' / ' + items.length;
    var cap = $('ivCap'); cap.textContent = it.rec.prompt || ''; cap.title = (it.rec.prompt || '') + ' · ' + (it.rec.model || '') + ' · ' + new Date(it.rec.time).toLocaleString();
    var d = $('ivDl'), fn = o.fname ? o.fname(it.rec) : 'agent-image.jpg'; d.href = it.url; d.download = fn;
    d.onclick = function () { if (o.onDownload) o.onDownload(it.rec, fn); };
    $('ivPrev').hidden = i === 0; $('ivNext').hidden = i >= items.length - 1;
  }
  function go(n) { var j = i + n; if (j < 0 || j >= items.length) return; i = j; show(n); }
  function del() {
    var it = items[i]; if (!it || !o.onDelete) return;
    var at = i, next = items[i + 1], prev = items[i - 1];
    var nextId = next && next.rec ? next.rec.id : null, prevId = prev && prev.rec ? prev.rec.id : null;
    // (before AG42) var it = items[i]; if (!it || !o.onDelete || !confirm('Delete this picture?')) return;
    // (before AG42) o.onDelete(it.rec).then(function () { items.splice(i, 1); if (i >= items.length) i = items.length - 1; if (i < 0) dlg.close(); else show(0); });
    return HR.confirm('Delete this picture?', { danger: true }).then(function (yes) {
      if (!yes) { try { dlg.focus(); } catch (e) {} return; }
      return o.onDelete(it.rec).then(function (fresh) {
        if (!Array.isArray(fresh)) {
          /* Refresh did not hand back new URLs (it failed before revoking the old ones). Dropping the
             deleted picture from this list is safe then. A successful gallery() always returns an array. */
          items.splice(at, 1);
          if (at >= items.length) at = items.length - 1;
          if (at < 0 || !items.length) { dlg.close(); return; }
          i = at; show(0); try { dlg.focus(); } catch (e2) {} return;
        }
        items = fresh.slice();
        if (!items.length) { dlg.close(); return; }
        var j = -1;
        if (nextId != null) j = items.findIndex(function (x) { return x.rec && x.rec.id === nextId; });
        if (j < 0 && prevId != null) j = items.findIndex(function (x) { return x.rec && x.rec.id === prevId; });
        if (j < 0) j = at >= items.length ? items.length - 1 : at;
        i = j < 0 ? 0 : j;
        show(0);
        try { dlg.focus(); } catch (e3) {}
      });
    });
  }
  function init() {
    dlg = $('imgView'); img = $('ivImg');
    $('ivX').onclick = function () { dlg.close(); };
    $('ivPrev').onclick = function () { go(-1); }; $('ivNext').onclick = function () { go(1); };
    $('ivDel').onclick = del;
    dlg.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } });
    var st = $('ivStage');
    st.addEventListener('pointerdown', function (e) { x0 = e.clientX; });
    st.addEventListener('pointerup', function (e) { if (x0 === null) return; var dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); });
    st.addEventListener('pointercancel', function () { x0 = null; });
    dlg.addEventListener('close', function () { img.removeAttribute('src'); });
  }
  function open(list, index, opt) { if (!dlg) init(); items = list.slice(); i = Math.max(0, Math.min(index, items.length - 1)); o = opt || {}; show(0); dlg.showModal(); dlg.focus(); }
  return { open: open, close: function () { if (dlg && dlg.open) dlg.close(); } };
})();
