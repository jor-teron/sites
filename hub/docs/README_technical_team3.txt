================================================================================
 README_technical_team3.txt  -  Team 3, week 1 technical report and handover
================================================================================

 Week:      Team 3 week 1, Thu 22 Oct 2026 to Sat 24 Oct 2026.
            (Some Games work below starts on Wed 21 Oct; it is included so the
            list is complete.)
 Next:      Team 3 rests after Sat 24 Oct and next starts Thu 29 Oct or later.
            Team 1 starts around Mon 26 Oct. Team 2: dates not set yet.
 Times:     All times are IST (UTC+5:30), taken from the merge commits on
            origin/main.
 Links:     PR N = https://github.com/jor-teron/sites/pull/N
 Release:   This file was written as release D2 (docs only, no build bump).

 HANDOVER RULE (all teams)
   1. Read this file before touching anything.
   2. Pull main first (git fetch, branch off a fresh origin/main).
   3. Leave your own notes in your own team doc (README_technical_team1.txt,
      README_technical_team2.txt, README_technical_team3.txt). Do not edit
      another team's doc. Add new weeks as a new dated section at the end.

 CONTENTS
   0. Header (this part)
   1. Start here: who looks after what, workflow, release ids, build number
   2. How the Hub works now
   3. Releases 21-24 Oct, by area
   4. Apps added, updated and renamed
   5. Parked and unreleased (T5 BusyBox in full)
   6. Decisions Jor made
   7. Known bugs and backlog
   8. Care notes for Team 1 and Team 2
   9. Learn category: plan and finalized topics (added in D3)


================================================================================
 1. START HERE
================================================================================

