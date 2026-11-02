# Find My Device (FD1)

Ring or locate any of your devices on the public Hub mesh **00000**.

- **The other device needs Find My Device open** (in a tab or the Hub). FD2 will let the Hub answer when it's closed.
- FD1 has **no permissions**: any device on 00000 can ring or locate any other. The decision lives in `allowFind(req)` in `fd_app.js`; FD2 adds permissions.
- 🔔 Ring: the target plays a loud repeating alarm (WebAudio, full volume), vibrates, and shows a full-screen card with a big Stop. Stops after 60 s, or when the finder taps ⏹. If autoplay blocks sound, the card says "Tap to sound".
- 📍 Locate: the target takes one GPS fix (high accuracy, 15 s timeout) and replies; the finder sees it on a full-screen Leaflet map with accuracy circle, time, and an "Open in Google Maps" link. The target shows "Your location was shared with …".
- Find by number: type a 5-digit number, or 👤 picks from the shared contacts (`../shared/contacts_store.js`).
- Number: `HubLine.myNumber()` / `SharedLinkDevices.code()`, else a saved random one. Follows `hub-number-changed`.
- Settings key: `find-device-settings-v1` = `{num}` (only used when there is no Hub number).
- Transport: `fd_peer.js`, copy of Messages' `messages_peer.js` with room `jtsites-00000-fd-*`.
- Map: Leaflet 1.9.4 in `vendor/leaflet/` (BSD-2) + OpenStreetMap tiles (needs internet).

Files: `fd_peer.js` mesh, `fd_ring.js` alarm, `fd_locate.js` GPS + map, `fd_app.js` glue.
