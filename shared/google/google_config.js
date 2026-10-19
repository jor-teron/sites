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
 */
window.GOOGLE_CONFIG = {
  tvClientId: '',
  tvClientSecret: '',
  deviceScopes: 'https://www.googleapis.com/auth/drive.file openid email profile'
};
