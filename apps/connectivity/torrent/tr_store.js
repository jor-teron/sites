/* Torrent — tr_store.js: persist torrent list + settings in localStorage. TR3+TR5 */
(function (root) {
  'use strict';

  var H = root.TRHelpers;
  var KEY = 'torrent.tr.state.v1';

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return H.restoreState(null);
      return H.restoreState(JSON.parse(raw));
    } catch (e) {
      return H.restoreState(null);
    }
  }

  function save(torrents, settings) {
    try {
      var payload = H.serializeState(torrents, settings);
      localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      return false;
    }
  }

  root.TRStore = { KEY: KEY, load: load, save: save };
})(typeof globalThis !== 'undefined' ? globalThis : this);
