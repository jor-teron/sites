SITES HUB - TECHNICAL GUIDE & HANDOVER: TEAM 5
==============================================

Team: Team 5 (Boss / Leader: Main Bot / Builder)
Shift: Active shift (Nov 17, 2026 IST, until 21:00 IST)
Handoff: Succeeded Team 1; handing over to Team 2 tonight at 21:00 IST.
Authority: GitHub repository `sites` (https://github.com/jor-teron/sites) is authoritative truth.

TEAM RESPONSIBILITIES & WORKSPACE
---------------------------------
- Team 5 leads coordination across app categories (Games, Learn, Tools, Office, System, Media).
- Members coordinate category-specific tasks under the Main Bot / Builder (Boss).
- All commits follow standard trailer:
    Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>

CURRENT STATUS & RECENT DELIVERIES
----------------------------------
1. System Settings & Wallpapers:
   - Added procedural Live Wallpapers group to Settings (Aurora waves, Constellation, Circadian sky).
   - Embedded live animated preview canvases directly inside Settings live swatches (apps/system/settings/sec_wallpaper.js).
   - Sizing preservation in hub/drives/hub_live_wallpaper.js: resizes preserve state.t and existing particles without resetting timer.
   - Occlusion pausing: auto-pauses when a desktop window is maximized (.wm-max:not(.wm-min)).
   - Known limitation recorded: desktop background canvas remains static in browser compositing environments (Won't Fix).

UPCOMING HANDOVER TO TEAM 2 (21:00 IST)
---------------------------------------
- Repository clean and synced on main.
- Unit test suite: 7/7 live wallpaper tests passing in hub/tests/hub_live_wallpapers.test.cjs.
- Handover notes and open items for Team 2 will be recorded here prior to 21:00 IST.
