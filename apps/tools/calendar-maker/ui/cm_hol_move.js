/* Calendar Maker CM21 ui: move a holiday between the Holidays cards (Repeat select on each row). window.CM.HolMove.
   Kinds: 'fx' Every year {m,d,em?,ed?}, 'mv' Every year, date changes {dates:{YYYY:{start,end?}}, len}, 'dt' This year only {date,end?}.
   Keeps name and type (r / t). Dates use the year shown (Design page year). A date-changes holiday with no date for that
   year cannot move to a fixed card: a dialog asks to fill in its date first (nothing is lost).
   Callers pass the list array (own() for every-year, so built-ins become user-owned first), then save() and draw(). */
window.CM = window.CM || {};
window.CM.HolMove = (function () {
  'use strict';
  const Hd = window.CM.Holidays, p2 = (n) => String(n).padStart(2, '0');
  const KINDS = [['fx', 'Every year'], ['mv', 'Every year, date changes'], ['dt', 'This year only']];
  const sel = (k) => '<select class="rep" data-act="rep" aria-label="Repeat" title="Repeat: move to another card">' +
    KINDS.map(([v, n]) => '<option value="' + v + '"' + (v === k ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>';
  /* start / end (YYYY-MM-DD) of item of kind k in year y, or null */
  function span(k, h, y) {
    if (k === 'dt') return { start: h.date, end: h.end || '' };
    if (k === 'mv') { const v = h.dates && h.dates[y]; return v && v.start ? { start: v.start, end: v.end || '' } : null; }
    const ds = (m, d) => y + '-' + p2(m + 1) + '-' + p2(Math.min(d, Hd.dim(y, m)));
    return { start: ds(h.m, h.d), end: h.em != null ? ds(h.em, h.ed) : '' };
  }
  /* move: H holidays, from/to kinds, list = array holding item. Returns true when moved. */
  async function move(H, from, to, list, item, y) {
    if (from === to || !item) return false;
    const s = span(from, item, y);
    if (!s) {
      if (window.UiDialog) await window.UiDialog.info('Needs a date first',
        [['Why', item.name + ' has no date for ' + y + '. Pick its date (Needs a date, at the top), then change Repeat.']]);
      return false;
    }
    let it;
    if (to === 'fx') {
      it = { m: +s.start.slice(5, 7) - 1, d: +s.start.slice(8, 10) };
      if (s.end && s.end > s.start) { it.em = +s.end.slice(5, 7) - 1; it.ed = +s.end.slice(8, 10); }
    } else if (to === 'dt') { it = { date: s.start }; if (s.end && s.end > s.start) it.end = s.end; }
    else { it = { len: 1, dates: {} }; Hd.setMoving(it, y, s.start, s.end); }
    it.name = item.name; Hd.setType(it, Hd.typeOf(item));
    list.splice(list.indexOf(item), 1);
    (to === 'fx' ? H.fixed : to === 'dt' ? H.dated : H.moving).push(it);
    return true;
  }
  return { sel, move, span, KINDS };
})();