1.1 Who looks after which folders
---------------------------------
 The whole repo is one team effort, split in three sides so two people never
 edit the same file at the same time. Team 1 and Team 2 will handle all of it
 next, so treat these as "areas", and take the care notes in section 8 with
 each area.

 Hub side
   - repo root: hub.html, sw.js, index.html, manifest.webmanifest, README.md,
     tree.txt
   - hub/         (shell, menu, window manager, service worker, docs, tools)
   - apps/system/ (Settings, About, Files, Disk, Viewer, System Monitor,
                   Device Benchmark, Terminal, App Hub, system-apps.csv)
   - shared/      (fs, google, tiles, dialog, favorites, wallpaper ... used by
                   many apps)
   - the category menu wiring (hub_config.js, hub_apps.js, hub.js CAT_PAGES,
     hub_sw.js cache lists, hub_catalog.js, hub_appindex.js)

 Games side
   - apps/games/  (every game, games-apps.csv)
   - apps/learn/  (the Learn category, learn-apps.csv, the Learn kit
                   apps/learn/common, First Aid, English Basic)
   - The Learn category belongs to the Games side. (Its first scaffold, LN1,
     was built on the Apps side by mistake; ownership was then given to the
     Games side by Jor.)

 Apps side
   - every other apps/* folder: office, tools, media, connectivity, lab, ...
   - apps/office/shared (shared by Draftly, Spreadsheet and PDF Tools)
   - tv/ at the repo root

1.2 Workflow
------------
 - No coding until Jor confirms with "code", "go" or "build". Before that,
   only read, plan and explain.
 - "push" or "merge" from Jor both mean: push the branch, open the PR, merge
   it into main. Nothing is pushed without his word.
 - One release = one branch off a fresh origin/main = one PR.
   Fetch/pull and rebase (or check `git merge-tree`) right before merging.
 - Tests run only when Jor asks for them. When they do run, the usual check is
   headless Chrome at 390x844 (phone) and 1280x800 (desktop), over http and
   over file://.
 - Everything is static HTML/CSS/JS. No build step. Must work from file://.

1.3 Release ids (tags)
----------------------
 Every release and fix has an id. It goes in the commit message, the PR title
 and the chat. Letters on the Hub side:
   H    Hub shell (menu, desktop, settings wiring)      e.g. H7, H8, H9
   AH   App Hub (apps/system/apphub/)                   e.g. AH1..AH5
   T    Terminal (apps/system/terminal/)                e.g. T1..T4, T5 parked
   FS   file:// fixes                                   FS1 (= R59)
   SW   service worker / offline cache
   D    docs only                                       e.g. D (build history),
                                                        D2 (this file)
   R    the old numbering used before 23 Oct (R53..R59)
 Fixes and bugs hang off the id: H3-F1 (fix), H6-B1 (bug).
 The Games and Apps sides use per-app ids, for example:
   TLQ1f (Turbo Lap), PGQ1a (Ping Pong), DRQ1a (Dino Run), GSQ1b (Gravity
   Sandbox), LRN1a (Learn), MM6 (Draftly Merge), CL5 (Code Lab), S4 (SSH),
   TV7 (TV), SR3 (Sound Recorder). "R" inside a game id (DRR1a, PGR1a) means a
   restructure, "Q" means quality/content, "-F1" a follow-up fix.

1.4 Build number
----------------
 - Only the Hub side bumps the Hub build number, only for big Hub releases,
   and only when Jor says so.
 - Always bump with the script, never by hand:
     python3 hub/tools/hub_bump.py --check                (all 7 places agree?)
     python3 hub/tools/hub_bump.py --release H10 --dry-run (show, write nothing)
     python3 hub/tools/hub_bump.py --release H10           (do it)
   The 7 places are listed in section 8.3. Current build (end of week):
   20261023q / hub-shell-v95, release H8 (hub/build.txt).
 - Games, Learn and Apps changes NEVER bump the Hub build. Categories have no
   build-number file. They version per release instead: the app's own
   ?v=<id> on its css/js links, and the release label in the app's <title>.
 - Small Hub releases (T4, H9, D, D2) went out with no bump.

1.5 Build history files
-----------------------
 hub/docs/build_history_2025.txt and hub/docs/build_history_2026.txt.
 One line per release (not per commit):
     DATE , BUILD => note
     2026-10-23 , 20261023q => Hub: H8 D-Pad Controller hidden ...
     2026-10-23 , TLQ1c => Games: Turbo Lap 100 generated circuits
 BUILD is the Hub build tag, or the release id, or (before ids existed) the
 commit range. Notes start with the area: Hub, App Hub, Terminal, Games,
 Apps, TV, Misc, Docs. One file per calendar year; a new file each January,
 no other splitting.


================================================================================
 2. HOW THE HUB WORKS NOW
================================================================================

2.1 Where the menu and categories come from
-------------------------------------------
 - hub/core/hub_apps.js  -> window.HUB_APPS_CSV. The legacy menu list. Since
   R33a it keeps only the category rows plus some old app rows; it is not the
   source of truth for apps any more.
 - hub/core/hub_config.js -> window.HUB_CAT_CSV. One line per category:
     Learn: 'apps/learn/learn-apps.csv',   // H9
   The ORDER of this object sets the menu order and the hash ids. Do not
   reorder it.
 - Category CSVs, one per category folder: apps/<cat>/<cat>-apps.csv.
   These ARE the source of truth.
     # comment lines first (3 lines by convention)
     name, path, icon, newtab, section
   - path:    relative to the CSV's folder; may point into another category
              (../tools/nei-dict/); a folder (ends in /) or a file.
   - icon:    empty = <folder>/<folder>_icon.png (file x/name.ext ->
              x/name_icon.png). Set it when the file name differs, e.g.
              ../lab/code-lab/codelab_icon.png. A missing image shows a letter.
   - newtab:  1 = opens in its own browser tab on the desktop.
   - section: group heading inside that category; first appearance sets the
              order; empty = "Other", shown last.
   - Hide a row by putting "# " in front of it (all readers skip # lines).
 - hub/core/hub_catalog.js -> window.SITES_CSV = {category: exact CSV text}.
   GENERATED. It is the offline / file:// fallback: online the Hub fetches the
   CSV first, so a stale catalog only shows on file://.
 - hub/core/hub_appindex.js -> the app index used on a first visit (#app link,
   last app, saved session) before the CSVs load. Also generated, but rows are
   sometimes hand-edited (see 8.2).
 - Regenerate after ANY CSV edit:
     python3 hub/core/hub_appindex_gen.py --catalog-only
   (--catalog-only = only hub_catalog.js, no Playwright needed.) Commit
   hub_catalog.js with the CSV.
 - hub/core/hub.js CAT_PAGES: category name -> its tiles page
   (apps/<cat>/<cat>.html). Used for icons, "which category am I in", old
   links.
 - hub/update/hub_sw.js: the shell cache lists. Each category's icon and CSV
   are in the precache lists (around lines 55 and 59).

2.2 How to add a new category (worked example: Learn, H9 PR 195)
----------------------------------------------------------------
 Category side (done in LN1, PR 194):
   apps/learn/learn-apps.csv, apps/learn/learn.html (data-csv + shared tiles
   css/js), apps/learn/index.html (redirect keeping ?query/#hash),
   apps/learn/learn_icon.png (128 px), README.md.
 Hub side, 4 edits + the catalog (H9):
   1. hub/core/hub_config.js   add  Learn: 'apps/learn/learn-apps.csv'
   2. hub/core/hub_apps.js     add the Learn category row (legacy menu)
   3. hub/core/hub.js          add  Learn: 'apps/learn/learn.html' to CAT_PAGES
   4. hub/update/hub_sw.js     add learn_icon.png and learn-apps.csv to the
                               cache lists
   5. run hub_appindex_gen.py --catalog-only, commit hub/core/hub_catalog.js
 H9 itself had no build bump.

2.3 App Hub (apps/system/apphub/)
---------------------------------
 - Lists the apps already in the Hub (not a store). Favourites row, category
   tiles, category pages. Opens from Start, the System page, or #apphub.
 - AH2: pressing a category anywhere in the Hub opens
   apps/system/apphub/#cat=<Category>. The old <cat>.html pages still exist
   and still work on their own.
 - AH3: File-Explorer-style breadcrumb "App Hub > Category" instead of Back.
 - AH4: the top row is exactly 40 px on every page (32 px icon + 4 px padding;
   the bottom line is a box-shadow so it adds no height).
 - AH5: the top-row icon is always the App Hub icon.

2.4 Desktop: "Show Files on the desktop"
----------------------------------------
 - H7: the Files pane on the Desktop home (hub/drives/hub_drives.js + .css)
   is plain desktop icons on the wallpaper, like a real OS.
 - Settings > Desktop > "Show Files on the desktop" (key showFiles, default
   on, '0' = off). Code: apps/system/settings/sec_desktop.js; applied live by
   hub_prefs.js and hub_drives.js. Files stays in Start and App Hub when off.
 - H6-B1: Show desktop on the taskbar only minimises/restores; the "Home
   button" setting (homeBtn) is for Phone mode only.

2.5 Terminal (apps/system/terminal/)
------------------------------------
 - Green on black, listed in System. Files: terminal.js (shell, commands),
   terminal_fs.js (file tree), terminal_wr.js (write commands), terminal_edit.js
   (edit), terminal.css, README.md.
 - Prompt: hub@hub:<cwd>$  (T4; was jor@hub).
 - The tree is made up on top of the shared drive code (shared/fs/fs_drives.js
   and shared/fs/fs_ops.js), shared/fs is not changed by the Terminal:
       /                    holds only drive
       /drive/              every drive, one folder each
       /drive/local/        the Local drive (OPFS); ~ is here
       /drive/gdrive/       Google Drive ("hub" folder), when signed in
       /drive/<folder>/     each folder added with "Add folder" in Files
   Mount names are kept in localStorage 'hub-terminal.mounts'; cwd in
   'hub-terminal.cwd'.
 - Commands: help clear echo date history apps open build theme (T1);
   pwd cd ls cat head tail wc tree stat drives allow (T2);
   mkdir touch cp mv rm rmdir edit find grep, > and >> (T3).
 - SSH: the SSH app stays standalone (apps/connectivity/ssh). When the
   Terminal uses SSH it must LOAD the SSH app's UI-free modules from there
   (ssh_conn.js, ssh_store.js, the S4 key files ssh_keys.js / ssh_keyring.js).
   Never copy them into the Terminal. (No ssh command is wired in the
   Terminal yet.)


================================================================================
 3. RELEASES 21-24 OCT, BY AREA
================================================================================
 Format: DATE TIME , ID => note (PR link). Earlier history:
 hub/docs/build_history_2026.txt.

3.1 Hub
-------
2026-10-22 12:47 , R53 => System category; Settings and About moved to apps/system/ (https://github.com/jor-teron/sites/pull/99)
2026-10-22 12:47 , R53b => Files, Viewer, System Monitor, Device Benchmark moved to apps/system/ (https://github.com/jor-teron/sites/pull/101)
2026-10-22 12:47 , R53c => D-Pad Controller listed under System (https://github.com/jor-teron/sites/pull/103)
2026-10-22 12:48 , R54 => new Disk system app (https://github.com/jor-teron/sites/pull/105)
2026-10-22 12:48 , R54b => Files only browses, desktop Files pane, manage in Disk (https://github.com/jor-teron/sites/pull/106)
2026-10-22 19:08 , (no id) => lab -> games folder moves (aeroplane, hero-builder ...) and games-apps.csv update, direct commit 56d15a2 by Jor (no PR)
2026-10-23 01:14 , R56 => Phone-mode idle check for 09:00 refresh, lab->games redirect stubs, locked folders show Allow access (https://github.com/jor-teron/sites/pull/113)
2026-10-23 01:14 , R57 => origin checks for hub_link, hub_settings, hub_saver; safe html-include errors (https://github.com/jor-teron/sites/pull/114)
2026-10-23 01:14 , R58 => service worker install/image refresh fixes, update check guards, loader retry order, manifest icons, old deep links (https://github.com/jor-teron/sites/pull/115)
2026-10-23 07:07 , FS1 (R59) => file:// fixes: manifest link on http(s) only, guarded frame reads, update check says not available on file:// (https://github.com/jor-teron/sites/pull/128)
2026-10-23 07:07 , H3 => hub/tools/hub_bump.py bumps the build in all 7 places (https://github.com/jor-teron/sites/pull/129)
2026-10-23 08:04 , H5 => menu active row follows the theme; Settings note for the Home button (https://github.com/jor-teron/sites/pull/140)
2026-10-23 11:11 , H6-B1 => Show desktop no longer opens App Hub; Home button setting is Phone mode only (https://github.com/jor-teron/sites/pull/155)
2026-10-23 14:02 , H7 => lean icon-grid Files pane on the Desktop + Settings switch "Show Files on the desktop" (https://github.com/jor-teron/sites/pull/164)
2026-10-23 18:51 , H8 => D-Pad Controller hidden from System; stale pong/ references fixed to ping-pong/ (https://github.com/jor-teron/sites/pull/179)
2026-10-24 03:05 , H9 => Learn category in the Hub menu (config, menu row, category page, offline cache, catalog), no bump (https://github.com/jor-teron/sites/pull/195)

3.2 Terminal
------------
2026-10-23 07:07 , T1 => new Terminal in System: help/clear/echo/date/history/apps/open/build/theme, Tab completion (https://github.com/jor-teron/sites/pull/135)
2026-10-23 08:59 , T2 => unix-style /drive tree and read-only file commands (https://github.com/jor-teron/sites/pull/145)
2026-10-23 10:07 , T3 => mkdir/touch/cp/mv/rm/rmdir, > and >>, edit, find, grep (https://github.com/jor-teron/sites/pull/152)
2026-10-23 21:06 , T4 => prompt is hub@hub:, no bump (https://github.com/jor-teron/sites/pull/183)

3.3 App Hub
-----------
2026-10-23 07:08 , AH1 => App Hub: favourites row, category tiles/pages, #cat routing; AH1-F1 Home button setting (https://github.com/jor-teron/sites/pull/137)
2026-10-23 12:25 , AH2 => Hub categories open the App Hub category page (#cat=<Category>) (https://github.com/jor-teron/sites/pull/156)
2026-10-23 14:02 , AH3 => breadcrumb App Hub > Category replaces Back (https://github.com/jor-teron/sites/pull/163)
2026-10-23 14:23 , AH4 => top row exactly 40px on home and category pages (https://github.com/jor-teron/sites/pull/165)
2026-10-23 14:40 , AH5 => top-row icon is always the App Hub icon (https://github.com/jor-teron/sites/pull/172)

3.4 Docs
--------
2026-10-22 15:41 , Docs => README_technical_20261023.txt technical handover (now README_technical_team2.txt) (https://github.com/jor-teron/sites/pull/111)
2026-10-23 21:12 , D => build_history_2025.txt added (https://github.com/jor-teron/sites/pull/184)
2026-10-23 21:32 , D => build_history_2026.txt added (https://github.com/jor-teron/sites/pull/185)
2026-10-23 21:34 , D => build history files use => instead of -> (https://github.com/jor-teron/sites/pull/186)
2026-10-23 21:56 , (no id) => "Restructure technical files", direct commit d99e0a7 by Jor: README_technical.txt -> README_technical_team1.txt, README_technical_20261023.txt -> README_technical_team2.txt, empty README_technical_team3.txt (no PR)
2026-10-23 23:33 , D => build_history_2025.txt date separator "," (https://github.com/jor-teron/sites/pull/189)
2026-10-23 23:34 , D => build_history_2026.txt date separator "," (https://github.com/jor-teron/sites/pull/190)
2026-10-24 , D2 => this file (not merged when written)

3.5 Games
---------
2026-10-21 01:09 , Desert Road => restructure, detailed car and obstacles (https://github.com/jor-teron/sites/pull/17)
2026-10-21 07:02 , Contra (alpha) => restructure, detailed 2D models (https://github.com/jor-teron/sites/pull/19)
2026-10-21 07:15 , Neon Raid => Contra renamed to Neon Raid (https://github.com/jor-teron/sites/pull/20)
2026-10-21 09:20 , Neon Raid => Large/Small character size (https://github.com/jor-teron/sites/pull/33)
2026-10-21 09:34 , Car Run => crashed car keeps smoking (https://github.com/jor-teron/sites/pull/34)
2026-10-21 09:54 , Car Run => HP, cones, pothole, smoke, FPS counter (https://github.com/jor-teron/sites/pull/37)
2026-10-21 10:31 , Car Run => smoke moved to rear (https://github.com/jor-teron/sites/pull/38)
2026-10-21 10:58 , Car Run => realistic obstacle mix (https://github.com/jor-teron/sites/pull/39)
2026-10-21 11:17 , Turbo Lap => new arcade racer (PC) (https://github.com/jor-teron/sites/pull/40)
2026-10-21 12:00 , Turbo Lap => touch controls + AUTO GAS (https://github.com/jor-teron/sites/pull/43)
2026-10-21 13:28 , Neon Fist => character viewer (https://github.com/jor-teron/sites/pull/46)
2026-10-21 14:00 , Neon Fist => in games menu (Arcade) (https://github.com/jor-teron/sites/pull/48)
2026-10-21 14:28 , Neon Fist => realism step 1 (https://github.com/jor-teron/sites/pull/49)
2026-10-21 15:41 , AoE RTS => moved to games, berries, villagers (https://github.com/jor-teron/sites/pull/56)
2026-10-21 15:54 , AoE RTS => slimmer HUD (https://github.com/jor-teron/sites/pull/58)
2026-10-21 16:21 , AoE RTS => procedural maps 00-99 (https://github.com/jor-teron/sites/pull/62)
2026-10-21 16:51 , AoE RTS 2a => speed, female villagers, ponds, pathfinding (https://github.com/jor-teron/sites/pull/65)
2026-10-21 17:19 , AoE RTS 2c => animals (https://github.com/jor-teron/sites/pull/69)
2026-10-21 19:41 , AoE RTS => per-map saves + map picker (https://github.com/jor-teron/sites/pull/78)
2026-10-21 20:12 , AoE RTS R3+R4b => refactor + no edge scroll (https://github.com/jor-teron/sites/pull/79)
2026-10-21 20:24 , AoE RTS R2b => terrain (https://github.com/jor-teron/sites/pull/80)
2026-10-21 20:24 , Snake => refactor (https://github.com/jor-teron/sites/pull/81)
2026-10-21 20:37 , Neon Fist R1b => layout (https://github.com/jor-teron/sites/pull/82)
2026-10-21 20:52 , Neon Fist R2a => fighter generator 00-99 (https://github.com/jor-teron/sites/pull/83)
2026-10-21 21:04 , Chess => refactor + move animation (https://github.com/jor-teron/sites/pull/84)
2026-10-21 21:16 , Neon Fist R2c2 => clothes (https://github.com/jor-teron/sites/pull/85)
2026-10-21 21:24 , Neon Fist R2b => roster grid (https://github.com/jor-teron/sites/pull/86)
2026-10-21 21:33 , Neon Fist R2c1 => bodies, heights, looks (https://github.com/jor-teron/sites/pull/87)
2026-10-21 21:40 , Neon Fist R2c3 => feet, headwear, eyewear (https://github.com/jor-teron/sites/pull/88)
2026-10-21 22:07 , Neon Fist 3D R1 => Hero Builder R1 (https://github.com/jor-teron/sites/pull/89)
2026-10-21 22:22 , Neon Fist 3D => added to the Hub app index (https://github.com/jor-teron/sites/pull/90)
2026-10-21 22:22 , Neon Fist 3D R2 => Builder R2 (https://github.com/jor-teron/sites/pull/91)
2026-10-21 22:35 , Neon Fist 3D v0.4 => Hero Builder v0.4 (https://github.com/jor-teron/sites/pull/92)
2026-10-22 06:33 , Neon Fist 3D v0.5 => Hero Builder v0.5 (https://github.com/jor-teron/sites/pull/93)
2026-10-22 08:56 , Gravity Sandbox + Ant Farm v0.1 => new games + new Lab section in Games (https://github.com/jor-teron/sites/pull/107)
2026-10-23 01:00 , Solar System R1a-R1c => Solar System Explorer (https://github.com/jor-teron/sites/pull/112)
2026-10-23 01:21 , LandCraft L1a-L1b => voxel rewrite (https://github.com/jor-teron/sites/pull/116)
2026-10-23 01:31 , LandCraft L1c => + no header bar (LandCraft, Solar System) (https://github.com/jor-teron/sites/pull/117)
2026-10-23 02:00 , LandCraft L2a+L2b => maps 00-99 + picker (https://github.com/jor-teron/sites/pull/126)
2026-10-23 02:16 , LandCraft L2c => per-map saves (https://github.com/jor-teron/sites/pull/127)
2026-10-23 02:37 , Solar System R2a => realistic planets, rings, Sun (https://github.com/jor-teron/sites/pull/130)
2026-10-23 02:43 , Solar System R2b+R2c => Pluto, moons, belts, Ceres (https://github.com/jor-teron/sites/pull/131)
2026-10-23 02:52 , Solar System R2e => Oort cloud, log scale (https://github.com/jor-teron/sites/pull/132)
2026-10-23 03:04 , Solar System R2e-F1+R2f => Oort edge, long descriptions (https://github.com/jor-teron/sites/pull/136)
2026-10-23 07:35 , AQ1a+AQ1b => Aquarium new game, feeding, water, autosave (https://github.com/jor-teron/sites/pull/139)
2026-10-23 08:14 , SB1a => Sling Birds levels 00-50 + layout (https://github.com/jor-teron/sites/pull/141)
2026-10-23 08:56 , DM1a => Demolisher levels 00-100 (https://github.com/jor-teron/sites/pull/144)
2026-10-23 09:20 , DMR1a-c => Demolisher refactor (https://github.com/jor-teron/sites/pull/147)
2026-10-23 09:43 , DMQ1a => Demolisher SVG art (https://github.com/jor-teron/sites/pull/148)
2026-10-23 10:03 , DMQ1b => Demolisher animation (https://github.com/jor-teron/sites/pull/151)
2026-10-23 10:13 , LCR1a => LandCraft layout (https://github.com/jor-teron/sites/pull/153)
2026-10-23 10:54 , SFR1a+SF1a => Swell Foop layout + 10 block themes (https://github.com/jor-teron/sites/pull/154)
2026-10-23 12:52 , DRR1a => Dino Run restructure (https://github.com/jor-teron/sites/pull/157)
2026-10-23 12:52 , CRR1a => Car Run restructure (https://github.com/jor-teron/sites/pull/158)
2026-10-23 12:52 , TLR1a => Turbo Lap restructure (https://github.com/jor-teron/sites/pull/159)
2026-10-23 12:53 , SNR1a => Snake restructure (https://github.com/jor-teron/sites/pull/160)
2026-10-23 12:53 , SF2a => Swell Foop responsive + fixes (https://github.com/jor-teron/sites/pull/161)
2026-10-23 13:21 , DRQ1a => Dino Run 10 dinos, 10 themes, picker (https://github.com/jor-teron/sites/pull/162)
2026-10-23 14:36 , RDR1a => Desert Road restructure (https://github.com/jor-teron/sites/pull/166)
2026-10-23 14:37 , GSR1a => Gravity Sandbox ui/ rename (https://github.com/jor-teron/sites/pull/167)
2026-10-23 14:37 , SSR1a => Solar System ui/ rename (https://github.com/jor-teron/sites/pull/168)
2026-10-23 14:37 , AQR1a => Aquarium ui/ rename (https://github.com/jor-teron/sites/pull/169)
2026-10-23 14:37 , CHR1a => Chess ui/ rename (https://github.com/jor-teron/sites/pull/170)
2026-10-23 14:37 , ARR1a => AoE RTS ui/ rename (https://github.com/jor-teron/sites/pull/171)
2026-10-23 18:27 , PPR1a => Pong renamed to ping-pong (https://github.com/jor-teron/sites/pull/173)
2026-10-23 18:27 , PGR1a => Ping Pong restructure (https://github.com/jor-teron/sites/pull/174)
2026-10-23 18:27 , PGQ1a => Ping Pong themes (https://github.com/jor-teron/sites/pull/175)
2026-10-23 18:27 , PGQ1c => Ping Pong balls (https://github.com/jor-teron/sites/pull/176)
2026-10-23 18:27 , PGQ1b => Ping Pong paddles (https://github.com/jor-teron/sites/pull/177)
2026-10-23 18:48 , PGQ1d => Customize button in the Hub header for Ping Pong (https://github.com/jor-teron/sites/pull/178)
2026-10-23 19:43 , TLQ1c => Turbo Lap 100 circuits (https://github.com/jor-teron/sites/pull/180)
2026-10-23 20:24 , TLQ1b => Turbo Lap 10 themes (https://github.com/jor-teron/sites/pull/181)
2026-10-23 21:35 , TLQ1a => Turbo Lap 10 cars (https://github.com/jor-teron/sites/pull/187)
2026-10-24 01:21 , TLQ1e => Turbo Lap floating analog joystick (https://github.com/jor-teron/sites/pull/192)
2026-10-24 12:08 , TLQ1f => Turbo Lap route previews on Circuits tiles and start page (https://github.com/jor-teron/sites/pull/200)
2026-10-24 20:06 , GSQ1a => Gravity Sandbox black hole swallows and grows (https://github.com/jor-teron/sites/pull/201)
2026-10-24 20:20 , GSQ1b => Gravity Sandbox structure + black hole light bending (https://github.com/jor-teron/sites/pull/202)
2026-10-24 22:06 , PPQ1a => Ping Pong 4 new paddles (Cricket Bat, Hockey Stick, Samurai Sword, Tennis Racket) (https://github.com/jor-teron/sites/pull/203)

3.6 Learn
---------
2026-10-24 02:53 , LRN1a => Learn kit apps/learn/common + First Aid (https://github.com/jor-teron/sites/pull/193)
2026-10-24 03:02 , LN1 => Learn category scaffold: learn-apps.csv, learn.html, index.html, learn_icon.png, README (https://github.com/jor-teron/sites/pull/194)
2026-10-24 03:05 , H9 => Learn in the Hub menu (see 3.1) (https://github.com/jor-teron/sites/pull/195)
2026-10-24 03:19 , LRN1b => First Aid breadcrumb header (https://github.com/jor-teron/sites/pull/196)
2026-10-24 03:40 , LRN1c => Done button, Quick check, neutral palette, no link underline (https://github.com/jor-teron/sites/pull/197)
2026-10-24 03:49 , LRN2a => English Basic (6 topics, kit unchanged) (https://github.com/jor-teron/sites/pull/198)
2026-10-24 03:53 , LRN2b => English Basic row in learn-apps.csv + hub_catalog.js regenerated (https://github.com/jor-teron/sites/pull/199)

3.7 Apps / Office
-----------------
2026-10-22 07:42 , Stopwatch => new app (https://github.com/jor-teron/sites/pull/94)
2026-10-22 07:50 , U1-U4 => Unit Converter, new app (https://github.com/jor-teron/sites/pull/95)
2026-10-22 08:03 , C1+C3+C4 => Calendar, new app, fixed holidays (https://github.com/jor-teron/sites/pull/96)
2026-10-22 08:14 , SR1-SR3 => Sound Recorder, new app (https://github.com/jor-teron/sites/pull/97)
2026-10-22 08:57 , Spreadsheet => refactor into modules, no behaviour change (https://github.com/jor-teron/sites/pull/98)
2026-10-22 08:58 , Spreadsheet => ribbon (File/Home/Insert/Data) (https://github.com/jor-teron/sites/pull/100)
2026-10-22 08:58 , P1 => PDF Tools, new app, page organiser (https://github.com/jor-teron/sites/pull/104)
2026-10-22 08:59 , Draftly => uses the shared Office dialog + page setup (https://github.com/jor-teron/sites/pull/102)
2026-10-22 09:47 , S1 => SSH, new app (https://github.com/jor-teron/sites/pull/108)
2026-10-22 10:24 , N1 => Code Lab, new app (Jupyter-style cells on a remote Jupyter server) (https://github.com/jor-teron/sites/pull/109)
2026-10-22 13:03 , Code Lab => auth fix: token on every request, clearer connect errors (https://github.com/jor-teron/sites/pull/110)
2026-10-23 01:48 , Draftly => orientation saved under draftly_orientation (was 'undefined'), with migration (https://github.com/jor-teron/sites/pull/125)
2026-10-23 02:54 , S3 => SSH saved hosts, known_hosts, keepalive, auto-reconnect (https://github.com/jor-teron/sites/pull/133)
2026-10-23 02:54 , S4 => SSH public-key login (ECDSA/RSA), key generate, encrypted key storage (https://github.com/jor-teron/sites/pull/134)
2026-10-23 07:19 , Sketchbook => Lab Notebook renamed to Sketchbook (folder, files, storage keys migrated) (https://github.com/jor-teron/sites/pull/138)
2026-10-23 08:18 , CL2 => Code Lab security: sandboxed HTML output, validated saved data, confirms (https://github.com/jor-teron/sites/pull/142)
2026-10-23 08:20 , CL3 => Code Lab connection loss, kernel reattach/shutdown, run timeout (https://github.com/jor-teron/sites/pull/143)
2026-10-23 09:10 , CL3-F1 => Code Lab Start/Restart/Stop moved left (https://github.com/jor-teron/sites/pull/146)
2026-10-23 09:53 , CL4 => Code Lab output module split, \r and \b handling, output cap (https://github.com/jor-teron/sites/pull/149)
2026-10-23 09:54 , CL5 => Code Lab keyboard + screen-reader accessibility (https://github.com/jor-teron/sites/pull/150)
2026-10-23 20:28 , MM1 => Draftly Merge ribbon tab, CSV mail merge, live refresh, export all (https://github.com/jor-teron/sites/pull/182)
2026-10-23 23:16 , MM3 => Draftly .xlsx import for Merge with sheet picker (https://github.com/jor-teron/sites/pull/188)
2026-10-24 00:19 , MM6 => Draftly real WordprocessingML DOCX export (modules/draftly-docxgen.js); fixes blank DOCX in LibreOffice (https://github.com/jor-teron/sites/pull/191)

3.8 TV (root tv/)
-----------------
2026-10-23 01:31 , TV4 => legacy v2/v3 and orphaned files moved to tv/legacy/ (https://github.com/jor-teron/sites/pull/118)
2026-10-23 01:31 , TV1 => vendored hls.js, local no-signal poster, load guard, M3U name parser fix (https://github.com/jor-teron/sites/pull/119)
2026-10-23 01:31 , TV2 => works from file:// via generated .m3u.js playlists (https://github.com/jor-teron/sites/pull/120)
2026-10-23 01:32 , TV3 => split into tv/core modules, renamed to tv.html, storage key tv-last-v1 (https://github.com/jor-teron/sites/pull/121)
2026-10-23 01:32 , TV5 => grid-aware arrows, error toast, Hub tile in frame, http-only channels (https://github.com/jor-teron/sites/pull/122)
2026-10-23 01:32 , TV6 => India tile moved inside More (https://github.com/jor-teron/sites/pull/123)
2026-10-23 01:32 , TV7 => Import tile in More (file, drop, URL) saved in IndexedDB (https://github.com/jor-teron/sites/pull/124)


================================================================================
 4. APPS ADDED, UPDATED AND RENAMED
================================================================================

4.1 Added
---------
 Hub / System
   - apps/system/terminal      Terminal (T1-T4)
   - apps/system/apphub        App Hub (AH1-AH5)
   - apps/system/disk          Disk (R54)
   - Learn category in the Hub menu (H9)
 Games
   - apps/games/aquarium, solar-system, gravity-sandbox, ant-farm,
     neon-fist-3d (+ Hero Builder), landcraft (voxel rewrite)
   - Turbo Lap (new arcade racer, 21 Oct)
 Learn
   - apps/learn/ category (learn-apps.csv, learn.html, index.html, icon)
   - apps/learn/common (shared Learn kit, window.LRN)
   - apps/learn/first-aid, apps/learn/english-basic
 Apps
   - apps/tools/stopwatch, apps/tools/unit-converter, apps/tools/calendar
   - apps/media/sound-recorder
   - apps/office/pdf-tools
   - apps/connectivity/ssh
   - apps/lab/code-lab

4.2 Renamed or moved
--------------------
   - apps/games/pong -> apps/games/ping-pong (PPR1a)
   - apps/lab/notebook -> apps/lab/sketchbook (redirect stub left at
     apps/lab/notebook/index.html; storage keys migrated)
   - Contra (alpha) -> Neon Raid (display name, PR 20)
   - tv v1 -> tv/tv.html; legacy pages -> tv/legacy/
   - Settings, About, Files, Viewer, System Monitor, Device Benchmark ->
     apps/system/ (R53, R53b)
   - aeroplane, hero-builder and other lab games -> apps/games/ (22 Oct)
   - Docs: README_technical.txt -> README_technical_team1.txt,
     README_technical_20261023.txt -> README_technical_team2.txt

4.3 Updated
-----------
 Games: turbo-lap, car-run, dino-run, snake, desert-road, chess, aoe-rts,
   neon-fist, demolisher, sling-birds, swell-foop, ping-pong, gravity-sandbox.
 Content added:
   - AoE RTS maps 00-99; Neon Fist fighters 00-99; LandCraft maps 00-99
   - Sling Birds levels 00-50; Demolisher levels 00-100
   - Turbo Lap: 100 circuits, 10 themes, 10 cars, floating joystick, route
     previews
   - Dino Run: 10 dinos, 10 themes; Swell Foop: 10 block themes
   - Ping Pong: 5 themes, 5 balls, 9 paddle models (5 shown, old ones hidden)
   - Gravity Sandbox: new Black hole preset, light bending
 Apps: apps/office/spreadsheet, apps/office/draftly (Merge, DOCX),
   apps/office/shared, tv/, apps/lab/sketchbook, ssh (S3, S4), code-lab
   (CL2-CL5).
 Hub: System category, Files pane, Settings switch, service worker, file://.


================================================================================
 5. PARKED AND UNRELEASED
================================================================================
 Nothing is unpushed on any side at the end of the week. Everything below is
 a plan only; each needs Jor's "code" first.

5.1 T5: BusyBox in the Terminal (Hub side)
------------------------------------------
 Goal: real Linux commands in the Terminal, on the Hub's /drive files.
 - BusyBox compiled to WebAssembly, kept in apps/system/terminal/bin/:
     busybox.wasm   ~1-2 MB, the compiled BusyBox
     busybox.js     the loader / glue for the wasm
     APPLETS.txt    the list of applets built in
     BUILD.md       how busybox.wasm was built (version, config, toolchain),
                    so anyone can rebuild it
 - New files:
     terminal_bb.js    runs a BusyBox applet, connects its stdin/stdout/files
                       to the Terminal and to the /drive tree
     terminal_etc.js   the read-only /etc
 - /bin: every applet appears as /bin/<name>, a link to busybox.
 - /etc (read-only): hostname (hub), motd, os-release.
 - cd, pwd, history, clear, exit stay Terminal built-ins.
 - Basic pipes "|" and redirect ">" between commands.
 - One line in hub/update/hub_sw.js so the new files are cached offline.
 - Estimate: 2-4 days. Not started.

 Repo folder after T5:
   apps/system/terminal/
   |-- index.html
   |-- terminal.css
   |-- terminal.js          shell, built-ins (cd pwd history clear exit)
   |-- terminal_fs.js       /drive tree (T2)
   |-- terminal_wr.js       write commands (T3)
   |-- terminal_edit.js     edit (T3)
   |-- terminal_bb.js       NEW: runs BusyBox applets
   |-- terminal_etc.js      NEW: read-only /etc
   |-- terminal_icon.png
   |-- README.md
   `-- bin/
       |-- busybox.wasm     NEW (~1-2 MB)
       |-- busybox.js       NEW
       |-- APPLETS.txt      NEW
       `-- BUILD.md         NEW

 Tree the user sees in the Terminal after T5:
   /
   |-- bin/                 ls, cat, grep, sed, awk, ... -> busybox
   |-- etc/                 read-only
   |   |-- hostname
   |   |-- motd
   |   `-- os-release
   `-- drive/
       |-- local/           ~ (OPFS)
       |-- gdrive/          when signed in
       `-- <folder>/        each "Add folder" drive

5.2 D-Pad Controller link bug (Hub side)
----------------------------------------
 - From the App Hub the D-Pad Controller opened a wrong folder. H8 hid it:
   its row in apps/system/system-apps.csv is commented out:
     # D-Pad Controller, ../../hub/controller/, ../../hub/controller/controller_icon.png, 1, Hub tools
 - To restore: remove the "# " in front of the row and re-run
   hub_appindex_gen.py (and add its entry back to hub_appindex.js).
 - Cause NOT found yet. The hub/controller/ files, the Gamepad tile and the
   pairing link were not changed.

5.3 Games side
--------------
 - Learn: PAUSED by Jor. Next planned step LRN3a: block types in the kit
   (grid, table, example list), tested on English Basic Alphabet, about
   100-170 lines. Later: Markdown (.md) content; First Aid visuals (stills,
   then motion); next starter apps (Life Skills, OS and Devices) undecided.
   Plan is 31 apps in 9 sections (no "Section A/B" labels), Basics plus one
   Expert toggle.
 - Sound for all games: parked.
 - Car Run CRQ1a: planned picker/content release (about 2,200-2,800 lines),
   defined, waiting for "code".
 - Others parked: Tower Defence plan, Space Invaders / Pacman renames, Neon
   Raid / beta renames, Browser FPS left out, Universe Sandbox lite.

5.4 Apps side
-------------
 - Draftly: MM2 (repeating blocks, if-then text, formats), MM4 (Merge PDF
   output; File > Export PDF screenshots the editor so it shows
   {{placeholders}}), MM5 polish. Not planned yet.
 - PE1 Photo Editor: whole toolbar to the left, add Sharpen, save PNG by
   default. Not scoped.
 - Sound Recorder SR4-SR7: review done, split defined, waiting for "go".
 - Code Lab: CL5 phone items (tap targets, collapsing connection bar, token
   storage), CL6 storage, CL7 features, CL8-CL11 Kaggle ideas.
 - SSH: S2 relay hardening parked (Jor: the relay is as intended), S5/S6,
   relay readme guide.
 - TV8: retire apps/lab/iptv-player in favour of tv.html#import, then
   regenerate the catalog. TV extras: bare URL lines, now-playing label,
   letter icons.
 - HW1-HW6 handwriting-to-text learning app (offline, phone/tablet):
   discussion only. It is a Learn app, so it would go to the Games side.
 - IB1 purchase-bill tracker (Jor as buyer, phone, offline, GST bills):
   discussion only. Open: item rows or bill total, CGST/SGST, categories.
 - EB1 electricity bill calculator (editable tariff slabs): discussion only.
   Open: which board; separate app or part of IB1.

5.5 Hub side backlog (not started)
----------------------------------
 See section 7.2.


================================================================================
 6. DECISIONS JOR MADE
================================================================================

6.1 Whole repo
--------------
 - No coding without "code"/"go"/"build". Push only on his word; push = merge.
 - Every release and fix has an id (commit, PR title, chat). The label goes
   only in the app's <title>; assets use ?v=<id>.
 - Static HTML/JS, no build step, must work from file://.
 - vendor/: one per app (e.g. TV vendors hls.js, SSH and Code Lab have their
   own). No shared Learn/Apps vendor folder for now; share one only when two
   apps really need the same library.
 - Small reusable procedural code over heavy code. Art is code-drawn.
 - Tests only when asked.

6.2 Hub side
------------
 - Terminal prompt is hub@hub (T4).
 - Build number: only the Hub side bumps it, only for big releases, only on
   Jor's word, only with hub_bump.py. Categories never bump it.
 - Build history format "DATE , BUILD => note"; one file per year
   (build_history_2025.txt, build_history_2026.txt), no other splitting.
 - Lean desktop that follows real-OS conventions: plain icons on the
   wallpaper, Files pane can be switched off, Show desktop only minimises.
 - The Drive is fully unix-style: / > /drive/ > local, gdrive, <folder>.
 - Linux in the Terminal: the chosen option is BusyBox compiled to
   WebAssembly inside the Terminal (T5), parked for now.
 - D-Pad Controller stays hidden until its link is fixed.
 - Names and files stay as they are; nothing is renamed just to tidy.

6.3 Games side
--------------
 - Game folder layout: index.html (redirect) + <name>.html (main), ui/
   (css, render, screens), core/ (logic only), assets/ (code-drawn),
   vendor/, icon <name>_icon.png at the app root.
 - The Learn category and apps/learn/learn-apps.csv belong to the Games side.
 - Learn style: content in editable text files; it should feel like learning,
   not a test ("Done", "Quick check", no "quiz" wording); calm slate palette,
   no red, no underlined header links; topics merged into a few large apps.
 - Sound parked; Learn paused.
 - Turbo Lap joystick floats under the thumb (no fixed pad).
 - Ping Pong old paddles are kept hidden, not deleted.

6.4 Apps side
-------------
 - SSH stays a standalone app; the Terminal loads its UI-free modules and
   never copies them (see 2.5).
 - Lab Notebook is now Sketchbook.
 - Draftly ribbon label stays "Merge". DOCX fixed at the root (MM6, own
   generator) instead of patching html-docx.
 - Fetch/pull + rebase before every push; tag every release with an id.


================================================================================
 7. KNOWN BUGS AND BACKLOG
================================================================================

7.1 Checked during D2 (24 Oct, origin/main 68a1948)
---------------------------------------------------
 - Missing icons (default file not found):
     LandCraft in apps/games/games-apps.csv: apps/games/landcraft/ has no
       landcraft_icon.png at all (shows a letter tile).
     Code Lab in apps/lab/lab-apps.csv: icon column empty, so it looks for
       code-lab/code-lab_icon.png; the real file is code-lab/codelab_icon.png.
       (learn-apps.csv already sets the icon explicitly.) hub_appindex.js has
       the same wrong path.
     hub_appindex.js also points at apps/lab/notebook/notebook_icon.png (gone
       after the Sketchbook rename).
   contra-alpha and hero-builder also have no root icon, but they are not
   listed in any category CSV, so nothing shows broken.
 - Old notebook paths (Hub side): hub/core/hub_apps.js line 124 and
   hub/core/hub_appindex.js line 72 still point to apps/lab/notebook/. The stub
   redirects to Sketchbook, so low priority.
 - Stale pong/ mentions: NONE left. H8 fixed hub_apps.js; hub_appindex.js and
   hub_catalog.js use ping-pong; hub/docs/hub_readme.md only mentions pong/ in
   the H8 change-log line describing that fix.
 - tree.txt is old: last updated by PPR1a (23 Oct); it has no terminal,
   apphub, sketchbook or english-basic entries and still lists
   README_technical_20261023.txt.

7.2 Hub side
------------
 - hub_appindex_gen.py (noted as H1): a full run reorders hub_appindex.js
   and swaps the notebook/sketchbook rows, giving a large unrelated diff.
   Use --catalog-only, or hand-edit hub_appindex.js, and keep only the
   intended diff.
 - D-Pad Controller link bug (5.2).
 - Desktop: centre the QR/link tiles when Files is switched off.
 - Desktop: icon labels on light wallpapers are hard to read.
 - Optional: a #pong alias so old #pong links open Ping Pong (none today).
 - Category tiles pages (<cat>.html) fail from file:// (they fetch the CSV);
   same for every category.
 - T5 BusyBox (5.1).

7.3 Games side
--------------
 - Turbo Lap: on an upright touch phone the rotate screen covers the menus.
 - Ping Pong: Samurai Sword hit glint briefly draws outside the paddle box
   (visual only); Paddle section is below the fold on 390 px phones.
 - Gravity Sandbox: lensing is subtle when zoomed out; the old paths
   core/render.js and core/ui.js now 404 (nothing in the repo uses them);
   a black hole now always beats heavier stars.
 - First Aid topic emojis and app icon are still red (Learn style says no red).

7.4 Apps side
-------------
 - Draftly MM6 DOCX not yet tested in real MS Word (Jor testing). Only
   PNG/JPEG/GIF images are kept. The combined merge DOCX has one
   header/footer, so a {{field}} in a header/footer comes out blank.
 - Draftly Merge has no PDF output (MM4).
 - Code Lab needs a running Jupyter server + token; phone UX items open.


================================================================================
 8. CARE NOTES FOR TEAM 1 AND TEAM 2
================================================================================

8.1 Git and the box
-------------------
 - Work only in your own clone. Never touch the other clones on the box:
   /workspace/sites, /workspace/sites_apps, /workspace/sites_games (and
   /workspace/sites_hub is the Hub side's). /workspace/sites_apps has about
   205 unrelated uncommitted node_modules/build deletions: do not stash,
   reset or clean it; use a temporary worktree.
 - Branch from a fresh origin/main; check `git merge-tree` (or rebase) right
   before merging. One release = one PR.
 - Local test servers: avoid ports 8811 and 8888 (used by other work).
 - Test with headless Chrome at 390x844 and 1280x800, over http and file://,
   only when Jor asks for tests.

8.2 Catalog and CSVs
--------------------
 - After editing ANY category CSV (games-apps.csv, learn-apps.csv,
   system-apps.csv, ...): run
     python3 hub/core/hub_appindex_gen.py --catalog-only
   and commit hub/core/hub_catalog.js in the same PR.
 - A full generator run also rewrites hub_appindex.js: it reorders rows and
   swaps notebook/sketchbook. Keep only the intended diff (revert the rest or
   hand-edit). Games rows in hub_appindex.js are hand-edited; there are no
   Learn rows.
 - CSV format: comment lines, then "name, path, icon, newtab, section". Empty
   icon = <folder>/<folder>_icon.png. Set the icon when the file name differs.
   Sections are named by topic only.
 - A game with a redirect index.html: keep the CSV path pointing at the
   folder (e.g. landcraft/) so the redirect works.
 - A new category needs the 4 Hub edits + catalog in 2.2.

8.3 Build number (Hub side only)
--------------------------------
 hub_bump.py touches these 7 places; never edit them by hand, never for a
 Games/Learn/Apps change:
   1. hub.html                every ?v=<tag>
   2. sw.js                   importScripts('hub/update/hub_sw.js?v=<tag>')
   3. hub/update/hub_sw.js    const V = '<tag>'
   4. hub/update/hub_sw.js    const CACHE = 'hub-shell-vNN'
   5. hub/menu/hub_ctx.js     const V = '<tag>'
   6. hub/core/hub_loader.js  const V = '<tag>'
   7. hub/build.txt           lines 1-4: tag, cache name, release, date IST
 hub/version.txt (user-facing version) changes only with --version, on Jor's
 word. Run --check before and after.

8.4 Must not break
------------------
 - file:// use: no fetch-only code paths in apps, no build step, no ES
   modules. Plain scripts with namespaced globals (PP, TL, LRN, ...); load
   order matters.
 - Storage keys: never rename one without a migration. Migrations exist for
   Sketchbook (was Notebook), Draftly orientation (draftly_orientation),
   TV (tv-last-v1), Ping Pong saved picks (core/config.js), lab->games moves
   (R56).
 - SSH shared modules (ssh_conn.js, ssh_store.js, S4 key files) must stay
   UI-free and live only in apps/connectivity/ssh.
 - apps/office/shared is used by Draftly, Spreadsheet and PDF Tools: test all
   three after an edit.
 - Draftly: draftly-docxgen.js is the main DOCX path, html-docx only a
   fallback. Earlier checks: MM1 39, MM3 33, MM6 18 checks (headless, http
   and file://).
 - TV: file:// playlists are generated .m3u.js files; keep them in sync with
   the .m3u.
 - Ping Pong: keep the Classic paddle pixel-identical.

8.5 Learn kit (apps/learn/common, window.LRN)
---------------------------------------------
 - Plain scripts, load order matters. The loader fetches .txt files
   relatively, so it needs a web server (not file://).
 - Text format must not change:
     index.txt: title:, disclaimer:, then card ids
     card files: title / icon / summary / call headers, then [basics]
       [expert] [quiz] sections; quiz line = question | right | wrong ...;
       "| drawing: id" is reserved.
 - Storage keys: learn.mode (shared), learn.<app>.viewed, learn.<app>.best.
 - learn-apps.csv: name, path, icon, newtab, section; # comments ok.

8.6 Hub side files you will touch most
--------------------------------------
 - Menu/category wiring: hub/core/hub_config.js, hub_apps.js, hub.js
   (CAT_PAGES), hub/update/hub_sw.js (cache lists), hub_catalog.js.
 - Terminal: apps/system/terminal/*; drive code in shared/fs (shared by Files,
   Viewer, Disk and Terminal: test them together).
 - Desktop Files pane: hub/drives/; setting in apps/system/settings/
   sec_desktop.js.
 - Change log for Hub releases: hub/docs/hub_readme.md (one dated line per
   release) and the build history file.

================================================================================
 End of Team 3 week 1. Next Team 3 section goes below this line.
================================================================================

================================================================================
 9. LEARN CATEGORY: PLAN AND FINALIZED TOPICS (Games side, added in D3)
================================================================================

Status: PAUSED by Jor. The cards were too basic (e.g. Alphabet and Sounds was a
one-line tutorial, not a full A-Z grid). Next step LRN3a (awaiting "Code"): block
types in the kit (grid, table, example list; later diagram and compare), still in
.txt, tested on English Basic > Alphabet and Sounds. Markdown (.md) later, with .txt
kept.

9.1 Rules Jor set
 - Learn is its own category, separate from games. It belongs to the Games side,
   which also owns apps/learn/learn-apps.csv.
 - Teach basics, with one optional Expert toggle (no intermediate level). The shared
   key learn.mode is one preference across all Learn apps.
 - Real-world, real-life tutorials are preferred.
 - Overlapping ideas are merged into broad apps, with topics inside the app (e.g.
   Phone Tips goes inside Operating Systems and Devices; Cooking and Personal Finance
   inside Life Skills).
 - Section names are topic names only, never "Section A/B/C".
 - Content lives in plain editable .txt files (index.txt lists topic order; one .txt
   per topic), so no HTML/JS/CSS edits are needed for content.
 - Shared code folder is apps/learn/common/ (not kit/, modules/ or engine).
 - Feel: learning, not a school test. Last step button is "Done"; the optional quiz
   is called "Quick check" (random questions), shown as the last tile and as a small
   header button inside its own topic. Breadcrumb header (e.g. First Aid > Fainting >
   Quick check), no underlined links, calm neutral slate/grey palette, emergency
   notes as a plain highlighted panel with a bold label.
 - Visuals (code-drawn, maybe motion) are wanted but parked; split releases when big.

9.2 Built and live (finalized topics)
 - First Aid (apps/learn/first-aid/, section Health): Cuts, Burns, Choking, CPR,
   Nosebleed, Sprain, Fainting. Releases LRN1a (#193), LRN1c (#197).
 - English Basic (apps/learn/english-basic/, section Language): Alphabet and Sounds,
   Everyday Words, Simple Sentences, Questions and Answers, Common Phrases, Spelling
   Tips. Releases LRN2a (#198), LRN2b csv row (#199).
 - Also listed in learn-apps.csv (apps owned by the Apps side): NE-India Dictionary,
   Caption for NEI (Language); Learning HTML (Basic), Code Lab (Coding).

9.3 Agreed app plan: 31 apps in 9 sections (Jor: "keep all"; not built yet)
 Nature
   1 Water Kingdom (fish, sharks, whales, coral, rivers, ocean depths)
   2 Animal Kingdom (mammals, birds, insects, reptiles, pets, food chains)
   3 Dinosaur Age
   4 Plant World (trees, flowers, fungi, crops, gardening, biomes)
 Earth and Space
   5 Earth and Atlas (globe, maps, countries, flags, landmarks, rivers and mountains)
   6 Planet Earth (weather, climate, volcanoes, earthquakes, rocks, disasters)
   7 Sky and Space (Sun, stars, Moon, planets, rockets, satellites, future tech)
 Science
   8 Human Body (organs, senses, brain, health, germs, medicine)
   9 Physics Lab (forces, energy, light, sound, electricity, simple machines, optics)
  10 Chemistry and Materials (periodic table, matter, everyday materials)
  11 Life Science (genetics, evolution, microbes)
 Technology
  12 Computers and Internet (hardware, binary, web, networks, safety and cybersecurity)
  13 Operating Systems and Devices (Android, iPhone, Windows, Linux, macOS, shortcuts)
  14 Coding, Data and AI (coding basics, data, spreadsheets, AI, robots, game design)
  15 Electronics and Making (circuits, robotics, DIY)
 Language and Maths
  16 English Basic (introduction, vocabulary, grammar, spelling, writing, idioms)
  17 World Languages (greetings, numbers, phrases, scripts)
  18 Maths and Logic (numbers, shapes, patterns, puzzles, riddles)
 History and World
  19 History and Inventions (timeline, empires, wars and peace, explorers, scientists)
  20 World Cultures (food, festivals, faiths, dress, etiquette)
  21 Civics and Law (government, rights, laws, economics)
 Life Skills
  22 Life Skills (money, cooking, home repair, travel, study skills, emergency skills)
  23 Mind and Society (psychology, family, relationships, philosophy)
  24 Careers and Business (jobs, trade, banks, startups)
  25 Transport and Machines (cars, trains, planes, ships, bridges, car and bike care)
 Arts and Fun
  26 Music Basics
  27 Art, Photo and Film (colour, drawing, cameras, comics and cartoons)
  28 Stories and Mythology (myths, poetry, literature, folk tales)
  29 Sports and Games (rules, events, board games, strategy, dance, magic tricks)
 Outdoors
  30 Survival and Outdoors (camping, knots, navigation, first aid)
 Bonus
  31 Trivia Arena (mixed quiz across all Learn apps)
 Parked from earlier lists: Ocean Floor (folded into Water Kingdom), Flags and
 Countries quiz.

9.4 Real Life direction (wanted by Jor, details not finalized)
 Jor wants real-life tutorials as their own focus. A 34-app Real Life list was
 proposed (home and daily life, money and paperwork, health and safety, getting
 around, tech in real life, family and community, outdoor and DIY), but Jor's later
 direction is to put these in as topics inside the bigger apps above rather than as
 separate apps.
 Suggested next starters (undecided): Life Skills starter (cooking basics, personal
 finance, study skills, fire safety); Operating Systems and Devices starter (phone
 tips, Android basics, passwords).

9.5 How to add a Learn app
 New folder apps/learn/<app>/ with index.html (redirect), <app>.html,
 <app>_icon.png, core/app.js, assets/data/index.txt + one .txt per topic, loading
 ../common/. Then add a row to apps/learn/learn-apps.csv, a README line, and run
 python3 hub/core/hub_appindex_gen.py --catalog-only (commit hub_catalog.js in the
 same commit). Never bump the Hub build.

================================================================================
 End of section 9 (D3). Next Team 3 section goes below this line.
================================================================================

-- Testing rule (Jor, 30 Oct 2026) --
- Do NOT test by default after coding. When a release is built, ask Jor:
  "test it, or push directly?" He decides. A quick syntax check
  (node --check) is always fine.
- "Test" means: open the app in a real headless Chromium (Playwright,
  /workspace/.venv-pw/bin/python), drive it with a script like a user,
  check results, take screenshots, and fix bugs found before pushing.
- Serve over http on ports 18890+ (never 8888); kill only your own pids.
- Limits: file-manager paste and drag-drop are simulated events; phones,
  real Microsoft Word and the real OS clipboard are not covered. Say
  clearly in the report what was real and what was mocked.

-- H75: Hub draws shared dialogs (31 Oct 2026) --
- Apps keep calling UiDialog.ask / confirm / choose / info (shared/dialog).
  Inside the Hub the call is posted to hub.html, which shows its own
  dialog over the whole desktop and posts the answer back.
- Hub side: hub/core/hub_dialog_bridge.js (sets window.__hubDialogHost).
  Same origin only, sender must be a Hub iframe, 4 methods only.
- Standalone, file://, or no Hub ack within 400 ms: drawn in the app as
  before. UiDialog.local.* always draws in the page itself.
- Apps must load shared/dialog/dialog.js to get this (devbench: H76).
-- H76: Devbench delete confirm (31 Oct 2026) --
- Devbench History "Delete all" now uses UiDialog.confirm (red Delete).
  Browser confirm stays only as a fallback if shared/dialog is missing.
- devbench.html links shared/dialog/dialog.css + dialog.js (relative,
  no ?v=). With H75 merged the Hub draws it over the whole desktop.

-- H77: Who holds the public lobby (31 Oct 2026) --
- The 0000 lobby now says who it is: welcome / roster / bye 'site' carry
  lobby {dev, name, site}. Members keep it (roster only from the lobby).
- HubMesh.lobbyInfo() → {dev, name, site, self} or null.
- Settings > Devices > Public mesh: "Lobby: this device" or
  "Lobby: <name> (<site>)", plus "· different site" if it is not this
  site. Also shown while Refused (site) when the holder sent its info.
- Older Hubs send nothing, so the line stays hidden until they update.

-- H78: Redirect pages, no flash (31 Oct 2026) --
- My 9 redirect pages (root index.html, apps/system/, apps/system/about/
  index + about / contact / feedback.html, apps/system/devbench/,
  hub/controller/ index + dpad.html) now copy Hub Apps Bot's IX1
  pattern (apps/index_redirects_readme.md): head script location.replace
  keeps ?query and #hash (About always goes to #about), meta refresh and
  the "Open …" link only in <noscript>, so no body text flashes.
- Colour follows the Hub theme before paint (sites-hub.theme, else the
  device setting). Each page keeps a one-line legacy comment on top.

NV-S2 (hub.html ?v= labels)
- hub.html keeps one ?v= label only, on hub/core/hub.js. Settings > About,
  HubUpdate (build tag + update check) and hub_bump.py read the build there,
  so don't remove it. Every other src / href is bare; the service worker
  stores shell files under origin + pathname, so no label is needed.
