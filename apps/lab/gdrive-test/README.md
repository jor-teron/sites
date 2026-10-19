# Google Drive test (Lab)

Tries the Hub's **Google sign-in** with its **web client** (`hubWebClientId` in
`shared/google/google_config.js`) through Google's sign-in window, then a first Google Drive call.
It's the same client that **Phone as a key** uses on the phone page (`apps/tools/phonekey/`).
The same code powers the **Google Drive** drive in the Hub's Drives pane and in Files
(`shared/google/`), which opens at the **hub** folder of My Drive (made if missing).

## Setup (Jor, done)

1. Google Cloud project **monorepo** → OAuth client of type **Web application**.
2. **Authorized JavaScript origins**: `https://jor-teron.github.io`.
3. **Google Drive API** enabled in that project.
4. Consent screen (Audience) in **Testing**, with your Google account as a test user.
5. Its **Client ID** goes in `hubWebClientId` in `shared/google/google_config.js`. There is no secret.
   Mail keeps its own client in `apps/office/mail/mail-config.js`.

Then open **Lab → Google Drive test** and press **Sign in**. Tick the Drive box if Google asks.
The page lists your first 10 Drive files, and **Find "hub" folder** lists the folder Files opens at.

## QR sign-in is off

The QR / device-flow method needs a "TVs and Limited Input devices" client *and its client
secret* in the public config file. GitHub push protection blocks pushing that secret, so the
method is switched off (`qrEnabled: false`) and hidden in the UI. Its code is still in
`google_auth.js`. Keep `tvClientId` and `tvClientSecret` empty.

## Limits

- Full Drive access (`…/auth/drive`) is a restricted scope. That's fine while the app stays in
  Testing with you as the test user.
- No refresh token: a sign-in lasts about an hour. Then the Hub tile says **Renew from phone**.
- The token is kept in this browser's localStorage (`sites-hub.google`). Sign out (it revokes the
  token) on a shared computer.
- A yellow **CORS / NETWORK ERROR** line in the log means the browser blocked a direct call.
  **Test CORS** checks this without signing in.
