/* Web Browser — www_config.js: every constant for WWW1 (tabs, address/search, bookmarks, history, open-in-tab fallback), WWW2a (Relay Server routing), WWW2b (relay sessions, clear cookies, privacy) and WWW2c (real address after redirects, Reader) and WWW2d (relay URL auto-fix, Hub-relay warning, detailed Test report), each one commented. */
(function (root) {
  'use strict';

  var WWW_CONFIG = {
    /* Display name shown in the page header and title. */
    APP_NAME: 'Web Browser',
    /* Release tag shown next to the title. */
    RELEASE: 'WWW2d',
    /* Every localStorage key this app writes starts with this prefix. */
    LS_PREFIX: 'browser_',
    /* localStorage keys (prefix + name). */
    LS_BOOKMARKS: 'browser_bookmarks',
    LS_HISTORY: 'browser_history',
    LS_SETTINGS: 'browser_settings',
    LS_TABS: 'browser_tabs',
    /* WWW2a: Relay Server settings {url, secret, enabled}. */
    LS_RELAY: 'browser_relay',
    /* WWW2b: this Hub browser's relay cookie session id (a random string, see newSessionId). */
    LS_RELAY_SESSION: 'browser_relay_session',
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
    STOPPED_TEXT: 'Tap Reload to try again.',

    /* ---- WWW2a: Relay Server (Jor's relay v0.7.0+, www module) ---- */
    /* Relay settings until the user fills them in: off. */
    DEFAULT_RELAY: { url: '', secret: '', enabled: false },
    /* Fallback relay cookie session id, only used when no per-device id is given (WWW2b makes one per Hub browser). */
    RELAY_SESSION: 'default',
    /* WWW2b: characters in a per-device session id (each from one random byte, 64-letter URL-safe alphabet: 6 bits each). */
    RELAY_SESSION_LEN: 22,
    /* WWW2b: a saved session id must look like this (URL-safe, 16-128 chars; the relay keeps at most 128). */
    RELAY_SESSION_RE: /^[A-Za-z0-9_-]{16,128}$/,
    /* WWW2b: a secret this long or longer is also searched for inside URLs before saving (shorter ones would match by chance). */
    RELAY_SECRET_MIN_SCAN: 6,
    /* WWW2b: relay cookie sessions end after this many idle minutes (relay RELAY_WWW_SESSION_TTL, 1800 s by default). */
    RELAY_SESSION_TTL_MIN: 30,
    /* WWW2b: Settings > Relay notes. */
    RELAY_LOGIN_NOTE: 'Logins through the relay are kept on the relay, for this device only. They end after about 30 minutes without use, or when the relay restarts.',
    RELAY_PRIVACY_NOTE: "Privacy: the secret is part of every relay page address, so this browser's own history (and the history of any device you use) may store it. Use the relay only on your own devices. If the secret leaks, change RELAY_TOKEN on the relay and here. This app never saves relay addresses in its history, bookmarks or tabs.",
    /* Per-tab routing modes: auto (relay only when needed), relay (always), direct (never). */
    TAB_MODES: ['auto', 'relay', 'direct'],
    /* Settings > Relay > Test gives up after this many ms. */
    RELAY_TEST_TIMEOUT_MS: 8000,
    /* A page loading through the relay gets this long before the relay timeout card (relay upstream timeout is 15 s). */
    RELAY_LOAD_TIMEOUT_MS: 25000,
    /* Card and message texts. */
    RELAY_TIMEOUT_TITLE: "The relay hasn't returned this page",
    RELAY_TIMEOUT_TEXT: 'The relay may be offline, the secret may be wrong, or the page may be slow or over 5 MB. Run Settings > Relay > Test, or open it in a new tab.',
    RELAY_NOT_SET: 'Relay not set: add the relay URL and secret in Settings > Relay to load sites like this inside the app.',
    RELAY_OFF: 'The relay is switched off in Settings > Relay.',

    /* ---- WWW2c: real address after redirects, Reader ---- */
    /* The HEAD request for X-Relay-Final-Url gives up after this many ms (then the requested address stays). */
    FINAL_URL_TIMEOUT_MS: 8000,
    /* Small harmless page used once per relay config to ask the relay whether Reader works (v0.7.0 answers 501). */
    READER_PROBE_URL: 'https://example.com/',
    /* Reader probe gives up after this many ms (unknown = button hidden). */
    READER_PROBE_TIMEOUT_MS: 8000,

    /* ---- WWW2d: relay URL auto-fix, Hub-relay warning, detailed Test report ---- */
    /* Ports of the Hub's own relays (RL1 8787, SSH relay 8022/8023): none of them has the www module. */
    HUB_RELAY_PORTS: ['8787', '8022', '8023'],
    /* Hosts that only point at this device itself. */
    LOCAL_HOSTS: ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'],
    /* Funnel publishes Relay Server under this path: a bare *.ts.net URL gets it added. */
    RELAY_PATH: '/relay',
    /* Example relay URL used in warnings. */
    RELAY_EXAMPLE: 'https://<machine>.<tailnet>.ts.net/relay',
    /* Warning shown when the URL looks like the Hub's own relay. */
    HUB_RELAY_WARN: "That looks like the Hub's own relay (RL1/SSH), which has no web module. Use your Relay Server URL, e.g. https://<machine>.<tailnet>.ts.net/relay",
    /* Note shown when the Hub is opened from a file. */
    FILE_HUB_NOTE: 'This Hub is opened from a file (file://). The relay should still work: Relay Server answers any origin for health checks and page loads.'
  };

  /* Attach to the global so script-tag loads can see it, and export for Node tests. */
  root.WWW_CONFIG = WWW_CONFIG;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WWW_CONFIG;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
