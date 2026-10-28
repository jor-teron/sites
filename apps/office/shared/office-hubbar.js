/*
 * apps/office/shared/office-hubbar.js  (HO1)
 * App side of the Hub title-bar contract (Hub side: H49, Hub Main Bot 2). Only active in a frame.
 *   HubTitleBar.set({buttons:[{id,label,icon,enabled,title}], tabs:[{id,label}], activeTab})
 *   HubTitleBar.update({buttons:[{id,enabled,label?}], activeTab})   partial patch by id
 *   HubTitleBar.clear()
 *   HubTitleBar.onClick(fn(kind, id))        kind 'button' | 'tab'
 *   HubTitleBar.onHello(fn())                 Hub said hello: reply with set()
 *   HubTitleBar.linked                        true after the first hubTitleBarHello
 * Messages (window.parent.postMessage(msg, location.origin); '*' on file:// where origin is 'null'):
 *   app -> hub {hubTitleBar:{v:1, op:'set'|'update'|'clear', ...}}
 *   hub -> app {hubTitleBarHello:{v:1}} · {hubTitleBarClick:{v:1, kind, id}}
 * Accepts messages only when event.source === window.parent and event.origin === location.origin.
 * Limits: at most 8 buttons and 10 tabs, text labels only (icon is a short text glyph).
 */
var HubTitleBar = (function () {
  var V = 1, MAX_B = 8, MAX_T = 10, clickFns = [], helloFns = [];
  var IN_FRAME = (function () { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();
  var api = { V: V, linked: false, inFrame: IN_FRAME };
  function str(v, n) { return String(v == null ? "" : v).slice(0, n); }
  function post(body) {
    if (!IN_FRAME) return;
    body.v = V;
    var target = (location.origin && location.origin !== "null") ? location.origin : "*";
    try { window.parent.postMessage({ hubTitleBar: body }, target); } catch (e) { /* parent gone */ }
  }
  function cleanButtons(list, full) {
    return (Array.isArray(list) ? list : []).filter(function (b) { return b && b.id != null; }).slice(0, MAX_B).map(function (b) {
      var o = { id: str(b.id, 32) };
      if (full || b.label != null) o.label = str(b.label != null ? b.label : b.id, 24);
      if (full || b.icon != null) o.icon = str(b.icon, 4);
      if (full || b.enabled != null) o.enabled = b.enabled !== false;
      if (full || b.title != null) o.title = str(b.title, 60);
      return o;
    });
  }
  function cleanTabs(list) {
    return (Array.isArray(list) ? list : []).filter(function (t) { return t && t.id != null; }).slice(0, MAX_T).map(function (t) {
      return { id: str(t.id, 32), label: str(t.label != null ? t.label : t.id, 20) };
    });
  }
  api.set = function (o) {
    o = o || {};
    var m = { op: "set", buttons: cleanButtons(o.buttons, true), tabs: cleanTabs(o.tabs) };
    if (o.activeTab != null) m.activeTab = str(o.activeTab, 32);
    post(m);
  };
  api.update = function (o) {
    o = o || {};
    var m = { op: "update" };
    if (o.buttons) m.buttons = cleanButtons(o.buttons, false);
    if (o.activeTab != null) m.activeTab = str(o.activeTab, 32);
    post(m);
  };
  api.clear = function () { post({ op: "clear" }); };
  api.onClick = function (fn) { if (typeof fn === "function") clickFns.push(fn); };
  api.onHello = function (fn) { if (typeof fn === "function") { helloFns.push(fn); if (api.linked) fn(); } };
  if (IN_FRAME) {
    window.addEventListener("message", function (e) {
      if (e.source !== window.parent || e.origin !== location.origin) return;
      var d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.hubTitleBarHello && d.hubTitleBarHello.v === V) {
        api.linked = true;
        if (document.body) document.body.classList.add("hub-titlebar");
        helloFns.forEach(function (fn) { try { fn(); } catch (err) { console.warn("HubTitleBar hello", err); } });
      } else if (d.hubTitleBarClick && d.hubTitleBarClick.v === V && api.linked) {
        var c = d.hubTitleBarClick, kind = c.kind === "tab" ? "tab" : c.kind === "button" ? "button" : "";
        if (!kind || typeof c.id !== "string") return;
        clickFns.forEach(function (fn) { try { fn(kind, c.id); } catch (err) { console.warn("HubTitleBar click", err); } });
      }
    });
  }
  return api;
})();
