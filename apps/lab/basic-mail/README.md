# basic-mail

Minimal personal Gmail client (own UI, Gmail REST API after Google sign-in). Lab app.
Works in the Hub (Lab → Basic Mail) and responds to the hub's D-pad.
Setup steps (Google Cloud, client id) are in `basic-mail.txt`.

## Files

| File | Job |
| --- | --- |
| `index.html` | Redirect to `basic-mail.html`. |
| `basic-mail.html` | Page, page CSP, script order. |
| `basic-mail-config.js` | Theme, app name, OAuth client id, scopes. No secrets. |
| `basic-mail-sanitize.js` | Untrusted mail HTML → safe srcdoc page (+ frame CSP). |
| `basic-mail-view.js` | Reader body: sandboxed iframe or plain text, "Show images". |
| `basic-mail-auth.js` | GIS token client, token storage, expiry, sign out (revoke). |
| `basic-mail.js` | Gmail calls, list, search, open, compose/send, archive, delete. |
| `basic-mail-keys.js` | Keyboard and hub D-pad: ↑↓ rows, ←→ folders, Enter, Esc. |
| `basic-mail.css` | Layout, dark/light themes, 44px tap targets. |
| `basic-mail_icon.png` | Hub icon (128×128). |

## Behaviour rules

- **HTML mail is never put in this page.** It is shown in an `<iframe sandbox="allow-popups
  allow-popups-to-escape-sandbox" srcdoc>`: no scripts, no same-origin, no forms, no top navigation.
  The mail keeps its own CSS; the frame contains it. The frame scrolls by itself and fills the reader.
- **Pre-sanitised anyway** (DOMParser): drops script, iframe, frame, object, embed, form, base,
  meta, link, template, SVG animate/set; all `on*` attributes, `srcdoc`, `action`, `formaction`, `ping`;
  `href`/`src`/`xlink:href`/… with `javascript:`, `vbscript:`, `data:` (only `data:image/*` on img).
  Links get `target=_blank rel="noopener noreferrer"`.
- **Frame CSP** (meta in srcdoc): `default-src 'none'; style-src 'unsafe-inline'; font-src data:;
  img-src data: cid:` (+ `https: http:` after Show images); `form-action 'none'; base-uri 'none'`.
- **Remote images blocked by default.** Remote `img src`, `srcset`, `background=` and CSS `url(...)`
  (style attributes and `<style>` blocks, plus `@import`) are removed. A bar "Images hidden — Show images"
  re-renders this one message with them. Per open only; nothing is remembered per sender.
- **Page CSP** (meta in `basic-mail.html`): scripts only from this folder and
  `https://accounts.google.com/gsi/client`; connect only to Gmail, GIS and `oauth2.googleapis.com`
  (revoke); frames only GIS. `img-src` includes `https:` because a srcdoc frame inherits the page
  policy, so "Show images" would fail otherwise; the page itself never renders mail HTML.
  `<meta name="referrer" content="no-referrer">` on the page and in the frame.
- **Token**: access token only (no refresh token, no secret), in memory and `sessionStorage`
  (`basic-mail-token`, this tab only) until Google's `expires_in` (about 60 min) minus a minute.
- **Expiry**: an expired token or any Gmail 401 wipes the token, hides Compose/Sign out, shows
  Connect and "Session expired. Tap Connect." Gmail errors show `error.message`, not raw JSON.
- **Sign out** revokes the token at Google (`google.accounts.oauth2.revoke`) and clears the screen.
- **Search** waits 400 ms after typing; Enter searches at once. Every list load has a sequence
  number, so a slow old reply never replaces a newer list. Same for opening messages.
- **Compose**: To accepts several addresses separated by commas. CR/LF are stripped from To and
  Subject so a value cannot inject headers. Plain-text UTF-8 body.
- Opening a mail marks it read in Gmail and un-bolds its row at once.

## Key data

- `localStorage["basic-mail-theme"]` — theme override (`dark` / `light`).
- `sessionStorage["basic-mail-token"]` — `{ token, exp }`.

## Google setup note

`https://jor-teron.github.io` must be an **Authorized JavaScript origin** of the OAuth client
(plus `http://localhost:PORT` for local tests). `file://` does not work.

## Testing (manual, in a browser)

1. Open the app, Connect, allow. Inbox loads; Compose and Sign out appear.
2. Open a newsletter: it renders styled inside the white frame; "Images hidden" bar shows;
   Show images loads them. Links open in a new tab.
3. Type in Search: one request after you stop typing; Enter searches at once.
4. Compose to two addresses with a comma; both receive it.
5. Sign out, or wait for expiry / revoke the app in Google account settings: next action shows
   "Session expired. Tap Connect."
6. In the Hub, use the D-pad: ↑↓ move rows, Enter opens, ←→ change folder, Esc goes back.
7. DevTools console: no CSP errors during Connect.

## Known limits (release 2)

No threading headers (In-Reply-To), non-ASCII subjects are not RFC 2047 encoded, charset is
assumed UTF-8, HTML-only mails quote nothing on reply, no attachments, 20 messages per list.
