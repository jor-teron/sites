# Screen Share — SS2

Share a computer's screen, window or tab with other devices on the same Hub Connect Code (Connectivity → Chat). Phones and tablets watch only.

- **Code:** same as Video Chat VC1 — `#code=1234` / `?hub=` (QR), the Hub's `{sharedLink:'hello'}` inside the Hub (app sends `{sharedLink:'ready', app:'screen-share'}`), `parent.__hubRemote.code`, `jtsites-hub-ctrl-code` / `shared-link-join-code`, the last code (`screenshare-last-code`), else the Code dialog. **Replaced by SS2 below.**
- **Peers (own, never the Hub's):** `jtsites-<code>-ss-<random>` per device; lobby `jtsites-<code>-ss-0` is claimed by the first device and keeps the roster (`hi` → `roster`, each entry `{id, name, share:null|{on, paused, audio}}`) and relays signals. If the lobby goes, a remaining device claims it. PeerJS from `SharedLink.PEERJS_URL` when loaded, else the same pinned URL (peerjs 1.5.4).
- **Signals:** viewer → sharer `watch` / `leave`; sharer → viewer `paused {on}`, `stopped`, `full`. The sharer calls each viewer with the screen stream (one MediaConnection per viewer, max 4); the viewer answers receive-only, and only the sharer it asked for.
- **Sharer (desktop):** `getDisplayMedia` (720p/1080p, 5/15/30 fps, optional tab audio), preview, viewer count + names, Pause/Resume (`track.enabled`), Stop; the browser's own "Stop sharing" (track `ended`) stops it too. Quality/fps changes apply live via `applyConstraints`.
- **Viewer:** full-screen overlay, Fit/Fill, full screen, wheel / pinch zoom (1–8×) + drag pan, double-click/tap 2.5×, "paused" overlay, sound toggle when the share has audio. Keys: Esc leave, 0 reset, f full screen, +/- zoom.
- **Phones:** Share shows "phones can't share, but can watch".
- **Files:** `screenshare_store.js` (settings `screenshare-settings-v1`, theme), `screenshare_peer.js` (presence, VC1 pattern), `screenshare_share.js` (capture, per-viewer calls, watching), `screenshare_app.js` (UI, swipe, zoom, dialogs).
- Screens: Share (live shares list, controls on the right) and Settings (name, quality, frame rate, tab audio, fit, theme, About). Swipe 75 px. A new share also goes to `window.top.HubNotify` when present.

## SS2 — Public 0000 by default; sharer approves viewers on Public

- **Code choice (same as Intercom IC4 / Telephone TP4):** `#code=` / `?hub=` / `join=` in the URL wins (held for the session). Inside the Hub: if `parent.HubMeshLink.isPrivate()` (read-only, try/catch) → `privateCode()`, else **0000 (Public)**, shown as `0000 · Public` under the status. The Hub's own Connect Code (`{sharedLink:'hello'}`, `__hubRemote.code`, `jtsites-hub-ctrl-code`, `shared-link-join-code`) is used only in an older Hub without `HubMeshLink`, ending at 0000. Standalone: last code, else 0000. No code dialog at start.
- **Code dialog:** Cancel · Public · Join. A code picked there holds for the session. While sharing or watching, picking a code shows "Stop sharing first" / "Stop watching first" and stays.
- **Following the Hub:** every 5 s the private mesh is re-read. When idle (not sharing, not watching) Screen Share switches by itself with a toast; otherwise a non-blocking **Switch to <code>** / **Back to Public** button appears at the top (tapping it while busy gives the same "Stop … first" toast).
- **Viewer approval on Public (0000):** an untrusted `watch` is queued and the sharer sees an in-app dialog "<name> wants to watch your screen" (Deny / Allow, one at a time, plus a Hub notice). The viewer gets `{t:'asking'}` ("Waiting for … to allow…"). Deny, or no answer in 30 s → `{t:'denied'}`, shown as "The sharer declined". Allowed viewers stay allowed until the share stops. The 4-viewer limit is checked before asking. Private codes: no prompt (SS1 behaviour).
- **Trusted devices skip the prompt (same idea as IC3):** each device has a lasting `did` (sent in `hi` / roster). On a **private** code every device gives each other device a random token `{t:'trust', did, name, token}` (stored as `trusted` / `keys` in `screenshare-settings-v1`), so your own devices that have met on a private Hub code are trusted. On 0000 tokens are never sent: the sharer sends `{t:'prove', n}` and the viewer answers `{t:'proof', n, mac}` with HMAC-SHA256(token, `n|sharerId|viewerId`) via WebCrypto, so the 0000 lobby owner (which relays signals) never sees a token. No WebCrypto, or no / wrong proof within 6 s → the normal Allow / Deny prompt.
- **New signals:** sharer → viewer `asking`, `denied`, `prove {n}`; viewer → sharer `proof {n, mac}`; both ways `trust` (private codes only).

## FC5 (SS3) — 5-digit Hub codes, public 00000
- **Why:** the Hub moved to 5-digit codes in H83 (clean cut-over, no 4-digit fallback). Public lobby is now **00000** (`SharedLink.LOBBY`, fallback `'00000'` while H83 is not live).
- **What:** URL `#code=` / `?hub=` / `join=`, the code dialog (maxlength 5, "5-digit code"), Hub hello codes, mesh codes and the last code now take exactly 5 digits. Saved 4-digit codes are ignored (`c5()`), so the app falls to Public or asks.
- `L.open()` (screenshare_peer.js) is true on `SharedLink.LOBBY || '00000'`.

## Legacy code notes

- SS1 `localCode()` + `go()` + `askCode()` + `boot()` (Hub's own Connect Code first, code dialog when none) are kept as `//` comments in `screenshare_app.js` above the SS2 code choice. SS1 `onWatch(from, name)` (sends the screen to anyone who asks) is now `admit()`, reached directly only on private codes or for allowed / proven viewers.
- FC5: earlier `\d{4}` / `'0000'` lines stay in the SS1 `//` legacy block.
