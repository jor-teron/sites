# Shared Clipboard — CB1

Copy on one device, paste on another: text, links and images go to every device on the same Hub Connect Code (Connectivity → Share), or to one chosen device.

- **Code:** `#code=1234` / `?hub=` (QR), the Hub's `{sharedLink:'hello'}` inside the Hub, `parent.__hubRemote.code`, `jtsites-hub-ctrl-code` / `shared-link-join-code`, the last code (`clipboard-last-code`), else the Code dialog. Without a code the history still works locally.
- **Peers (own, never the Hub's; data connections only):** `jtsites-<code>-cb-<random>` per device; lobby `jtsites-<code>-cb-0` (first device) keeps the roster (`hi` → `roster`), relays `{t:'all'}` to every other device and `{t:'to'}` to one, and sends a new device the 10 newest shareable items (`{k:'recent', its}`; items sent to one device are never included). If the lobby goes, a remaining device reclaims it.
- **Messages:** `{k:'clip', it:{id, ts, kind:'text'|'image', name, text|img}, priv?}`; `{k:'recent', its}`. Incoming images must be `data:image/(png|jpeg|gif|webp);base64,` or they are dropped.
- **Getting content in:** Paste button (`navigator.clipboard.read()` for images, then `readText()`; a help dialog if the browser refuses), Ctrl/⌘+V into the page, drag & drop, or the Image button (file picker). Images are shrunk to ≤1600 px (PNG kept for png/gif/webp unless large, else JPEG 0.85). Ctrl/⌘+Enter sends.
- **History:** newest first with device name + time; Copy (text via `writeText`, images via `ClipboardItem` PNG, fallbacks: textarea copy / download), Download (images), Open link, Pin, Delete, Clear (confirm; pinned kept). Local only — deleting never touches other devices.
- **Files:** `clipboard_store.js` (settings `clipboard-settings-v1` `{name, theme, autocopy, notice, target}`), `clipboard_peer.js` (presence + relay), `clipboard_save.js` (the one save module: IndexedDB `clipboard-v1`/`items`, last 50 + pinned, copy/download), `clipboard_app.js` (UI, paste/drop, sync glue, dialogs, swipe).
