SITES HUB - TECHNICAL GUIDE & SHIFT HANDOVER: TEAM 5
======================================================

Team: Team 5 (Boss / Leader: Main Bot / Builder)
Shift: Active shift completed (Nov 17, 2026 IST, 17:00 - 21:00 IST)
Handoff: Succeeded Team 1; handed over to Team 2 tonight at 21:00 IST.
Authority: GitHub repository `sites` (https://github.com/jor-teron/sites) is authoritative master truth.


1. TEAM RESPONSIBILITIES & CONTEXT
----------------------------------
- Team 5 led coordination across app categories (Games, Learn, Tools, Office, System, Media).
- Primary focus during this shift:
  1. System Settings & Procedural Live Wallpapers refinement.
  2. Construction and launch of the unified Hub Office Start Center and tabbed suite container (apps/office/hub-office/).
  3. Responding to architectural inquiries regarding Terminal/BusyBox WASM vs pure-JS POSIX.
- All commits follow standard trailer:
    Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>


2. COMPLETED DELIVERIES DURING SHIFT
------------------------------------
A. System Settings & Procedural Live Wallpapers:
   - Added procedural Live Wallpapers category to System Settings (Aurora waves, Constellation, Circadian sky).
   - Embedded live animated preview canvases directly inside Settings live swatches (apps/system/settings/sec_wallpaper.js).
   - Sizing and particle state preservation: resizing preserves state.t and existing particle coordinates without resetting animation clocks (hub/drives/hub_live_wallpaper.js).
   - Occlusion pausing: automatically pauses animation loop when a desktop window is maximized (.wm-max:not(.wm-min)).
   - Documented limitation: live wallpaper canvas on the desktop shell background remains static in certain browser compositing environments (Won't Fix).

B. Hub Office Suite Start Center & Tabbed Container (apps/office/hub-office/):
   - Created unified LibreOffice-style Start Center and multi-document container for all 5 office applications:
     * Writer (apps/office/writer/ - Word processor & documents, .how, .docx, .odt, .txt, .pdf)
     * Spreadsheet (apps/office/spreadsheet/ - Formulas, sheets, CSV/XLSX, .hos)
     * Slides (apps/office/slides/ - 16:9 presentations, full-screen deck mode, .hslides, .pptx)
     * Base (apps/office/base/ - Relational database: tables, forms, queries)
     * Tables (apps/office/tables/ - Structured typed data grid, .hot, .csv)
   - Top Tab Bar Architecture:
     * Persistent pinned tab: [ 🏠 Start Page ] remains accessible at all times and cannot be closed.
     * Dynamic document tabs: [ 📝 Writer 1 ✕ ], [ 📊 Spreadsheet 1 ✕ ] open in tabbed iframe viewports.
     * Clean tab lifecycle: active tab indicator, tab close button with automatic focus fallback to previously active document tab or Start Page.
   - Clean Launch UI:
     * Removed template dropdown menus ("Meeting Notes", "Proposal", etc.) from cards per user direction, providing fast, single-action launch buttons ("Open Writer", "Open Spreadsheet", etc.).
   - Smart File Routing:
     * Drag-and-drop zone and file picker route recognized office extensions (.how, .hos, .hslides, .hot, .docx, .xlsx, .pptx, .csv, .txt) directly into a newly opened document tab.
   - Hub Local OPFS Documents Integration:
     * Scans Hub Local / Documents via FsDrives and maintains recent documents list with human-readable timestamps and file sizes.
   - URL Resolution & Pathing:
     * Resolved 404 issue when launching suites: updated iframe URLs to sibling relative paths (../<app>/) since hub-office is 3 directories deep and sibling suites are 2 directories deep.
   - Office Guidelines Compliance:
     * Replaced fallback window.alert with OfficeNotify / OfficeDialog.alert across the codebase.
   - Suite Icon:
     * Generated 128x128 RGBA plain suite icon (hub_office_icon.png and hub-office_icon.png) matching IC plain theme.
   - Registry & Discoverability:
     * Registered in apps/office/office-apps.csv and hub/core/hub_appindex.js.
   - Automated Unit Tests:
     * 9/9 passing tests in apps/office/hub-office/tests/hub_office.test.cjs.

C. Terminal & BusyBox Architecture Clarification:
   - Responded to Web OS team inquiry comparing Hub OS and Web OS terminal implementations.
   - Documented hybrid architecture:
     * Pure-JS fast path for simple commands (pwd, cd, ls, cat, head, tail, etc.) in terminal_fs.js.
     * Compiled BusyBox 1.36.1 WASM (87 applets) in off-thread Web Worker (terminal_worker.js) for pipes, redirects, sed, awk, sort, etc.
     * Stream chunking (40ms, 64KB) with 512 KB/s rate throttling (LIVE_RATE) and instant worker.terminate on Ctrl+C.
     * Selective MEMFS copy-in staging and diff write-back (32 MB / 3000 files limit).


3. DESIGN DISCUSSIONS & DECISIONS
---------------------------------
- Screen Size Adaptability:
  * User noted usage across multiple monitors, ranging from large ultrawides down to 19" displays.
  * Decision: Positioned tab bar at the very top (compact 40px height) to maximize vertical canvas for documents across 19" screens while remaining prominent on large displays.
- Persistent Start Page:
  * Start Page remains pinned as tab 0 rather than being replaced or closed. This allows users to effortlessly switch back, browse recent files, or drag-and-drop new files without losing opened sessions.
- Direct Action Buttons vs Template Menus:
  * Suite cards originally contained dropdown menus for templates. Per user guidance, these were removed to eliminate UI friction, leaving clean, single-click launch buttons.


4. IDEAS & ROADMAP FOR FUTURE RELEASES (HANDOVER TO TEAM 2)
-----------------------------------------------------------
Team 2 is invited to consider the following enhancements for Hub Office and System tools:

A. Hub Office Enhancements:
   1. Unsaved Changes Guard:
      - Coordinate with child iframes via postMessage to check for unsaved edits before closing a document tab or switching away.
   2. Tab Bar Overflow & Scrolling:
      - On smaller screens (e.g. 19" monitors) when >8 tabs are open, implement horizontal wheel scroll and left/right overflow chevron buttons (`<` and `>`), or an overflow dropdown (`»`).
   3. Drag-to-Reorder Tabs:
      - Implement HTML5 drag-and-drop reordering for tabs on the top tab bar.
   4. Inter-App Data Dragging / Embedding:
      - Allow dragging tables/charts from Spreadsheet tabs directly into an active Writer document tab.
   5. Dedicated Templates Gallery:
      - If templates are requested again, implement a dedicated "Templates Gallery" modal or sidebar section rather than per-tile dropdown menus.
   6. Session Restore:
      - Option to save open tab state in localStorage / OPFS and restore active document sessions on launch.

B. System & Tooling:
   - Monitor OPFS storage limits when staging large files in Terminal BusyBox.
   - Expand FsDrives file search capabilities across subdirectories.


5. REPOSITORY STATUS & VERIFICATION
-----------------------------------
- Repository: Clean working trees in /home/bot/hub-os and /home/www/sites.
- Branch: main (synced with origin/main).
- Passing Tests:
  * apps/office/hub-office/tests/hub_office.test.cjs (9/9 passed)
  * apps/office/notely/tests/nl4.test.cjs (passed)
  * apps/office/notely/tests/nl5.test.cjs (passed)
- Pull Requests merged during shift:
  * PR #634: Office: Add Hub Office suite Start Center (apps/office/hub-office/)
  * PR #635: Office: Tabbed suite container and clean launch cards for Hub Office
  * PR #636: Office: Fix suite iframe relative URL resolution in Hub Office

Handover completed at 21:00 IST on Nov 17, 2026.
Best of luck to Team 2!
