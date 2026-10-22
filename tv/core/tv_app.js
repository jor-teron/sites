/*
 * TV: app (tv/core/tv_app.js)
 * Activating a tile (play / open category / follow link), the saved last
 * channel (localStorage) and start-up. Loaded last; starts the player.
 */
(function () {
  'use strict';
  var TV = window.TV;
  var config = TV.config;
  var state = TV.state;

  // ---------- saved channel ----------
  // TV3: move the old 'tv-v1-last' value to 'tv-last-v1' once, then drop it.
  function migrateStorage() {
    try {
      var old = localStorage.getItem(config.OLD_STORAGE_KEY);
      if (old === null) return;
      if (localStorage.getItem(config.STORAGE_KEY) === null) {
        localStorage.setItem(config.STORAGE_KEY, old);
      }
      localStorage.removeItem(config.OLD_STORAGE_KEY);
    } catch (e) {
      /* storage blocked */
    }
  }

  function readLast() {
    try {
      var raw = localStorage.getItem(config.STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      if (!TV.playlist.hasCategory(data.category)) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function saveLast(category, index, item) {
    try {
      localStorage.setItem(
        config.STORAGE_KEY,
        JSON.stringify({
          category: category,
          index: index,
          name: item && item.name ? item.name : '',
          url: item && item.url ? item.url : ''
        })
      );
    } catch (e) {
      /* ignore quota / private mode */
    }
  }

  // ---------- activate a tile ----------
  // file:// shows a folder listing for "../", so open its index.html (TV5).
  function linkHref(href) {
    if (location.protocol === 'file:' && /\/$/.test(href)) return href + 'index.html';
    return href;
  }

  function activate(index) {
    var items = state.items;
    if (index < 0 || index >= items.length) return;

    state.currentIndex = index;
    TV.ui.highlight();
    TV.ui.hideNumber();

    var item = items[index];

    if (item.type === 'category') {
      TV.playlist.load(item.categoryKey);
      TV.ui.startHideTimer();
      return;
    }

    if (item.type === 'action') {
      // TV7: e.g. the Import panel (TV.actions from tv_import.js).
      var fn = TV.actions && TV.actions[item.action];
      if (fn) fn();
      return;
    }

    if (item.type === 'link') {
      // TV5: never navigate the frame (a hub inside the hub). The tile is
      // hidden when framed; this guards a stale list too.
      if (item.href && !TV.env.framed) {
        window.location.href = linkHref(item.href);
      }
      return;
    }

    if (item.httpOnly) {
      // TV5: https page, http:// stream: the browser would block it.
      TV.ui.toast(item.name + ': http:// stream, needs an http:// or file:// page');
      TV.ui.startHideTimer();
      return;
    }

    TV.player.play(item);
    saveLast(state.currentCategory, index, item);
    TV.ui.startHideTimer();
  }

  // ---------- start ----------
  function resume(last) {
    if (last) {
      TV.playlist.load(last.category, {
        startIndex: typeof last.index === 'number' ? last.index : undefined,
        preferName: last.name,
        preferUrl: last.url
      });
    } else {
      TV.playlist.load(config.DEFAULT_CATEGORY);
    }
  }

  function start() {
    migrateStorage();
    var last = readLast();
    // TV7: tv.html#import opens the Import panel over the saved import
    // (or the usual start list when nothing is imported yet).
    if (TV['import'] && TV['import'].isDeepLink()) {
      TV['import'].openPanel();
      if (!last || last.category !== 'import') {
        TV['import'].hasSaved().then(function (yes) {
          if (yes) TV.playlist.load('import');
          else resume(last);
        });
        return;
      }
    }
    resume(last);
  }

  TV.app = {
    activate: activate,
    linkHref: linkHref,
    readLast: readLast,
    saveLast: saveLast,
    migrateStorage: migrateStorage,
    start: start
  };

  start();
})();
