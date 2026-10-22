/*
 * TV: config (tv/core/tv_config.js)
 * Edit playlists, tiles and timings here. Loaded first; creates the one
 * global namespace window.TV that every other tv/core module hangs off.
 */
(function () {
  'use strict';
  var TV = (window.TV = window.TV || {});

  TV.config = {
    // Category -> M3U path / URL. Local paths also have a generated
    // <path>.js copy (channels/m3u-to-js.py) for file://.
    PLAYLISTS: {
      home: 'channels/home.m3u',
      kids: 'channels/kids.m3u',
      more: 'channels/home-more.m3u',
      india: 'https://iptv-org.github.io/iptv/countries/in.m3u'
    },
    DEFAULT_CATEGORY: 'home',

    // Saved last channel {category, index, name, url}. TV3: renamed from
    // 'tv-v1-last' (migrated once on start, then removed).
    STORAGE_KEY: 'tv-last-v1',
    OLD_STORAGE_KEY: 'tv-v1-last',

    NUMBER_DELAY: 1500, // ms after the last digit before a number zap
    HIDE_DELAY: 5000, // ms of no input before the grid hides
    AUTOPLAY_DELAY: 200, // ms after a playlist loads before its first channel plays
    TOAST_DELAY: 3000, // ms an error toast stays on screen (TV5)

    // Tiles shown before the Home channels. type 'link' opens href (same tab).
    CATEGORY_TILES: [
      { type: 'link', name: 'Hub', href: '../', group: 'Link', logo: '../shared/image/placeholder.png' },
      { type: 'category', key: 'kids', name: 'Kids', group: 'Category', logo: '../shared/image/placeholder.png' },
      { type: 'category', key: 'more', name: 'More', group: 'Category', logo: '../shared/image/placeholder.png' },
      { type: 'category', key: 'india', name: 'India', group: 'Category', logo: '../shared/image/placeholder.png' }
    ],
    // The "Home" tile shown first in every other category.
    HOME_CATEGORY_LOGO: '../shared/image/placeholder.png',

    PLACEHOLDER_LOGO:
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="70" height="70"><rect fill="%23333" width="70" height="70"/><text x="35" y="40" fill="%23999" text-anchor="middle" font-size="18">TV</text></svg>'
  };

  // Where the page runs (TV5). framed: inside an iframe (e.g. the Hub), so
  // the Hub tile is hidden. secure: https page, so http:// streams are
  // blocked by the browser (mixed content) and marked "HTTP".
  TV.env = {
    framed: (function () {
      try { return window.top !== window; } catch (e) { return true; }
    })(),
    secure: location.protocol === 'https:'
  };

  // Shared runtime state (read / written by the other modules).
  TV.state = {
    items: [], // tiles + channels of the current list: {name, logo, group, type, url | href | categoryKey}
    currentIndex: -1, // highlighted / playing tile
    currentCategory: TV.config.DEFAULT_CATEGORY
  };
})();
