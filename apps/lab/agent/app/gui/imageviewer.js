/* Agent — app/gui/imageviewer.js: AG20 full-screen picture viewer for the Image page (replaces the AG14 #imgView dialog).
   HR.imgviewer.open(items, index, opt): items = [{rec, url}] in gallery order; opt.fname(rec) -> download name,
   opt.onDownload(rec, name), opt.onDelete(rec) -> Promise (viewer then shows the next picture, closes when none left).
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
    var it = items[i]; if (!it || !o.onDelete || !confirm('Delete this picture?')) return;
    o.onDelete(it.rec).then(function () { items.splice(i, 1); if (i >= items.length) i = items.length - 1; if (i < 0) dlg.close(); else show(0); });
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
