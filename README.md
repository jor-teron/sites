This is a WebApp intended to turn old Android Smartphone or Tablet into a TV (apk not included).
This project can be viewed directly at (https://jor-teron.github.io/sites/tv/)

Include choice of:
* Indian Channels (+600)
* Kids Channels (+250)
* World Channels (+10,000)
* YouTube
* Play Store
* Android Setting
* Photos viewer (Planned)
* Video Player (Planned)

Work best on:
1. Android Smartphone.
2. Android TV Smart Box.

(Just an amalgamation of Homescreen launcher, and WebView app landing page.)

## Hub (hub.html)

`hub.html` is the app launcher (menu, app iframe, phone controller pairing).
* App list: `hub_apps.js` (`window.HUB_APPS_CSV`, CSV columns `CATEGORY,NAME,ENTRY_URL,ICON_URL,NEW_TAB,HIDDEN,ORDER`, read by header name; replaces the old `hub-apps.csv`). Works over http and `file://`.
* Home screen tiles: `hub_tiles.js` (`window.HUB_TILES`: a QR of the hub link, and app shortcuts; 2 columns).
* App links + last-app memory: an app opened in the hub gets a hash link like `hub.html#snake` or `hub.html#webcam` (folder / file name) and is remembered in localStorage, so a reload reopens it; Back / Forward switch apps, the menu's "Home screen" item clears it. New-tab apps are not remembered.
* After changing hub files, bump the `?v=` cache-buster in `hub.html` (see the comment there).
