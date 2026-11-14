# Live Location (LL2)

Share where you are with the devices on your **private** Hub mesh, live, while this page is open. LL2 adds history.

- LL1.1: full-screen map under one slim top row: Share toggle · status · code · 👥 n (device list as a bottom sheet) · ⋮ (LL2 history menu).
- Sharing starts automatically on a private code; turning it off is remembered (`share:false`). A denied permission shows on the toggle and isn't retried. Uses `navigator.geolocation.watchPosition` only while on.
- Sends `{k:'pos', lat, lon, acc, at, name, dev}` at most every 5 s (sooner after moving >10 m); `{k:'off', dev}` when you stop or close. `dev` (LL2) = `SharedLinkDevices.id()`, the permanent device id; LL1 senders without it are keyed `n:<name>`.
- Transport: `ll_peer.js`, a copy of the Shared Clipboard PeerJS lobby pattern (`jtsites-<code>-ll-0`).
- Code: URL `#code=`, the Hub's `HubMeshLink` private code, last code, else type one. Public 00000 is refused.
- Map: Leaflet 1.9.4 in `vendor/leaflet/` (BSD-2, see LICENSE) with OpenStreetMap tiles (needs internet).
- Devices go grey after 2 minutes of silence. Tap a row (or a marker) to fly to it and show its trail.

## LL2 history
- Every device keeps the positions it sees for every member (itself too) in IndexedDB `live-location-history` (`ll_hist.js`): a point is stored only after ≥ 15 m or ≥ 60 s since that member's last stored point. Kept 7 days by default; ⋮ menu: Keep history 1 / 7 / 30 days.
- Trail: the selected person's polyline (+ small time-stamped dots), range **Today / 24 h / 7 days** in the bar over the map; ✕ hides it.
- Offline people (stopped, left, or silent > 2 min) stay on the map greyed at their last spot with **last seen X min ago**; after a reload they come back from history.
- ⋮ → **Clear history…** (red) asks first in an in-app dialog; clears this device only.
- Optional home server: `server/` (Node + SQLite, see `server/README.md`). When it is in the group the app shows **History server online**, asks it for what it missed and merges it, and uploads its own points the server missed. Without it everything above still works locally.
- Setting key: `live-location-settings-v1` = `{code, share, keep, range, hsync:{code: cursor}, hup:{code: time}}` (share unset = on).
- Not yet: background sharing (PH2).

Files: `ll_store.js` settings (`VERSION = 'LL2'`), `ll_peer.js` mesh, `ll_geo.js` GPS + throttle, `ll_hist.js` history, `ll_map.js` map + list + trail, `ll_app.js` glue, `server/` history server.

## Legacy
IC9a: icon redrawn colourful, no tile; old icon kept as live-location_icon_before_IC9a.svg
