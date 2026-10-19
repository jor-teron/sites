# Google Drive test (Lab)

Tries the Hub's **Google sign-in by QR** (OAuth 2.0 *device flow*, client type
"TVs and Limited Input devices") and a first Google Drive call, straight from the browser.
The same code powers the **Google Drive** drive in the Hub's Drives pane and in Files
(`shared/google/`).

## One-time setup (Jor)

1. Open <https://console.cloud.google.com/> and pick the **same project as Mail**
   (the one with Mail's web client `783291801077-…`).
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **OAuth consent screen** (Google Auth Platform → Audience): keep **Publishing status = Testing**
   and make sure **your own Google account is the only test user**.
   (Data access / scopes: you may add `…/auth/drive.file`, `openid`, `email`, `profile`; in
   Testing mode it also works without listing them.)
4. **Credentials → Create credentials → OAuth client ID** (or Google Auth Platform → **Clients →
   Create client**) → Application type **TVs and Limited Input devices** → name it e.g. `Hub TV` →
   **Create**.
5. Copy the **Client ID** and **Client secret** into `shared/google/google_config.js`:
   ```js
   tvClientId: '…….apps.googleusercontent.com',
   tvClientSecret: 'GOCSPX-……',
   ```
   This is a new client — do **not** reuse Mail's web client (Google rejects it for the device flow:
   `invalid_client`). The "secret" is not really secret on a public site; that's normal for
   device apps. Testing mode + you as the only test user keeps everyone else out.
6. Push, open **Lab → Google Drive test**, press **Start**, scan the QR with your phone, type the
   code if asked, approve. The page lists your first 10 Drive files.

## What to tell us after a try

The log shows every request. A yellow **CORS / NETWORK ERROR** line means the browser blocked a
direct call from GitHub Pages. (Checked from a server on 19 Oct 2026: `oauth2.googleapis.com`
and `www.googleapis.com/drive/v3` answer CORS pre-flights for `https://jor-teron.github.io`, so it
should work.) **Test CORS** checks this even before setup.

## Limits

- Google allows only these scopes in the device flow: `openid`, `email`, `profile`,
  `drive.appdata`, `drive.file`, `youtube`, `youtube.readonly`. So the Hub uses **`drive.file`**:
  it sees only files and folders **it created** (or uploaded) — not the rest of your Drive.
- The refresh token is kept in this browser's localStorage (`sites-hub.google`); any page of this
  site could read it. Sign out (it revokes the token) on a shared computer.
- In Testing mode Google may ask you to sign in again after about 7 days.
