# Paper Keyboard (web demo)

Web demo for a future Android input device. Screen keyboard already sends
characters to a desktop over PeerJS. Paper-camera typing is not built yet.

## Printable sheet

Tap **Download keyboard** on the home screen to get `paper-keyboard-A4.pdf`, then
print A4 landscape at **100%** with fit-to-page off. One key should measure 18 mm.

Corner shapes (solid black, 18 mm, 10 mm from the edge):

| Corner | Shape |
|--------|-------|
| Top-left | Circle |
| Top-right | Square |
| Bottom-left | Triangle |
| Bottom-right | Diamond |

`paper-sheet-layout.js` holds the millimetre grid (`window.PAPER_LAYOUT`). The
PDF and the future camera key-map use the same numbers.

## Pairing (4-digit code)

`paper-link.js` holds all link logic (`window.PaperLink`).

- **Desktop (Output):** PeerJS id `jtpkb-` + random 4 digits. Shows a big code
  and a QR. The long link is never shown as text. If the code is taken by
  someone else (`unavailable-id`), a new one is picked; after a reload the
  saved code is retried a few times first (the broker may still hold it).
- **QR link:** this page with `?role=input&code=1234` only. No version tags;
  there is one always-latest page.
- **Phone (Input):** type the 4 digits + Connect, or Scan QR. Scan accepts a URL
  with `code=`, an old URL with `peer=jtpkb-1234`, or bare digits.
- **Survives reload / hard reload.** Both sides reopen on load and the phone
  reconnects with backoff (1, 2, 4, 8, 15 s) whenever the link drops.
- **Disconnect** (header, both sides) is the only way to end it; it clears the
  saved code.
- PeerJS default config is kept on purpose (no `iceServers` override): its TURN
  relay is needed behind CGNAT.

Saved keys (localStorage):

| Key | Side | Value |
|-----|------|-------|
| `jtpkb-host-code` | Desktop | Its 4-digit code |
| `jtpkb-last-code` | Phone | Last code it connected to |

Fresh pages: the hub service worker (`hub/hub_sw.js`) is network-first and
fetches app pages and `apps/*` files with `cache: 'no-cache'`, so a phone
always gets the latest push (cache is only an offline fallback).

## Libraries

- PeerJS stays on the online unpkg URL (by choice for this demo).
- QR library is local: `vendor/qrcode.min.js`.

## Manual test

1. Desktop: open `paper-keyboard.html` → Use as Output. A big 4-digit code and a QR show; no long link.
2. Phone: Use as Input → type the code → Connect (or Scan QR). Screen keyboard types into the desktop box.
3. Reload (and hard reload) the phone: it reconnects by itself. Reload the desktop: same code comes back and the phone rejoins.
4. Tap Disconnect on either side: back to the role pick; a reload stays on the role pick.
5. Tap Download keyboard, print the PDF; check key size and that all four corner shapes are clear of the edge.

## Known limit

Paper mode finds the four corner shapes only (`paper-corners.js`): circle,
square, triangle, diamond, judged against the local paper white so dim rooms and
screens work. Each TL/TR/BL/BR light goes green on its own shape; all four
draw a green outline ("Locked"). A turned sheet still names the right corners. The diamond is a square turned
45°, so square and diamond are told apart by their angle to the sheet edge
(circle→triangle line, or the triangle's tip). Lights hold 800 ms.

Showing the PDF on a tablet works for testing: full screen, brightness down a
bit, auto-rotate off.

Finger detection, hold-to-press, and sending from the sheet are not built yet.
