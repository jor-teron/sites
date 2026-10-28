# Screen Share — SS1

Share a computer's screen, window or tab with other devices on the same Hub Connect Code (Connectivity → Chat). Phones and tablets watch only.

- **Code:** same as Video Chat VC1 — `#code=1234` / `?hub=` (QR), the Hub's `{sharedLink:'hello'}` inside the Hub (app sends `{sharedLink:'ready', app:'screen-share'}`), `parent.__hubRemote.code`, `jtsites-hub-ctrl-code` / `shared-link-join-code`, the last code (`screenshare-last-code`), else the Code dialog.
- **Peers (own, never the Hub's):** `jtsites-<code>-ss-<random>` per device; lobby `jtsites-<code>-ss-0` is claimed by the first device and keeps the roster (`hi` → `roster`, each entry `{id, name, share:null|{on, paused, audio}}`) and relays signals. If the lobby goes, a remaining device claims it. PeerJS from `SharedLink.PEERJS_URL` when loaded, else the same pinned URL (peerjs 1.5.4).
- **Signals:** viewer → sharer `watch` / `leave`; sharer → viewer `paused {on}`, `stopped`, `full`. The sharer calls each viewer with the screen stream (one MediaConnection per viewer, max 4); the viewer answers receive-only, and only the sharer it asked for.
- **Sharer (desktop):** `getDisplayMedia` (720p/1080p, 5/15/30 fps, optional tab audio), preview, viewer count + names, Pause/Resume (`track.enabled`), Stop; the browser's own "Stop sharing" (track `ended`) stops it too. Quality/fps changes apply live via `applyConstraints`.
- **Viewer:** full-screen overlay, Fit/Fill, full screen, wheel / pinch zoom (1–8×) + drag pan, double-click/tap 2.5×, "paused" overlay, sound toggle when the share has audio. Keys: Esc leave, 0 reset, f full screen, +/- zoom.
- **Phones:** Share shows "phones can't share, but can watch".
- **Files:** `screenshare_store.js` (settings `screenshare-settings-v1`, theme), `screenshare_peer.js` (presence, VC1 pattern), `screenshare_share.js` (capture, per-viewer calls, watching), `screenshare_app.js` (UI, swipe, zoom, dialogs).
- Screens: Share (live shares list, controls on the right) and Settings (name, quality, frame rate, tab audio, fit, theme, About). Swipe 75 px. A new share also goes to `window.top.HubNotify` when present.
