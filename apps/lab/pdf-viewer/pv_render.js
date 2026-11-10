/* PDF Viewer — pv_render.js: continuous scroll + IntersectionObserver render. PV1 + PV2 text layer hook */
(function (root) {
  'use strict';

  var H = root.PVHelpers;

  function createRenderer(opts) {
    var viewer = opts.viewer;
    var pagesEl = opts.pagesEl;
    var onPageChange = opts.onPageChange || function () {};
    var onStatus = opts.onStatus || function () {};
    var onPageRendered = opts.onPageRendered || function () {};

    var state = {
      doc: null,
      numPages: 0,
      /** @type {{width:number,height:number}[]} PDF-unit sizes at scale 1 */
      sizes: [],
      zoom: 1,
      fit: 1,
      scale: 1,
      currentPage: 1,
      slots: [], // { el, canvas, pageNum, task, rendered }
      observer: null,
      intersecting: Object.create(null),
      resizeTimer: null,
      scrollTimer: null,
      destroyed: false
    };

    function cssSizeFor(pageIndex) {
      var s = state.sizes[pageIndex] || state.sizes[0] || { width: 612, height: 792 };
      return {
        width: Math.max(1, Math.round(s.width * state.scale)),
        height: Math.max(1, Math.round(s.height * state.scale))
      };
    }

    function recomputeFit() {
      if (!state.sizes.length) return;
      var pad = 24; // viewer padding left+right
      var cw = viewer.clientWidth || 320;
      state.fit = H.fitScale(state.sizes[0].width, cw, pad);
      state.scale = H.displayScale(state.fit, state.zoom);
    }

    function applySlotSizes() {
      for (var i = 0; i < state.slots.length; i++) {
        var slot = state.slots[i];
        var sz = cssSizeFor(i);
        slot.el.style.width = sz.width + 'px';
        slot.el.style.height = sz.height + 'px';
        // If already rendered at a different scale, free canvas so it re-renders.
        if (slot.rendered && slot.renderedScale !== state.scale) {
          cancelSlot(slot);
        }
      }
    }

    function cancelSlot(slot) {
      if (slot.task) {
        try { slot.task.cancel(); } catch (e) { /* ignore */ }
        slot.task = null;
      }
      if (slot.canvas && slot.canvas.parentNode) {
        slot.canvas.parentNode.removeChild(slot.canvas);
      }
      slot.canvas = null;
      if (root.PVTextLayer) root.PVTextLayer.remove(slot);
      slot.rendered = false;
      slot.renderedScale = 0;
      slot.el.classList.remove('is-rendered');
    }

    function renderedPageNums() {
      var out = [];
      for (var i = 0; i < state.slots.length; i++) {
        if (state.slots[i].rendered || state.slots[i].task) out.push(i + 1);
      }
      return out;
    }

    function keepSet() {
      var base = H.pagesAround(
        state.currentPage,
        state.numPages,
        H.LOOK_BEHIND,
        H.LOOK_AHEAD
      );
      var set = Object.create(null);
      var i;
      for (i = 0; i < base.length; i++) set[base[i]] = true;
      for (var k in state.intersecting) {
        if (state.intersecting[k]) set[Number(k)] = true;
      }
      var keep = [];
      for (k in set) keep.push(Number(k));
      keep.sort(function (a, b) { return a - b; });
      return keep;
    }

    function enforceBudget() {
      var keep = keepSet();
      // If too many slots are intersecting, keep only the closest to current.
      if (keep.length > H.MAX_RENDERED) {
        keep.sort(function (a, b) {
          return Math.abs(a - state.currentPage) - Math.abs(b - state.currentPage);
        });
        keep = keep.slice(0, H.MAX_RENDERED).sort(function (a, b) { return a - b; });
      }
      var evict = H.chooseEvictions(
        renderedPageNums(),
        keep,
        state.currentPage,
        H.MAX_RENDERED
      );
      for (var i = 0; i < evict.length; i++) {
        cancelSlot(state.slots[evict[i] - 1]);
      }
      return keep;
    }

    async function renderSlot(slot) {
      if (!state.doc || slot.rendered || slot.task) return;
      var pageNum = slot.pageNum;
      var dpr = H.devicePixelRatioCapped(
        (typeof window !== 'undefined' && window.devicePixelRatio) || 1
      );
      var page;
      try {
        page = await state.doc.getPage(pageNum);
      } catch (e) {
        onStatus('Could not read page ' + pageNum, 'error');
        return;
      }
      if (state.destroyed || !state.slots[pageNum - 1] || state.slots[pageNum - 1] !== slot) {
        return;
      }

      // Prefer viewport from desired CSS width so individual page sizes stay accurate.
      var base = page.getViewport({ scale: 1 });
      state.sizes[pageNum - 1] = { width: base.width, height: base.height };
      var css = cssSizeFor(pageNum - 1);
      slot.el.style.width = css.width + 'px';
      slot.el.style.height = css.height + 'px';

      // Size the canvas once before render; never resize mid-render.
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(css.width * dpr));
      canvas.height = Math.max(1, Math.round(css.height * dpr));
      canvas.style.width = css.width + 'px';
      canvas.style.height = css.height + 'px';
      var ctx = canvas.getContext('2d', { alpha: false });

      var viewport = page.getViewport({ scale: state.scale * dpr });
      var task = page.render({ canvasContext: ctx, viewport: viewport });
      slot.task = task;
      slot.canvas = canvas;

      try {
        await task.promise;
      } catch (e) {
        // Cancelled is normal when zooming / scrolling away.
        if (e && (e.name === 'RenderingCancelledException' || /cancel/i.test(e.message || ''))) {
          return;
        }
        onStatus('Render failed on page ' + pageNum, 'error');
        cancelSlot(slot);
        return;
      }

      if (state.destroyed || slot.task !== task) {
        return;
      }
      slot.task = null;
      slot.rendered = true;
      slot.renderedScale = state.scale;
      slot.el.appendChild(canvas);
      slot.el.classList.add('is-rendered');
      try {
        var ret = onPageRendered(slot);
        if (ret && typeof ret.then === 'function') {
          ret.catch(function (err) { console.warn('[pv2] text layer', err); });
        }
      } catch (err) {
        console.warn('[pv2] text layer', err);
      }
    }

    function scheduleVisible() {
      if (!state.doc) return;
      var keep = enforceBudget();
      for (var i = 0; i < keep.length; i++) {
        var slot = state.slots[keep[i] - 1];
        if (slot && !slot.rendered && !slot.task) {
          renderSlot(slot);
        }
      }
    }

    function updateCurrentFromScroll() {
      if (!state.slots.length) return;
      var mid = viewer.scrollTop + viewer.clientHeight / 3;
      var best = 1;
      var bestDist = Infinity;
      for (var i = 0; i < state.slots.length; i++) {
        var el = state.slots[i].el;
        var top = el.offsetTop;
        var bottom = top + el.offsetHeight;
        var center = (top + bottom) / 2;
        var dist = Math.abs(center - mid);
        if (top <= mid && mid <= bottom) {
          best = i + 1;
          break;
        }
        if (dist < bestDist) {
          bestDist = dist;
          best = i + 1;
        }
      }
      if (best !== state.currentPage) {
        state.currentPage = best;
        onPageChange(best, state.numPages);
      }
    }

    function buildSlots() {
      pagesEl.innerHTML = '';
      state.slots = [];
      for (var i = 1; i <= state.numPages; i++) {
        var el = document.createElement('div');
        el.className = 'page-slot';
        el.dataset.page = String(i);
        el.setAttribute('aria-label', 'Page ' + i);
        var ph = document.createElement('div');
        ph.className = 'page-placeholder';
        ph.textContent = 'Page ' + i;
        el.appendChild(ph);
        var sz = cssSizeFor(i - 1);
        el.style.width = sz.width + 'px';
        el.style.height = sz.height + 'px';
        pagesEl.appendChild(el);
        state.slots.push({
          el: el,
          canvas: null,
          pageNum: i,
          task: null,
          rendered: false,
          renderedScale: 0,
          textLayer: null,
          textTask: null,
          textSource: null
        });
      }
    }

    function bindObserver() {
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }
      state.intersecting = Object.create(null);
      if (typeof IntersectionObserver === 'undefined') {
        // Fallback: render around current only.
        scheduleVisible();
        return;
      }
      state.observer = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            var ent = entries[i];
            var n = Number(ent.target.dataset.page);
            if (!n) continue;
            if (ent.isIntersecting) state.intersecting[n] = true;
            else delete state.intersecting[n];
          }
          scheduleVisible();
        },
        {
          root: viewer,
          // ~1 page ahead/behind via margin
          rootMargin: '100% 0px 100% 0px',
          threshold: 0.01
        }
      );
      for (var j = 0; j < state.slots.length; j++) {
        state.observer.observe(state.slots[j].el);
      }
    }

    async function loadDocument(doc) {
      destroyContent(false);
      state.doc = doc;
      state.numPages = doc.numPages;
      state.currentPage = 1;
      state.zoom = 1;
      state.destroyed = false;

      // Size all pages from page 1 first (cheap); correct per-page on render.
      var page1 = await doc.getPage(1);
      var vp = page1.getViewport({ scale: 1 });
      state.sizes = [];
      for (var i = 0; i < state.numPages; i++) {
        state.sizes.push({ width: vp.width, height: vp.height });
      }
      recomputeFit();
      buildSlots();
      bindObserver();
      viewer.scrollTop = 0;
      onPageChange(1, state.numPages);
      scheduleVisible();
    }

    function setZoom(z) {
      if (!state.doc) return;
      // Keep current page in view after zoom.
      var anchor = state.currentPage;
      var slot = state.slots[anchor - 1];
      var offsetInPage = 0;
      if (slot) {
        offsetInPage = viewer.scrollTop - slot.el.offsetTop;
      }
      state.zoom = H.clampZoom(z);
      recomputeFit();
      // Cancel in-flight + free canvases so they re-render at new scale.
      for (var i = 0; i < state.slots.length; i++) {
        cancelSlot(state.slots[i]);
      }
      applySlotSizes();
      // Restore scroll to same page + relative offset.
      if (slot) {
        viewer.scrollTop = state.slots[anchor - 1].el.offsetTop + Math.max(0, offsetInPage);
      }
      scheduleVisible();
    }

    function fitWidth() {
      setZoom(1);
    }

    function zoomBy(dir) {
      setZoom(H.stepZoom(state.zoom, dir));
    }

    function goToPage(n) {
      if (!state.doc) return;
      var p = Math.min(Math.max(1, n | 0), state.numPages);
      state.currentPage = p;
      var slot = state.slots[p - 1];
      if (slot) {
        slot.el.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
      onPageChange(p, state.numPages);
      scheduleVisible();
    }

    function onScroll() {
      if (state.scrollTimer) clearTimeout(state.scrollTimer);
      state.scrollTimer = setTimeout(function () {
        updateCurrentFromScroll();
        scheduleVisible();
      }, 80);
    }

    function onResize() {
      if (state.resizeTimer) clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(function () {
        if (!state.doc) return;
        var anchor = state.currentPage;
        recomputeFit();
        for (var i = 0; i < state.slots.length; i++) cancelSlot(state.slots[i]);
        applySlotSizes();
        var slot = state.slots[anchor - 1];
        if (slot) viewer.scrollTop = slot.el.offsetTop;
        scheduleVisible();
      }, 150);
    }

    function destroyContent(full) {
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }
      for (var i = 0; i < state.slots.length; i++) cancelSlot(state.slots[i]);
      state.slots = [];
      state.sizes = [];
      state.doc = null;
      state.numPages = 0;
      state.intersecting = Object.create(null);
      if (pagesEl) pagesEl.innerHTML = '';
      if (full) state.destroyed = true;
    }

    viewer.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return {
      loadDocument: loadDocument,
      setZoom: setZoom,
      fitWidth: fitWidth,
      zoomBy: zoomBy,
      goToPage: goToPage,
      getZoom: function () { return state.zoom; },
      getScale: function () { return state.scale; },
      getCurrentPage: function () { return state.currentPage; },
      getNumPages: function () { return state.numPages; },
      getDoc: function () { return state.doc; },
      getSlot: function (n) { return state.slots[(n | 0) - 1] || null; },
      destroy: function () {
        viewer.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
        destroyContent(true);
      }
    };
  }

  root.PVRender = { createRenderer: createRenderer };
})(typeof globalThis !== 'undefined' ? globalThis : this);
