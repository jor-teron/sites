# Mesh Viewer (apps/system/mesh-viewer/), H69

A read-only System app that shows the Hub mesh (`shared/link/hub_mesh.js`, `window.HubMesh`).
Listed in `apps/system/system-apps.csv` (section System, after System Monitor), so it opens from
Start › System, the App Hub and Search ("mesh", "network", "connection log"). Opens as a window in
Desktop mode and full screen in Phone mode. Follows the Hub theme (`shared/theme/hub_theme.js`:
Light, Dark, Auto by the clock, Glass → light).

## What it shows
- **This device**: name, Hub device id, mesh code (0000 public / private), link state (as Settings ›
  Devices: Lobby, Linking… Ns, Linked, Retrying in Ns, Refused, Not linked: tap Retry), raw
  `state · joinState`, role (Host = lobby, or Joiner / relayed), lobby id and term, mode,
  "Linked for" (since this device linked or became the lobby) and Hub uptime.
- **Join stats** (H55b): joinState, joinFails, lastJoinMs, times given up, retry timer, the
  join wait / retry / give-up constants, direct links, messages, drops.
- **Devices in the mesh**: every roster entry (max 40 shown): name, device id, Online / Offline,
  Lobby / Relayed / mode / join order, the link (Direct link, Lobby link, Via the lobby, or Last
  seen N ago) and when the lobby last heard from it. Trust is "not checked" until H51 adds trust.
- **Connection log**: the last 200 events since the Hub page started (`hub/link/hub_meshlog.js`,
  `window.HubMeshLog`): join, open, close, error, retry, presence, link (Connect link), info, with
  local times (IST on an Indian device clock). Autoscrolls while you are at the bottom.
  **Copy log** copies a text version with a header (date, zone, device, code, state);
  **Clear** empties the Hub's log.

## Actions (the only ones)
- **Retry join now**: `HubMeshLog.retry()` → `HubMesh.retry()`, the same as Settings › Devices Retry
  ("Not linked: tap to retry"). Disabled on the lobby and on a refused device.
- **Settings › Devices**: opens Settings on `#devices/connected`.

## How it gets the data
The app runs in a Hub iframe (same origin) and reads `window.parent.HubMesh`, `HubMeshLog`,
`HubMeshLink` directly, like System Monitor reads `__hubTasks`. Live: HubMesh `status` / `roster` /
`peers` / `lobby` events, `HubMeshLog.on()` and a 2 s timer (skipped while hidden). Every name and id
from another device is clipped and written with `textContent` only. Opened outside the Hub, it says
to open it from the Hub.

Files: `index.html`, `mv.js`, `mv.css`, `mesh-viewer_icon.png`, this README. Hub side:
`hub/link/hub_meshlog.js` (loaded right after `hub_mesh.js` in `hub.html`).
Tests: `/workspace/h69test/t69.py` (two and three real Hub pages on the stand-in PeerJS broker).
