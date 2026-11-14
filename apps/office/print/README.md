# Print

Phone sends a file to a station; the station prints it. Plain HTML/CSS/JS, libraries in `vendor/`.

## HO2

Clearing the station's file list asks with an in-app dialog (Enter confirms, Esc cancels) instead of the browser confirm box. The QR reader on the phone page (`vendor/jsQR.js`) loads when the camera scanner starts, not with the page. PeerJS and the station QR image still load on open, because the station has to connect and show its code immediately.

## Legacy
IC8: icon redrawn plain without tile; old icon kept as *_icon_before_IC8.png
