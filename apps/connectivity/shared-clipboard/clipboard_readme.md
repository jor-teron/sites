# Shared Clipboard — CB1 / CB2 / CB3

Copy on one device, paste on another: text, links and images go to every device on the same Hub Connect Code (Connectivity → Share), or to one chosen device.

- **Code:** `#code=1234` / `?hub=` (QR), the Hub's `{sharedLink:'hello'}` inside the Hub, `parent.__hubRemote.code`, `jtsites-hub-ctrl-code` / `shared-link-join-code`, the last code (`clipboard-last-code`), else the Code dialog. Without a code the history still works locally.
- **Peers (own, never the Hub's; data connections only):** `jtsites-<code>-cb-<random>` per device; lobby `jtsites-<code>-cb-0` (first device) keeps the roster (`hi` → `roster`), relays `{t:'all'}` to every other device and `{t:'to'}` to one, and sends a new device the 10 newest shareable items (`{k:'recent', its}`; items sent to one device are never included). If the lobby goes, a remaining device reclaims it.
- **Messages:** `{k:'clip', it:{id, ts, kind:'text'|'image', name, text|img}, priv?}`; `{k:'recent', its}`. Incoming images must be `data:image/(png|jpeg|gif|webp);base64,` or they are dropped.
- **Getting content in:** Paste button (`navigator.clipboard.read()` for images, then `readText()`; a help dialog if the browser refuses), Ctrl/⌘+V into the page, drag & drop, or the Image button (file picker). Images are shrunk to ≤1600 px (PNG kept for png/gif/webp unless large, else JPEG 0.85). Ctrl/⌘+Enter sends.
- **History:** newest first with device name + time; Copy (text via `writeText`, images via `ClipboardItem` PNG, fallbacks: textarea copy / download), Download (images), Open link, Pin, Delete, Clear (confirm; pinned kept). Local only — deleting never touches other devices.
- **Files:** `clipboard_store.js` (settings `clipboard-settings-v1` `{name, theme, autocopy, notice, target}`), `clipboard_peer.js` (presence + relay), `clipboard_save.js` (the one save module: IndexedDB `clipboard-v1`/`items`, last 50 + pinned, copy/download), `clipboard_app.js` (UI, paste/drop, sync glue, dialogs, swipe).

## CB2 — files (2026-10-31)

- **In:** Ctrl/⌘+V on the page (`clipboardData.files`, else `items` of kind `file` — files copied in a file manager arrive here when the browser exposes them) and drag & drop anywhere on the page (overlay). One png/jpeg/gif/webp alone stays an `image` item (CB1 behaviour); anything else waits as a file chip until Send. No Attach button, no helper program.
- **Limit:** 25 MB per file; bigger files are refused with a pointer to File Drop.
- **Wire:** `{k:'fmeta', id, n, it:{id, ts, kind:'file', name, fname, mime, size}, priv?}` then `n × {k:'fchunk', id, i, n, data:ArrayBuffer}` (64 KB) through the normal lobby relay, paced on the data channel `bufferedAmount` (≤1 MB queued). `{k:'fcancel', id}` from either side. The receiver checks the piece count and total size before keeping the file; idle transfers drop after 60 s. CB1 clients ignore these `k` values, and files are never in `clip` or `recent`.
- **Cards:** icon by type, name, size, sender/time; Open (blob URL tab), Save, Share (`navigator.share` with files, only where `canShare`), Pin, Delete.
- **Save folder (Settings):** where `showDirectoryPicker` exists (Chrome/Edge desktop) pick a folder once; the handle is kept in IndexedDB `clipboard-v1`/`kv` (DB version 2), permission is re-asked on use, and names get ` (1)`, ` (2)`… instead of overwriting. Otherwise, or when permission is refused, Save is a normal download. Nothing is ever saved automatically.
- **Storage:** file blobs live in IndexedDB; all files together ≤ 200 MB — the oldest unpinned files go first, with a notice.

## CB3 — private only (2026-11-01)

- **Why:** on public 0000 anyone could receive the 10 newest shared items and every send. Shared Clipboard now never joins 0000.
- **Code order:** `#code=` / `?hub=` / `join=` first; else inside the Hub `parent.HubMeshLink.isPrivate()` / `privateCode()` (try/catch for cross-origin) — if the Hub is public the app stays offline; else (older Hub) `{sharedLink:'hello'}`, `__hubRemote.code`, `jtsites-hub-ctrl-code`, `shared-link-join-code`; else the last code. Any `0000` from any source is rejected.
- **Dialog:** typing 0000 shows "Shared Clipboard is private only. Use your Hub's private code." and asks again.
- **No private code:** status "Private code needed", offline; local history (copy/download) still works.
- **Follow the Hub:** every 5 s, while no file transfer is running, switch to a new Hub private code, or disconnect when the Hub turns public. A URL code is never overridden.

## FC5 (CB4) — 5-digit Hub codes, public 00000
- **Why:** the Hub moved to 5-digit codes in H83 (clean cut-over, no 4-digit fallback). Public lobby is now **00000** (`SharedLink.LOBBY`, fallback `'00000'` while H83 is not live).
- **What:** URL `#code=` / `?hub=` / `join=`, the code dialog (maxlength 5, "5-digit code"), Hub hello codes, mesh codes and the last code now take exactly 5 digits. Saved 4-digit codes are ignored (`c5()`), so the app falls to Public or asks.
- Private only, as in CB3: `ok()` rejects `00000` (and the Hub's LOBBY) and anything that is not 5 digits.

## Legacy code notes

- `clipboard_app.js`: the CB1/CB2 code order (`urlCode`/`localCode`/`go`/`askCode`/`boot`) is kept as an inline comment above the CB3 version.
- FC5: the CB1/CB2 legacy block (4-digit) is kept unchanged as a comment.
