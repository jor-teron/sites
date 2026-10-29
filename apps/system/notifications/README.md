# Notification Centre (apps/system/notifications/), H66

A System app with every notification this Hub showed on this device. Listed in
`apps/system/system-apps.csv` (section System, after Mesh Viewer), so it opens from Start › System, the
App Hub and Search ("notification", "do not disturb"). Window in Desktop mode, full screen in Phone mode.
Follows the Hub theme (`shared/theme/hub_theme.js`: Light, Dark, Auto, Glass → light).

## What it shows
- The saved history, newest first, grouped Today / Yesterday / date, with the app icon (or the
  notice's own emoji), app name, title, text and local time HH:MM (IST on an Indian device clock).
  Unread items have a blue dot; items count as read once the list has been on screen ~1 s.
- **App** filter (All apps (N) plus each app with its count). `#app=<name>` in the URL preselects one.
- **✕** clears one item, **Clear all** empties the history.
- **Do Not Disturb**: the same switch as in the 🔔 panel (`sites-hub.dnd`).
- A tap on an item does what the 🔔 panel does: runs the notice's action if this Hub session still has
  it, otherwise opens the app it came from.

## Where the data lives
`hub/viewer/hub_notifcenter.js` (`window.HubNotifCenter`, loaded after `hub_notify.js` in `hub.html`)
saves every notice into localStorage `sites-hub.notifs` (JSON array, newest first, max 100):
`{ id, t (ms), app, appId, entry, hash, aicon, icon, title, text, read }`. This device only: excluded
from the profile file / folder and from sync. `sites-hub.dnd` = '1' is Do Not Disturb (this device
only, never synced): no pop-up cards, still saved, 🔔 shows 🔕.

Inside the Hub the app calls `window.top.HubNotifCenter` (list, unread, dnd, setDnd, markRead,
markAllRead, remove, clear, activate, on); opened on its own it reads and writes the same
localStorage keys. Live: `HubNotifCenter.on()` and the storage event.

The 🔔 button and its side panel: `hub/viewer/hub_notifcenter.js` + `.css` (glass rules in
`hub/core/hub_glass.css`). Settings › Hub bar › Notifications (`barNotif`, default on) shows / hides 🔔;
the app keeps working when it is off.

Files: `index.html`, `nc.js`, `nc.css`, `notifications_icon.png`, this README.
Tests: `/workspace/h66test/t66.py`.
