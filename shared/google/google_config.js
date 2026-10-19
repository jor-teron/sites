/*
 * Google sign-in config for the Hub's Google Drive drive (shared/google/google_config.js).
 *
 * tvClientId / tvClientSecret: an OAuth client of type "TVs and Limited Input devices"
 *   (Google's Device Authorization flow: the Hub shows a QR + code, you approve on your phone).
 *   This is NOT Mail's "Web application" client (apps/office/mail/mail-config.js) — make a new one
 *   in the same Google Cloud project. Empty = Google Drive shows "Set up Google Drive (see How-to)".
 *   Setup steps: Settings → How-to → "Google Drive", or apps/lab/gdrive-test/README.md.
 *
 * About the secret: Google gives device clients a "client secret", but on a public static site
 * (GitHub Pages) anyone can read this file, so it is NOT really secret. Google expects that for
 * device / installed apps. Keep the Cloud project's OAuth consent screen in "Testing" with only
 * Jor's account as a test user, so nobody else can sign in with this client.
 *
 * deviceScopes: Google allows only a short list of scopes in the device flow (checked Oct 2026:
 *   openid, email, profile, drive.appdata, drive.file, youtube, youtube.readonly). drive.file is the
 *   broadest Drive scope allowed: the Hub sees the files and folders IT created (or that were opened
 *   with it) — not the rest of your Drive.
 *
 * QR / device flow is DISABLED (qrEnabled: false, Oct 2026): it needs the client secret in this
 * public file and GitHub push protection blocks pushing it. The code stays (google_auth.connect)
 * but the UI hides the method. Keep tvClientId / tvClientSecret EMPTY — never commit a secret.
 *
 * hubWebClientId — "Phone as a key" (full Drive) and "Sign in on this computer" (popup) use Google
 * Identity Services with a WEB application client in Google Cloud project "monorepo"
 * (Authorized JavaScript origin https://jor-teron.github.io, Google Drive API enabled, consent
 * screen in Testing with Jor as test user). No secret needed. Scope fullScopes =
 * https://www.googleapis.com/auth/drive (all of Drive) + openid email. No refresh token: the
 * sign-in lasts about an hour, then "Renew from phone".
 * Mail (apps/office/mail/mail-config.js) keeps its OWN web client (project 783291801077).
 * defaultMethod: 'phone' — which method the Google Drive tile offers first.
 */
window.GOOGLE_CONFIG = {
  tvClientId: '783291801077-86he9so99le9rbauqo8cl3i20uuc5c5k.apps.googleusercontent.com',
  tvClientSecret: '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',
  deviceScopes: 'https://www.googleapis.com/auth/drive.file openid email profile'
};

// Hub web client + method switches (own block so the TV lines above stay untouched)
Object.assign(window.GOOGLE_CONFIG, {
  hubWebClientId: '1093334194754-ol4ge41bcq9ehqlg7dk2oasmg00vqu2f.apps.googleusercontent.com',
  fullScopes: 'https://www.googleapis.com/auth/drive openid email',
  qrEnabled: false,
  defaultMethod: 'phone'
});
