/* Web Browser — www_config.js: every constant for WWW1 (tabs, address/search, bookmarks, history, open-in-tab fallback), each one commented. */
(function (root) {
  'use strict';

  var WWW_CONFIG = {
    /* Display name shown in the page header and title. */
    APP_NAME: 'Web Browser',
    /* Release tag shown next to the title. */
    RELEASE: 'WWW1',
    /* Every localStorage key this app writes starts with this prefix. */
    LS_PREFIX: 'browser_',
    /* localStorage keys (prefix + name). */
    LS_BOOKMARKS: 'browser_bookmarks',
    LS_HISTORY: 'browser_history',
    LS_SETTINGS: 'browser_settings',
    LS_TABS: 'browser_tabs',
    /* Shared Hub theme key — read only, never written by this app. */
    HUB_THEME_KEY: 'sites-hub.theme',
    /* Pseudo URL for the speed-dial home page (never loaded in a frame). */
    HOME_URL: 'hub:home',
    /* Most history entries kept; the oldest are dropped first. */
    HISTORY_MAX: 500,
    /* Most open tabs; Ctrl+T / + past this shows a toast instead. */
    TABS_MAX: 12,
    /* Most back/forward entries kept per tab. */
    TAB_HISTORY_MAX: 50,
    /* If the frame has not fired "load" after this many ms, show the "may not allow embedding" card. */
    LOAD_TIMEOUT_MS: 15000,
    /* Search engines. url gets the encoded query appended. frames = its results page allows embedding (checked Nov 2026). */
    ENGINES: {
      duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', frames: false },
      bing: { label: 'Bing', url: 'https://www.bing.com/search?q=', frames: true },
      google: { label: 'Google', url: 'https://www.google.com/search?q=', frames: false },
      brave: { label: 'Brave Search', url: 'https://search.brave.com/search?q=', frames: false },
      wikipedia: { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search=', frames: true }
    },
    /* Engine used until the user picks another in Settings. */
    DEFAULT_ENGINE: 'duckduckgo',
    /* Default settings, merged under whatever is saved. */
    DEFAULT_SETTINGS: {
      engine: 'duckduckgo',
      bookmarksBar: true,
      autoOpenBlocked: false
    },
    /*
     * Hosts known to refuse framing (X-Frame-Options or CSP frame-ancestors, checked Nov 2026).
     * A host matches itself and every subdomain. These skip the frame and show the card at once.
     */
    BLOCKED_HOSTS: [
      'google.com', 'youtube.com', 'youtu.be', 'github.com', 'x.com', 'twitter.com',
      'facebook.com', 'instagram.com', 'linkedin.com', 'reddit.com', 'stackoverflow.com',
      'developer.mozilla.org', 'bbc.com', 'bbc.co.uk', 'openstreetmap.org', 'duckduckgo.com',
      'startpage.com', 'search.brave.com', 'whatsapp.com', 'netflix.com', 'chatgpt.com', 'microsoft.com', 'live.com'
    ],
    /* Bookmarks added the first time the app opens (only if none were ever saved). All of these allow embedding. */
    SEED_BOOKMARKS: [
      { url: 'https://en.m.wikipedia.org/', title: 'Wikipedia' },
      { url: 'https://news.ycombinator.com/', title: 'Hacker News' },
      { url: 'https://archive.org/', title: 'Internet Archive' },
      { url: 'https://www.bing.com/', title: 'Bing' }
    ],
    /* Schemes typed into the address bar that load as-is. javascript: is never loaded. */
    SCHEMES: ['http:', 'https:', 'file:', 'about:', 'data:'],
    /* Sandbox for each tab's frame: scripts, forms, popups and downloads; same-origin so sites can keep their own cookies. */
    FRAME_SANDBOX: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals',
    /* Text shown on the "can't embed" card. */
    BLOCKED_TITLE: "This site doesn't allow embedding",
    BLOCKED_TEXT: 'Many big sites refuse to load inside another page. Open it in a new browser tab instead.',
    TIMEOUT_TITLE: 'This site may not allow embedding',
    TIMEOUT_TEXT: 'The page has not loaded yet. It may be slow or it may refuse to load inside another page.',
    MIXED_TITLE: "This http page can't load here",
    MIXED_TEXT: 'This app runs on a secure (https) page so plain http pages are blocked inside it.',
    STOPPED_TITLE: 'Loading stopped',
    STOPPED_TEXT: 'Tap Reload to try again.'
  };

  /* Attach to the global so script-tag loads can see it, and export for Node tests. */
  root.WWW_CONFIG = WWW_CONFIG;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WWW_CONFIG;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
