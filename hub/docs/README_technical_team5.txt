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

2. Office Suite Start Center (apps/office/hub-office/):
   - Created unified LibreOffice-style Start Center for Hub Office suite apps (Writer, Spreadsheet, Slides, Base, Tables).
   - Smart file routing for drag-and-drop and file picking (.how, .hos, .hslides, .hot, .docx, .xlsx, .pptx, etc.).
   - Quick launch for new documents and templates across all 5 apps.
   - Hub Local drive (Documents/) scanning via FsDrives and recent documents tracker.
   - Unit tests: 8/8 tests passing in apps/office/hub-office/tests/hub_office.test.cjs.
   - Registered in apps/office/office-apps.csv and hub/core/hub_appindex.js.

UPCOMING HANDOVER TO TEAM 2 (21:00 IST)
---------------------------------------
- Repository clean and synced on main.
- Unit test suite: 17/17 tests passing (live wallpapers, notely, hub office).
- Handover notes and open items for Team 2 will be recorded here prior to 21:00 IST.
