/* Video Editor — ve_range.js: timeline with in/out handles, playhead, cuts. VD1 */
(function (root) {
  'use strict';

  var H = root.VEHelpers;
  var E = root.VEEdits;

  /**
   * @param {object} opts
   * @param {HTMLElement} opts.track
   * @param {HTMLElement} opts.fill
   * @param {HTMLElement} opts.removedLayer
   * @param {HTMLElement} opts.handleStart
   * @param {HTMLElement} opts.handleEnd
   * @param {HTMLElement} opts.playhead
   * @param {HTMLElement} opts.startChip
   * @param {HTMLElement} opts.endChip
   * @param {HTMLElement} opts.durEl
   * @param {(start:number,end:number,which:string) => void} [opts.onChange]
   * @param {(t:number) => void} [opts.onSeek]
   */
  function createRange(opts) {
    var track = opts.track;
    var fill = opts.fill;
    var removedLayer = opts.removedLayer;
    var hStart = opts.handleStart;
    var hEnd = opts.handleEnd;
    var playhead = opts.playhead;
    var startChip = opts.startChip;
    var endChip = opts.endChip;
    var durEl = opts.durEl;
    var onChange = opts.onChange || function () {};
    var onSeek = opts.onSeek || function () {};

    var duration = 0;
    var start = 0;
    var end = 0;
    var current = 0;
    var segments = [];
    var dragging = null; // 'start' | 'end' | 'playhead'
    var editing = null;

    function setDuration(d) {
      duration = Math.max(0, Number(d) || 0);
      var c = H.clampRange(start, end, duration, H.MIN_GAP, 'both');
      start = c.start;
      end = c.end;
      current = Math.max(0, Math.min(duration, current));
      paint();
    }

    function getRange() {
      return { start: start, end: end, duration: duration, current: current };
    }

    function setRange(s, e, which) {
      var c = H.clampRange(s, e, duration, H.MIN_GAP, which || 'both');
      start = c.start;
      end = c.end;
      paint();
      onChange(start, end, which || 'both');
    }

    function setCurrent(t, silent) {
      var v = Number(t);
      if (!isFinite(v)) v = 0;
      current = Math.max(0, Math.min(duration, v));
      paintPlayhead();
      if (!silent) { /* painted */ }
    }

    function setSegments(segs) {
      segments = segs || [];
      paintRemoved();
    }

    function paintRemoved() {
      if (!removedLayer) return;
      removedLayer.innerHTML = '';
      if (duration <= 0) return;
      var gone = E.removedRanges(segments, duration);
      for (var i = 0; i < gone.length; i++) {
        var g = gone[i];
        var el = document.createElement('div');
        el.className = 'range-removed';
        var r0 = H.timeToRatio(g.start, duration) * 100;
        var r1 = H.timeToRatio(g.end, duration) * 100;
        el.style.left = r0 + '%';
        el.style.width = Math.max(0, r1 - r0) + '%';
        el.title = 'Removed ' + H.formatTime(g.start) + '–' + H.formatTime(g.end);
        removedLayer.appendChild(el);
      }
    }

    function paintPlayhead() {
      if (!playhead) return;
      var r = H.timeToRatio(current, duration) * 100;
      playhead.style.left = r + '%';
      playhead.setAttribute('aria-valuemin', '0');
      playhead.setAttribute('aria-valuemax', String(duration));
      playhead.setAttribute('aria-valuenow', String(current.toFixed(2)));
      playhead.setAttribute('aria-valuetext', H.formatTime(current));
    }

    function paint() {
      var r0 = H.timeToRatio(start, duration) * 100;
      var r1 = H.timeToRatio(end, duration) * 100;
      fill.style.left = r0 + '%';
      fill.style.width = Math.max(0, r1 - r0) + '%';
      hStart.style.left = r0 + '%';
      hEnd.style.left = r1 + '%';

      hStart.setAttribute('aria-valuemin', '0');
      hStart.setAttribute('aria-valuemax', String(duration));
      hStart.setAttribute('aria-valuenow', String(start.toFixed(1)));
      hStart.setAttribute('aria-valuetext', H.formatTime(start));
      hEnd.setAttribute('aria-valuemin', '0');
      hEnd.setAttribute('aria-valuemax', String(duration));
      hEnd.setAttribute('aria-valuenow', String(end.toFixed(1)));
      hEnd.setAttribute('aria-valuetext', H.formatTime(end));

      if (editing !== 'start') startChip.textContent = H.formatTime(start);
      if (editing !== 'end') endChip.textContent = H.formatTime(end);
      if (durEl) durEl.textContent = H.formatTime(Math.max(0, end - start));
      paintPlayhead();
      paintRemoved();
    }

    function timeFromEvent(ev) {
      var rect = track.getBoundingClientRect();
      var x = (ev.clientX != null ? ev.clientX : 0) - rect.left;
      return H.pixelToTime(x, rect.width, duration);
    }

    function onPointerDown(ev) {
      if (duration <= 0) return;
      if (ev.button != null && ev.button !== 0) return;
      var which;
      if (ev.target === hStart || (ev.target.closest && ev.target.closest('#handleStart'))) {
        which = 'start';
      } else if (ev.target === hEnd || (ev.target.closest && ev.target.closest('#handleEnd'))) {
        which = 'end';
      } else {
        which = 'playhead';
      }
      dragging = which;
      if (track.setPointerCapture) track.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      if (which === 'start') hStart.focus();
      else if (which === 'end') hEnd.focus();
      else if (playhead) playhead.focus();
      moveTo(ev, which);
    }

    function moveTo(ev, which) {
      var t = timeFromEvent(ev);
      if (which === 'start') {
        setRange(t, end, 'start');
        onSeek(start);
      } else if (which === 'end') {
        setRange(start, t, 'end');
        onSeek(end);
      } else {
        setCurrent(t, true);
        onSeek(current);
      }
    }

    function onPointerMove(ev) {
      if (!dragging) return;
      moveTo(ev, dragging);
    }

    function onPointerUp(ev) {
      if (!dragging) return;
      dragging = null;
      try { track.releasePointerCapture && track.releasePointerCapture(ev.pointerId); } catch (_) { /* ok */ }
    }

    function nudge(which, delta) {
      if (which === 'start') setRange(start + delta, end, 'start');
      else if (which === 'end') setRange(start, end + delta, 'end');
      onSeek(which === 'start' ? start : end);
    }

    function onKey(which, ev) {
      var step = ev.shiftKey ? 1 : 0.1;
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') {
        ev.preventDefault();
        nudge(which, -step);
      } else if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        nudge(which, step);
      } else if (ev.key === 'Home') {
        ev.preventDefault();
        if (which === 'start') setRange(0, end, 'start');
        else setRange(start, start + H.MIN_GAP, 'end');
        onSeek(which === 'start' ? start : end);
      } else if (ev.key === 'End') {
        ev.preventDefault();
        if (which === 'end') setRange(start, duration, 'end');
        else setRange(end - H.MIN_GAP, end, 'start');
        onSeek(which === 'start' ? start : end);
      }
    }

    function beginEdit(which) {
      var chip = which === 'start' ? startChip : endChip;
      if (editing) return;
      editing = which;
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'time-edit';
      input.value = H.formatTime(which === 'start' ? start : end);
      input.setAttribute('aria-label', which === 'start' ? 'Edit in time' : 'Edit out time');
      chip.textContent = '';
      chip.appendChild(input);
      input.focus();
      input.select();

      function commit() {
        if (editing !== which) return;
        editing = null;
        var parsed = H.parseTime(input.value);
        if (isFinite(parsed)) {
          if (which === 'start') setRange(parsed, end, 'start');
          else setRange(start, parsed, 'end');
          onSeek(which === 'start' ? start : end);
        } else {
          paint();
        }
      }
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          editing = null;
          paint();
        }
      });
      input.addEventListener('blur', commit);
    }

    track.addEventListener('pointerdown', onPointerDown);
    track.addEventListener('pointermove', onPointerMove);
    track.addEventListener('pointerup', onPointerUp);
    track.addEventListener('pointercancel', onPointerUp);
    hStart.addEventListener('keydown', function (ev) { onKey('start', ev); });
    hEnd.addEventListener('keydown', function (ev) { onKey('end', ev); });
    startChip.addEventListener('click', function () { beginEdit('start'); });
    endChip.addEventListener('click', function () { beginEdit('end'); });

    paint();
    return {
      setDuration: setDuration,
      setRange: setRange,
      getRange: getRange,
      setCurrent: setCurrent,
      setSegments: setSegments,
      paint: paint
    };
  }

  root.VERange = { create: createRange };
})(typeof window !== 'undefined' ? window : globalThis);
