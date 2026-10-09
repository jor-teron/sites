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
| Bottom-right | Plus |

`paper-sheet-layout.js` holds the millimetre grid (`window.PAPER_LAYOUT`). The
PDF and the future camera key-map use the same numbers.

## Libraries

- PeerJS stays on the online unpkg URL (by choice for this demo).
- QR library is local: `vendor/qrcode.min.js`.

## Manual test

1. Desktop: open `paper-keyboard.html` → Use as Output → scan the QR with a phone.
2. Phone: Screen keyboard should type into the desktop box.
3. Tap Download keyboard, print the PDF; check key size and that all four corner shapes are clear of the edge.

## Known limit

Paper mode only looks for corner marks today. Finger detection, hold-to-press,
and sending from the sheet are not built yet.
