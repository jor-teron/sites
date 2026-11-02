# Live Location (LL1.1)

Share where you are with the devices on your **private** Hub mesh, live, while this page is open.

- LL1.1: full-screen map under one slim top row: Share toggle · status · code · 👥 n (device list as a bottom sheet).
- Sharing starts automatically on a private code; turning it off is remembered (`share:false`). A denied permission shows on the toggle and isn't retried. Uses `navigator.geolocation.watchPosition` only while on.
- Sends `{k:'pos', lat, lon, acc, at, name}` at most every 5 s (sooner after moving >10 m); `{k:'off'}` when you stop or close.
- Transport: `ll_peer.js`, a copy of the Shared Clipboard PeerJS lobby pattern (`jtsites-<code>-ll-0`).
- Code: URL `#code=`, the Hub's `HubMeshLink` private code, last code, else type one. Public 00000 is refused.
- Map: Leaflet 1.9.4 in `vendor/leaflet/` (BSD-2, see LICENSE) with OpenStreetMap tiles (needs internet).
- Devices go grey after 2 minutes of silence. Tap a row to fly to it.
- Setting key: `live-location-settings-v1` = `{code, share}` (share unset = on).
- Not in R1: history (LL2), background sharing (PH2).

Files: `ll_store.js` settings, `ll_peer.js` mesh, `ll_geo.js` GPS + throttle, `ll_map.js` map + list, `ll_app.js` glue.
