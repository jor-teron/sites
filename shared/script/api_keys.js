/*
 * Shared API keys for jor-teron.github.io/sites apps — script/api_keys.js
 *
 * THIS FILE IS PUBLIC. Anything here is readable by anyone who opens the site,
 * so only put a key here that is locked down in Google Cloud Console
 * (APIs & Services → Credentials → the key):
 *   - Application restrictions: HTTP referrers (websites)
 *       jor-teron.github.io/*
 *       localhost
 *       127.0.0.1
 *     (add localhost:* / 127.0.0.1:* if you test on a port)
 *   - API restrictions: Restrict key → only "Generative Language API"
 *   - Use a project with NO billing account (free tier only), so a leaked key
 *     cannot cost money.
 *
 * Apps load this file as OPTIONAL (it may be missing; nothing breaks). A key
 * the user saved in their browser always wins over this one.
 * Template with usage notes: script/api_keys.sample.js
 * Leave GEMINI empty ("") to use no shared key.
 */
window.SITES_KEYS = {
  GEMINI: "",
};
