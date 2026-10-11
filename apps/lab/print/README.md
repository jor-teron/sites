# Print

Phone camera / file → PC print dialog.

- `print.html` (host station), `print-send.html` (phone sender).
- PeerJS is no longer vendored: loaded by `shared/link/link_core.js` (pinned CDN). `vendor/` keeps qrcode.js and jsQR.js.

## Inside the Hub (release 2)
Print posts `{sharedLink:'ready', app:'print'}`. The Hub answers with its code, so Print has no peer of its own: its QR opens `print-send.html?hub=1&code=<hub code>`, the phone joins the Hub's SharedLink (listed by name in the device list) and files carry `app:'print'`, which the Hub delivers into Print (`{sharedLink:'file'}`) → history + print dialog. No Hub answer within 0.7 s → standalone.

## Standalone
Own 4-digit code (`jtprint-` peer ids), QR, manual entry, reload-persistent link, reconnect backoff, transfer bars, history in IndexedDB — unchanged. Protocol frames (hello/ready, meta/chunk/end, bye) are the same as SharedLink's.

## Test
1. Standalone: open print.html, scan with phone, send a photo → print dialog; reload both → reconnect.
2. In Hub: open Print from the Hub, scan its QR, send → print dialog, no Hub toast.
