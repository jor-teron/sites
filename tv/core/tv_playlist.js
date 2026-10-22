/*
 * TV: playlists (tv/core/tv_playlist.js)
 * M3U parsing, loading (fetch, or generated .m3u.js on file://) and the
 * stale-load guard. TV.playlist.load(category, options) swaps the list.
 */
(function () {
  'use strict';
  var TV = window.TV;
  var config = TV.config;
  var state = TV.state;

  var loadToken = 0; // bumps on every load(); stale responses are ignored (TV1)
  var m3uScriptLoads = {}; // key -> Promise<string>, so each .m3u.js is injected once (TV2)
  var sources = {}; // category -> function () -> Promise<text>, for lists not in PLAYLISTS (TV7: import)

  // ---------- parse ----------
  // The name follows the first comma OUTSIDE quotes, so quoted attributes
  // with commas (e.g. group-title="News, India") don't end up in the name.
  function extinfName(line) {
    var body = line.slice('#EXTINF:'.length);
    var quote = '';
    for (var i = 0; i < body.length; i++) {
      var c = body[i];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === ',') {
        return body.slice(i + 1).trim();
      }
    }
    return '';
  }

  function attr(line, name) {
    var m =
      line.match(new RegExp(name + '="([^"]*)"', 'i')) ||
      line.match(new RegExp(name + "='([^']*)'", 'i'));
    return m ? m[1] : null;
  }

  function parseM3U(text) {
    var lines = text.split('\n').map(function (l) {
      return l.trim();
    }).filter(Boolean);
    var result = [];
    var current = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.startsWith('#EXTINF:')) {
        var tvgName = attr(line, 'tvg-name');
        var group = attr(line, 'group-title');
        current = {
          name: extinfName(line) || (tvgName && tvgName.trim()) || 'Unknown',
          logo: attr(line, 'tvg-logo') || '',
          group: group !== null ? group : 'Live',
          url: '',
          type: 'channel'
        };
      } else if (line && !line.startsWith('#') && current) {
        current.url = line;
        result.push(current);
        current = null;
      }
    }
    return result;
  }

  // ---------- text: fetch, or .m3u.js on file:// ----------
  // Browsers block fetch() on file://, so local playlists also exist as
  // generated channels/<name>.m3u.js (window.TV_M3U['<name>'] = "...").
  function isLocalPlaylist(url) {
    return !/^[a-z][a-z0-9+.-]*:/i.test(url); // relative path, no scheme
  }

  // TV5: on an https page the browser blocks http:// streams (mixed content).
  function isHttpOnly(url) {
    return !!TV.env.secure && /^http:\/\//i.test(url || '');
  }

  function isPlayable(item) {
    return !!item && item.type === 'channel' && !item.httpOnly;
  }

  function categoryName(category) {
    if (category === 'home') return 'Home';
    var t = config.CATEGORY_TILES.filter(function (x) { return x.key === category; })[0];
    return t ? t.name : category;
  }

  // TV7: a category whose text comes from code (tv_import.js), not a URL.
  function registerSource(category, fn) {
    sources[category] = fn;
  }

  function hasCategory(category) {
    return !!(config.PLAYLISTS[category] || sources[category]);
  }

  function m3uKey(url) {
    return url.split('/').pop().replace(/\.m3u8?$/i, '');
  }

  function loadM3uScript(url) {
    var key = m3uKey(url);
    if (window.TV_M3U && typeof window.TV_M3U[key] === 'string') {
      return Promise.resolve(window.TV_M3U[key]);
    }
    if (!m3uScriptLoads[key]) {
      m3uScriptLoads[key] = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = url + '.js';
        script.onload = function () {
          var text = window.TV_M3U && window.TV_M3U[key];
          if (typeof text === 'string') resolve(text);
          else reject(new Error('No TV_M3U["' + key + '"] in ' + script.src));
        };
        script.onerror = function () {
          reject(new Error('Could not load ' + script.src));
        };
        document.head.appendChild(script);
      }).catch(function (err) {
        delete m3uScriptLoads[key]; // allow a retry later
        throw err;
      });
    }
    return m3uScriptLoads[key];
  }

  function getPlaylistText(url) {
    var local = isLocalPlaylist(url);
    if (local && location.protocol === 'file:') {
      return loadM3uScript(url); // skip fetch: it always fails (and logs) on file://
    }
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .catch(function (err) {
        if (!local) throw err; // online lists (India) stay online-only
        console.warn('fetch failed for ' + url + ', trying ' + url + '.js', err);
        return loadM3uScript(url);
      });
  }

  // ---------- tiles before the channels ----------
  // Tiles before the channels of a list: the CATEGORY_TILES whose screen
  // is this category (TV6), then, outside Home, the "Home" tile back.
  function categoryTilesFor(category) {
    var tiles = config.CATEGORY_TILES.filter(function (t) {
      if ((t.screen || 'home') !== category) return false;
      // TV5: inside a frame (the Hub) the Hub link would open a hub inside the hub.
      return !(t.type === 'link' && TV.env.framed);
    }).map(function (t) {
      if (t.type === 'link') {
        return { name: t.name, logo: t.logo || '', group: t.group || 'Link', type: 'link', href: t.href };
      }
      if (t.type === 'action') {
        return { name: t.name, logo: t.logo || '', group: t.group || 'Action', type: 'action', action: t.action };
      }
      return { name: t.name, logo: t.logo || '', group: t.group || 'Category', type: 'category', categoryKey: t.key };
    });
    var hasHome = tiles.some(function (t) { return t.categoryKey === 'home'; });
    if (category !== 'home' && !hasHome) {
      tiles.push({ name: 'Home', logo: config.HOME_CATEGORY_LOGO, group: 'Category', type: 'category', categoryKey: 'home' });
    }
    return tiles;
  }

  // ---------- load a category ----------
  // options: {startIndex, preferName, preferUrl} (resume a saved channel).
  // The category changes only after its list loads; a newer load() makes
  // this one stale. Only real stream channels are auto-played (TV1).
  function load(category, options) {
    options = options || {};
    var url = config.PLAYLISTS[category];
    var source = sources[category];
    if (!url && !source) {
      console.error('Unknown category: ' + category);
      return;
    }

    var token = ++loadToken;

    (source ? source() : getPlaylistText(url))
      .then(function (text) {
        if (token !== loadToken) return; // stale
        var channels = parseM3U(text);
        channels.forEach(function (ch) {
          if (isHttpOnly(ch.url)) ch.httpOnly = true;
        });
        state.currentCategory = category;
        state.items = categoryTilesFor(category).concat(channels);
        var items = state.items;
        TV.ui.buildList();

        // Auto-play only channels this page can play (TV5: not http:// on https).
        var startIndex = items.findIndex(isPlayable);

        if (options.preferName || options.preferUrl) {
          var found = items.findIndex(function (it) {
            if (!isPlayable(it)) return false;
            if (options.preferUrl && it.url === options.preferUrl) return true;
            if (options.preferName && it.name === options.preferName) return true;
            return false;
          });
          if (found >= 0) startIndex = found;
        } else if (typeof options.startIndex === 'number' &&
                   options.startIndex >= 0 &&
                   options.startIndex < items.length &&
                   isPlayable(items[options.startIndex])) {
          startIndex = options.startIndex;
        }

        if (isPlayable(items[startIndex])) {
          setTimeout(function () {
            if (token !== loadToken) return; // a newer load started
            TV.app.activate(startIndex);
          }, config.AUTOPLAY_DELAY);
        } else {
          // No stream channels: just highlight the first tile, never
          // auto-open a link (Hub) or category tile.
          state.currentIndex = 0;
          TV.ui.highlight();
          if (channels.length) {
            console.warn('Only http:// channels in playlist: ' + category);
            TV.ui.toast(categoryName(category) + ': only http:// channels, they need an http:// or file:// page');
          } else {
            console.error('No channels in playlist: ' + category);
            TV.ui.toast('No channels in ' + categoryName(category));
          }
        }
      })
      .catch(function (err) {
        if (token !== loadToken) return; // stale
        console.error(err);
        console.error('Failed to load playlist: ' + category + ' (keeping ' + state.currentCategory + ')');
        TV.ui.toast(err && err.toast ? err.toast :
          !url || isLocalPlaylist(url) ?
          'Could not load ' + categoryName(category) :
          categoryName(category) + ' needs internet');
        // Nothing loaded yet (e.g. saved category is offline): fall back to the default list.
        if (!state.items.length && category !== config.DEFAULT_CATEGORY) {
          load(config.DEFAULT_CATEGORY);
        }
      });
  }

  TV.playlist = {
    parseM3U: parseM3U,
    extinfName: extinfName,
    isLocalPlaylist: isLocalPlaylist,
    isHttpOnly: isHttpOnly,
    isPlayable: isPlayable,
    categoryName: categoryName,
    m3uKey: m3uKey,
    getPlaylistText: getPlaylistText,
    categoryTilesFor: categoryTilesFor,
    registerSource: registerSource,
    hasCategory: hasCategory,
    load: load
  };
})();
