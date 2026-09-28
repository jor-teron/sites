/*
 * Sample for script/api_keys.js — copy the structure, paste your key.
 *
 * Usage:
 *   1. In Google Cloud Console create an API key (APIs & Services → Credentials)
 *      in a project with NO billing account.
 *   2. Restrict it:
 *        Application restrictions → HTTP referrers:
 *          jor-teron.github.io/*
 *          localhost
 *          127.0.0.1
 *        API restrictions → only "Generative Language API".
 *   3. Put the key into script/api_keys.js as GEMINI below (the file is public
 *      on GitHub Pages — that is why the restrictions above matter).
 *
 * Apps load ../../script/api_keys.js as an optional script and use
 * window.SITES_KEYS.GEMINI only when it is a non-empty string that is not the
 * placeholder "PASTE_YOUR_KEY_HERE". A key saved in the browser (the app's Key
 * button) always wins; clearing it falls back to this shared key.
 */
window.SITES_KEYS = {
  GEMINI: "PASTE_YOUR_KEY_HERE",
};
