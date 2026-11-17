/*
 * H162: Hub title-bar item helpers (pure). Used by desktop/gamebar/hub-gamebar.js
 * and hub/tests/h162_titlebar_text.test.cjs.
 *
 * Extends the H49 hubTitleBar contract with kind:'text': a non-clickable status
 * label at normal contrast (not a faded disabled button). Truncates with a hard
 * cap (then CSS ellipsis if the bar is tight). Updatable by id.
 *
 *   {hubTitleBar:{v:1, op:'set', buttons:[
 *     {id:'count', kind:'text', label:'42 words', title:'42 words · 120 characters'},
 *     {id:'open', label:'Open'}
 *   ]}}
 *   {hubTitleBar:{v:1, op:'update', buttons:[{id:'count', label:'43 words'}]}}
 *
 * Existing button items are unchanged (no kind, or kind other than 'text', stays
 * a button). kind is fixed after set; an update cannot turn a button into text
 * or the other way around. Apps send this with HubTitleBar.set / .update; the
 * office-hubbar helper must pass kind through (Apps owner).
 *
 * API: window.HubTitleBarItems (also module.exports in Node).
 */
(function (global) {
  'use strict';

  var ID_MAX = 32;
  var LABEL_MAX = 24;       /* H49 buttons */
  var TEXT_LABEL_MAX = 48;  /* H162 text items */
  var ICON_MAX = 4;
  var TITLE_MAX = 60;
  var TAB_LABEL_MAX = 20;
  var TB_MAX_BUTTONS = 8;
  var TB_MAX_TABS = 10;

  function str(v, max) {
    return String(v == null ? '' : v).slice(0, max);
  }

  function isText(src) {
    return !!(src && src.kind === 'text');
  }

  function kindOf(src) {
    return isText(src) ? 'text' : 'button';
  }

  function normalizeText(src, full) {
    var o = { id: str(src.id, ID_MAX), kind: 'text' };
    if (full || src.label != null) o.label = str(src.label != null ? src.label : src.id, TEXT_LABEL_MAX);
    if (full || src.title != null) {
      o.title = str(src.title != null ? src.title : (o.label != null ? o.label : src.label), TITLE_MAX);
    }
    return o;
  }

  function normalizeButton(src, full) {
    var o = { id: str(src.id, ID_MAX), kind: 'button' };
    if (full || src.label != null) o.label = str(src.label != null ? src.label : src.id, LABEL_MAX);
    if (full || src.icon != null) o.icon = str(src.icon, ICON_MAX);
    if (full || src.enabled != null) o.enabled = src.enabled !== false;
    if (full || src.title != null) o.title = str(src.title, TITLE_MAX);
    if (full || src.showLabel != null) o.showLabel = src.showLabel === true; /* H110 */
    return o;
  }

  function normalizeItem(src, full) {
    if (!src || src.id == null) return null;
    return isText(src) ? normalizeText(src, full) : normalizeButton(src, full);
  }

  function normalizeSet(m) {
    m = m || {};
    var buttons = (Array.isArray(m.buttons) ? m.buttons : [])
      .filter(function (b) { return b && b.id != null; })
      .slice(0, TB_MAX_BUTTONS)
      .map(function (b) { return normalizeItem(b, true); });
    var tabs = (Array.isArray(m.tabs) ? m.tabs : [])
      .filter(function (t) { return t && t.id != null; })
      .slice(0, TB_MAX_TABS)
      .map(function (t) {
        return { id: str(t.id, ID_MAX), label: str(t.label != null ? t.label : t.id, TAB_LABEL_MAX) };
      });
    return {
      buttons: buttons,
      tabs: tabs,
      align: m.align === 'left' ? 'left' : 'right',
      activeTab: m.activeTab != null ? str(m.activeTab, ID_MAX) : (tabs[0] ? tabs[0].id : '')
    };
  }

  function applyUpdate(tb, m) {
    if (!tb || !m) return [];
    var changed = [];
    (Array.isArray(m.buttons) ? m.buttons : []).slice(0, TB_MAX_BUTTONS).forEach(function (p) {
      if (!p || p.id == null) return;
      var cur = tb.buttons.find(function (x) { return x.id === str(p.id, ID_MAX); });
      if (!cur) return;
      var patch = cur.kind === 'text' ? normalizeText(p, false) : normalizeButton(p, false);
      Object.assign(cur, patch);
      changed.push(cur);
    });
    if (m.activeTab != null) tb.activeTab = str(m.activeTab, ID_MAX);
    return changed;
  }

  function isClickable(item) {
    return !!(item && item.kind !== 'text' && item.enabled !== false);
  }

  var api = {
    ID_MAX: ID_MAX,
    LABEL_MAX: LABEL_MAX,
    TEXT_LABEL_MAX: TEXT_LABEL_MAX,
    ICON_MAX: ICON_MAX,
    TITLE_MAX: TITLE_MAX,
    TAB_LABEL_MAX: TAB_LABEL_MAX,
    TB_MAX_BUTTONS: TB_MAX_BUTTONS,
    TB_MAX_TABS: TB_MAX_TABS,
    str: str,
    isText: isText,
    kindOf: kindOf,
    normalizeItem: normalizeItem,
    normalizeSet: normalizeSet,
    applyUpdate: applyUpdate,
    isClickable: isClickable
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.HubTitleBarItems = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
