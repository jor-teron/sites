================================================================================
 jor-teron/sites: Technical Handover
================================================================================
 Snapshot date : 2026-10-23 (prepared 2026-10-22, IST)
 Based on      : origin/main @ 44ddd7d
 Hub build     : 20261022e / hub-shell-v78 (release R54b)

 PURPOSE
   Lets a new developer pick up the Hub, the Apps and the Games and continue
   the project: what exists, where it lives, how it works, what was learned,
   known bugs, unreleased work, and what is planned or parked.

 AUTHORS
   Part 1  Hub   - Monorepo Hub Bot   (hub/, apps/system/, shared hub code)
   Part 2  Apps  - Monorepo Apps Bot  (apps/* except games and system)
   Part 3  Games - Monorepo Games Bot (apps/games/)

 CONTENTS
   Notes (read first)
   Part 1  Hub   - Technical Handover
   Part 2  Apps  - Technical Handover
   Part 3  Games - Technical Handover

 LEGEND
   [unverified]  The author could not confirm this; check before relying on it.

 HOW TO USE WITH README_technical.txt
   hub/docs/README_technical.txt is the deep-dive guide to the Hub and virtual
   desktop (module specs, build bump in section 13). This file is a dated
   snapshot covering all three areas. Start here for orientation, then use
   README_technical.txt and each file's header comment for detail.
   Later snapshots can sit beside this one by date.

================================================================================
 NOTES (read first)
================================================================================
 - apps/lab/hero-builder (a Three.js viewer v1) was not deleted: it moved to
   apps/games/hero-builder (node_modules still committed, 213 tracked files;
   corrected in Hub R58). The "deleted" files seen in older local clones are
   the old apps/lab/ paths. Removing node_modules from git is a separate
   decision for Jor.
 - One apps/games/ar-game vendor file (three.module.min.js) is also missing
   on disk in local clones. Noted only, not fixed.
 - Check whether shared/script/api_keys.js holds a live secret.
 - The apps/tools/vDesktop/wallpaper.csv path is no longer referenced on main
   and may already be resolved.


================================================================================
 PART 1: Hub
================================================================================

# Hub side — Technical Handover (Monorepo Hub Bot)

Repo: jor-teron/sites, branch main. Checked against origin/main after `git fetch` on 22 Oct 2026, ~15:40 IST (build 20261022e / hub-shell-v78, release R54b, all 5 R53–R54b PRs merged).
Sources: `git ls-tree` / `git show` / `git grep` on origin/main, `git log origin/main`, `gh pr list --state all --limit 200`, hub/docs/hub_readme.md and hub/docs/README_technical.txt. The dirty working tree of /workspace/sites was not touched. Items I could not check are marked **[unverified]**.

## 1. Ownership and repo layout
- Who owns what
  - Hub Bot owns `hub/**`, `hub.html`, root `sw.js`, `apps/system/**`, `shared/**` (except Office-only `apps/office/shared/`), the category menu, and `hub/docs/README_technical.txt` + `hub/docs/hub_readme.md`.
  - Apps Bot owns `apps/*` except games and system (clone `/workspace/sites_apps`).
  - Games Bot owns `apps/games/**` (clone `/workspace/sites_games`).
  - Each category CSV belongs to its category's owner; the generator and `hub_catalog.js`/`hub_appindex.js` are Hub's, but every bot regenerates them after its CSV edits.
- Hub Bot clone: `/workspace/sites`. Every release branches from origin/main and goes in by PR.
- Stack: plain static HTML/CSS/JS, no bundler, served from GitHub Pages (https://jor-teron.github.io/sites/) **[unverified: exact deploy path]**. Must also open from file://.
- Layout on origin/main
  - `hub.html` — the shell page (all `?v=` tags live here).
  - `sw.js` (root) — one line, imports `hub/update/hub_sw.js?v=<build>`.
  - `hub/build.txt` — line 1 build tag, 2 shell cache name, 3 release, 4 date (IST). Docs only; nothing reads it.
  - `hub/version.txt` — user-facing version (`v0.299`, `2026-10-19`). Changed only when Jor says.
  - `hub/core/` — hub.js, hub_loader.js, hub_config.js, hub_prefs.js, hub_role.js, hub_saver.js, hub_apps.js (LEGACY), hub_catalog.js (generated), hub_appindex.js (generated), hub_appindex_gen.py, hub_wallthumbs_gen.py, hub_main.css.
  - `hub/wm/` — virtual desktop: wm_windows.js, wm_taskbar.js, wm_snap.js, wm_workspaces.js, wm_mode.js, wm.css.
  - `hub/menu/` — hub_flyout.js/.css (Start + category menu), hub_tiles.js, hub_ctx.js + hub_ctx_menus.js (right-click menus), hub_settings.js (Settings glue).
  - `hub/drives/` — hub_drives.js/.css (Files tile / drives), hub_traymeter.js (taskbar busy meter), hub_wallpapers.js.
  - `hub/link/` — phone link: hub_link.js, hub_linkstate.js, hub_receive.js, hub_remote.js, hub_pointer.js, hub_phonekey.js, hub_chat.js/.css, hub-gamebar.js (app ↔ Hub postMessage bridge, ribbon tabs).
  - `hub/controller/` — D-Pad Controller (phone page + Hub side): controller.html, dpad.html, controller_logic.js, ctrl_tabs.js, ctrl_trackpad.js, kb_common/kb_pc/kb_phone.js, hub-controller.js, hub_textedit.js, configs, readme.
  - `hub/osk/` — on-screen keyboard: osk.js, osk_board.js, osk_drag.js, osk_layout.js, osk.css, osk_readme.md. No page of its own.
  - `hub/viewer/` — receive overlay + notifications: hub_viewer.js, hub_viewer_pdf.js, hub_notify.js, hub_notification.css.
  - `hub/update/` — hub_sw.js, hub_update.js/.css, hub_offline.html.
  - `hub/docs/` — README_technical.txt (14+ numbered sections), hub_readme.md (behaviour + change log).
  - `apps/system/` — system.html, index.html (redirect), system-apps.csv, system_icon.png, and apps: settings/, about/ (+contact, feedback, misc/T&C, misc/privatedns), files/, viewer/, sysmon/, devbench/, disk/.
  - Redirect stubs at the old paths (kept on purpose, keep the #hash): `apps/settings/`, `apps/about/`, `apps/tools/{files,viewer,sysmon,devbench}`.
  - `shared/` — fs/ (filetypes, fs_drives, fs_ops, fs_ref, thumbs_store), google/ (google_auth, google_gis, google_config, gdrive_fs, gdrive_connect, phonekey), link/ (SharedLink core/ui/scan/files/chat/devices), ctxmenu/, dialog/, favorites/, tiles/, perf/busy_meter.js, style/ (app-common, font, cursor, no-scrollbar, weather), script/ (html-include, cursor, time, api_keys.sample.js, txt-view.html), share/share_wa.js, wallpaper/ (wallpapers.js manifest, images, thumbs/*.webp), vendor/pdfjs.
  - `shared/script/api_keys.js` is on origin/main — check it holds no live secret **[unverified]**.

## 2. Architecture (module by module)
- Shell boot
  - `hub.html` loads core CSS/JS with `?v=<build>`. `hub_loader.js` (R16a) loads the minimum first and defers Drive/Google, snap, keyboard (OSK) and Viewer batches. Failed files are retried and show a small "Couldn't load …" note (R27–R29); the ⌨ stub stays until the OSK is really loaded.
  - `hub.js` — app open/close, Phone vs Desktop routing, `#hash` deep links, last app, migration of saved windows on old paths (R53/R53b map apps/settings, apps/about, apps/tools/{files,viewer,sysmon,devbench} → apps/system/...).
  - `hub_config.js` — static config (version is NOT here; hub/version.txt is the single source).
  - `hub_prefs.js` — reads prefs (theme, accent, motion, sizes) and applies CSS vars.
  - `hub_role.js` — hub vs phone/controller role **[unverified: exact role]**.
  - `hub_saver.js` — clock screen saver (R49–R49d), `window.HubSaver` API, idle minutes and second-hand mode.
- App lists / menu
  - Source of truth: `apps/<cat>/<cat>-apps.csv` (header `name, path, icon, newtab, section`; `#` comments; section order = first appearance; empty section = "Other", last).
  - Categories in the menu: … Lab, then System (R53). System sections include "Hub tools" (D-Pad Controller, R53c).
  - `hub_catalog.js` (R47) — generated copy of all CSVs so the Hub lists apps from file:// without fetch. Regenerate: `python3 hub/core/hub_appindex_gen.py --catalog-only`.
  - `hub_appindex.js` (R33c) — search / first-visit index. Full regen needs Playwright (venv); other bots sometimes hand-add rows.
  - `hub_apps.js` — LEGACY (R30/R33a): only "<Category> Page" rows + hidden system rows; the 60 old app rows kept in a commented archive block.
  - `hub_flyout.js` — Start / category flyout. CSVs start loading as soon as it is in; hash/last app/saved windows open when their CSV registers (R33b, 4 s cap). Cached Start list in `sites-hub.startList`, rebuilt when a CSV / hub_apps.js changes (R16c).
- Virtual desktop (`hub/wm/`)
  - `wm_mode.js` — Auto/Desktop/Phone. Auto enters Desktop at 1024 px, leaves below 960 px (R21).
  - `wm_windows.js` — iframe windows, session (`sites-hub.wmSession`, keeps app #hash), `window.__hubTasks` API (used by SysMon), new windows open maximised (R51, `openMax`), sizes grow back after shrink (R22).
  - `wm_taskbar.js` — taskbar (top/bottom), tray (busy meter, update icon, clock), workspaces + OSK on the right (R41/R43).
  - `wm_snap.js` — edge snap (half / maximise, preview), magnet with strength slider (R10/R13/R14/R35). Loaded at once on first title-bar press (R35).
  - `wm_workspaces.js` — two workspaces, monitor-shaped buttons (R10/R41).
- Menus: `shared/ctxmenu` + `hub/menu/hub_ctx*.js` (R3c) — own right-click / long-press on desktop, taskbar, title bars, drives, tiles; `ctx_in_app.js` injected into same-origin apps; Shift+right-click = browser menu.
- Settings glue: `hub/menu/hub_settings.js` opens `apps/system/settings/` (with #section). Settings app = settings.js + settings_store.js + sec_{wallpaper,desktop,windows,sizes,look,howto,about}.js. Deep links `#wallpaper #desktop #sizes #look #howto #about`.
- Drives / Files / Disk
  - `shared/fs/fs_drives.js` — drive list: Local (OPFS, persist asked once), added PC folders (`showDirectoryPicker`, handles in IndexedDB, "Allow access" re-grant), Google Drive (`shared/google/gdrive_fs.js` directory-handle adapter so FsOps works unchanged).
  - `fs_ops.js` (copy/move/rename/delete/upload), `fs_ref.js`, `filetypes.js` (Open with → apps/system/viewer/), `thumbs_store.js` (thumbnail cache).
  - `hub_drives.js` — desktop Files tile/pane (R54b: only connected drives, "⚙ Manage drives" → Disk).
  - Files app (`apps/system/files/`, R3a/R3b/R12b): browse only since R54b (multi-select, cut/copy/paste, clash prompt, drag & drop, grid/list, sort, search, thumbnails, keys).
  - Disk app (`apps/system/disk/`, R54): add/remove drives, Google sign-in, space used, persistence, per-drive size, clear thumbnail cache, empty Local, Open in Files.
  - Viewer (`apps/system/viewer/`, R12a): image/video viewer with prev/next.
- Google: `google_auth.js` (token in `sites-hub.google`, BroadcastChannel), `google_gis.js` (Sign in on this computer popup), `phonekey.js` + `hub_phonekey.js` (Phone as a key: phone signs in, hands token over SharedLink; single-use 10-min room ids in `sites-hub.phonekeyRooms`). QR device flow code kept but `qrEnabled:false`; `tvClientId/tvClientSecret` must stay empty (R9a–R9c).
- Phone link / controller: SharedLink (PeerJS **[unverified]**) for controller tabs (Gamepad / Keyboard & Mouse / Send Files), trackpad pointer, received files (overlay with queue, PDF scroll via pdf.js), rumble (`hub-rumble` postMessage).
- SysMon (`apps/system/sysmon/`, R7) — tasks, storage, memory, CPU (busy estimate, `shared/perf/busy_meter.js`), network, battery; 1 s sampling. DevBench (`apps/system/devbench/`) — device benchmark with history/export **[unverified: origin release]**.
- Storage keys (grep of origin/main, hub/ apps/system/ shared/)
  - localStorage prefix `sites-hub.`: accent, favorites, filesClick, filesThumbs, fromCat, fromLab (old), google, hoverFocus, lastApp, lastRefresh, motion, openMax, osk, phonekeyRooms, saverIdle, saverSec, snapEdges, snapMagnet, snapMagnetPx, startHover, startList, taskH, taskPos, theme, titleH, trayMeter, updTried, wallpaper, wmMode, wmSession, workspaces.
  - Other localStorage: `sites-files.*` (Files app prefs), `sites-fs.persistAsked`.
  - IndexedDB: `hub-received` (received files) plus the folder-handle store in shared/fs and the thumbnail store **[unverified: exact DB names, not caught by the grep pattern]**.
  - OPFS: the Local drive.
  - Full key table with values: README_technical.txt section 14.
- Service worker (`hub/update/hub_sw.js`, README_technical section 13)
  - Caches: `hub-shell-vNN` (precached SHELL list: Hub files, shared modules, OSK, Start icons, all category CSVs incl. system-apps.csv, version.txt, icons, offline page), `hub-rt-1` (runtime: app pages/images opened once), `hub-meta` (which shell files changed).
  - Fetch rules (same-origin GET only): cross-origin untouched; no-store/reload/Range untouched; shell files with no ?v or ?v = V → cache first + background refresh; newer ?v → network first; *.csv and hub/version.txt → network first, cache offline; other html/css/js → network first into hub-rt-1; images → cached copy then background refresh (R25); fonts cache first; uncached offline navigation → hub_offline.html.
- Update flow (`hub/update/hub_update.js`, `window.HubUpdate`)
  - A new worker WAITS (only first install activates at once).
  - R50: "Update ready" tray icon `#upd-btn` (desktop tray before clock; phone 24 px top bar) opens Settings → About; the Update button there does skip-waiting → reload. Old toast `#hub-upd-note` kept commented out.
  - Daily refresh at 09:00 local or next open after a missed one (`sites-hub.lastRefresh`): reg.update() + worker `{type:'refresh'}` refetches SHELL, replaces only changed files. Nothing open → quiet reload (waits for an installing worker, R23), else the icon.
  - Settings → About "Check for update": waiting worker takes over (R24), else clears hub-shell-* and reloads. `clearCache()` deletes hub-shell-*, hub-rt-*, startList, lastRefresh, unregisters, reloads.

## 3. Build bump procedure (every Hub release)
- Pick the next build tag after hub/build.txt line 1 (`YYYYMMDD` + letter, e.g. 20261022e → 20261022f, new day → 20261023a) and cache number +1 (hub-shell-v78 → v79).
  1. `hub.html`: every `?v=` (sed old tag → new).
  2. `sw.js`: `importScripts('hub/update/hub_sw.js?v=<new>')`.
  3. `hub/update/hub_sw.js`: `V = '<new>'`, `CACHE = 'hub-shell-v<NN+1>'`; add new shell files to SHELL.
  4. `hub/menu/hub_ctx.js`: `const V = '<new>'`.
  5. `hub/core/hub_loader.js`: `const V = '<new>'`.
  6. `hub/build.txt`: build tag, cache name, release, date (IST).
  7. `hub/version.txt`: only when Jor says.
- Check: `git grep -n <old tag>` returns nothing in those files.
- Add a change-log entry to `hub/docs/hub_readme.md` (and README_technical when behaviour changes). Readme bodies carry no current numbers.
- App-only changes (an app's own files) need no shell bump.
- Commit identity: `git -c user.name=jor-teron -c user.email=1854500+jor-teron@users.noreply.github.com commit ...`
- Commit/PR title style: `R54b: <summary>; build 20261022e / hub-shell-v78`.

## 4. Hub releases (from the beginning)
- Early (direct commits, hub_readme change log, no PR numbers)
  - 2026-09-29 hub icon option (d63c325); 10-02 folder rearrange (8cb4c69); 10-03 re-categorised (fab92c7), 2×2 home tiles + Night blue wallpaper (ab58986); 10-04 collapsible category menu (f6a0fd3), controller tabs + trackpad + phone→hub files (5809f29), Notepad/Notely → Office (3a32f4e); 10-05 file cards, image viewer, installable PWA (manifest, sw.js → hub_sw.js, offline page), receive overlay + polish, CSS split.
  - SharedLink release 2 (20261011b), Release 4 (2026-10-11), One Connect QR (2026-10-12a).
  - R1, R2, R4–R6 **[unverified: not found under those names in git log]**.
- R3a–R16 (direct commits to main, no PR)
  - R3a desktop two-pane home, Drives (Local OPFS + Add folder), Files app (41abcf5, v30).
  - R3b Files explorer: multi-select, paste/move, clash prompt, drag & drop, Open with, shared/dialog (35954e7, v31).
  - R3c own right-click / long-press menus, ctx_in_app.js (107762d, v32).
  - R7 System Monitor + __hubTasks + busy meter (6f3d5d8, v33).
  - R8 category pages → apps/<cat>/<cat>.html with redirects; SW precache cache:'reload'; Settings > Windows hover focus, Files click (e9b5c08, v34).
  - R9a Google Drive via QR device flow (5d74b01, v36); R9b Phone as a key + popup sign-in (8792b9c, v37); R9c Hub's own web client, QR flow hidden (0827bfa, v38).
  - R10 window snapping, two workspaces, picture wallpapers (b45461e, v35).
  - R11 OSK drag/undock, edge snapping, favorites (57051ab).
  - R12a media viewer + Open with (53359c2); R12b Files thumbnails (0112475).
  - R13 magnetic snap (bd033d5); R14 magnet strength slider (0285545); R15 legacy app list sync + OSK cursor keys (c560d9f).
  - R16a deferred loader (5f6d436, v46); R16b cache-first shell + update notice (d0c7872, v47); R16c 09:00 refresh, cached Start list, Clear cache (fcde078, v48).
  - R17 technical readme (25bf7f4); R18 Lab app icons (7b5c394).
  - R19, R20 **[unverified: not found in git log]**.
  - R21+R22 steady mode switch / window sizes (427a6cc, v56); R23+R24 update apply fixes (a916e8a, v49); R25+R26 image refresh, UiDialog for new code (7244ffc, v50); R27–R29 loader stub, load errors, single key handling (9d0495f, v51).
  - R30 hub_apps.js LEGACY (ac4ff13, v52); R31 hub/ into feature folders (1926d59, v53); R32 build.txt + readme cleanup; R33a hub_apps.js categories only; R33b faster first-visit lookup (d2f49c2); R33c+R38 app index for first visit, Settings window refresh (9b3931a).
  - R35 edge snapping works again (763aa01, v57); R41 monitor-shaped workspace buttons, OSK beside them (7da1538); R43 workspaces + keyboard on the right of the taskbar (3460b21).
- PR era
  - #51 R44 ribbon tabs in the title bar (Draftly bridge, hub-gamebar hub-tab/hub-title) — 20261021c / v61.
  - #53 R44b phone-mode tabs not under #cat-btn — 20261021d / v62.
  - #57 R45 AoE RTS → Games — 20261021e / v63.
  - #60 R46 MyBookmark replaces Bookmark Manager — 20261021f / v64.
  - #64 R42 Phone mode Home button, tidy top bar — 20261021g / v65.
  - #67 R47 hub_catalog.js (lists without a web server) — 20261021h / v66.
  - #71 R49 clock screen saver — 20261021i / v67; #72 R49b idle 0–240 min — j / v68; #73 R49c minimalist clock + second-hand modes — k / v69; #74 R49d second hand Off really hidden — l / v70.
  - #75 R36 WebP wallpaper thumbnails + hub_wallthumbs_gen.py — 20261021m / v71. MERGED.
  - #76 R50 Update ready tray icon — 20261021n / v72. MERGED.
  - #77 R51 windows open maximised + Settings switch — 20261021o / v73. MERGED.
  - #99 R53 System category; Settings + About → apps/system/ — 20261022a / v74.
  - #101 R53b Files, Viewer, SysMon, DevBench → apps/system/ — 20261022b / v75.
  - #103 R53c D-Pad Controller listed under System → Hub tools — 20261022c / v76.
  - #105 R54 Disk system app — 20261022d / v77.
  - #106 R54b Files only browses; desktop Files pane; manage drives in Disk — 20261022e / v78.
  - All above MERGED. #99–#106 were stacked and merged in order on 22 Oct 2026.
- Release numbers used but not shipped: R34, R37, R39, R40, R48, R52, R55 (see section 8).

## 5. Gotchas and lessons learned
- file:// has no fetch for CSVs → the menu needs `hub_catalog.js`. Any CSV edit without regenerating it means the app is missing offline/file://.
- Regenerate generated files (`hub_catalog.js`, `hub_appindex.js`, wallpaper thumbs) after merges and conflicts; never hand-merge them.
- Stacked PRs: update a child branch by merging main (or its parent) into it. Never rebase or force-push without Jor's confirmation.
- Forgetting one `?v=` or the CACHE name means users keep the old shell; always grep for the old tag.
- New shell files must be added to SHELL in hub_sw.js or they won't work offline.
- Moving an app: leave a redirect stub at the old path that keeps `?query` and `#hash`, migrate saved windows in hub.js, update filetypes.js/hub_drives.js/hub_traymeter.js and other hard-coded paths, and the SW SHELL list.
- File System Access handles lose permission after reload; the user must press "Allow access" (a user gesture).
- GitHub push protection blocks Google client secrets; that is why the QR device flow is off and tvClientSecret stays empty.
- Keyboard keys: handle each key once (R29) — deferred modules re-binding caused doubles.
- Playwright tests: venv `/workspace/.venv-pw`, serve on a fresh random port, kill only our own server pid (never broad pkill — other bots share the box).
- Three bots share one box: never touch the other clones, and never touch /workspace/sites' dirty tree for docs work.
- Local `main` in /workspace/sites is 119 commits behind origin/main; pull before branching.

## 6. Known bugs and fixes still needed
- ~~`hub/version.txt` fetch errors when opened from file://~~ fixed in R58 (hub_update.js skips the fetch on file://; the version shows '—').
- ~~`apps/system/settings/index.html` (line 3 comment) and `apps/system/settings/README.md` still say `apps/settings/`~~ fixed in R58.
- Fixed in R56: phone-mode idle check (09:00 refresh could reload over an open app), Lab → Games deep links (aeroplane, island-demo, aoe-rts).
- Fixed in R57: hub_link / hub_settings / hub_saver origin checks; html-include error box uses textContent.
- Fixed in R58: SW install records missed shell files (retried), 'hub-meta' kept on activate, images no longer re-fetched on every request, automatic update check never clears caches / reloads, loader retry keeps batch order, manifest any / maskable icons split, gamebar hub-hello to location.origin, old #contact / #feedback / #transcribe / #vdesktop links, dead CAT_PAGES rows.
- Broken `apps/tools/vDesktop/wallpaper.csv` path — Apps bot's area **[unverified: no reference found by `git grep` on origin/main; may be a runtime/404 path or already gone]**.
- ~~Added PC folders that need access again are hidden in Files~~ fixed in R56 (greyed with "Allow access").
- Disk's Add folder and Google sign-in not yet tested on a real PC (box Playwright only).
- Leaked TV (device-flow) client secret: Jor must delete/rotate it in Google Cloud Console. Code keeps tvClientId/tvClientSecret empty.
- Low priority: R21/R22-style mode/size edge cases on odd viewports **[unverified]**.

## 7. Unreleased work
- Hub: none. Every local branch in /workspace/sites (r36…r51, hub/r53…r54b, plus chess and games/desert-road-refactor) has 0 commits not in origin/main. No open Hub PRs.
- Dirty tree in /workspace/sites (not Hub changes, note only): 199 deleted files under `apps/lab/hero-builder` (node_modules) and 1 deleted file under `apps/games/ar-game` (vendor). Apps bot proposes a separate PR to drop hero-builder node_modules from git after asking Jor.
- Local `main` is behind origin/main (119 commits) — pull only.

## 8. Planned and parked
- R52a–d: app lists as JS instead of CSV (split into four; testing last). Parked as too long.
- R55 Terminal (system app): a shared Hub command list where each feature registers its own commands; file commands on added PC folders (ls, cd, cat, cp, mv, rm via fs_ops); `ssh user@host` opens `apps/connectivity/ssh/#host=user@host:22` (Apps bot's SSH S1, #108, already accepts it). Parked: needs more design.
- R48 `hub-tabs-ok` acknowledgement in the hub-gamebar tab bridge.
- Keyboard shortcuts + a Ctrl+K command/search box (could share R55's command list).
- R34 TV poster. R37 Google Drive label. R39 web browser app. R40 review.
- Snapping improvements; Settings refreshing while open (live update from other windows).
- Wallpaper screen saver (alongside the clock saver).
- Phone mode improvements (discussed, not numbered) **[unverified: list]**.
- Status checks: R50 (#76), R51 (#77) and R36 (#75) are MERGED.
- Follow-ups: ~~grey out added folders needing access~~ (R56); ~~fix version.txt on file://~~ (R58); ~~fix apps/settings/ comments~~ (R58).

## 9. Conventions with Jor
- Release wording
  - "no coding" — discuss only.
  - "lets do" or a bare release id ("R53c") — code and commit locally.
  - "push" — push (and PR / merge as he asks).
  - "code n push" — both.
  - "rewind" — talk about it again; NOT a git revert.
- Report the problem and the plan (with a time estimate) before coding.
- Keep legacy files with LEGACY comments; don't delete.
- Every release: change-log entry in hub_readme.md + build bump (section 3), numbered R<nn><letter>.
- End each release with a short report including minutes spent.
- Lists, never wide tables (Jor reads on a phone).
- Bots code themselves; no cloud agents.
- Times in IST.

## 10. How to test
- Static server: `cd <worktree> && python3 -m http.server <random port>`; open `/hub.html`. Also open `hub.html` from file:// to check catalog-only listing.
- Playwright: `/workspace/.venv-pw/bin/python` with a script that loads hub.html, checks the menu (System after Lab), opens apps (Settings #about, Files, Disk), checks console errors; kill only the server pid you started.
- Desktop vs Phone: test at ≥1024 px and 360 px wide.
- Service worker: after a bump, reload → "Update ready" icon appears → Settings → About → Update.
- Generators: `python3 hub/core/hub_appindex_gen.py --catalog-only` (catalog), full run for hub_appindex.js (needs Playwright), `python3 hub/core/hub_wallthumbs_gen.py` for wallpaper thumbs.
- Real-device checks still needed: Disk Add folder (Chrome/Edge on PC), Google sign-in, phone controller link.

================================================================================
 PART 2: Apps
================================================================================

# Monorepo Apps Bot: technical handover (jor-teron/sites)

- Written 22 Oct 2026, ~15:45 IST, from read-only research: origin/main @ 44ddd7d (#110), Hub build 20261022e (hub-shell-v78, R54b).
- Scope: everything under `apps/*` **except** `apps/games/` (Monorepo Games Bot). Hub files (`hub/`, repo-root `shared/`) belong to Monorepo Hub Bot (the boss, wins conflicts).
- Working clone: `/workspace/sites_apps` on the shared box. Git identity `jor-teron`. Branch from `origin/main`, one PR per release.

## 1. Apps owned (folder, files, how it works)

### 1.1 Camera: `apps/media/camera/` (Media → Photo)
- Files
  - `camera.html` / `camera.css`: preview, controls, settings panel, light/dark.
  - `camera_config.js`: `resolutions` + `resolutionOrder` (480p, 720p, 1080p, Max), timers, photo formats, video MIME candidates, defaults, UI text.
  - `camera_save.js`: `CameraSave.save(blob, filename)`, the single save point (browser download today, Hub Drive later), plus the timestamped name helper.
  - `camera_slowmo.js`: R3 slow motion (fps check, high-fps capture, canvas re-encode).
  - `camera_logic.js`: getUserMedia start/stop, photo, MediaRecorder video, timer, grid, mirror, keys, settings.
- Behaviour
  - Photo: JPG (q 0.92) or PNG at full frame size. Video: MP4 if `MediaRecorder` supports it, else WebM. Pause/Resume (P).
  - Mirror: on by default for the front camera; preview, photo and video are mirrored the same way (mirrored video goes through a canvas).
  - Timer Off/3 s/10 s; rule-of-thirds grid; flip = next camera in the list.
  - Tab hidden → recording finalized and saved, camera released.
  - Slow motion: the switch is shown only if the track reports ≥ 60 fps (rechecked on every camera start). It asks for 120 fps (min 60), records ≤ 10 s with no audio, then plays it back at 1/factor onto a 30 fps canvas and records that. Factor = fps/30 (120 → 4×, 60 → 2×). Output `slowmo-YYYYMMDD-HHMMSS.mp4|webm`.
  - File names: `photo-…jpg|png`, `video-…mp4|webm` (local time).
- Storage: localStorage `camera-settings-v1`.
- Keys: Space/Enter shutter, V mode, P pause, F flip, G grid, Esc.

### 1.2 Stopwatch: `apps/tools/stopwatch/` (Tools → Time). Reference for the "Stopwatch style"
- Files: `stopwatch.html`, `stopwatch.css`, `stopwatch_logic.js` (timing, laps, gestures, keys, saving, export), `stopwatch_icon.png`, `index.html`.
- Screens: Stopwatch (default) → Lap → Settings, with a 75 px wrap-around swipe and 3 dots.
- Tap anywhere (< 0.5 s, < 10 px movement) = start/pause. Taps on buttons, dots, the lap list and Settings are excluded.
- Full-width Reset button; it asks in the app's own dialog when there are laps.
- Faces: Analog (default; sweeping seconds hand, 30-min sub-dial, small digital below) or Digital (mm:ss.cc, hours after 60 min).
- Laps are newest first, with fastest green and slowest red once there are ≥ 3. Copy (TSV) and CSV `laps-YYYYMMDD-HHMMSS.csv`.
- Storage
  - `stopwatch-state-v1`: start epoch, accumulated ms, running flag, laps, mode. The time keeps running across reloads.
  - `stopwatch-settings-v1`: `{face, theme}`.
- Keys: Space, ←/→ screens, L lap, R reset, Esc.

### 1.3 Unit Converter: `apps/tools/unit-converter/` (Tools → Calculators)
- Files: `unitconv.html/.css`, `unitconv_units.js` (`window.UNITS`, categories with `[id, label, factor]`), `unitconv_logic.js`, `unit-converter_icon.png`, `index.html`.
- U1–U4 shipped together:
  - Length, Weight, Temperature (affine via Kelvin), Area, Volume (US + UK gal), Speed, Time, Data (decimal 1000ⁿ and binary 1024ⁿ), Number (lakh/crore/arab/kharab/million…).
  - Indian land units: guntha, cent, and bigha/katha for Assam, West Bengal, Bihar, UP, Rajasthan and Gujarat.
  - Precision 2/4/6 (default 4); exponent form for ≥ 1e15 or tiny values; input accepts `1,00,000` and `1e6`.
- Screens: Converter → Settings (swipe 75 px, dots, ←/→, S = swap).
- Storage: `unitconv-settings-v1` `{theme, prec}`, `unitconv-state-v1` `{screen, category, units per category, value, side}`.
- No currency (by Jor's decision).

### 1.4 Calendar: `apps/tools/calendar/` (Tools → Time)
- Files: `calendar.html/.css`, `calendar_holidays.js` (`window.CalHolidays`), `calendar_logic.js`, icon, `index.html`.
- Screens: Month (default) → Year → Holiday List → Settings. The screen swipe works on the **top bar** only; a swipe on the month grid changes the month.
- Month (C1)
  - Today is filled; Sundays are red; Prev/Today/Next are on the right.
  - Day info: weekday, day of year, ISO week, distance from today.
- Year (C4): 12 mini months.
- Jump & count sheet: jump to a date; a day counter with an include-end option.
- C3 holidays are fixed dates only: 1 Jan, 26 Jan, 14 Apr, 1 May, 15 Aug, 2 Oct, 25 Dec. They can be switched On/Off in Settings.
- Holiday List: a table for the year. Past rows are grey, the next holiday is highlighted, and tapping a row opens that day.
- Settings: week start Sun/Mon, holidays on/off, theme, About.
- Storage: `calendar-state-v1` (screen, month, selected day, counter dates) and `calendar-settings-v1` `{week, hol, theme}`.

### 1.5 Sound Recorder: `apps/media/sound-recorder/` (Media → Audio)
- Files
  - `_app.js`: screens, top-bar swipe, settings, dialog, toast, keys.
  - `_recorder.js`: Record/Pause/Stop, live 8 s waveform, level meter, mic picker.
  - `_list.js`: list, rename, delete, download, import.
  - `_player.js`: waveform player, seek, pinch/Ctrl-wheel zoom, overview bar, sound regions.
  - `_audio.js`: peak AudioWorklet, peaks from a file, silence detection.
  - `_wave.js`: canvas drawing.
  - `_store.js`: IndexedDB.
  - `_save.js`: `SRSave.save(blob, name)`.
- Screens: Recorder → Recordings → Player → Settings (swipe on the top bar only; the waveform drag is seek/pan).
- Sound regions: level above the threshold (−50/−40/−30 dB, default −40). Gaps < 1 s are joined and sounds < 0.15 s are dropped. Sound ▶ / ◀ Sound jump between them.
- Storage
  - IndexedDB `sound-recorder-v1`, store `rec`: `{id, name, date, dur, mime, size, blob, peaks: Float32Array (50/s), pps}`.
  - Peaks are computed live while recording, so long files are never decoded. Imports are decoded at 8 kHz, one minute at a time.
  - localStorage `sound-recorder-settings-v1` `{theme, thr, mic}` and `sound-recorder-state-v1` `{mode, cur}`.
- Format: WebM/Opus (Chrome, Firefox); MP4/AAC saved as `.m4a` (Safari).

### 1.6 Spreadsheet: `apps/office/spreadsheet/` (Office → Sheets)
- A 26 × 100 grid with formulas (`FUNCTIONS.txt` lists them), styles, formats, CSV import/export and print. Plain JS; works from `file://`.
- Modules after the refactor (#98)
  - `_config`, `_state`, `_storage`, `_grid`, `_select`, `_edit`, `_keys`, `_formula`, `_functions`, `_refs`.
  - `_fill`, `_format`, `_clipboard`, `_sort`, `_rows`, `_resize`, `_undo`, `_files`, `_toolbar`, `_logic`.
  - `_ribbon.js/.css` (#100) and `_page.js/.css` (Page tab: orientation, paper, margins, gridlines, headings, fit width, print).
- Storage
  - localStorage `sheet-v2`: cells, styles, formats, widths. `sheet-v1` is read as a fallback.
  - `sheet-v2-page`: page setup, saved under the storage key plus `-page`.
  - `spreadsheet-ribbon-tab`: the last ribbon tab.
- Undo keeps 100 steps; colour drags within 0.8 s merge into one step.
- Possible future name: "Sheetly".

### 1.7 Draftly: `apps/office/draftly/` (Office → Write)
- An A4 paged word processor, with text flowing line by line between pages. Autosave; PDF and DOCX export.
- Modules in `modules/draftly-*.js`
  - app, breaks, colour, config, dialog, docs, editor, export, find, flow, flow-blocks, format.
  - headerfooter, history, hub, lists, margins, marks, pages, pdf, ribbon, spacing, storage, and others (65 files in total).
  - CSS is in `ui/`.
- Hub bridge (`draftly-hub.js`, v:1)
  - After `hub-hello`, the body gets the `in-hub` class.
  - It sends `hub-app {app, tabs, activeTab, title}`, `hub-tab` and `hub-title`, and handles `hub-action {id:'tab:<id>'}`.
- Vendored (MIT; see `vendor/README.txt`): html-docx-js 0.3.1, jsPDF 2.5.1, html2canvas 1.4.1. Fonts: Tinos (Apache-2.0/OFL) in `assets/fonts/tinos/`.
- Storage
  - IndexedDB `draftly`, store `documents` `{name, html, updated}`.
  - localStorage `draftly_last_name`, `draftly_theme`, `draftly_nonprinting`, `draftly_status_bar`.
  - Orientation is saved under the key literally named **`undefined`** (bug). `draftly_margins` is a legacy key removed at start-up.
- Uses `apps/office/shared/` dialog and page setup since #102. The ribbon is still Draftly's own.

### 1.8 Office shared: `apps/office/shared/`
- This is not the repo-root `shared/` (Hub's). Plain scripts, no build, work from `file://`.
- `office-ribbon.css/js`: 36 px top row (File + tabs), one scrolling `.of-group` row per tab, File dropdown. Tabs are `{id,label}` data.
- `office-dialog.css/js`: `OfficeDialog.prompt / confirm / form`.
- `office-page.js`: paper sizes, margin presets (Normal/Narrow/Wide), `clampMargins`, `pageRule` (@page text), `inject`, `customMarginsDialog`.
- Used by Spreadsheet (ribbon, dialog, page) and Draftly (dialog, page).

### 1.9 PDF Tools: `apps/office/pdf-tools/` (Office → PDF)
- P1 page organiser: open or drop a PDF; thumbnails; reorder by drag (touch uses a 0.4 s long-press); rotate ±90; delete (refuses to delete all pages); undo/redo (200 steps); save `name-edited.pdf`.
- Files
  - `_ui.js`: state `PT.S`, theme, menu, dialog, toast.
  - `_load.js`: open, drop, validation, errors.
  - `_thumbs.js`: lazy IntersectionObserver rendering with a 400 px margin, one page at a time.
  - `_select.js`, `_edit.js`, `_app.js`.
  - `_save.js`: `PTSave.save` plus `build()` with pdf-lib, which copies pages so text and quality are kept.
- Vendored: `vendor/pdf-lib.min.js`, pdf-lib 1.17.1 UMD, MIT.
- pdf.js 3.11.174 (Apache-2.0) is used **read-only** from the Hub's `shared/vendor/pdfjs/`.
- Storage: `pdf-tools-settings-v1` `{theme}`. Files are held in memory only. Encrypted PDFs are refused with a friendly message.

### 1.10 SSH: `apps/connectivity/ssh/` (Connectivity → Remote)
- Files
  - `ssh.html`, `ssh.css`.
  - `ssh_ui.js`: settings, theme, menu, dialog, toast.
  - `ssh_conn.js`: SSH over the relay, host key, errors.
  - `ssh_term.js`: xterm, copy/paste, extra keys bar.
  - `ssh_app.js`: form, `#host=user@host:22` hash prefill (used by the Hub terminal `ssh` command), states, reconnect.
  - `relay/`, `vendor/`.
- Vendored
  - `ssh-lib.min.js`: `@microsoft/dev-tunnels-ssh` 3.12.42, MIT, ~330 KB (~80 KB gzip), exposes `window.SSHLib`.
    - Built with esbuild from `vendor/build/` (entry, Buffer shim, stubs). The entry adds the `pty-req` and `window-change` channel requests.
    - Deps are listed in `THIRD_PARTY_NOTICES.txt`.
  - xterm.js 6.0.0 and addon-fit 0.11.0 (MIT).
- Crypto uses Web Crypto: ECDH P-256/384, DH group14/16, AES-256-GCM/CTR, HMAC-SHA2-ETM, RSA-SHA2/ECDSA host keys.
- S1 has password login only. The host key is shown as a SHA256 fingerprint and trusted for this visit only. The password is kept in memory only, for Reconnect.
- Storage: `ssh-settings-v1` (theme, relay URL, text size, last user/host/port). The password is never saved.
- Relay: websockify with `ssh_allowlist.py`. See section 8.

### 1.11 Code Lab: `apps/lab/code-lab/` (Lab → Tools, after Notebook)
- Files
  - `codelab.html`, `codelab.css`.
  - `codelab_app.js`: cells, UI, screens, theme.
  - `codelab_kernel.js`: connect, kernelspecs, start/restart/interrupt, execute, output mapping.
  - `codelab_save.js`: the only storage.
  - `vendor/codelab-lib-entry.js` and `vendor/codelab-lib.min.js`.
- Vendored: `@jupyterlab/services` 7.5.11 (BSD-3) plus CodeMirror 6 (@codemirror/view 6.43.15 etc., MIT), ~530 KB (~170 KB gzip), exposes `window.CodeLabLib`. The scratch build folder is `/tmp/clbuild` (temporary).
- Connect flow
  - `ServerConnection.makeSettings({baseUrl, wsUrl, token, appendToken:true})`. `makeRequest` adds `Authorization: token …` itself.
  - It pings `api`, then `api/kernelspecs`. 401/403 means a wrong token; 404 means a wrong URL or the origin isn't allowed.
- Output types: stream, execute_result/display_data (text/plain, text/html, image/png/jpeg/svg), error (ANSI stripped). `[n]` / `[*]` counters.
- Storage: `codelab-cells-v1` (cell sources) and `codelab-settings-v1` `{url, theme, remember, token only if remember}`.
- Grok Computer's server: `https://grok-lab.tail94ffdb.ts.net` (Tailscale serve → Jupyter on :8888). Allowed origins requested: `https://jor-teron.github.io` and `http://localhost`.

### 1.12 MyBookmark: `apps/lab/mybookmark/` (Lab → Tools)
- Replaces Bookmark Manager; `apps/lab/bookmark-manager/` now redirects here.
- Files: `_config`, `_store` (IndexedDB `mybookmark`, stores `nodes` and `meta`; the only storage module), `_data`, `_netscape` (HTML import/export), `_view`, `_dialog`, `_logic`.
- On first open it migrates localStorage `bookmarkManagerData` once into the folder "From Bookmark Manager", without deleting the old data.
- Duplicates (#63): keeps the oldest per normalized URL, with a review view and an all/this-folder scope.
- Theme follows `sites-hub.theme`, else the system.

### 1.13 ONNX Runner: `apps/lab/onnx-runner/` (Lab → AI)
- Files: `_config`, `_tensor`, `_text` (tokenizer detection), `_logic`, `_gen` (Generate tab), `_worker` (Web Worker running ORT and the generation loop).
- Libraries come **from the jsdelivr CDN** and are not vendored: ONNX Runtime Web 1.22.0 and Transformers.js 3.7.0 (tokenizers).
- Supports KV-cache exports (`past_key_values.*` / `present.*`).
- Limits: batch 1; no `.onnx_data`; WASM is single-threaded unless the page is cross-origin isolated.

### 1.14 Settings pieces (now `apps/system/settings/`)
- #47 About update/Clear Cache labels and the release read from `hub/build.txt`; #70 Screen saver picker (`sites-hub.saverIdle`). #18 is an older Settings PR and its author isn't verified (see §2.4).
- **Hub Bot now owns** the screen-saver control (`sec_desktop.js`) and the whole `apps/system/` move. `apps/settings/index.html` and the old `apps/tools/{files,sysmon,viewer,devbench}` folders are redirect stubs.

### 1.15 Image Gen: `apps/lab/image-gen/` (Lab → Tools, after Code Lab), release IG3 (IG1 → IG3; IG2 skipped for now)
- Text-to-image through the user's own Ollama. Screens: Generate · Gallery · Settings (dots, 75 px wrap-around swipes, ←/→).
- Files: `imagegen.html/.css`, `imagegen_app.js` (UI, theme, swipes, dialogs, compare), `imagegen_ollama.js` (API), `imagegen_edit.js` (IG3: start photo, upscale, similarity), `imagegen_store.js` (IndexedDB gallery), `imagegen_save.js` (the only save path), `imagegen_icon.png`.
- API: `POST {url}/api/generate` `{model, prompt, width, height, steps, stream:true}`; NDJSON lines with `completed/total` drive the bar, the last line has `image` (base64 PNG). Cancel = AbortController. Models: `/api/tags`, plus `/api/show` capabilities when tags lack them; `image` models first, "Other" lets you type a name.
- Sizes: Square 1024×1024, Portrait 768×1024, Landscape 1024×768. Steps default 8 (z-image-turbo), 4 for flux models.
- Storage: `imagegen-settings-v1` `{theme, url, model, size, steps, prompt}`; IndexedDB `imagegen-v1`/`images` keeps the newest 20.
- Error dialogs: unreachable/CORS → `OLLAMA_ORIGINS=https://jor-teron.github.io`; HTTP 400 "…not currently supported" → Ollama 0.32.6+ disabled image gen, use 0.32.5 on macOS; no image models → `ollama pull x/z-image-turbo`.
- CSV icon column is set explicitly (`image-gen/imagegen_icon.png`) because the default would look for `image-gen/image-gen_icon.png` (same quirk as Code Lab).
- IG3 start photo (image-to-image): Add photo / drop / paste / "Use as start"; ≤1024 px JPEG sent as `images:[b64]` on `/api/generate`; size "Photo" = long side 1024, multiples of 16. **Ollama doesn't really support it**: editing landed in 0.15.1 for flux2 only (commit c01608b; z-image → HTTP 400 "model does not support image editing") and worked through v0.15.4; the v0.15.5 runner rewrite dropped the dispatch so 0.15.5–0.32.5 silently ignore `images` (issue #14306, fix PR #14408 closed unmerged; v0.32.5 `x/imagegen/imagegen.go` always calls `GenerateImage`), and 0.32.6+ removed image gen. No strength option exists. The app shows a heads-up, maps a 400 to "Start photo not supported", and flags "Ollama ignored the start photo" when the result's grey 32×32 correlation with the photo is < 0.3 (heuristic).
- IG3 Upscale 2×: canvas `imageSmoothingQuality:'high'` + optional mild sharpen (`sharpen` setting, default on), new gallery item `kind:'up'`, max 4096 px a side. Gallery records may carry `kind:'edit'` + `src` (start photo blob) or `kind:'up'` + `from`.
- IG3 Compare: overlay with two stacked images and a draggable divider (drag / range / ←→, Swap, Esc). Gallery → Compare → tap two; "Before / after" on edits.
- IG3 Send to Gallery: `apps/media/gallery` has no shared store (it reads a folder/files the user opens; IndexedDB `gallery-v1` only holds the folder handle), so it saves the PNG (`IGSave.toGallery`) and explains how to open it in Gallery. Gallery files untouched.
- Tested only against a mock Ollama (headless Chromium); not yet against a real Ollama 0.32.5 on a Mac.

### 1.16 Vision: `apps/lab/vision/` (Lab → Tools, after Image Gen), release VS1
- Ask a vision model on the user's own Ollama about a photo. Screens: Look · Recent · Settings (dots, 75 px wrap-around swipes, ←/→).
- Photo in: Open photo, Camera (`<input capture=environment>`, phones), drag-drop, paste. Shrunk to ≤1024 px JPEG q0.85.
- Modes: Describe, Read text (OCR), Image prompt (one text-to-image prompt), Ask. A typed question is always sent as-is; follow-ups keep the chat (image rides only on the first user message).
- API: `POST {url}/api/chat` `{model, messages, stream:true}`; NDJSON `message.content` chunks stream into the reply bubble. Cancel = AbortController. Models: `/api/tags` + `/api/show` capabilities (`vision` first, then name guesses llava/llama3.2-vision/qwen2.5vl/gemma3/minicpm-v…), "Other" to type a name.
- Files: `vision.html/.css`, `vision_app.js` (UI), `vision_ollama.js` (API), `vision_save.js` (the one save module: IndexedDB history, Copy answer, Save .txt), `vision_icon.png`.
- Storage: `vision-settings-v1` `{theme, url, model, mode}`; IndexedDB `vision-v1`/`chats` `{id, ts, mode, model, img, messages}`, newest 20; tap a Recent card to reopen and keep asking.
- Errors (in-app dialogs): unreachable/CORS → `OLLAMA_ORIGINS=https://jor-teron.github.io`; no vision model → `ollama pull llama3.2-vision` / `gemma3`; model rejects images or answers "I can't see an image" (heuristic) → pick a vision model.
- Tested only against a mock Ollama in headless Chromium; not yet against a real Ollama or a phone camera.

### 1.17 Screen Share: `apps/connectivity/screen-share/` (Connectivity → Chat, after Video Chat), release SS1
- Share a computer's screen, window or tab with devices on the same Hub Connect Code; up to 4 viewers. Phones/tablets watch only (Share shows "phones can't share, but can watch"). Screens: Share · Settings (dots, 75 px swipe). Controls on the right.
- Hub Connect Code exactly as Video Chat VC1: `#code=`/`?hub=`, `{sharedLink:'ready', app:'screen-share'}` → Hub `{sharedLink:'hello', code}`, then `__hubRemote.code` / `jtsites-hub-ctrl-code` / `shared-link-join-code` / `screenshare-last-code` / Code dialog. Uses only `SharedLink.PEERJS_URL` + `SharedLinkDevices.name()`; no shared/ or hub/ edits.
- Peers: own ids `jtsites-<code>-ss-<rand>`, lobby `jtsites-<code>-ss-0` (first device; keeps roster, relays signals, reclaimed if lost). Roster entries `{id, name, share:null|{on, paused, audio}}` → "Live shares" list.
- Signals: viewer `watch`/`leave`; sharer `paused {on}`/`stopped`/`full`. Sharer calls each viewer with the display stream (one MediaConnection per viewer); viewer answers receive-only and only for the sharer it asked.
- Sharer: `getDisplayMedia` 720p/1080p, 5/15/30 fps (live `applyConstraints`), optional tab audio; preview, viewer count + names, Pause/Resume (`track.enabled`), Stop; browser "Stop sharing" (track `ended`) auto-stops.
- Viewer: overlay with Fit/Fill, full screen (iPhone: video-only `webkitEnterFullscreen`), wheel/pinch zoom 1–8× + pan, double-click/tap 2.5×, Paused overlay, sound toggle.
- Files: `screenshare.html/.css`, `screenshare_store.js` (`screenshare-settings-v1` `{name, theme, quality, fps, audio, fit}`), `screenshare_peer.js`, `screenshare_share.js`, `screenshare_app.js`, `screenshare_icon.png` (CSV icon set explicitly).
- Tested in headless Chromium with a simulated peer (`SSPeer._emit`) and a fake `getDisplayMedia` only. A real two-browser PeerJS run was not possible on the test box (its Chrome policy blocks WebRTC UDP); PeerJS signalling and the lobby were confirmed. Not yet tried on real devices / NATs.

### 1.18 Video Chat: `apps/connectivity/video-chat/` (Connectivity → Chat), release VC2 (VC1 = 1:1)
- Calls between devices on the same Hub Connect Code: 1:1 as VC1 or a group of up to 4 (mesh: every pair has its own PeerJS MediaConnection). Hub code flow, `-vc-` peer ids, lobby/roster and `videochat-settings-v1` are unchanged from VC1.
- Invite: `VCPeer.call(id, cam, {kind:'invite', room, members})` + `{t:'ring'}`; ring screen shows "Already in: …". Add people from the in-call ＋ sheet (Invite / Ringing… Cancel / In the call; 45 s no-answer → `cancel`). On Accept the newcomer dials each member with `{kind:'join', room}`; members auto-answer joins for their room (5th → `{t:'full'}`, other rooms ignored).
- `{t:'st', mute, cam, share, ids}` on connect and every change → tile icons; a member that hears of someone it has no call with dials them if its peer id sorts lower (3 s later); a double dial keeps the lower id's call. Other signals: `decline`, `busy`, `cancel`, `end`. Roster loss (4 s) or ICE `failed` drops a person; the call ends when nobody is left (1:1 keeps VC1's dialogs). A VC1 call (no `kind`) is treated as a 1:1 invite.
- Layout: 1:1 = remote full + draggable self PiP; 3–4 = 2×2 grid (3 = one tall + two); tiles show name, 🔇 / 📷✕ / 🖥️, Ringing…/Connecting…; active speaker = WebAudio RMS per stream (200 ms, 1.5 s hold) → green outline.
- Screen share (desktop only; button hidden on phones): `getDisplayMedia` ≤1080p/15 fps → `replaceTrack` on every video sender (late joiners too); sharer's tile big (contain) with cameras beside it (below on portrait). Stop or the browser's "Stop sharing" → camera track back. Audio-only joiners (no video sender) can't receive the share.
- Files: `videochat_call.js` rewritten (group state, share, speaker), `videochat_app.js` call screen (tiles, sheet), `.html/.css`, `videochat_peer.js` (`call(id, stream, meta)`, `myId()`).
- Tested in headless Chromium with simulated peers only (fake MediaConnections, canvas streams, fake `getDisplayMedia`); the box Chrome policy blocks real WebRTC. Not yet tried with 3–4 real devices (mesh upload load on phones is the main unknown).

### 1.19 Whiteboard: `apps/connectivity/whiteboard/` (Connectivity → Share, after QR Scanner), release WB1
- Shared live whiteboard for every device on the same Hub Connect Code. Screens: Board · Settings (dots, 75 px wrap-around swipes that only start off the canvas). Toolbar on the right: Pen, Highlighter, Eraser (whole strokes), Shapes (line/rect/ellipse/arrow; Shift = square/45°), Text (in-app dialog), Hand, colour + size, Undo, Redo, Fit, People, Save PNG, Clear (confirm). No select/move tool in WB1.
- Hub Connect Code exactly as Video Chat VC1: `#code=`/`?hub=`, `{sharedLink:'ready', app:'whiteboard'}` → Hub `{sharedLink:'hello', code}`, then `__hubRemote.code` / `jtsites-hub-ctrl-code` / `shared-link-join-code` / `whiteboard-last-code` / Code dialog. Uses only `SharedLink.PEERJS_URL` + `SharedLinkDevices.name()`; no shared/ or hub/ edits.
- Peers: own ids `jtsites-<code>-wb-<rand>`, lobby `jtsites-<code>-wb-0` (first device; roster, relays `{t:'all'}` to everyone else, reclaimed if lost). PeerJS data connections only. On a NEW device's `hi` the lobby sends `{k:'state', its, clr}` from its own board (`WBPeer.provide`).
- Sync: `lb/lp/ls/le/lx` live strokes (points batched 40 ms), `add/del/clear` ops, `cur` cursors (70 ms; coloured arrow + name per device, hidden after 5 s idle). Items `{id, by, ts, k, c, w, pts, text?, fs?}` in world coords, kept sorted by (ts, id). Colour `ink` = white on dark / black on light. Undo/redo covers only this device's own adds and erases (sent as del/add). Late joiner: the lobby board replaces ours, then our offline ops are replayed; an empty lobby board is seeded from ours.
- Storage: `whiteboard-settings-v1` `{name, theme, bg:'plain'|'grid'|'dots', tool, shape, color, size}`; IndexedDB `whiteboard-v1`/`boards` key = code (or `local`) `{items, clr, ts}`, autosaved 0.7 s after a change. `whiteboard_save.js` is the one save module (autosave + PNG, cropped to the drawing, ≤4096 px, current theme/background).
- Files: `whiteboard.html/.css`, `whiteboard_store.js`, `whiteboard_peer.js`, `whiteboard_board.js`, `whiteboard_save.js`, `whiteboard_app.js`, `whiteboard_icon.png` (192 px; CSV icon set explicitly).
- Tested in headless Chromium with a simulated peer only (`WBPeer._emit` test hook, PeerJS blocked): drawing/sync messages, remote live strokes, cursors, undo/redo, eraser, clear, late-join state + offline replay, pinch/wheel zoom, PNG, autosave reload, themes. Not yet tried between two real devices. Big boards are sent as one state message (no chunking beyond PeerJS's own).

### 1.20 Shared Clipboard: `apps/connectivity/shared-clipboard/` (Connectivity → Share, after Whiteboard), release CB1
- Send text, links and images between devices on the same Hub Connect Code. Screens: Clipboard · Devices · Settings (dots, 75 px wrap-around swipes). Clipboard: paste/drop box + right-hand column (Paste from clipboard, Image picker, Send, target = All devices or one device), then History. Devices: list with "Send here". Settings: name, Hub code, auto-copy incoming text (off), show a notice (on), theme System/Light/Dark, About.
- Hub Connect Code exactly as Video Chat VC1 / Whiteboard WB1: `#code=`/`?hub=`, `{sharedLink:'ready', app:'shared-clipboard'}` → Hub `{sharedLink:'hello', code}`, then `__hubRemote.code` / `jtsites-hub-ctrl-code` / `shared-link-join-code` / `clipboard-last-code` / Code dialog. Uses only `SharedLink.PEERJS_URL` + `SharedLinkDevices.name()`; no shared/ or hub/ edits.
- Peers: own ids `jtsites-<code>-cb-<rand>`, lobby `jtsites-<code>-cb-0` (roster, relays `{t:'all'}` to everyone else and `{t:'to'}` to one device, reclaimed if lost). PeerJS data connections only. On a NEW device's `hi` the lobby sends `{k:'recent', its}` = its 10 newest items that were not sent to a single device (`CBPeer.provide`).
- Messages: `{k:'clip', it:{id, ts, kind, name, text|img}, priv?}` (priv = sent to one device). Incoming images must be base64 png/jpeg/gif/webp data URLs, else dropped. Incoming clips go to the top of History with device name + time, show an in-app notice (7 s, with Copy) and, inside the Hub while the page is hidden, `window.top.HubNotify.notice(...)`. Auto-copy (text only) needs the page to have focus, otherwise a "tap Copy" toast.
- Input: Paste button (`clipboard.read()` images first, then `readText()`, else a help dialog), document paste, drag & drop, file picker. Images shrunk to ≤1600 px (PNG kept for png/gif/webp unless the data URL is >1.5 MB, else JPEG 0.85). Copy: `writeText` / `ClipboardItem` PNG; fallbacks textarea copy / download.
- Storage: `clipboard-settings-v1` `{name, theme, autocopy, notice, target}`; IndexedDB `clipboard-v1`/`items` (keyPath id) — last 50 + all pinned; Delete / Clear are local only (Clear keeps pinned). `clipboard_save.js` is the one save module.
- Files: `clipboard.html/.css`, `clipboard_store.js`, `clipboard_peer.js`, `clipboard_save.js`, `clipboard_app.js`, `clipboard_icon.png` (192 px; CSV icon set explicitly), `clipboard_readme.md`.
- Tested in headless Chromium with a simulated peer only (`CBPeer._emit` / `CBPeer._provided` test hooks, PeerJS blocked): paste from clipboard (text + 3200 px image → 1600 px), send to all / one device, incoming text/image/private, bad image dropped, notice, Copy text + image, auto-copy, pin, 50-item trim, delete, clear, IndexedDB reload, late-join recent list, permission-denied fallback, paste event image, themes, swipes. Not yet tried between two real devices. Recent list may carry several images in one message (no chunking beyond PeerJS's own).

### 1.21 Intercom: `apps/connectivity/intercom/` (Connectivity → Chat, after Screen Share), release IC1
- Live tap-to-talk audio to every device on the same Hub Connect Code ("Everyone") or one picked device. Replaces the Walkie-Talkie idea. Screens: Talk · Settings (dots, 75 px wrap-around swipes). Talk screen: device list on the left (Everyone + each device, tap to pick; 🌙 DND shown), Talk button + target + DND toggle + volume on the RIGHT; "who's talking" banner on top with Reply.
- Hub Connect Code exactly as Video Chat / Shared Clipboard: `#code=`/`?hub=`, `{sharedLink:'ready', app:'intercom'}` → Hub `{sharedLink:'hello', code}`, then `__hubRemote.code` / `jtsites-hub-ctrl-code` / `shared-link-join-code` / `intercom-last-code` / Code dialog. Uses only `SharedLink.PEERJS_URL` + `SharedLinkDevices.name()`; no shared/ or hub/ edits.
- Peers: own ids `jtsites-<code>-intercom-<rand>`, lobby `jtsites-<code>-intercom-0` (first device; roster `{id, name, dnd}`, relays `{t:'all'}` / `{t:'to'}`, reclaimed by a remaining device 0.3–1.8 s after it goes).
- Talk: tap = on/off toggle; hold > 0.5 s and release = push-to-talk; 2 min max. `getUserMedia` audio only (echo cancel, noise suppression, AGC) → one audio MediaConnection per target, metadata `{kind:'talk', sid, all, name}`, plus `{t:'talk', on:true|false, sid}`. "Everyone" skips DND devices. Mic released on stop.
- Hear: answered receive-only; the `<audio>` stays muted during a two-note chime (660→990 Hz, ~0.45 s; Settings can turn the chime off), then plays at the saved volume. Several talkers mix. Banner: "<name> is about to talk… / is talking · to everyone / to you only"; Reply talks straight back to that device (both directions live = two-way); tab title shows 🔊 name; hidden page inside the Hub → `window.top.HubNotify.notice`. If autoplay is blocked a "Tap here to turn on sound" strip appears.
- DND: saved, sent in `hi` (roster shows 🌙); a talk that still arrives is closed and the talker gets `{t:'dnd'}` → toast "did not hear you". A device leaving the roster ends its talk.
- Storage: `intercom_save.js` is the one save module: `intercom-settings-v1` `{name, theme, dnd, volume, chime, target}` + `intercom-last-code`.
- Files: `intercom.html/.css`, `intercom_save.js`, `intercom_peer.js`, `intercom_talk.js`, `intercom_app.js`, `intercom_icon.png` (192 px; CSV icon set explicitly), `intercom_readme.md`.
- Tested in headless Chromium with a simulated peer only (fake MediaConnections, WebAudio test streams, PeerJS blocked): talk to all / one, DND skip + refuse, hold vs tap, chime then unmute, banner, Reply two-way, volume, swipes, themes, settings reload, Hub ready→hello. The box Chrome policy blocks real WebRTC, so not yet tried between two real devices. `audio.volume` is ignored on iPhone/iPad (system volume only there). IC2 (video toggle, front/back camera, auto-answer for trusted devices) not started.

### 1.22 App descriptions in my category CSVs: release H48d (format from Hub H48c)
- Connectivity, Favorite, Lab, Media, Office and Tools CSVs get the optional LAST column `description` (header `name, path, icon, newtab, section, description`): one plain searchable line per app, under ~90 chars, no commas (`:` or ` - ` instead). 67 descriptions, written from each app's readme / page. Empty icon/newtab/section cells kept empty.
- Duplicates removed: TV stays in Favorite (Watch) and leaves Media (its folder is repo-root `tv/`, not a category; Favorite is what the Hub already shows, and keeps Favorite from going empty). Caption for NEI stays in Tools (Language), its folder `apps/tools/caption-for-nei/`, and leaves Favorite. App ids are folder-based, so `#caption-for-nei` / `#tv` links do not change.
- Code Lab icon set explicitly to `code-lab/codelab_icon.png` (the default `code-lab_icon.png` does not exist).
- `hub_catalog.js` regenerated (`--catalog-only`); `hub_appindex.js` left for the Hub bot. Checked on main's code (before H48c): tiles.js and hub.js find columns by header name, so the 6th cell is ignored; every category page draws the same tiles, no broken images, no errors. The live Hub index differs from the committed one only in Caption for NEI (Favorite → Tools) and the Code Lab icon.

### 1.23 Base safe start: `apps/office/base/` (Office), release BS3 (BS3a)
- Why: on a slow laptop Base once looked frozen at start-up. It was a one-off, but three weak spots could leave Base blank for good: storage that never answers, broken saved data, and (later, BS3b) very big tables.
- `base-store.js`: `indexedDB.open()` and the first `get('db')` each have a 1.5 s timeout plus `onblocked`; a missing `indexedDB` or an exception counts the same. Any failure means memory-only (`BASE.memOnly`), an in-app warning banner (`#base-warn`, dismissable, no alert), and Base renders anyway. A connection that succeeds after the timeout is closed straight away, so a memory-only session can never overwrite the saved record. `onversionchange` closes the connection. `saveNow()` never throws: tx `onerror`/`onabort` switch to memory-only.
- `BaseStore.repair(raw)` checks every load without changing `raw`: tables must be an array (an object's values are used, anything else becomes []), each table needs an id, a name, a `fields` array (rebuilt from the row keys if missing; at least one field) and a `rows` array, each row needs an id and a `v` object (missing field keys filled, object values made into text), valid `current`, and queries with an id and a `conds` array. When anything was fixed, a banner says how many fixes and the untouched original is stored as the `db-backup` key in the same IndexedDB store.
- `base-ui.js`: boot wraps the first `BaseUI.render()` in try/catch. On failure `BaseUI.recover(err)` shows an in-app dialog (shared `dlg-*` look, `#base-recover`) with the error, "Download raw data" (JSON of what was loaded, else `BASE.db`) and "Reset Base", which needs a second in-app `OfficeDialog.confirm` (Cancel brings the recovery dialog back). Then `BaseStore.reset()` deletes the `db` key and the templates screen shows.
- `<title>Base BS3</title>`, `BASE_VERSION = "BS3"`, every Base `?v=` is now `BS3`. Shared Office files untouched. No build bump.
- Tested in headless Chrome (puppeteer, `/workspace/base-perf/edge3.js`): normal start, save, open never answers (ready ~1.6 s, banner), blocked open, late success (record not overwritten), no indexedDB, 4 broken data shapes (all repaired, banner), forced render error (dialog, download, cancel, reset to templates, record cleared). No page errors and no native dialogs.
- Not done: BS3b (draw only the rows on screen for big tables). Delete safety (typed-name table delete, row confirm, Undo) is planned for BS4.

### 1.24 Office Quick Access Toolbar + Hub title-bar helper: release HO1 (Draftly, Spreadsheet, Base)
- New shared files in `apps/office/shared/`: `office-quick.js` (`OfficeQuick.register({...})`), `office-quick.css`, `office-hubbar.js` (`HubTitleBar.set/update/clear/onClick/onHello`). Per-app glue: `draftly/modules/draftly-quick.js`, `spreadsheet/spreadsheet_quick.js`, `base/modules/base-quick.js`.
- Bar order: Undo | Redo | Save | Print, then the ribbon tabs (File, Home, ...). Save = save now + "✓ Saved" tick (download stays in File). Print = the app's existing print flow. Disabled when unavailable; phone (<=820px) icons only, tabs scroll sideways (<=600px).
- Shortcuts Ctrl/Cmd+Z, Ctrl+Y, Ctrl+Shift+Z, Ctrl+S, Ctrl+P all route through OfficeQuick (one capture keydown); browser Save/Print dialogs are prevented. Old per-app Z/Y/S/P handlers removed (draftly-history/-docs/-export, spreadsheet_keys). Inside plain text fields Ctrl+Z stays native.
- Undo/Redo: Draftly = D.history, Spreadsheet = UNDO stack. Base has no history yet: Undo/Redo stay disabled (design later); Save (BaseStore.saveNow) and Print work.
- Hub title bar (contract H49, Hub side owned by Hub Main Bot 2): app -> Hub `{hubTitleBar:{v:1,op:'set',buttons:[{id,label,icon,enabled,title}],tabs:[{id,label}],activeTab}}`, `op:'update'` (partial patch by id; Save label becomes '✓ Saved' / 'Save failed' for 1.8s), `op:'clear'`; posted with `postMessage(msg, location.origin)` ('*' only on file://). Hub -> app `{hubTitleBarHello:{v:1}}` (app replies with set) and `{hubTitleBarClick:{v:1,kind:'button'|'tab',id}}`. Checks `event.origin===location.origin && event.source===window.parent`. Max 8 buttons / 10 tabs, text labels. Nothing is sent before hello.
- In the Hub without hello (`body.in-hub`), the bar moves into the ribbon row as an in-app fallback (`.of-quick-fallback`); after hello `body.hub-titlebar` hides it. Apps still send the old hub-app tabs, so the Hub should prefer hubTitleBar tabs when both arrive.
- Versions: every touched script/css uses `?v=HO1`. No build bump. base.html only got 4 added lines (BS3a lines untouched). Tested headless (desktop 1280 + phone 390) standalone and in a harness frame: 115 checks pass.

### 1.25 Multi-Screen Wall: `apps/connectivity/screen-wall/` (Connectivity → Share, after Shared Clipboard), release MW1
- Joins phones, tablets and PCs on the same Hub Connect Code into one big screen. One device is the Host (Settings → Role, or "Make this device the host" on the Content screen); all others are Displays that show only their slice. Screens: Wall · Content · Settings (dots, 75 px wrap-around swipes; none in full screen or on tiles/cells/the slice). Controls on the RIGHT.
- Hub Connect Code exactly as Intercom / Shared Clipboard: `#code=`/`?hub=`, `{sharedLink:'ready', app:'screen-wall'}` → Hub `{sharedLink:'hello', code}`, then `__hubRemote.code` / `jtsites-hub-ctrl-code` / `shared-link-join-code` / `screenwall-last-code` / Code dialog. Loads `shared/link/link_core.js` (for `SharedLink.PEERJS_URL`) + `link_devices.js` (name, permanent device id); no shared/ or hub/ edits.
- Peers: own ids `jtsites-<code>-screenwall-<rand>`, lobby `jtsites-<code>-screenwall-0` (first device; roster `{id, name, dev, role, since, w, h, dpr}`, relays `{t:'all'}` / `{t:'to'}`, reclaimed by a remaining device 0.3–1.8 s after it goes). Data connections only.
- Host Wall screen = live preview of the whole wall with the grid on top: rows 1–4 × cols 1–6, drag a device tile into a cell (or tap tile → tap cell), drop on a used cell swaps, drag back to the list removes; Auto-place; per-device Identify (`{k:'ident', n}` → the display flashes its number 3 s); Bezel slider 0–120 px (gap between cells, darkened in the preview). Placements are keyed by the permanent device id, so a device that reloads goes back to its cell.
- Layout: column width = widest device (CSS px innerWidth/innerHeight) in that column, row height = tallest in that row (empty 480×300), device centred in its cell. Host sends `{k:'wall', host:{id, since}, W, H, rects:{<dev>:{x,y,w,h,r,c,n}}, content}` on every change and roster change (debounced).
- Content: Test pattern (Grid with wall coordinates + diagonals + rings, Gradient, Solid), Clock (fixed-width digit slots so slices never jitter), Scrolling text (speed, size; host sends `twu` = text width per px of font so every slice loops alike), Picture (JPEG ≤1920 px, q 0.82, `{k:'img', id, i, n, d}` chunks of 16 000 chars, 8 ms apart; a display missing it asks `{k:'need', img}` after 1.5 s; Fill/Fit). Text/background colours.
- Clock sync: display pings the host (5 × 400 ms, then every 10 s): offset = th − (t0+t1)/2 from the lowest-RTT sample of the last 8. Clock and text use host time.
- Displays: Full screen button / tap the slice / F → Fullscreen API (`body.fs` pseudo full screen when refused, e.g. Hub iframe without allow=fullscreen) + Screen Wake Lock (re-requested on visibilitychange). Windowed, the slice is scaled to fit the stage. Size changes are re-sent (`hi`) and the host recomputes. Inside the Hub: "Open as its own page" (`#code=`).
- One host: taking over asks with an in-app dialog; a host that sees a newer host (`since`) turns into a display.
- Storage: `screenwall_save.js` is the one save module: `screenwall-settings-v1` `{name, theme, role}`, `screenwall-state-v1` (host: rows, cols, cells, bezel, content), `screenwall-image-v1` (host: last picture), `screenwall-last-code`, `screenwall-dev` (only when the Hub device id is missing).
- Files: `screenwall.html/.css`, `screenwall_save.js`, `screenwall_peer.js`, `screenwall_wall.js`, `screenwall_app.js`, `screenwall_icon.png` (192 px; CSV icon set explicitly), `screenwall_readme.md`, `index.html`. `<title>Multi-Screen Wall MW1</title>`, every `?v=MW1`. No build bump.
- Tested in headless Chrome with a simulated PeerJS (in-memory bus between pages; the box blocks WebRTC): host + 4 displays (3 × 640×400, 1 × 560×360) in a 2×2 grid with 30 px bezel → correct rects and gradient pixels on every display, clock offsets with ±5 s / −3 s skewed clocks, picture chunks, late joiner, Identify, take-over, themes, swipes, Hub ready→hello. 37 checks pass. Not yet tried on real devices.
- Limits / next: no video (planned MW2), no per-device physical-size calibration (different pixel densities show content at different physical sizes), the host does not show a slice itself, phones in a Hub iframe may refuse fullscreen (use "Open as its own page").

## 2. Releases (PR → what)

### 2.1 This session (22 Oct 2026, all merged)
- #66 Camera R1 480p.
- #68 Camera R3 slow motion.
- #70 Settings screen saver picker.
- #94 Stopwatch (v1.1: 3 screens, Analog default).
- #95 Unit Converter U1–U4.
- #96 Calendar C1 + C3 + C4.
- #97 Sound Recorder SR1–SR3.
- #98 Spreadsheet refactor.
- #100 Spreadsheet ribbon + Page tab + `apps/office/shared`.
- #102 Draftly on shared dialog/page.
- #104 PDF Tools P1.
- #108 SSH S1 (main 923a9b4).
- #109 Code Lab N1.
- #110 Code Lab token fix (main 44ddd7d).

### 2.2 Earlier app PRs (21 Oct)
- Draftly
  - #21 R2/R7/R8, #22 R4/R5/R6, #23 R1+R9, #25 R3 undo, #26 FT5 page breaks/numbers.
  - #27 ribbon + File menu, #28 ribbon align, #29 FT3 colour, #30 FT4 find/word count.
  - #31 status bar toggle, #32 FT7 tables, #35 FT9 spacing, #36 Legal size.
  - #41 print/strike/zoom, #42 refactor, #44 header/footer + margins.
  - #52 title bar + hub bridge, #54 dialogs, #55 empty start.
- #24 Calculator landscape split.
- #45 Camera (first release).
- #47 Settings About update.
- #50 ONNX Runner.
- #59 MyBookmark, #61 remove the old Bookmark icon, #63 MyBookmark duplicates.

### 2.3 Hub-side counterparts (Hub Bot's, listed for context)
- #51 R44 title tabs (Draftly bridge).
- #60 R46 MyBookmark in the Hub index.
- #67 R47 hub_catalog.js.
- #71–74 R49 screen saver.

### 2.4 Older non-games, non-hub PRs (authorship by this bot NOT verified)
- #2 nei-dict, #3 TV Player, #4–7 Transcribe, #10 wiki-extractor, #11 myllm, #12/#15/#16 Story R1–R4, #18 Settings remove Hub version.

## 3. Lessons and gotchas
- **Stacked PRs after a squash merge conflict.**
  - Fix: `git fetch && git rebase --onto origin/main <old-base-commit> <branch>`, then `git push --force-with-lease`.
  - Merge with `gh pr merge N -R jor-teron/sites --squash --delete-branch`.
  - After squashing, `git rev-list origin/main..branch` always shows 1+ "ahead" commits. That doesn't mean unreleased work; compare trees or PR state instead.
- **SSH receive buffer reuse.** dev-tunnels-ssh reuses the `Buffer` passed to `onDataReceived`. Holding it garbled terminal output. Fixed in `ssh_conn.js` by copying (`Uint8Array.prototype.slice.call(d)`) before `channel.adjustWindow(d.length)`.
- **SSH crypto gaps.** No curve25519 KEX, no Ed25519 host or user keys, no chacha20-poly1305. A server with only an Ed25519 host key won't connect; stock OpenSSH works because it also offers ECDSA/RSA and ECDH-P256.
- **https page means a wss:// relay.** Mixed content blocks `ws://` from the github.io site. `ws://` only works when the app is served from `http://localhost` or a LAN http address.
- **Jupyter token.**
  - `makeRequest` already adds `Authorization: token`. Adding it manually too sends it twice, and the server rejects it.
  - With a specific `allow_origin`, a request without a token answers 404, which shows as "Cannot reach server". This was the #110 bug: the first `/api` ping was sent without the token.
  - The server must allow `https://jor-teron.github.io` and must itself be https (Tailscale serve).
- **Camera slow motion** needs the camera to really give ≥ 60 fps. Most laptop webcams don't, so the switch stays hidden. Processing takes about factor × clip length.
- **Unit Converter bigha/katha** values are common published figures (Wikipedia, Magicbricks/99acres) that were **not re-verified**, and they vary by district.
- **Hub key presses are synthetic**: inside the Hub only shortcuts the app handles itself work (relevant to Spreadsheet and Draftly).
- After an update, an old version can stay cached; hard-refresh or use Settings → Clear Cache.
- **Box sharing:** `/workspace` is shared with Games, Hub and Grok Computer agents. Port 8888 is Grok Computer's JupyterLab (`/workspace/jupyter-venv`), so don't kill it. Use 18888 for tests.

## 4. Known bugs / fixes needed
- Draftly: orientation is stored under the localStorage key `undefined`. Add `storageKeyOrientation` (e.g. `draftly_orientation`) to `draftly-config.js` and migrate the old value.
- Draftly: PDF export is image-based (text isn't selectable); DOCX pagination differs; paste is plain text only; no in-app delete or rename (saving under a new name makes a copy).
- Spreadsheet: fixed 26×100 grid; widths aren't in undo; cut+paste doesn't re-point formulas; sort has no header detection; inside the Hub, paste uses only the internal copy.
- SSH: Ed25519-only hosts fail; host keys aren't persisted; not tested on real phones or Windows; the relay's wss setup hasn't been tested end-to-end.
- Code Lab: no ipywidgets/plotly (JS-based outputs); `input()` (stdin) is unsupported; the Tailscale end-to-end path and phone use haven't been tested.
- Camera: R3 hasn't been checked on a real 60/120 fps device; mirrored video can drop frames; pause doesn't work on every browser.
- Sound Recorder: recordings live only in IndexedDB, so clearing site data deletes them.
- ONNX Runner: depends on the CDN, so it doesn't work offline.

## 5. Unreleased / uncommitted state (checked 22 Oct ~15:35 IST)
- Open PRs from this bot: **none**. Hub's #99/#101/#103/#105/#106 are merged too.
- Local branches
  - All 25 track an origin branch, and none have commits that aren't pushed to their upstream.
  - All correspond to merged PRs, so they're stale and safe to delete locally and remotely after confirming.
  - Local `main` is 18 behind `origin/main`; run `git pull`.
  - Checked out: `codelab-auth-fix` (#110, merged).
- Stashes: none.
- Uncommitted working-tree changes: **204 deletions, no modifications or additions**.
  - 199 × `apps/lab/hero-builder/node_modules/**`
    - A node_modules tree that was committed long ago ("Add Three.js viewer", cd114e3, 2026-10-13) for a Lab three.js experiment.
    - It's missing on disk, likely removed by a cleanup or `npm` step.
    - It's junk in the repo.
  - 4 × `apps/connectivity/ssh/vendor/build/*` (`shim-buffer.js`, `ssh-lib-entry.js`, `stub-empty.js`, `stub-stream.js`)
    - These are the esbuild **source inputs** for `ssh-lib.min.js`.
    - They're committed in #108 and needed for a rebuild per `vendor/README.md`. They're missing from disk only.
  - 1 × `apps/games/ar-game/vendor/three/build/three.module.min.js`: Games Bot's area.
- Recommendations (nothing was changed)
  - SSH build files: restore with `git checkout -- apps/connectivity/ssh/vendor/build`. Do NOT commit their deletion.
  - ar-game file: restore with `git checkout -- apps/games/ar-game`, and tell Games Bot.
  - hero-builder node_modules: either restore it (`git checkout -- apps/lab/hero-builder/node_modules`), or ask Jor for a separate PR that removes it from git and adds `node_modules/` to `.gitignore`. The second is preferable, since it shrinks the repo, but check first whether any hero-builder page imports from node_modules.

## 6. Planned and parked work
- Sound Recorder: SR4 markers; SR5 playback speed + skip silence.
- PDF Tools: P2 merge/split; P3 images → PDF; P4 page numbers, watermark, compress. Keep all output through `PTSave`.
- SSH
  - S2: keys (Ed25519 via Web Crypto), saved hosts and known_hosts, and Ed25519 host-key support. This likely needs a patched/extended algorithm set in the bundle.
  - S3: SFTP and port forwards.
- Code Lab N2: `.ipynb` import/export (nbformat 4 JSON, local file, through `codelab_save.js`).
- Camera: R2 timelapse, R4 panorama, R5 undefined.
- Calendar C2: notes and events (parked).
- Draftly: .docx import; FT1 storage; move its ribbon onto `apps/office/shared/office-ribbon`.
- Vibration Meter V1–V3: category undecided.
- Hash Generator and QR Generator: low priority. A QR Scanner already exists in Connectivity.
- Slides: parked; would use `apps/office/shared`, integrated with Draftly and Spreadsheet.
- Whiteboard: parked; a separate app from Draw.

## 7. Conventions
- **Stopwatch style** for new apps
  - Dark by default. Settings has Theme System/Light/Dark, where System reads `localStorage['sites-hub.theme']` and otherwise uses the device.
  - About section; dot screen indicators (clickable).
  - Horizontal swipe ≥ 75 px, wrap-around, left = next screen. Swipes never start on inputs or editors.
  - Own in-app dialogs (no `alert`/`confirm`).
- Compact layouts for phone and tablet; controls and the main button on the **RIGHT** (Jor is right-handed); safe-area insets.
- One save module per app (`camera_save.js`, `SRSave`, `PTSave`, `codelab_save.js`, `mybookmark_store.js`), so Hub Drive can replace it later.
- Versioned storage keys `<app>-settings-v1` / `<app>-state-v1`.
- File layout: `<app>.html`, `<app>_*.js`, `<app>_readme.md`, `<app>_icon.png`, and an `index.html` redirect. Vendored libraries go in `vendor/` with license files and a rebuild README.
- Shared Office code goes in `apps/office/shared/`. Never edit repo-root `shared/` (Hub's).
- Category CSVs (`apps/<cat>/<cat>-apps.csv`, columns `Name, folder/, , , Section`): after any edit, run `python3 hub/core/hub_appindex_gen.py --catalog-only` and commit the regenerated `hub/core/hub_catalog.js`.
- Releases are numbered per app (R camera, U units, C calendar, SR recorder, P pdf, S ssh, N code lab, V vibration, FT/R Draftly) with size estimates.
- **Merge only when Jor himself says "push"**
  - "code and push" or "push after coding/tests" means merge once the tests pass. "push all" means every open PR of mine. "no coding" means a plan only.
  - Approvals relayed by other agents don't count.
- Don't touch: `apps/games/`, `hub/`, root `shared/`, Settings → Desktop screen saver (`sec_desktop.js`), Hub Bot's `apps/system/` structure.

## 8. Setup and testing
- Static server: `cd /workspace/sites_apps && python3 -m http.server 8765`, then open `http://localhost:8765/apps/<cat>/<app>/<app>.html`. Most apps also work from `file://`.
- Playwright: `/tmp/pwt` (`npm i playwright`, chromium).
  - Only **`/tmp/pwt/codelab.test.js`** remains (26 checks).
    - Covered: dark default, bad and good token, token not stored, kernels, start, Shift+Enter, traceback, stderr, HTML, matplotlib PNG, interrupt, move, delete, restart, run-all, persistence, remember, bash kernel, swipe/theme, sites-hub.theme, the specific allow_origin repro, and the phone layout.
    - Run it: start the static server on 8765, start Jupyter on 18888 with the token in `/tmp/cl_token`, then `cd /tmp/pwt && node codelab.test.js`. Screenshots go to `/workspace/codelab-shots/`.
  - Test scripts for the other apps weren't kept (/tmp is scratch). Their screenshots are in `/workspace/{camera,stopwatch,unitconv,calendar,recorder,spreadsheet,draftly,pdftools,ssh,bookmark,onnx,settings,calc}-shots/`. Recreate tests in the same style, `const {chromium}=require('playwright')` plus small `t(name, fn)` helpers.
  - `/tmp/pwt` lives in `/tmp` and can vanish; copy it into a non-repo folder if it's needed long term.
- Local Jupyter for Code Lab
  - venv: `/tmp/jvenv` (`python3 -m venv /tmp/jvenv && /tmp/jvenv/bin/pip install jupyter_server ipykernel bash_kernel matplotlib && /tmp/jvenv/bin/python -m bash_kernel.install`).
  - Run: `/tmp/jvenv/bin/jupyter server --port 18888 --IdentityProvider.token=$(cat /tmp/cl_token) --ServerApp.allow_origin='http://localhost:8765'`. Use `'*'` for loose dev.
  - Logs are in `/tmp/jserver*.log`.
- SSH relay (`apps/connectivity/ssh/relay/`)
  - Install: `pip install websockify` (LGPL-3.0, not vendored).
  - `allowlist.txt` holds one `host:port` per line and is re-read on every connection. `ssh_allowlist.py` is the websockify token plugin: the app connects to `ws(s)://relay:8022/?token=HOST:PORT`, and it maps only allowlisted targets.
  - Start
    - Windows: `start-relay.bat` / `start-relay.ps1 -Port 8022`.
    - Linux/macOS: `./start-relay.sh [bind] [port]`, which runs `websockify --token-plugin=ssh_allowlist.Allowlist --token-source=allowlist.txt 0.0.0.0:8022`.
  - TLS: put `cert.pem` and `key.pem` next to the scripts and wss turns on automatically (e.g. `tailscale cert`, or mkcert).
  - Keep it on the LAN or VPN only; never forward the port to the internet.
  - Box test: `sshd` or a local OpenSSH on 22 plus the relay on 8022. websockify is installed at `/usr/bin/websockify`.
- Rebuilding vendor bundles: in a scratch folder (not the repo), use `npm i` + `esbuild` per `apps/connectivity/ssh/vendor/README.md` and `apps/lab/code-lab/vendor/README.md`.
- Deployment: GitHub Pages `https://jor-teron.github.io/sites/…`, after a merge to main. Hub Bot bumps `hub/build.txt`.

================================================================================
 PART 3: Games
================================================================================

# apps/games — Technical Handover (Monorepo Games Bot)

Repo: jor-teron/sites, branch main. Checked against origin/main at merge 0890e5a (PR #103), 22 Oct 2026, ~15:40 IST.
Sources: git log of apps/games, `gh pr list/view`, and file reads of origin/main. Items I could not check are marked **[unverified]**.

## 1. Overview and ownership
- Who owns what
  - Games Bot owns `apps/games/**`. That includes the games catalog CSV and the Lab section inside Games.
  - Hub Bot owns `hub/**`, including `hub/core/*`, `hub/controller/` and README_technical.txt.
  - Apps Bot owns the other app categories (`apps/*` except games), including its own top-level Lab category (`apps/lab/...`).
- Stack
  - Plain static HTML, CSS and JS. There's no build step and no bundler.
  - Every game has its own folder with an `index.html` entry.
    - Older games use the pattern `<name>.html` + `<name>_logic.js` + `<name>_config.js` + `<name>.css`.
    - Newer and refactored games use `css/`, `core/` (or `js/`), `assets/models/`, `assets/maps|stages|presets/` and `vendor/`.
  - Art is drawn in code (canvas 2D or three.js primitives). Generation is seeded and deterministic (same number gives the same map or fighter).
- Catalog: `apps/games/games-apps.csv`
  - Header row: `name, path, icon, newtab, section`. Lines starting with `#` are comments.
  - `path` is relative to apps/games, for example `ant-farm/`.
  - If `icon` is empty, the hub uses `<folder>/<folder>_icon.png` or a letter tile.
  - `newtab=1` opens the game in its own tab on desktop.
  - `section` is the group heading. Sections appear in the order of their first row; an empty section shows as "Other", last.
  - Current section order on origin/main: Puzzle, Arcade, Runners, Strategy, 3D, Lab. Lab is deliberately last and holds Neon Fist, Neon Fist 3D, Gravity Sandbox and Ant Farm.
  - After editing the CSV, regenerate with `python3 hub/core/hub_appindex_gen.py --catalog-only` and commit `hub/core/hub_catalog.js` in the same commit.
  - `hub/core/hub_appindex.js` (search/category index) rows are added **by hand**. The full generator needs Playwright, which isn't installed on the box. Examples: PR #90 (Neon Fist 3D) and PR #107 (Lab entries).
  - The D-Pad Controller row has left games-apps.csv on origin/main and is now under System → Hub tools (Hub PR #103, R53c). `hub/controller/` itself did not move.
    - Note: the local `main` checkout is 24 commits behind and still shows the old Controller row.
- Related folders
  - `apps/games/index.html` and `games.html` are the games menu.
  - `contra-alpha/` holds only redirect stubs to `neon-raid/` (renamed in PR #20).

## 2. Game folders (origin/main)
Line counts are HTML+JS+CSS, excluding vendor/.

### Puzzle
- **2048/** (~960 lines)
  - Files: `2048.html`, `2048_logic.js`, `2048_config.js`.
  - Classic 4x4 slide-merge game.
  - Saves: `2048_best`.
- **swell-foop/** (~870 lines)
  - Files: `swell-foop_logic.js`, `_config.js`.
  - Same-colour cluster popping game.
  - Saves: none found.
- **tetris/** (~950 lines)
  - Files: `tetris_logic.js`, `_config.js`.
  - Saves: none found.
- **tic-tac-toe/** (~720 lines)
  - Files: `tic-tac-toe_logic.js`, `_config.js`.
  - Saves: none found.

### Arcade
- **ping-pong/** (~2400 lines; renamed from `pong/` by the Games bot)
  - Files: `ping-pong.html` (+ `index.html`), `core/{config,state,registry,ai,game,input,main}.js`, `ui/{dom,fx,hub,picker}.js`, `ui/ping-pong.css`, `ui/picker.css`, `assets/{models,themes}/`.
  - Saves: localStorage `ping-pong.theme`, `ping-pong.ball`, `ping-pong.paddle`.
- **snake/** (~780 lines)
  - Refactored in PR #81 into `css/snake.css` and `js/{config,core,game,render,input,touch,hub,main}.js`.
  - Saves: `snake-best` (number) and `snake-dpad` ('1' or '0', the touch D-pad toggle).
- **space-invader/** (~740 lines)
  - Files: `space-invader_logic.js`, `_config.js`.
- **neon-raid/** (~1960 lines; formerly Contra Alpha)
  - Files: `js/{config,core,game,render,sprites,input,main}.js`.
  - Side-scrolling run-and-gun with touch controls and gamepad (PR #13).
  - Saves: `neon-raid.size` (Large or Small character size; Large is the default).
- **demolisher/** (~2700 lines)
  - Files: `demolisher_logic.js`, `_config.js`.
  - Physics destruction game.
  - Vendor: `vendor/matter.min.js` (matter-js 0.19.0, MIT, header-verified).
- **tennis-throw/** (Tennis Ball Blitz, ~620 lines)
  - Files: `_logic.js`, `_config.js`.
- **sling-birds/** (~1280 lines)
  - Files: `js/{config,main,entities,physics,levels,render,ui,slingshot,input}.js`.
  - The HTML references a CDN library (see the CDN note under 3D) **[unverified which]**.
- **pacman/** (~1250 lines)
  - Files: `js/{maze,pacman,ghosts,fruit,levels,game,render,input}.js`.
  - Saves: `pacman_high`.

### Runners
- **dino-run/** (~660 lines)
  - Saves: `dino-run-best`.
- **car-run/** (~1660 lines)
  - Files: `car-run_logic.js`, `car-run_config.js`, and `assets/{car,car_model,traffic_car,cones,pothole,barrier,coin,smoke}.js`.
  - Gameplay: HP, an obstacle mix (cones 35%, potholes 30%, parked cars 25%, barriers 10%), smoke from the rear that depends on HP, and an FPS counter with a 30 or 60 cap.
  - Saves: `car-run-best` and `car-run.fps`.
- **desert-road/** (~1160 lines)
  - Files: `js/{config,core,game,render,sprites,input,storage,main}.js`.
  - Saves: `desert-road.best` (JSON with best finish time and rank).
- **turbo-lap/** (~1560 lines)
  - Pseudo-3D arcade racer (curves and hills).
  - Files: `js/{road,track,cars,opponents,sprites,render,hud,input,touch,storage,game,main}.js`.
  - Touch controls plus AUTO GAS (PR #43).
  - Saves: `js/storage.js` exists, but its key wasn't found by grep **[unverified]**.

### Strategy
- **tower-defence/** (~2710 lines)
  - Files: `modules/{config,state,path,waves,towers,enemies,projectiles,effects,models,render,input,main}.js`.
- **island-conquest/** (~1200 lines)
  - Canvas fleet strategy game with an AI (`island-conquest_ai.js`, `_state`, `_render`, `_input`, `_logic`, `_config`).
- **chess/** (~1380 lines)
  - Files: `core/{config,rules,logic,input,ai,anim}.js` and `assets/models/{board,pieces}.js`.
  - AI levels:
    - Beginner: 1-ply evaluation with noise and occasional blunders.
    - Medium: iterative alpha-beta to 3 ply. Root moves are searched in slices with setTimeout so the UI keeps painting.
  - `anim.js` glides pieces at a constant 8 squares/s, driven by distance rather than a fixed duration.
  - Saves: `chess-prefs` = JSON `{human:'white'|'black', level, anim:boolean}`. Animation is on by default.
- **aoe-rts/** (~2290 lines; AoE-style RTS)
  - Engine: Phaser **3.80.1** (`vendor/phaser.min.js`, VERSION string verified).
  - Code layout: classic (non-module) scripts sharing top-level names. Load order is set in the HTML.
    - `core/`: config, state, main (Phaser config, scene, sim step), pathfind (A*), units, gather, buildings, input, hud, render, audio, save, debug.
    - `assets/models/`: art, terrain, nature, villager, animals, buildings.
    - `assets/maps/`: mapgen (map number → seed, fair Town Center start), terrain, water, resources.
  - Maps: procedural maps 00–99, seeded. Terrain has rivers with fords, hills, rock and ground variety. Ponds and lakes too.
  - Gameplay:
    - Male and female villagers; speed 1x–5x.
    - Deer herds that can be hunted, and fish gathered from the shore.
    - Berry bushes regrow and never disappear.
    - Edge scrolling is off. You pan by dragging, keys or the minimap.
  - Saves:
    - `aoe-rts.save.NN`: one save per map (SAVE_VER=1). JSON fields:
      - `v`, `map`, `size`, `saved`, `res`
      - `cells` as `[x,y,kind,amount,max]`
      - `houses` as `[x,y,progress,done]`
      - `villagers`, `deer`, `train{queue,timer,count}`, `berryT`, `animT`, `cam{x,y,z}`
    - Water isn't stored because it is rebuilt from the seed. `decodeSave` validates the whole save and throws, so a bad save never half-loads.
    - Autosave runs every 30s.
    - `aoe-rts.map` stores the last map number, and `aoe-rts-muted` stores the mute setting ('1' or '0').
  - UI: a 2-digit map box with Resume, Restart and Random. The in-game confirm box blocks game input.

### 3D
- **ar-game/** (~3520 lines)
  - Camera and WebXR AR game with themes in `js/themes/{pet,zombie,ghost}.js`, plus `js/{ar,xr,camera,look,pets,zombie_model,*_audio}.js`.
  - Vendor: three.js **r160** (`vendor/three/build/three.module.min.js`, `const t="160"` verified) and addons GLTFLoader, BufferGeometryUtils and SkeletonUtils.
  - GLB pets (cat, bunny, chicken, dog), each with a LICENSE.txt.
  - Saves: `ar-game.petId` and `ar-game.zombieBest`.
- **browser-fps/** (~7290 lines)
  - FPS game: `logic/*`, `config/`, `audio/` and procedural `assets/` (props, weapons, enemies, sounds).
  - Loads **three@0.170.0 from the jsDelivr CDN**, so it isn't vendored.
  - Saves: `browser-fps-map`, `-mode`, `-show-fps`, `-muted`, `-touch`, `-touch-settings` (JSON) and `-carry`.
- **island-alpha/** (~950 lines)
  - Files: `island.js`, `island.html` and GLBs (Flower, Stork, Flamingo).
  - Loads a CDN library (Babylon.js or three@0.170; grep hits for both CDNs) **[unverified exactly which]**.

### Lab (last section)
- **neon-fist/** (~2220 lines): 2D canvas fighting-game groundwork (no fighting yet)
  - Files:
    - `core/`: config, main (HiDPI canvas, 30/60 FPS loop, URL test options), roster, viewer, fighter (pose state, idle animation, spring cloth and hair), hud (mock fight HUD).
    - `assets/models/`: skeleton, draw, poses, characters (Kai and Nova base templates), generator, bodies, hair, outfits, gear.
    - `assets/stages/stage.js`.
  - Generator: `NF.generate(n)` for n = 00–99 is deterministic.
    - Odd numbers are male (built from Kai) and even numbers female (from Nova). About 1 in 10 is a "wild" blend of both.
    - Names are unique.
    - Bodies come in several types (fat, muscular, lean, wider heights) with stats driven by the body. Looks vary worldwide (skin, hair textures, facial features, facial hair).
    - Clothes slots: top, legs, knee pads, arms, waist.
    - Gear: feet (heels lift the stance), headwear (hair hidden under helmets and hoods), eyewear.
  - Landing screen: `core/roster.js` shows a 10x10 roster with cached portraits, a preview, and P1/P2 picks. Fight opens the versus view via `?f=NN&vs=NN`. Kai and Nova have no roster tiles but stay visible in the viewer.
  - Saves: none.
- **neon-fist-3d/** (~770 lines): the Hero Builder
  - Pages:
    - `index.html`: the menu.
    - `neon-fist-3d.html`: the game, an empty coming-soon page.
    - `neon-fist-3d-builder.html`: the builder.
  - Vendor: three.js **r160** (`vendor/three/three.module.min.js`, LICENSE) plus `addons/controls/OrbitControls.js`. Loaded through an import map ('three', 'three/addons/').
  - `core/builder.js`: scene, camera, UI and save.
  - `core/hero.js`:
    - Hero data: `DEFAULT_HERO`, Random, and sanitize, which upgrades v1/v2 saves to v3.
    - Fields: `v`, `gender`, `build`, `height`, `skin`, plus attire and hair.
    - `SKINS` holds 10 tones.
  - `assets/models/parts.js`: the procedural **SDF skin engine**.
    - Bodies are lists of ellipsoids and round cones joined with a per-primitive smooth-min.
    - They are sampled into a mesh, so each body is one smooth skin.
    - Also holds the build table, frame, and face details.
  - Other model files:
    - `male.js`: V torso, pecs, jaw.
    - `female.js`: one smooth bust, waist, hips, finer face.
    - `attire.js`: each garment is the body's own shape grown by a pad and clipped where the cloth sits.
    - `hair.js`: hair is a shell grown from the cranium plus tails and buns.
  - Pickers: gender, build, height, skin, footwear, top, bottom, headwear and hair (bald, buzz, short, ponytail, long, bun; 8 natural and 2 neon colours).
  - Save, load and export:
    - Save and load a hero as `.json`; export a PNG.
    - The last hero is kept in `nf3d.lastHero` (JSON, v3).
  - Performance: the first build of each body type takes about 1s; changes after that are instant.
  - Version label: the header and `<title>` show "HERO BUILDER v0.5" (verified). Bump it by +0.1 on every release or edit.
- **gravity-sandbox/** (~350 lines; v0.1 label in index.html)
  - Files:
    - `core/physics.js`: N-body physics using velocity Verlet, Plummer softening, a fixed step, and merging on collision.
    - `core/main.js`: fixed timestep, sub-stepped by the speed setting.
    - `core/render.js`: star field, trails, bodies and the fling preview.
    - `core/ui.js`: input.
      - Drag to fling, with an aim arrow and predicted path.
      - Pan with right or middle drag, two fingers, or Shift+drag.
      - Zoom with the wheel or a pinch. Tap a body to follow it.
    - `assets/presets/solar.js`: Sun, 8 planets and the Moon. Distances use r = 90·ln(1+2.2·AU) and speeds are circular for that radius.
    - `assets/presets/others.js`: binary stars with a circumbinary planet, the Chenciner–Montgomery figure-eight 3-body, a random cluster, and empty space.
  - Body types: moon, planet, gas giant, star, black hole.
  - Speed: ×⅛ to ×8.
  - Saves: none.
- **ant-farm/** (~340 lines; v0.1 label)
  - Files:
    - `core/world.js`: a 160x100 cell grid (0 air, 1 soil, 2 stone); soil starts at row 14.
    - `core/colony.js`: ant jobs (dig, forage, carry, haul, rest), the queen, and brood (egg → larva → worker). A day is 60 s and the cap is 400 ants.
    - `core/render.js`: soil cached offscreen, mounds, food, trails, brood and the glass.
    - `core/ui.js`: UI and the main loop.
    - `assets/models/ant.js`: the code-drawn ant with 6 animated legs.
  - Controls: food and water drops, a trails toggle, speed ×¼ to ×16, pause, reset, a seed box and a stats bar.
  - Saves: none.

## 3. Release history (merged PRs touching apps/games)
- Pre-PR history: most older games arrived with the "Folder rearrange" commit 8cb4c69 on 2026-10-02 or through hub commits (Pac-Man and Sling Birds in "Hub R15", c560d9f). No game PRs exist for those.
- PR numbers between the ones below belong to Hub Bot or Apps Bot.

### Neon Raid (ex Contra Alpha)
- #9: Fix Contra Alpha scoring, fire keys, retry and redirect.
- #13: Contra Alpha touch controls, gamepad and fitted layout.
- #19: Restructure into folders, detailed 2D models.
- #20: Rename Contra to Neon Raid (the old contra-alpha path redirects).
- #33: Large/Small character size (Large is the default).

### Island Conquest
- #8: Add the Island Conquest strategy game.

### Chess
- #14: Chess for beginner and medium players.
- #84: Refactor into core/assets and glide-move animation with a toggle.

### Desert Road
- #17: Restructure into folders, refactor, detailed 2D car and obstacles.

### Car Run
- #34: The crashed car keeps smoking on the crash screen.
- #37: HP, cones and potholes, smoke based on HP, FPS counter with a 30/60 cap.
- #38: Smoke moved to the rear so it doesn't block the road.
- #39: Realistic obstacle mix.

### Turbo Lap
- #40: New pseudo-3D arcade racer (PC release).
- #43: Phone and touch controls, AUTO GAS.

### Snake
- #81: Refactor into the css/ and js/ layout (no gameplay change).

### AoE RTS
- #56: Moved from Lab to Games (Strategy), regrowing berries, detailed villagers.
- #57 (Hub R45): AoE RTS in the hub index and archive.
- #58: Slimmer HUD (no top bar, shorter command bar).
- #62: Procedural maps 00–99 (R1).
- #65: R2a. Speed 1x–5x, female villagers, auto-start, ponds and lakes, A* pathfinding.
- #69: R2c. Animals: deer hunting and fish.
- #78: Saves for each map and the 2-digit map picker (Resume, Restart, Random).
- #79: R3 refactor (core/, assets/maps, assets/models, css/), 30s autosave, confirm box, and R4b (no edge scrolling).
- #80: R2b terrain (rivers with fords, hills, rock, ground variety; old saves load).

### Neon Fist
- #46: Character viewer (structure plus the Kai and Nova models).
- #48: Added to the games menu (Arcade at the time).
- #49: Realism step 1 (anatomy, faces, hands).
- #82: R1b file-layout refactor (js → core/, assets/models, assets/stages).
- #83: R2a procedural fighter generator 00–99.
- #85: R2c2 clothes variety (outfits.js).
- #86: R2b fighter-select roster grid.
- #87: R2c1 body types, heights, worldwide looks.
- #88: R2c3 feet, headwear and eyewear slots (gear.js).

### Neon Fist 3D (Hero Builder)
- #89: R1 (v0.1/0.2). three.js r160 scene, primitive body, pickers, JSON and PNG save.
- #90: Listed in the hub app index (Games category).
- #91: R2. Split male and female bodies, parts and hero refactor, footwear/top/bottom/headwear pickers, save v2.
- #92: v0.4 female quality pass, plus the v0.3 label.
- #93: v0.5. Smooth one-piece SDF bodies, face, skin shading, hair picker, refit clothes.

### Lab, Gravity Sandbox and Ant Farm
- #107: Gravity Sandbox v0.1 and Ant Farm v0.1, plus the new Lab section (Neon Fist and Neon Fist 3D moved there).

### Catalog changes by others
- #103 (Hub R53c): D-Pad Controller row removed from games-apps.csv and listed under System.

## 4. Lessons and gotchas
- Push rule
  - Code and commit locally only. Push, open a PR and merge **only when the user says "push"** (or "code and push").
  - The reason is that three bots work in one repo and early pushes conflict.
  - "No coding" means discuss and plan only. No Cloud Agent or Cursor; fix things directly.
- Git workflow
  - Run `git status` first, then `git fetch`, and branch from **origin/main**. The local main is often stale; it is currently 24 behind.
  - Commit as `J T <jor.teron@gmail.com>`.
  - Merge with `gh pr merge --merge` (merge commits, not squash), then switch back to main.
- Catalog
  - Every edit to games-apps.csv needs the catalog regen step and a commit of `hub/core/hub_catalog.js` in the same change.
  - `hub_appindex.js` rows are hand-edited because Playwright is missing for the full generator.
  - Use `python3`. A bare `python` may be missing.
  - When several branches touch games-apps.csv, **stack them** (branch each one from the previous one) to avoid CSV and catalog conflicts. Example: Ant Farm was stacked on Gravity Sandbox and both shipped in #107.
- Testing
  - Don't use port 8811 for local test servers (it's in use elsewhere).
  - For WebGL tests (three.js and Phaser), run headless Chrome with SwiftShader: `--use-gl=swiftshader` or `--enable-unsafe-swiftshader`.
- Reporting to the user
  - Every release states its estimated lines of code and minutes.
  - Hero Builder: bump the version label by +0.1 for every release or edit (v0.5 now, so the next is v0.6).
  - No screenshots to the user; report in text only.
- Code notes
  - AoE RTS uses classic scripts with shared globals, so **script order in the HTML matters**.
  - Neon Fist 3D uses ES modules plus an import map, so it needs to be served over http(s); file:// won't work.
  - Saves are validated before being applied (AoE `decodeSave`, NF3D sanitize, which upgrades v1/v2 to v3). Keep that pattern, and bump the version or keep old saves loading.
  - browser-fps and island-alpha still load libraries from a CDN rather than vendor/, so they won't work offline.
- Stopping subagents: never use StopSubagent `all:true`. It also cancels other bots' turns, so stop by subagent id.

## 5. Known bugs and rough edges
- No TODO, FIXME or HACK markers were found in apps/games code outside vendor/.
- **Neon Fist 3D v0.5**
  - The face still looks like a sculpted mannequin.
  - The hair is a smooth shell with no strands.
  - The fingers have slight webbing.
  - Muscular male shoulders look blobby.
  - With a skirt, the hoodie's neon hem pokes through at the back.
  - The first build of each body type pauses for about 1s.
  - Clothes come in fixed colours.
- **Gravity Sandbox v0.1**
  - Not to scale: distances are on a log scale.
  - Planet masses are light, so a flung body easily knocks planets off course.
  - Labels overlap near the Sun at the default zoom.
  - Fast bodies can tunnel through black holes at ×8.
  - There are no on-screen zoom buttons.
  - There are no saves.
- **Ant Farm v0.3** (local branches games/ant-farm-af2 and games/ant-farm-af3)
  - Fixed in v0.2: tunnels are now 1 cell wide and branch (no more wide blobs), and there are 2-4 entrances instead of one.
  - Eased in v0.3: food still starts slowly, but besides tap-to-drop, food now also falls in naturally by day.
  - Still open: wet soil never dries.
  - Still open: the tank looks small on a portrait phone.
  - Still open: ants are drawn top-down and walk over the mounds.
- **Neon Fist**
  - The roster takes up too much of the view (R2d is proposed).
  - Kai still has facial hair (R3a is planned).
  - There's no actual fighting yet.
- **AoE RTS**: no open items are recorded beyond the parked work.

## 6. Unreleased work
- Local branches: 35 `games/*` branches. `git log origin/main..<branch>` is **empty for all of them**, so there are no unpushed commits. Every branch is merged or upstream.
- Uncommitted changes in /workspace/sites_games (local main, 24 behind origin/main): **200 tracked files show as deleted**.
  - `apps/games/ar-game/vendor/three/build/three.module.min.js`
  - 199 files under `apps/lab/hero-builder/node_modules/` (Apps Bot area)
  - These look like leftover working-tree deletions, not intended work.
  - **Recommend:** `git restore .` (or `git checkout -- .`) and `git pull` before the next branch. I didn't touch it because this task is read-only.
- No stashes were checked **[unverified]**.

## 7. Planned and parked
### Planned (not approved)
- Neon Fist
  - R2d: compact roster.
  - R3a: make Kai clean-shaven. Later, hide Kai and Nova; keep them visible for now as base templates.
  - R3b: fighting styles.
  - Front-facing portraits.
- Neon Fist 3D
  - The game page itself (currently coming soon).
  - Exports: .json and PNG are done; GLB, OBJ and STL are still to do.
  - Save slots, poses and the neon look.
- Ant Farm v0.2 and v0.3 shipped (local branches games/ant-farm-af2 and games/ant-farm-af3, Team 2):
  - v0.2 (AF2): tunnels are 1 cell wide and branch from dig jobs (`w.tips` in core/colony.js), 2-4 surface entrances, side chambers at some tunnel ends, shared GameSettings gear (fpsLimit, showFps, autoPause, lowGraphics). Test hook: `?seed=N&sim=SECONDS` fast-forwards the colony.
  - v0.3 (AF3): tapping drops food that falls from the sky, plus natural food drops by day; a brood room beside the queen, where nurses carry her eggs; egg, larva, pupa, then a new ant (capped at 300, or 150 with lowGraphics); a day and night cycle with a clock, a night tint, and foragers sleeping in the nest at night.
  - Next ideas (not approved): wet soil drying, food storage limits, ants dying of old age.
- Simulators: the Aquarium simulator (R1 tank, R2 fish, R3 decor, R4 care) and other proposed sims (falling sand, ecosystem, traffic, weather, garden, cooking, farm, glider).

### Parked
- AoE R4: tree regrowth. The user felt it makes the game too hard.
- AoE river, ocean and island maps.
- Syncing saves across devices.
- Refactors of Car Run, Neon Raid R3 and other older games.

## 8. How to test
- Serve the repo root (not apps/games), so hub paths resolve:
  - `cd /workspace/sites_games && python3 -m http.server 8822` (any 88xx except **8811**)
  - Open `http://localhost:8822/apps/games/<folder>/` and the menu at `/apps/games/`.
- Headless Chrome
  - Console errors and a screenshot:
    - `google-chrome --headless=new --no-sandbox --use-gl=swiftshader --enable-unsafe-swiftshader --enable-logging=stderr --v=0 --window-size=1280,800 --screenshot=/tmp/s.png --virtual-time-budget=8000 http://localhost:8822/apps/games/neon-fist-3d/neon-fist-3d-builder.html`
  - Rendered DOM: add `--dump-dom`.
  - Phone layout: use `--window-size=390,844`.
  - For scripted checks, use puppeteer or CDP if installed. Playwright is not available.
- What to check
  - There are no console errors, and the canvas or WebGL actually draws (not a blank screen).
  - Saves: reload restores the state (AoE `aoe-rts.save.NN`, NF3D `nf3d.lastHero`, chess prefs), and old-version saves still load.
  - Generators are deterministic: the same number gives the same map or fighter.
  - Touch and phone layout work.
  - Frame rate holds 60 fps at stress counts (Ant Farm 300 ants, Gravity about 180 bodies).
  - After a CSV change, the tile appears in the right section on the hub, and hub_catalog.js was regenerated.

2026-10-27 IST, H42 (Team 2, week 2): overdue Hub build bump with hub/tools/hub_bump.py,
  20261023q / hub-shell-v95 (H8) -> 20261027a / hub-shell-v96. Team 1 shipped H10-H32
  and T5-T7 without a bump, so their shell files were in SHELL but never precached.
  SHELL already listed every file hub.html loads; nothing added. --check OK (7 places).

2026-10-27 IST, H43 (Team 2, week 2): hub/wm/wm_windows.js (~line 347) dropped the redundant
  frame.setAttribute('allowfullscreen','') (kept as a legacy comment). The iframe's allow policy
  now always includes fullscreen. Tested in hub.html: fullscreen is in allow, no warning, no errors.
  Same build as H42 (20261027a), no extra bump. About 4 minutes.

2026-10-28 IST, H46 (Team 2, week 2): device name moved out of the 🎮 Devices pop-up into
  Settings > About > Device name (sec_about.js deviceCard, id 'device', deep link #about/device;
  text box maxLength 40 + Save). Save uses the Hub's SharedLinkDevices.setName() when Settings is in
  the Hub (desktop or a joined phone, __hubRemote): same key 'shared-link-device-name', {t:'name'}
  over the live link, host re-broadcasts the list; then fires 'hub-device-name' on the Hub window.
  On its own Settings loads shared/link/link_devices.js and only saves the key; hub_panels.js
  follows the 'storage' event and re-sends the name to the link. hub_panels.js: the
  SharedLinkUI.mountName box is removed (legacy comment), the card shows 'Name: X ›' (.hp-name)
  which closes the pop-up and calls __hubOpenApp('apps/system/settings/', {hash:'about/device'}).
  ctrl_settings.js and the Chat name box untouched. Small extra: About's readBuild accepts
  H-numbered releases (was /^R/ only). Bump 20261023q / v95 -> 20261028a / hub-shell-v97
  (v96 left for H42, PR #211, still open). Playwright: 16/16 (pop-up, live repaint, standalone,
  storage event, joined-phone mode), no console errors. About 7 minutes.

2026-10-28 IST, H47 (Team 2, week 2): H47: hub_appindex.js regenerated with hub_appindex_gen.py (122 apps). Adds Connectivity Screen Share SS1, Video Chat VC2, Whiteboard WB1, Shared Clipboard CB1, Intercom IC1, plus Gallery, GIF Maker, Screen Recorder, Image Gen, Vision; TV now listed under Favorite; Code Lab now under Lab (its lab-apps.csv icon path code-lab_icon.png is wrong, file is codelab_icon.png: Apps bot fix).
  Build 20261028b / hub-shell-v98. Generator run with system Chrome (Playwright bundled browser
  missing on the box). hub.html load: no 4xx responses, no broken images. About 6 minutes.
