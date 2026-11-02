# Live Location (LL1)

Share where you are with the devices on your **private** Hub mesh, live, while this page is open.

- Big "Share my location" toggle, OFF on every load. Uses `navigator.geolocation.watchPosition` only while on.
- Sends `{k:'pos', lat, lon, acc, at, name}` at most every 5 s (sooner after moving >10 m); `{k:'off'}` when you stop or close.
- Transport: `ll_peer.js`, a copy of the Shared Clipboard PeerJS lobby pattern (`jtsites-<code>-ll-0`).
- Code: URL `#code=`, the Hub's `HubMeshLink` private code, last code, else type one. Public 00000 is refused.
- Map: Leaflet 1.9.4 in `vendor/leaflet/` (BSD-2, see LICENSE) with OpenStreetMap tiles (needs internet).
- Devices go grey after 2 minutes of silence. Tap a row to fly to it.
- Setting key: `live-location-settings-v1` = `{code}`.
- Not in R1: history (LL2), background sharing (PH2).

Files: `ll_store.js` settings, `ll_peer.js` mesh, `ll_geo.js` GPS + throttle, `ll_map.js` map + list, `ll_app.js` glue.
