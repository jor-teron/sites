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
- Settings glue: `hub/menu/hub_settings.js` opens `apps/system/settings/` (with #section). Settings app = settings.js + settings_store.js + sec_{wallpaper,desktop,windows,sizes,look,keys,howto,devices,about}.js (H29.2b: sec_devices.js loads before sec_about.js so Devices sits above About). Deep links `#wallpaper #desktop #sizes #look #keys #howto #devices #about` (+ `#devices/device|connected|profile|sync`; old `#about/device|profile|sync` redirect, settings.js ALIASES).
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
- Tested in headless Chromium with a simulated peer only (fake MediaConnections, WebAudio test streams, PeerJS blocked): talk to all / one, DND skip + refuse, hold vs tap, chime then unmute, banner, Reply two-way, volume, swipes, themes, settings reload, Hub ready→hello. The box Chrome policy blocks real WebRTC, so not yet tried between two real devices. `audio.volume` is ignored on iPhone/iPad (system volume only there). Video, camera flip and trusted auto-answer came in IC2 (see 1.27).

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

### 1.26 Base delete safety: `apps/office/base/` (Office), release BS4
- Why: deleting a table or a record was one tap on a button right beside the table / in the form view, easy to hit by accident and easy to confuse with each other.
- New `modules/base-delete.js` (`BaseDelete.table()`, `.records(rows?)`, `.menu(anchor, items)`). Ribbon Home: `#btn-table-delete` and `#btn-row-del` (− Record) removed; a `⋯` button after Rename (`#btn-table-more`) and after + Record (`#btn-row-more`) opens a small fixed-position menu (not clipped by the scrolling ribbon) with one red item: `#menu-table-delete` "🗑 Delete table…" / `#menu-row-delete` "⊖ Delete record…". Form view lost its Delete button.
- Typed-confirm dialog (in-app, shared `dlg-*` look, no alert/confirm): red button starts disabled; Enter only works when the text is right; Esc / Cancel / backdrop cancel; focus trapped. Table: solid red header 🗑 "Delete whole table", facts Table / Records / Fields, type the table name exactly (case sensitive, outer spaces ignored). Record: red-outline header ⊖ "Delete 1 record" (or N), preview of the first record (first 6 fields), type `DELETE` or the count.
- Deletes call `BaseStore.saveNow()` (no 400 ms debounce), so they survive an immediate reload. Deleting a table also clears an active query on it. No Undo toast; HO1 Undo/Redo stay disabled in Base (Undo/Redo is a later release).
- A capture keydown guard: Delete / Backspace outside an editable field are prevented and never delete anything; inside a cell they edit text as before.
- `<title>Base BS4</title>`, `BASE_VERSION = "BS4"`, Base's own `?v=` now `BS4` (base-quick.js and shared files keep their tags, unchanged). Shared Office files untouched. No build bump.
- Tested headless (puppeteer, `/workspace/bs4-test/test.js`) at 1280x800 and 390x844 phone: 43 checks each pass, no page errors, no native dialogs. Not tested inside the Hub frame. Multi-record selection does not exist yet, so the record dialog is always for 1 record for now.

### 1.27 Intercom video + trusted auto-answer: `apps/connectivity/intercom/`, release IC2
- Video toggle (off by default, saved `video`): a talk opens camera + mic, audio+video MediaConnections with metadata `video:true`. Camera off mid-talk = `replaceTrack(null)` + `{t:'vid', on:false}` and the camera is released; on = replaceTrack(video). Video turned on during a voice talk restarts it with video (`cont`). Red "camera on" bar + 🔴 in the title whenever the camera is live.
- Front/back flip (only while video is on), saved `facing`; toast when there is one camera.
- Incoming video shows at once, audio muted during the chime; banner 📹 Two-way + Reply; stage = them big, you small; camera-off placeholder.
- Trusted auto-answer: lasting device id `did` (16 hex); Settings trusts an online device → 32-hex token in `trusted` and `{t:'trust', did, token}` to it (re-sent when it returns); the other side keeps it in `keys` and shows 📹 View. `{t:'view', did, token}` is accepted only with Auto-answer on (default off), matching device + token, DND off, no other viewer; else `{t:'viewno', why:'off'|'untrusted'|'dnd'|'busy'}`. DND always wins and stops a running view. No 2-minute limit on a view; ends on Stop (`viewstop`), untrust (`{t:'untrust'}`), DND, or the viewer leaving. Viewer: no chime, banner Two-way / Talk back / Stop.
- Storage stays in `intercom_save.js` (`intercom-settings-v1` gains `video, facing, did, autoAnswer, trusted, keys`). IC1 voice talks still interoperate. `<title>Intercom IC2</title>`, every `?v=IC2`. CSV description updated, `hub_catalog.js` regenerated (`--catalog-only`). No build bump; no hub/, shared/ or apps/system edits.
- Tested headless Chrome (puppeteer, simulated peers, PeerJS blocked, fake camera): 58/58 checks (video talk, cam off/on, flip, stop releases tracks, mid-talk restart, receive-only answer, chime mute, two-way, trust/token, auto-answer off/untrusted/wrong token/DND/busy, view stop/untrust/leave, IC1 audio compat). Real WebRTC between two devices still untried (box blocks it).

### 1.28 Telephone: `apps/connectivity/telephone/` (Connectivity → Chat, after Intercom), release TP1
- Standalone phone app that shares Intercom's lobby pattern (no shared code edits). Each device gets a random 4-digit number (2000–9999), saved and shown big; editable device name; Settings → New number. Number clash: when an older device (different `did`, earlier `since`) has my number, this device takes a new free one and says so in an in-app dialog.
- Hub Connect Code exactly as Intercom: `#code=`/`?hub=`, `{sharedLink:'ready', app:'telephone'}` → Hub `{sharedLink:'hello', code}`, then `__hubRemote.code` / `jtsites-hub-ctrl-code` / `shared-link-join-code` / `telephone-last-code` / Code dialog. Loads `shared/link/link_core.js` (for `SharedLink.PEERJS_URL`) + `link_devices.js` (name).
- Peers: own ids `jtsites-<code>-telephone-<rand>`, lobby `jtsites-<code>-telephone-0` (roster `{id, name, num, did, busy, since}`, relays `{t:'to'}` to ONE device only; there is no broadcast signal). Failover like Intercom.
- Call flow: mic first, then `{t:'ring', cid, num, name, did}` to the device with that number (newest if two tabs share it) → `{t:'ringing'}` ack (none in 6 s = "Could not reach the phone") → Answer `{t:'answer'}` / Decline `{t:'decline'}` / already in a call `{t:'busy'}`. After answer the caller opens the audio MediaConnection (metadata `{kind:'phone', cid, num, name}`); the callee answers it only when peer + cid match. 30 s ring limit (`{t:'cancel', why:'timeout'}` → "No answer", missed on the callee), 15 s connect limit. `{t:'hang'}`, `{t:'mute', on}`; roster loss ends the call ("Call dropped").
- Tones are WebAudio oscillators: ringback 440+480 Hz 2 s/4 s, busy 480+620 Hz, ringtone warble every 3 s (+ vibrate, + `HubNotify.notice` when hidden inside the Hub), "not online" three rising notes, DTMF on the keypad (Settings can turn key tones off).
- In a call: timer, Mute, Speaker (`HTMLMediaElement.setSinkId` picker listing `audiooutput` devices; `selectAudioOutput` on Firefox; otherwise an in-app note), Hang up. Keyboard: digits / Backspace / Enter = call or answer / Esc = hang up.
- Recent calls: in ↙ / out ↗ / missed ✕ (red) with time and length or reason, tap to call back, Clear (in-app confirm). Busy-while-on-a-call is logged as missed "(you were on a call)".
- Storage: `telephone_save.js` is the one save module: `telephone-settings-v1` `{name, theme, num, did, volume, sink, keytones}`, `telephone-log-v1` (max 100), `telephone-last-code`.
- Files: `telephone.html/.css`, `telephone_save.js`, `telephone_peer.js`, `telephone_call.js`, `telephone_app.js`, `telephone_icon.png` (192 px; CSV icon set explicitly), `telephone_readme.md`, `index.html`. `<title>Telephone TP1</title>`, every `?v=TP1`. CSV row added (Chat), `hub_catalog.js` regenerated (`--catalog-only`). No build bump; no other hub/, shared/ or apps/system edits.
- Tested headless Chrome (puppeteer `/workspace/tp1-test/t.js`, two pages linked by a simulated signal + media relay, PeerJS blocked, fake mic and fake audio outputs): 60/60 checks (number made + kept, keypad, ring only the dialled device, ringback/ringtone, answer, cid checks, timer, mute, speaker picker, hang up releases the mic, decline, no-answer timeout, busy both sides, unreachable, not online, own number, peer leaves, log + call back, number clash, theme, swipes, Hub ready→hello, no native dialogs). Real WebRTC between two devices still untried (box blocks it).
- Limits / next: rings only while the app is open on the other device (PH1 launcher plan); phones usually do not let a page switch earpiece ↔ loudspeaker; one call at a time. TP2: contacts, missed-call badge, DND, video during a call. TP3: call waiting / hold, voicemail, conference.

### 1.29 Telephone contacts, missed calls, DND, video: `apps/connectivity/telephone/`, release TP2
- Screens are now Phone · Recent · Contacts · Settings (4 dots, 75 px wrap-around swipes). TP3 (call waiting / hold, voicemail, conference) is dropped for now.
- Contacts: `telephone-contacts-v1` `[{id (8 hex), name (≤40), num (4 digits), did, fav}]`, max 200, repaired on load, synced across tabs (`storage`). ＋ Add / ✎ Edit = in-app form (Name, Number, ⭐ Favourite; empty name, not 4 digits, own number or a number another contact has are refused in the form; Enter saves). Delete sits in Edit and asks again (in-app, red Delete). A contact stores the device's `did` when known (from the roster or the log), and when that device shows up with a new number the contact follows it (toast). Online state per contact: online / on a call / do not disturb / offline (dot colour). Contact names are used in Online now (device name kept small), the keypad, Recent calls (＋ on numbers that are not contacts, prefilled) and the ringing screen + tab title. Log entries now keep `did`.
- Missed calls: count of missed entries newer than `missedSeen` → red badge on the Recent dot + "(n) Telephone TP2" tab title; cleared when Recent is on screen, the page is visible and no call screen is up. Inside the Hub, a missed call while hidden also sends `window.top.HubNotify.notice({icon:'📞'})` (same pattern as the ring notice).
- Do Not Disturb: `dnd` (🌙 DND on Phone + Settings) and `dndFav` (Favourites still ring, default on). A ring under DND → `{t:'dnd', cid}` to the caller ("Do Not Disturb", busy tone), nothing rings or shows here, logged as missed `why:'dnd'` (badge only, no toast / Hub notice). Roster `hi` now carries `dnd` so other phones show it.
- Video: only while a call is active. Video on = camera (`facingMode` saved `facing`, 640×480 ideal, 15 fps; any camera as fallback) on a SECOND one-way MediaConnection `{kind:'phone-video', cid}` + `{t:'vid', on:true}`; the other side answers it with no stream (receive-only) only when peer + cid match the live call, else closes it. Each side sends its own, so two-way = two one-way streams and the audio call is never renegotiated. Stage: theirs big, mine small (alone = mine big), front camera mirrored, "Their video is starting…" between `vid` and the stream. Flip = new track with exact facingMode + `RTCRtpSender.replaceTrack`; one camera → toast. Video off = `{t:'vid', on:false}` + close + camera stopped; hang up / end stops everything.
- Settings gain `dnd, dndFav, facing, missedSeen`. `<title>Telephone TP2</title>`, every `?v=TP2`, about text updated. CSV description updated (6 columns, no commas), `hub_catalog.js` regenerated (`--catalog-only`). No build bump; no other hub/, shared/ or apps/system edits.
- Tested headless Chrome (puppeteer `/workspace/tp1-test/t.js`, simulated signal + media relay, PeerJS blocked, fake mic + fake camera; canvas streams stand in for the far camera): 108/108 checks (all 60 TP1 checks + 48 TP2: add / validate / duplicate / edit / delete confirm + cancel, online dots, names everywhere, add from Recent, ringing screen name by device id, badge + title + clear, DND decline + log + badge + favourites + switch off + roster flag, video one-way + receive-only answer + two-way + flip replaceTrack + off releases camera + hang up releases all + stray video refused, contact follows a new number, contacts kept after reload, Hub notice when hidden). Shots in `/workspace/tp2-shots`. Real WebRTC (and real front/back cameras) between two devices still untried (box blocks it).

### 1.30 Telephone 5-digit numbers, checked before kept: `apps/connectivity/telephone/`, release TP2b
- Numbers are 5 digits, random 10000–99999 inclusive (`TPSave.newNum(avoid)`, `numOk` = `/^[1-9]\d{4}$/`). Keypad stops at 5, "Numbers have 5 digits"; contact form "Number (5 digits)", max 5, 4 digits refused; dialling checks 5 digits. Hub Connect Codes stay 4 digits.
- Check before keeping: a fresh device's first number, or the number replacing a saved 4-digit one, is a candidate (`TPSave.pending()`, greyed, "Checking that no other phone has this number…"). `save()` keeps the stored value while pending, and `hi` sends `num:''` so nobody can dial it yet. The first roster from the lobby (while online) → `TPSave.checked(otherNums)`: taken → re-pick, then saved with `numAt`; toast "Your number is …". No roster within 5 s (`CHECK_MS`) → the candidate is kept.
- Later clash: `hi`/roster gain `at` (`numAt`, when the number was set) and `old` (`oldNum`). When another device (other `did`) has my number, the one whose `at` is newer moves; same `at` → the higher `did` moves (both sides agree). It moves with an in-app dialog "Your number changed: “X” already had the number … first…". In a call it waits and checks again when the call ends. Replaces TP1's `since` rule. A missing `at` counts as 0 (oldest).
- Moving old numbers: a saved 4-digit number is replaced ONCE (the next load finds 5 digits) with a checked 5-digit number. `oldNum` is kept, and an in-app notice says "Phone numbers now have 5 digits. This device’s old number … is now …". Contacts and Recent entries with a 4-digit number are kept, struck through as "old number": Contacts shows "not reachable until seen online", Recent has no ＋, and dialling one explains. `followNum(did, num, old)` / `followLog` switch them when the device is seen: by `did`, or, for entries without a `did`, by the device's advertised `old` number (the `did` is then learnt). Tapping a Recent entry calls the entry's device by `did` when it is online.
- Settings gain `numAt, oldNum`. `<title>Telephone TP2b</title>`, every `?v=TP2b`, about text updated. CSV unchanged (the description has no digit count); `--catalog-only` re-run gives no change. No build bump; no other hub/, shared/ or apps/system edits.
- Tested headless Chrome (`/workspace/tp1-test/t.js`, PeerJS blocked, simulated roster): 131/131 checks. All 108 TP1/TP2 checks pass, moved to 5-digit numbers. The 23 new TP2b checks cover: the candidate not saved, the collision re-pick, the timeout keep, the range (20 000 samples, ends 10000/99999), newNum skipping used numbers, migration 4321 → checked number with notice, once only, contacts/Recent following by did and by old, an unseen old number struck through, the dial refusal, the form, later clash (newer moves, older moves me, tie both ways, waits for the call), and the 5-digit keypad. Shots in `/workspace/tp2b-shots`.
- Limits: devices still on TP1/TP2 drop 5-digit numbers from their roster (and TP2b drops their 4-digit ones), so every device needs TP2b. The check only sees devices online at that moment; later clashes fix the rest. Real WebRTC between two devices is still untried (the box blocks it). Per-app lobby until the H50 mesh lands.

### 1.31 Phone launcher: `phone/` (new top-level folder, not an app, not in any CSV), release PH1
- Phone-style home screen for an Android WebView (Jor's home screen; PH3 = the APK). Fully gesture driven with pointer events (`phone_gesture.js`: 10 px axis lock, 75 px swipe or ≥24 px flick at ≥0.45 px/ms, 480 ms long-press, the click after a long-press swallowed). `touch-action:none` everywhere; the drawer list scrolls itself (drag + fling).
- html/body always `background:transparent` (Android wallpaper shows through). `#wall` test wallpaper: setting Auto/None/colour; Auto = transparent in an Android WebView (UA `; wv)` or `?webview=1`), gradient in a browser; `?bg=none|auto|<hex>` beats the setting.
- Home: clock + date on page 1, pinned grid (4 columns, 6 at ≥700 px; page 1 = 16 apps, others 24), dots, dock ≤5. Swipe up (home or dock) = drawer: search, tabs All + `HUB_CAT_CSV` categories (swipe sideways), alphabetical icons; pull down at the top / Back = close. Swipe down = quick panel: Theme, Full screen, Intercom, Telephone, Location (in-app placeholder until LL1), Settings; Notices (empty). Long-press = Open / Pin or Remove from home / Add or Remove from dock (full = dialog) / App info (name, category, description, path).
- Apps open in iframes inside `#apps` (allow camera, mic, geolocation, fullscreen…). Layers push `history` states; `popstate` closes to the state depth, so the WebView's Back works; a left-edge strip (18 px, captures the pointer) swipes back. Opening from the drawer/panel replaces that entry. At most `keepAlive` (1|2, default 2) frames stay alive, oldest dropped.
- Hub handshake: `{sharedLink:'ready'}` from our own frame + our origin → `{sharedLink:'hello', code, prefix:'jtsites-', devices:[]}` when `shared-link-join-code` or `jtsites-hub-ctrl-code` is saved; otherwise no reply (apps go standalone). No PeerJS in the launcher.
- App list READ ONLY from `../hub/core/hub_appindex.js` (`HUB_APP_INDEX`) + `../hub/core/hub_config.js` (category order). One save module `phone_save.js`: `phone-launcher-v1` `{v, pages, dock, recent, settings:{theme, wall, clock24, keepAlive}}`, repaired on load, memory-only fallback. Defaults: dock Telephone, Intercom, Camera, Gallery, Stopwatch (Clock stand-in).
- Stopwatch palette, dark default, System/Light/Dark following `sites-hub.theme`; home text always white + shadow. Settings sheet has About. In-app dialogs only. `<title>Phone PH1</title>`, every `?v=PH1`. Files: `phone/index.html`, `phone.css`, `phone_save.js`, `phone_apps.js`, `phone_gesture.js`, `phone_app.js`, `README.md`. No build bump; no other hub/, shared/ or apps/system edits; no CSV change.
- Tested headless Chrome (puppeteer `/workspace/ph1-test/t.js`, CDP touch at 412×915 + mouse at 1280×800): 87/87 checks (transparent html/body + alpha-0 screenshot, ?bg=, WebView UA, page swipes / short drag / flick, drawer from home and dock, category swipes, alphabetical, search + no match, list scroll vs close, panel tiles, theme cycle, Location placeholder, long-press menu, pin / unpin, dock full / remove / add, app info, open + full-screen iframe + title, handshake hello, edge swipe back, kept alive + reused, history Back, 2-frame limit, Settings + About + test wallpaper, save after reload, bad save repaired, desktop drag / wheel / keys / edge drag, no native dialogs, no errors). Shots in `/workspace/ph1-shots`.
- Limits: not yet run in a real Android WebView; Full screen needs WebView support; apps that navigate inside their frame add history entries (Back steps inside the app first); Esc inside an app goes to the app; no icon drag-to-reorder; notices empty; offline only with the Hub's service worker installed. phone/ ownership still to agree with Hub Main Bot 2 before PH2/PH3.

### 1.32 Photo Editor v2 Sharpen + Resize: `apps/media/photo-editor-v2/` (Media), release PE5
- Naming: the app's own scheme is "release N" (release 3 Send, release 4 Send QR in the readme), so this is release 5 = PE5. `<title>Photo Editor v2 PE5</title>`, every app `?v=PE5` (was 20261004a / 20261011x); the four shared/link scripts keep their own ?v=. `PE.config.release = 'PE5'`.
- Sharpen: new Adjust chip `sh` (config `adjust.sliders` entry with its own min 0 / max 100; the one slider switches its range per chip). Edits `adj.sh` (0..100, default 0, presets never touch it, Reset clears it). `PE.adjust.sharpen(src, dst, w, h, y0, y1, amount)` = 3×3 unsharp mask, 1-2-1 Gaussian (/16), `out = c + a·(c − blur)`, edges repeat, alpha copied; `amount = sh/100 · adjust.sharpenMax` (2). Runs after the colour LUT/matrix. Preview (pe_view.js): extra `sharpData` buffer; while dragging (`adjlive`) with sh > 0 the rebuild is debounced `view.sharpenDelay` 90 ms; on `change` it is immediate. Save (pe_io.js `processFull`): strips of `save.stripRows` with one margin row above and below; the row above is the previous strip's un-sharpened (already coloured) copy, so results equal a one-pass run (tested maxdiff 0 with 37-row strips).
- Resize: new `pe_resize.js` + toolbar button `#tb-resize` (key `E`) + modal `#dlg-resize` (in-app). Stored as edit `k: [kx, ky]` = scale along the PHOTO's own x / y axes, relative to the crop (`T.k`, `T.scaledCrop`, `T.baseSize` = before resize, `T.outputSize` = after). So it is in the undo snapshots, follows later crops (crop × k) and rotations (axes swap). `T.drawOriented` gained an optional `scaleY`; `V.content()` returns the scaled O plus `sx/sy` (crop mode = whole photo, unscaled). Dialog: Pixels / Percent (of the current output), lock (on by default; ratio of the current output), presets Original / 25 / 50 / 75 / 200 / 400 % / 640 / 1280 / 1920 / 3840 w, current and new size, cap note, "can't add real detail" and "slow on low-RAM" notes. Cap `R.clamp`: each side ≤ min(4 × base side, 8000), area ≤ `PE.io.limit().px` (16.7 MP touch / 50 MP desktop), min side 8; with the lock the shape is kept. Save: draw crop + orientation at native size, then `PE.resize.resample` in steps (each step ≤ 2× per axis: halving down, doubling up, `imageSmoothingQuality 'high'`, in-between canvases freed), then colour + sharpen at the output size. Save menu header adds "(resized)". Modal: U.act ignores everything but cancel while open; pe_input only Esc / Enter.
- CSV description now "Edit photos: crop - rotate - resize - brightness - contrast - sharpen - B&W and sepia looks"; `--catalog-only` regenerated hub_catalog.js (that one line). No build bump; no other hub/, shared/ or apps/system edits.
- Tested headless Chrome (puppeteer `/workspace/pe-shots/pe5-test.js`, generated 800×600 and 3000×1500 PNGs, exports via `PE.io.save('png', onBlob)`): 46/46 checks (title; Sharpen range/default, debounce, preview pixels change, recorded + chip dot, export differs, strip seams = reference, with brightness, undo / redo / Reset, other sliders keep ±100; dialog by E, current size, lock 400→300, Enter applies, 400×300 export, halving steps, undo / redo; Percent 200 → 1600×1200 export, 2× steps, interpolated tones; unlock 1000×1200 export; rotate swaps; cap note + shape-kept cap, notes present, Esc no change; 8000 px cap 8000×4000; presets 50% / 1920 w; crop after resize keeps the scale; 1920×960 export; no page errors). Sharpen on a 2.5 MP preview ≈ 60–120 ms on the box. Shots in `/workspace/pe-shots`.
- Limits: Sharpen preview runs on the screen-sized copy, so at fit it looks a bit stronger than the saved photo; enlarging is smooth interpolation only; an 8000 px save needs several hundred MB (native + step canvases) and may be slow or fail on 4 GB machines; crop mode shows the un-resized photo; not tried on a real phone yet.
### 1.33 Music Player: `apps/media/music-player/` (Media → Audio), release MP1
- Plays music from a folder or files on this device. Folder: `showDirectoryPicker`, with the handle kept in IndexedDB so it reopens after a reload (or with one "Open again" tap); otherwise `<input webkitdirectory>`. Files: one or more audio files, plus drag-and-drop. Subfolders up to 6 deep, 20 000 files max.
- Light for a Celeron / 4 GB: one `Audio` element, one object URL at a time (revoked), the library is never decoded, tags are read from the first 64 KB (two files at a time; big frames like APIC skipped), and the list is virtual (52 px rows). The tag reader handles ID3v2.2/2.3/2.4 (unsync, encodings 0–3) with ID3v1 fallback; without tags it uses "Artist - Title" or "NN Title" from the file name and the parent folder as album.
- Songs: sort Title/Artist/Album, search, tap to play the list from that song, ⋯ / long-press menu (Play, Play next, Add to playlist…). Player on the right (a bottom bar at ≤760 px): play/pause, previous (restarts after 3 s), next, shuffle (current song first), repeat off/all/one, seek with times, volume/mute.
- Playlists: create, rename, delete (in-app confirm), add, remove, ▲▼ reorder, Play, Shuffle. Saved by path + name + size, so files picked again without folder paths still match. Songs that aren't open are shown as needing the folder again (Play disabled, Open folder / Open again).
- Resume: the last song, position, queue and shuffle order come back paused with a "Ready to resume" toast. Songs of 10 min or more keep their own position in the shared module. Media Session sets metadata + artwork, play/pause/previous/next/seekbackward/seekforward/seekto and position state, so lock-screen keys and background play work. The optional level bar (off by default) is a lazy Web Audio analyser, 24 segments, drawn only while visible and playing.
- Keys: Space/K, N, P, ←/→ ±5 s (Shift ±30), ↑/↓ volume, S, R, M, V, /, O, 1/2/3. Stopwatch palette, dark default, System/Light/Dark following `sites-hub.theme`, About, dots, 75 px swipes, in-app dialogs only. `<title>Music Player MP1</title>`, every `?v=MP1`.
- Files: `music-player.html/.css`, `index.html`, `music-player_app.js`, `_player.js` (`MPPlayer`), `_tags.js` (`MPTags`), `_save.js` (`MPSave`, the one save module: `music-player-settings-v1`, `-state-v1`, `-playlists-v1`, `-tags-v1`), `_icon.png`, `_readme.md`.
- New shared module `apps/media/shared-media/media_files.js` (`MediaFiles`, inside apps/media, not repo-root shared/), for VP1 and the Gallery update too. It covers pickFolder/pickFiles/reopen/forget/fromDrop/fromList (IndexedDB `shared-media-v1`) and `positions(ns)` (localStorage `shared-media-pos-v1`, newest 300 per namespace).
- CSV row added to `apps/media/media-apps.csv` (Audio) and `hub_appindex_gen.py --catalog-only` re-run (only `hub_catalog.js` changed). No build bump; no other hub/, shared/ or apps/system edits.
- Tested headless Chrome (puppeteer `/workspace/mp1-test/t.js`, generated mp3/wav/ogg with and without ID3 tags, a 700 s file, a 470 KB cover-art frame; an OPFS handle stands in for the picker): 126/126 checks. They cover open, tags + fallbacks, sort/search, play/next/prev, shuffle, repeat all/one, seek, volume, playlists (create/rename/delete/add/duplicate/reorder/remove/play), long-file position, resume after reload (song, position, queue, shuffle order), Media Session, background play, level bar, keys, themes, phone fallback without the picker (playlists needing the folder, matched again by name + size), touch swipes / tap / long-press, no native dialogs and no errors. Shots in `/workspace/mp1-shots`.
- Limits: not yet run on a real phone or laptop. Without `showDirectoryPicker` (most phones) the folder must be picked again after a reload. Tags are read only from MP3; durations show once metadata has loaded. Media Session actions were tested by calling the handlers. Reordering uses ▲▼, not drag. The level bar keeps the Web Audio route until reload. Queues over 5000 songs are restored from sort + search. Numbered 1.33 because PE5 takes 1.32.

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

2026-10-28 IST, H48 (Team 2, week 2): Hub Search app (System category), split release 1 of 4.
  New apps/system/search/: index.html, search.js, search_items.js, search.css, README.md,
  search_icon.png; row in apps/system/system-apps.csv (existing columns only). Data: hub_appindex.js
  (instant list, reads an optional 6th item as description), then every category CSV via
  TilesCsv.parse for sections and a.description (absent today = ''). Hub items in search_items.js:
  Settings pages / options -> __hubOpenApp('apps/system/settings/', {hash}) (#about/device,
  #about/profile); categories -> App Hub #cat=; actions (minimiseAll, setWs) only when parent
  HubMode.isDesktop(); open windows from parent __hubTasks.list / focus (skips its own window).
  Apps open with parent __hubFly.openFromCat like the Start flyout; hub-open-app message on
  file://; standalone navigates. Scoring: every query word must match; name > section / category
  > description; whole-query name prefix +50; groups sorted by their best row. Not touched:
  wm_taskbar.js, hub_appindex_gen.py, tiles.js. Planned: H48b taskbar search button after Show
  desktop, H48c optional CSV description column (last column), H48d descriptions filled in by the
  Apps / Games bots. Index regenerated (123 apps; line order kept so the diff is the Search row
  only). Bump 20261028b / v98 -> 20261028c / hub-shell-v99. Playwright (system Chrome): 27/27
  (standalone, Start > System > Search window, settings / device / tetris / games, keys, Enter,
  windows, workspace + Show desktop actions, Phone mode #search), no console errors or 4xx.

2026-10-28 IST, H48b (Team 2, week 2): Search icon on the Hub bar beside Show Desktop (split 2 of 4).
  wm_taskbar.js: button#wm-search (title / aria-label 'Search', magnifier SVG) appended right after
  #wm-showdesk: bar order Start, Show desktop, Search, tasks, [workspaces 1 2, OSK, tray, clock on
  the right since R43]. Click: closes ctx menu / Start menu; Search window open (key
  apps/system/search/) -> HubWM.focus (active one else topmost) + focus #q in its frame
  (same origin; search.js also focuses q on window focus); else __hubOpenApp('apps/system/search/')
  and focus q on frame load. wm.css: #wm-search shares every #wm-showdesk rule except .on.
  Header comment updated (workspace switcher note fixed to R43 position). Bump 20261028c / v99 ->
  20261028d / hub-shell-v100. Playwright (system Chrome): 13/13 (order, size, opens, focuses
  after minimise, box focused, taskbar top, Phone mode hidden), no console errors or 4xx.

2026-10-28 IST, H48c (Team 2, week 2): Optional app descriptions in category CSVs (split 3 of 4).
  CSV format (any apps/<cat>/<cat>-apps.csv): optional LAST column 'description', read only when
  the header row names it: name, path, icon, newtab, section, description. One plain line,
  < ~90 chars, NO commas (cells are split on ','; no quoting), not starting with '#'. Empty or
  missing cell = no description. Old 5-column CSVs need no change.
  Readers: shared/tiles/tiles.js parse() -> {.., description} (COLS default order + description;
  tiles do not draw it); hub/menu/hub_flyout.js build() keeps description (cached start lists are
  keyed by CSV text hash, so an edited CSV rebuilds them); hub/core/hub.js addCsvApps keeps
  app.description and __hubAppIndex() pushes it as a 6th item only when non-empty (checkIndex
  String compare stays equal for 5-item rows); apphub.js uses TilesCsv.parse (unchanged; extra
  column ignored); terminal.js reads index items 0-2 only; search.js reads index item 5 and the
  CSV description (H48). hub_appindex_gen.py: header / docstring updated, plus csv_descriptions()
  that maps entry path -> description from every CSV with the column (mirrors tiles.js parse;
  path resolved against the CSV folder) and appends it to the browser's rows; CSVs without the
  column -> rows unchanged. apps/system/system-apps.csv: header + 9 descriptions (Files, Disk,
  Viewer, Settings, System Monitor, Device Benchmark, Terminal, App Hub, Search; Settings is not
  in the index because hub_apps.js registers it first, Search still reads its CSV description).
  Regenerated hub_catalog.js (System CSV text only) and hub_appindex.js (old line order and the
  existing caption-for-nei Favorite row kept; the run flips it to Tools, registration order is
  not stable for apps listed in two CSVs), so the diff is the 8 System descriptions + header.
  Bump 20261028d / v100 -> 20261028e / hub-shell-v101. Playwright (system Chrome): 13/13
  (Search standalone + in Hub matches 'organise' / 'unix' / 'battery' / 'wallpaper preferences'
  only in System descriptions; index rows = live __hubAppIndex; System flyout, App Hub #cat=System
  and system.html list the same 9 apps with no description text leaked), no console errors / 4xx,
  no 'out of date' notice. H48d: Apps / Games bots fill their own CSVs (format above).

2026-10-28 IST, H48d index (Team 2, week 2): hub_appindex.js regenerated after #228 (Apps bot) and
  #229 (Games bot) were merged into h48-search-app (merge commit, no rebase; no conflicts). Run:
  /workspace/.venv-pw/bin/python via runpy with playwright BrowserType.launch patched to
  executable_path=/usr/bin/google-chrome, headless=True. 124 apps, every category row has a 6th
  description item (Games 33, Lab 27, Learn 16, Tools 11, Office 10, Connectivity 9, Media 9,
  System 8, Favorite 1); code-school (Learn) after code-lab; tv Favorite only; caption-for-nei
  Tools only; code-lab icon codelab_icon.png. Old line order restored after the run. No bump.

2026-10-28 IST, H49 (Team 2, week 2): Office quick actions and tabs on the Hub window title bar.
  Hub side of HO1 (Apps bot; app side apps/office/shared/office-hubbar.js + office-quick.js, used
  by Draftly, Spreadsheet and Base). Code: hub/link/hub-gamebar.js (makeBar(frame, bar,
  {titleBar:true}) for window bars only; the Phone header #gamebar never uses it), hub/wm/wm.css,
  hub/wm/wm_windows.js (drag / dblclick ignore .gb-qbtn).
  Contract (all v:1; unknown v ignored):
  - app -> hub  window.parent.postMessage({hubTitleBar:{v:1, op:'set', buttons:[{id, label, icon,
    enabled, title}], tabs:[{id, label}], activeTab}}, location.origin)   ('*' only on file://)
  - app -> hub  {hubTitleBar:{v:1, op:'update', buttons:[{id, label?, icon?, enabled?, title?}],
    activeTab?}}  patches existing buttons by id (unknown ids ignored); no add / remove (use set)
  - app -> hub  {hubTitleBar:{v:1, op:'clear'}}
  - hub -> app  iframe.contentWindow.postMessage({hubTitleBarHello:{v:1}}, origin): sent with each
    hub-hello burst after the iframe loads (0 / 150 / 400 / 900 / 1800 ms) until a set arrives;
    the app answers with set. Only in Desktop mode.
  - hub -> app  {hubTitleBarClick:{v:1, kind:'button'|'tab', id}} on a click (enabled buttons
    only; a tab click also highlights that tab at once).
  Checks: event.source === the window's iframe contentWindow AND event.origin === location.origin
  ('null' on file://); Hub -> app messages are only sent to a frame showing a Hub-origin page.
  Limits: 8 buttons, 10 tabs; strings cut to id 32, label 24, icon 4, title 60, tab label 20;
  drawn with textContent only (no HTML). Button shows icon (if any) else label; tooltip = title
  else label; aria-label = label. enabled:false -> disabled + greyed (opacity 0.35).
  Layout (.wm-gb): [app name hidden] [.gb-qa quick buttons | divider] [.gb-tbtabs tabs]
  [.gb-fold-btn 'Active ▾'] [hub-app stats] [hub-app buttons, max 3] [.gb-file file name].
  hubTitleBar tabs replace the R44 hub-app tabs (never both); legacy hub-tab messages still move
  the highlight. Fold: a ResizeObserver on the window re-measures; if the bar or tab strip
  overflows, .gb-fold hides the strip and shows the ▾ button; its drop-down (.gb-tabmenu, fixed,
  on <body>) closes on pick, Esc, outside press or window blur. Cleared on iframe load (new
  document), on iframe src change (MutationObserver), on op:'clear', on window close and when the
  mode becomes Phone (hub-wm-mode). No Hub shortcuts are added; focus goes back to the iframe
  after every click, so Ctrl+Z / Ctrl+S / Ctrl+P stay with the app. Apps that do not use
  hubTitleBar draw exactly as before.
  Bump 20261028e / v101 -> 20261028f / hub-shell-v102 (hub.html wm.css now carries the build
  stamp). Playwright (system Chrome, throwaway test page in /tmp, not committed): 35/35 (order,
  disabled, icon / label / title, click messages, disabled sends nothing, focus back to iframe,
  update patch + activeTab, HTML stays text, fold + menu + pick, unfold, 8 / 10 limits, nested
  child frame ignored, foreign origin ignored, v:2 ignored, clear, auto-clear on navigation +
  new hello, Draftly buttons + tabs and in-app bar hidden, Insert tab selects Draftly's ribbon,
  2048 bar unchanged, H48b Search button, Phone mode no quick buttons and Draftly keeps its bar),
  Spreadsheet and Base checked too; no console errors or 4xx.

2026-10-28 IST, H29.1 (Team 2, week 2): Send profile to a connected device with preview and Apply.
  H29 HUB SYNC PLAN (agreed with Jor, 28 Oct; Team 1's H29.1-H29.4 idea reworked):
  - No automatic sync, ever: devices are peers over the Connect Code link with no server, so an
    automatic sync would just bounce between devices. Every send and every apply is a button press.
  - H29.1 (this release): send the whole profile (no API keys) + preview on the receiver with
    Keep mine / Use incoming per setting, Keep all mine / Use all incoming, Apply / Cancel, summary.
    Mode groups Shared / Desktop / Phone with Desktop layout / Phone layout ticks (Jor's scope add).
  - H29.2 (built, see below): choose what to send (Hub settings / System app settings / everything)
    + an API keys tick (off by default). Keys masked to the last 4 characters in the preview and
    never overwrite on their own: same key = skipped, missing = added, different = conflict with
    Keep mine (default) / Use incoming / Keep both where the service allows it.
  - H29.3 (built, see below; was 'not built' until 28 Oct): backup of the old settings before Apply +
    'Undo last sync' in Settings, and the PC's connected folder copy (hub/hub-profile/) updated
    straight after a sync.
  - Dropped: Team 1's H29.4 automatic sync (see above).
  - Status (28 Oct, after H29.3): H29 COMPLETE (H29.1, H29.2, H29.2b, H29.3); H29.4 dropped.
  Profile before H29.1 (checked): hub.json "hub" is one flat object of every allowed sites-hub.*
  setting, not split by Desktop / Phone mode (device.mode only records the saving device's mode); app
  settings are per app file. Mode groups are therefore new, kept in ONE map in hub_profile.js:
    SYNC_GROUPS.desktop = taskPos, taskH, titleH, openMax, startHover, showFiles, trayMeter,
      hoverFocus, snapEdges, snapMagnet, snapMagnetPx, workspaces, saverIdle, saverSec
    SYNC_GROUPS.phone   = homeBtn
    shared              = everything else (theme, accent, motion, wallpaper, favorites,
                          notifyTimeout, files*, profileEvery, osk ...) and every app setting
    SYNC_SKIP           = wmMode (each device's own Screen mode; never sent / applied)
  HubProfile.groupOf(scope, name) reads it; add a key to SYNC_GROUPS to move it out of Shared.
  Files: hub/link/hub_sync.js (new, window.HubSync), hub/core/hub_profile.js (exportData(o) with
  o.keys === false; diffData(profile, {groups}); applyItems(items); groupOf; SYNC_GROUPS),
  hub/link/hub_link.js ('hubsync…' messages not forwarded to app frames, like 'phonekey…'),
  apps/system/settings/sec_about.js (syncCard, id 'sync', #about/sync, after Profile; About's
  release regex accepts dotted ids), settings.css (.sync-*), index.html (?v=20261028h291),
  hub.html (hub_sync.js after hub_link.js; hub_profile.js now on the build stamp), hub_sw.js SHELL.
  Wire (SharedLink.send, host relays 'to'; replies go to msg.from, else 'host' on a joined phone):
  - {type:'hubsync-profile', v:1, id, name, mode, include:{desktop, phone}, profile}
  - {type:'hubsync-got', id}  -> sender shows 'Received, waiting for review'
  - {type:'hubsync-result', id, state:'applied'|'cancelled'|'bad', applied, kept} -> sender card
  Choice: the RECEIVER filters groups. The sender sends Shared + Desktop + Phone settings and its
  two ticks; the receiver keeps Shared + the group of its own mode (HubMode.mode; a joined phone
  Hub is always Phone) + ticked groups, and only counts the rest ('N Desktop layout settings not
  included'). Simpler and robust: the sender does not need to know the other device's mode.
  Receiver: one pending offer (a new one replaces it), diffed again against the current settings
  each time the preview draws. Identical settings are counted, not listed; settings the sender
  does not have are left alone (never deleted). New settings default to Use incoming, changed
  ones to Keep mine. Apply writes only the chosen items through applyItems (same filters as
  load / import: allowed names, the app's own keys, no key-like values, no "keys"), calls
  HubPrefs.apply() for a live repaint and marks the profile dirty so the normal Save every timer
  writes the profile places. Cancel writes nothing. Limits: 200,000 chars per offer, 2000
  settings, values <= 200,000 chars; all text drawn with textContent.
  Bump 20261028f / v102 -> 20261028g / hub-shell-v103 (hub_bump.py --release H29.1).
  Playwright (system Chrome, two browser contexts: PC 1366 px Desktop mode as host, phone 400 px
  Phone mode as a joined device; SharedLink.send / devices / id / role stubbed and bridged
  between the two pages, no real PeerJS link): 40/40. Send lists the device, ticks off by
  default, payload has no keys even with Include keys on, receiver card + Review opens
  #about/sync, rows grouped / tagged, defaults, Use incoming changes, Keep mine keeps, new items
  applied, Desktop settings never reach the Phone-mode receiver without the tick and Phone
  settings never reach the Desktop-mode receiver without the tick (and do with it), Cancel
  changes nothing, sender gets got / applied / cancelled, bad version / oversize rejected,
  unknown and secret keys ignored, HTML shown as text, standalone Settings note, no console
  errors. Real phone <-> PC over the internet not tested: Jor to try once on real devices.

2026-10-28 IST, H29.2 (Team 2, week 2): Choose what to send and optional API keys in profile sync.
  Plan status: H29.1 done, H29.2 this release, H29.3 still planned (backup of the old settings before
  Apply + 'Undo last sync' in Settings + the PC's connected folder copy hub/hub-profile/ updated straight
  after a sync). Sync stays manual only (peers, no server).
  What to send (Send card, radio 'What to send', default Everything):
    everything = Hub settings + every app's settings (= the parts of the H30.3 export file)
    hub        = the sites-hub.* settings only (hub.json "hub")
    system     = the System apps only (Files, Viewer, Terminal; profile "system")
  The Desktop layout / Phone layout ticks and the receiver-side mode filter (H29.1) are unchanged; the
  ticks are disabled when System app settings is picked (no layout in it). Wire: include gains
  what + keys: {type:'hubsync-profile', v:1, id, name, mode, include:{desktop, phone, what, keys}, profile}.
  Sender: HubProfile.exportData({ what, keys }) (exportData now takes o.what; o.keys === true adds the
  key store even with the profile's 'Include keys' switch off; o.keys === false never; not set = the
  switch, as the H30.3 export). Receiver: diffData(profile, { groups, what, keys }) drops the parts
  outside 'what' again (counted as ignored), so the receiver does not trust the sender for it.
  API keys ('Include API keys' tick, off by default):
  - Store: the Hub key store hub/core/hub_keys.js (H28, localStorage sites-hub.keys = {name: value}).
    It holds ONE value per name, so 'Keep both' is not offered for any key (no key supports it).
  - Unticked: send() still forces keys off (exportData({keys:false}) + delete profile.keys; the H29.1
    lines are kept as comments). Ticked: profile.keys = the cleaned key store (names /^[a-z0-9][a-z0-9_.-]{0,39}$/,
    non-empty strings < 4096 chars). Sent only with SharedLink.send(msg, picked device); phone -> phone
    goes through the PC host's normal relay (link_core.js), never into a notification.
  - Receiver lists keys only when include.keys is true (a "keys" block without it is ignored), as group
    'keys' (heading 'API keys'). diffData items for keys: { id:'key:<name>', scope:'key', group:'keys',
    isKey, mine: masked | null, incoming: masked, isNew }. maskKey(v) = '••••' + last 4 (values shorter than
    8 chars: '••••' only). The full value stays in hub_sync.js (pend.profile.keys) until Apply / Cancel;
    pending(), lastSend(), lastResult(), the notification card, the summary and the DOM only ever see the
    masked text or the key name.
  - Same key: counted (keysSame, 'N keys are already the same'), not listed. Missing here: tag New,
    buttons Add (default) / Skip. Different: tag Different, Keep mine (default) / Use incoming.
  - 'Keep all mine' / 'Use all incoming' skip key rows (each key is chosen on its own row; documented in
    the preview note). HubSync.apply(choices) defaults are the same (New = Add, Different = Keep mine).
  - Apply: HubProfile.applyItems gets { scope:'key', key, value } for the chosen keys (value taken from
    the held offer) and writes them with HubKeys.set (raw store write if HubKeys is missing); nothing is
    written before Apply; Cancel writes nothing and drops the held keys.
  - The key-like value filter (KEY_VALUE / OPAQUE, KEY_NAME) still runs on every hub and app setting, so
    a secret can only travel inside the explicit "keys" block. Size caps unchanged (200,000 chars per
    offer, 2000 items, keys < 4096 chars).
  Files: hub/link/hub_sync.js, hub/core/hub_profile.js (exportData what/keys, cleanKeys, maskKey,
  diffData what/keys, applyItems scope 'key', SYNC_WHAT), apps/system/settings/sec_about.js (What to
  send radios, Include API keys tick, API keys group, Add/Skip, bulk skip keys), settings.css (.sync-what,
  .sync-tag-keys, .sync-conflict), index.html (?v=20261028h292).
  Bump 20261028g / v103 -> 20261028h / hub-shell-v104 (hub_bump.py --release H29.2).
  Playwright (system Chrome, same two-context set-up as H29.1, SharedLink stubbed and bridged, no
  real PeerJS link): H29.2 45/45 (each choice sends / lists only its part, receiver enforces 'what',
  layout ticks disabled for System, keys absent unticked and present ticked with the profile switch off,
  key-like hub value and app secret still blocked, masking, no full key in pending(), lastSend, DOM text /
  attributes / inputs, notification, summary or console, same / new / different cases and defaults, no
  Keep both, Use all incoming leaves keys, Cancel changes nothing, Apply adds new + keeps conflict +
  leaves other keys, Use incoming replaces, keys without include.keys ignored, bad key names / sizes
  dropped, short key mask, size cap, no console errors) + H29.1 suite 40/40 again.
  Real phone <-> PC not tested: Jor to try once on real devices.

2026-10-28 IST, H29.2b (Team 2, week 2): New Devices section in Settings, directly above About.
  About was getting crowded, so everything about this device and the devices it is linked with moved
  to a new section apps/system/settings/sec_devices.js (id 'devices', icon 📲, title Devices), loaded in
  index.html just before sec_about.js (Settings shows sections in registration order). Cards, in order:
    Device name (H46, id 'device')      #devices/device     moved unchanged from sec_about.js
    Connected devices (new, 'connected') #devices/connected read-only
    Profile (H30.x, id 'profile')        #devices/profile    moved unchanged
    Send profile (H29.1/H29.2, 'sync')   #devices/sync       moved unchanged, all choices
  plus an empty .pane-end spacer (140 px) so Apply / Cancel never sit under a Hub notification card.
  About keeps the Hub card (Credit, Release date, Current release, Update, Last refreshed, Clear Cache,
  Running build), Contact and Feedback. The old pane.append line is kept as a comment.
  Connected devices: this device row (name, Desktop / Phone mode = HubSync.mode(), 'This Hub · code N'
  / 'Joined Hub N' / 'Link off', Linked / Waiting / Not linked) and one row per device the link knows
  from the new HubSync.peers() -> [{id, name, online, legacy, host, mode}] (offline devices too, an old
  Gamepad only while online; host = the 'host' entry, tagged Hub; mode = what that device said in its
  last profile offer, else 'Mode not known yet'). Text only, repaints on SharedLink devices / status /
  open / close and HubSync.onChange. Empty: 'No other device connected...' hint to 🎮 Devices;
  Settings opened on its own: 'Open Settings inside the Hub...'.
  Redirects: settings.js ALIASES {about/device, about/profile, about/sync, about/devices,
  about/connected} -> devices/...; on load and on hashchange the hash is replaced (replaceState).
  Callers updated (old lines kept as comments): hub_panels.js 'Name: X ›' -> hash 'devices/device',
  hub_sync.js review() -> 'devices/sync', Search search_items.js (Devices, Device name, Connected
  devices, Profile, Send profile rows under Settings › Devices). #about from the context menus / update
  icon still opens About. hub_keys.js header: keys leave the browser only with the profile sync
  'Include API keys' tick (old line kept as a comment).
  Bump 20261028h / v104 -> 20261028i / hub-shell-v105 (hub_bump.py --release H29.2b); hub_panels.js
  ?v= and the Settings / Search file ?v= moved by hand.
  Playwright (system Chrome): H29.2b 30/30 (nav order, icon, 4 cards, About without them, the three
  old anchors on load and on hashchange, narrow list-first, Desktop-mode Hub: pop-up link, connected
  list online / offline / gamepad, this-device row, mode learnt from an offer, Review notification ->
  #devices/sync, empty state, Search 'device name' -> #devices/device, #about still About; Phone-mode
  joined Hub: pop-up link, PC listed as Hub, this device Phone mode; no console errors) + H29.1 40/40
  (Review anchor now #devices/sync) + H29.2 45/45.

2026-10-28 IST, H29.3 (Team 2, week 2): Backup and Undo last sync, profile folder saved after sync.
  Plan status: H29.1, H29.2, H29.2b and H29.3 done -> H29 COMPLETE. Team 1's H29.4 automatic sync
  stays dropped (peers, no server; every send / apply is a button press).
  Backup (only the last sync, on this device):
    sites-hub.syncUndo  {v:1, at, from, settings:[{k, prev}], keys}   hub_profile.js (K_UNDO)
      prev = the old raw localStorage text, or null = 'did not exist'; keys = count only.
    sites-hub.keysUndo  {v:1, at, prev:{name: oldValue | null}}       hub_keys.js only (UNDO)
  applyItems(list, {backup:{from}}) (hub_sync.js apply) first builds the write plan, then (only when it
  will write something) saves the backup, then writes. Settings: prevs via lget. Keys: HubKeys.backupKeys
  (names) snapshots the old values inside hub_keys.js; nothing outside it reads them: backupInfo() ->
  {count, names, at}, restoreBackup() -> count. A sync without keys clears the old key backup (only the
  last sync is kept); if the settings backup cannot be written the key backup is cleared too.
  Keys kept separate: there is no protected / encrypted store in the browser for the Hub key store
  (sites-hub.keys is plain localStorage, H28), so the key backup sits next to it in its own entry with
  the same exposure, is managed only by hub_keys.js, is never rendered, logged, put in a notification,
  summary, profile, export file or sync (both entries in hub_profile.js EXCLUDE), and is deleted on Undo
  or replaced by the next sync. Cancel never touches either entry; an Apply that writes nothing keeps
  the previous backup.
  Undo: HubProfile.undoSync() puts each setting back exactly (null -> removed; same allowedName / app
  guards as apply), HubKeys.restoreBackup() writes the old key values raw (no trim) and deletes keys that
  did not exist, then emits one key change ('' = re-read all, so open Settings > API Keys rows repaint),
  both backups are cleared, the profile is marked changed. HubSync.undo() then HubPrefs.apply(), keeps
  lastUndo() {at, from, settings, keys, folder} for the summary.
  UI (sec_devices.js, card id 'undo', #devices/undo, after Send profile): note, Last sync / From /
  Covers ('N settings and M API keys'), 'Undo last sync' -> UiDialog.confirm (sender, time, counts) ->
  'Last sync undone' summary + Reload Hub; disabled + hint 'Nothing to undo...' without a backup;
  repaints on HubSync.onChange. The Apply summary has Reload Hub + Undo. Old pane.append line kept.
  PC folder copy: after an Apply that wrote something, and after Undo, HubSync.saveFolder() calls the
  existing HubProfile.save() at once when HubProfile.status() has a ticked folder target in state
  'ready' ('Saved to profile folder' / 'Could not save...'); no folder (phone, not ticked, permission
  needed) = skipped quietly, nothing shown. The normal Save every timer is unchanged.
  Search: 'Undo last sync' row (Settings > Devices, #devices/undo).
  Bump 20261028i / v105 -> 20261028j / hub-shell-v106 (hub_bump.py --release H29.3, --check OK);
  Settings / Search file ?v= moved by hand (20261028h293), hub.html hub_keys.js ?v=20261028j.
  Playwright (system Chrome, two contexts: PC 1366 px Desktop mode host + phone 400 px Phone mode
  joined; SharedLink send / devices / id / role stubbed and bridged between them (stand-ins); PC folder
  = a real OPFS directory handle in the 'sites-fs' drives store (fake folder); HubProfile.save wrapped
  with a counter): H29.3 40/40 (disabled + hint without backup, Cancel no backup + no change, Apply
  backup with sender / time / counts and did-not-exist, key backup separate, backup not in the profile,
  Undo dialog Cancel, Undo restores settings + keys exactly and removes new items, backup cleared,
  key listeners told, second / third sync replace the backup, PC folder saved once after Apply and
  once more after Undo with the file content back, phone skips quietly, API Keys row repaints, Search
  -> #devices/undo, standalone Settings note, no key value in DOM / logs / backup info, no console
  errors) + H29.1 40/40 + H29.2 45/45 + H29.2b 30/30 (its card list now includes 'undo').
  Note from testing: Search -> Settings was checked with a fresh Settings window; with Settings
  already open on a hash the test had set by hand, the reused window did not move (not H29.3 code,
  left as is). Real phone <-> PC and a real PC folder not tested: Jor to try once on real devices.

2026-10-28 IST, H50a (Team 2, week 2): New 16-char Hub device ID (hub-xxxxxxxx-xxx).
  First step of H50 (Hub mesh): the mesh uses the existing H19 device id, in Jor's new format.
  Format: 'hub-' + 8 random + '-' + 3 clock = 16 chars, lowercase [a-z0-9], ^hub-[a-z0-9]{8}-[a-z0-9]{3}$,
    e.g. hub-k3x9p0qa-m2f. Random: crypto.getRandomValues bytes, a byte >= 252 is dropped (252 = 7 x 36)
    so every character is equally likely (no modulo bias); Math.random only when crypto is missing.
    Clock: last 3 chars of Date.now().toString(36) (wraps every ~46.7 s; only lowers clash odds).
  Keys: shared-link-device-id (current id), shared-link-device-id-old (comma list of old 'd-...' ids,
    newest last, max 5; never deleted). Migration: link_devices.js calls id() once at load; an old
    'd-...' value is added to the -old list and a new id written; every id() call re-reads the key, so
    two tabs converting at once settle on the last write. A page still running a cached pre-H50a
    link_devices.js would not accept the new id and writes a fresh 'd-...' one; the next new page
    converts it again and remembers it too (so chat 'You' still holds). Pages loading the file with
    an old ?v= (Apps bot's connectivity apps, photo editor, OCR, paper scan, paper keyboard, filedrop)
    get the new file when their HTTP cache expires (GitHub Pages ~10 min); Settings and Controller now
    use ?v=20261028h50a.
  API SharedLinkDevices: id(), oldIds() -> [ids], isMe(id) -> current or old id of this device, ID_RE.
  link_chat.js: isDev accepts 'd-' and 'hub-'; isMine(m) = SharedLinkDevices.isMe(m.from) (fallback
    m.from === id()). Old lines kept as comments.
  Never synced: the id is not a 'sites-hub.*' key, so HubProfile.collect / exportData / H29 sync never
    carry it (tested: id and key name absent from exportData({}), exportData({what:'everything',
    keys:true}) and collect()). Two devices with one id would be clones; the mesh (H50) relies on this.
  Screen Wall (apps/connectivity/screen-wall, Apps bot, not edited): SWSave.dev() returns
    SharedLinkDevices.id() and uses it only as an opaque string (<= 40 chars) for the roster and the
    host's cells:{<dev>:{r,c}} layout. Works with the new format; after the one-time conversion a
    display's saved cell (keyed by its old d- id) is not found, so the host places it again once.
  Bump 20261028j / v106 -> 20261028k / hub-shell-v107 (hub_bump.py --release H50a, --check OK).
  Playwright (system Chrome, real pages, no stubs): H50a 22/22 (fresh id format + 16 chars, stored,
    clock part, stable across reload, second tab same id, 40 regenerated ids valid + unique, id not in
    profile export / sync payload, migration from d-k3x9p0qa7m2f, old id kept + oldIds + isMe, Pooh Chat
    standalone shows the old message as You and others as received, migration once, stale d- id
    converted again with both kept, Hub page same id + isMine, new message uses new id, Screen Wall
    dev() = new id, no console errors) + H29.1 40/40 + H29.2 45/45 + H29.2b 30/30 + H29.3 40/40.

2026-10-29 IST, H50 (Team 2, week 2): Hub mesh core: one shared connection per Connect Code.
  Files: shared/link/hub_mesh.js (new, window.HubMesh), hub/link/hub_meshlink.js (new, Hub glue),
    hub.html (both loaded after hub_sync.js), hub/update/hub_sw.js (precache both),
    apps/system/settings/sec_devices.js (Hub mesh list in Connected devices; ?v=20261028h50) +
    settings.css (.mesh-*), shared/link/README.md. No Apps bot file edited.
  Peers: device peer 'jtsites-' + code + '-mesh-' + deviceId (H50a id); lobby peer
    'jtsites-' + code + '-mesh-0', a second Peer opened only by the device holding the lobby (the lobby
    device talks to itself in-process). The PeerJS broker's unavailable-id is the lock: one holder.
  Start: hub_meshlink.js check() (SharedLink status / open / close, every 3 s, 500 ms after load):
    role 'host' with a live code peer, or role 'join' and connected -> HubMesh.start(code,
    {preferLobby: host && Desktop mode}); stop only when the link is really off (no role / no code /
    host peer gone / hub-mesh-off = '1'). A phone that lost the PC keeps its mesh.
    preferLobby: claim -0 at once. Others try to join -0 first; no answer in 5 s -> takeover logic
    with rank >= 1 (so a PC that is starting wins).
  Join: member dials -0 with metadata {kind:'mesh', v:1, dev}; sends hello {name, mode, apps, site}.
    Lobby checks: conn.peer = 'jtsites-<code>-mesh-' + dev and dev matches metadata, site = its
    location.host (weak), hooks.approveJoin(hello, peerId), roster size <= 32 (offline entries older
    than 10 min pruned). Then welcome {roster} to the newcomer and roster to all. joinOrder = next
    number, kept for a returning device. Lobby control channel '_mesh': welcome, roster, hb, bye
    {reason: site | denied | full} (refused state, no retry until start() again), info (name / mode /
    apps changed: HubMesh.refresh(), on hub-wm-mode / hub-device-name / storage).
  Direct links: every online non-relayed pair, the smaller deviceId dials (metadata {kind:'mesh-peer'}).
    Relay: online devices sorted lobby first, then joinOrder; the first 8 are direct, the rest are
    marked relay and only talk through the lobby. Broadcast = direct to every direct peer + one copy
    via the lobby with skip:[already reached], the lobby forwards to the rest (each once, deduped by
    message id, LRU 600).
  Liveness: hb every 2 s on every link; a link silent 6 s is dropped. Lobby lost (closed / silent 6 s /
    no welcome): rank the living devices (me + direct peers heard within 6 s, not the old lobby) by
    joinOrder; wait rank x 3 s + random 0-1.5 s, then claim -0. unavailable-id -> someone won, join
    it. New lobby: term + 1, everyone offline until their hello, joinOrders kept; a hello with a newer
    term makes the lobby go above it. Members accept welcome / roster only with term >= theirs.
    Old PC returning: joins as a normal device (its preferLobby claim gets unavailable-id), keeps #1.
  Envelope {v:1, ch, from, to ('*' or deviceId), t, term, id, data}. accept(): shape (v, ch regex
    /^[a-z][a-z0-9-]{0,31}$/ or '_mesh', ids /^hub-.../ ), size <= 240 KiB UTF-8 JSON, from = the
    conn's device (direct links; via lobby the lobby vouches), rate 60/s burst 120 per sender, then
    hooks.verify, then term < mine -> drop (stats.dropTerm). Data with a newer term raises mine.
    Known trade-off: during a takeover, direct messages from a device still on the old term are
    dropped by devices already on the new one (a few seconds).
  API: start(code, {preferLobby, name, mode}) -> Promise(me), stop(), me(), peers(), roster(),
    on/off('peers'|'lobby'|'roster'|'status'), channel(name) -> {send(to, data) -> {ok, via|reason},
    broadcast(data), on(fn(data, from, env)) -> unsubscribe, peers}, setAppIdentity(app, obj)
    (localStorage 'hub-mesh-id-<app>', max 2 KB, shown in roster.apps), appIdentity(app), refresh(),
    isLobby(), term(), lobbyId(), state(), stats(), hooks, LIMITS. Test helpers _env / _raw.
    send reasons: stopped, to, size, rate, offline.
  Settings > Devices > Connected devices: new 'Hub mesh' list under the SharedLink list (HubMesh.roster(),
    textContent only, repaints on roster / peers / lobby / status + every 5 s): name, Lobby, This
    device, Relayed, Desktop / Phone mode, join #, Apps: ..., Online / Offline; note = code, term, state.
  Unchanged: controller / gamepad, H29 sync, Pooh Chat, file transfer keep SharedLink. Seen in tests
    with the mesh off too (pre-existing, not H50): the PC controller keeps one SharedLink phone at a
    time (hub-controller attachConn closes the older link), so two phones take turns on SharedLink;
    on the mesh both stay online.
  Open security risks (for the security talk, not fixed in H50; hooks left: approveJoin, sign, verify):
    1. Anyone who knows the code can join; the 4-digit code is brute-forceable (10,000 values).
    2. No join approval (approveJoin allows all) and no allow-list of known devices.
    3. Device ids are claimable on the public PeerJS broker: someone can register another device's
       mesh peer id while it is away, or claim -0 first and act as the lobby.
    4. A malicious lobby can forge the roster, drop or change relayed messages, mark devices relay.
    5. The lobby sees all relayed traffic (devices past 8 and broadcast copies).
    6. No end-to-end signing or encryption beyond WebRTC DTLS; 'from' is only checked per link.
    7. The site check (location.host in hello) is self-reported and can be faked.
    8. DoS: hello / message floods (rate limit per sender only), roster fill to 32, takeover storms by
       claiming -0.
    9. Identity data (name, mode, app identities) is visible to every device in the mesh.
    10. Term numbers are trusted: a device can send a huge term and reset others' view.
    11. Messages are JSON from other devices: apps must keep showing them as text only.
  Screen Wall: not edited. H50 changes nothing it uses (SharedLink, SharedLinkDevices.id()); the only
    impact is still the H50a one-time re-place of a display. Moving it onto the mesh is H50d (later).
  Tests: this box's managed Chrome policy (WebRtcIPHandling disable_non_proxied_udp) blocks WebRTC
    UDP, so real PeerJS DataChannels never open here (checked: no ICE candidates even in one page).
    So: (1) real PeerJS cloud broker 4/4 (real PeerJS 1.5.4, 3 simultaneous -0 claims -> exactly one
    open + 2 unavailable-id, HubMesh preferLobby claims the lobby, no errors); (2) mesh core 35/35
    with a PeerJS stand-in (same Peer / DataConnection API, Python broker between contexts; real
    hub_mesh.js): roster on 4, joinOrder, lobby tag, modes, H50a ids, full mesh, app identity, direct
    + broadcast, oversize send + raw 245 KB drop, spoofed from, takeover by lowest joinOrder (~6.7 s),
    single winner, term 2, old-term drop, returning PC normal + no flapping, 9 devices with 1 relayed,
    relay broadcast / direct, rate limit, no console errors; (3) Hub integration 20/20 (stand-in for
    every Peer, real Hub pages): PC Desktop holds lobby, two ?join phones, roster 3 online, Settings
    Devices roster (screenshot), PC closes -> phone takes over at term 2, no console errors.
    H29.1 40/40, H29.2 45/45, H29.2b 30/30, H29.3 40/40, H50a 22/22.
  Bump 20261028k / v107 -> 20261029a / hub-shell-v108 (hub_bump.py --release H50, --check OK).

2026-10-29 IST, H52 (Team 2, week 2): Hub bar section in Settings and auto update every N days.
  Hub bar items (Desktop taskbar, hub/wm): Start #wm-start (always shown, locked switch), Show Desktop
    #wm-showdesk, Search #wm-search (H48b), Window buttons .wm-tasks, Workspaces .wm-ws, OSK
    .wm-osk-btn (hub_loader stub / osk.js), Pooh #chat-btn, Devices #ctrl-btn, Update #upd-btn (R50),
    Busy meter (hub_traymeter.js, own key trayMeter, default off as before), Clock .wm-clock.
    There is no Battery item in the Hub bar. Phone-remote extras (#rm-fs, #rm-set) are Phone only: no switch.
  Keys: sites-hub.barShowDesk / barSearch / barTasks / barWorkspaces / barOsk / barPooh / barDevices /
    barUpdate / barClock. Default on except barPooh and barUpdate; stored '0' = off (default-on
    items), '1' = on (default-off items), '' = default. HubPrefs.BAR + HubPrefs.barOn(key).
  Live apply: SettingsStore.set -> parent HubPrefs.apply() + postMessage {type:'hub-prefs', key};
    other tabs via the storage event. apply() toggles html.hub-bar-off-<item>; wm.css hides with
    display:none !important only under #wm-taskbar (Window buttons: visibility:hidden, keeps space).
    Phone mode moves .header-right back to the top bar, so no rule matches there (checked).
  Update dot: showNote() also sets html.hub-upd-ready; html.hub-bar-off-update.hub-upd-ready
    #wm-taskbar #wm-start::after = 8 px accent dot.
  Settings: apps/system/settings/sec_hubbar.js (new, after Desktop), Desktop's Busy meter switch
    commented out and replaced by a "Hub bar icons ›" link; taskbar empty-area menu has
    "Hub bar settings". H29: bar* keys added to SYNC_GROUPS.desktop; updEvery in shared;
    lastBuild / lastUpdated in EXCLUDE (never synced).
  Auto update before H52 (R16c, indicator from R50): due once a day at 09:00 browser-local time, or on
    the next open after a missed 09:00 (sites-hub.lastRefresh), hourly timer steps; refresh re-fetches
    the shell through the service worker and reloads quietly only when idleNow() (Desktop: no windows;
    Phone: no app open), else shows the R50 #upd-btn indicator. R50 only replaced the old toast with
    that indicator; a manual check() never reloads.
  Auto update from H52 (hub_update.js; old due() / schedule() kept as comments): N = updEvery
    (1 default, 7, 15, 30 days). Due when never run, or now - lastRefresh >= N x 24 h (also on load),
    or inside the 6 AM window (06:00-06:59 local) of the first 06:00 after max(last + (N-1) days,
    now - 1 h). N=1: every morning at 6 AM, or 24 h after the last one if 6 AM was missed. One
    timer: first check 5 s after load, steps <= 1 h, 1 h retry after a failed run; rescheduled on
    visibilitychange, storage (updEvery / lastRefresh) and hub-prefs key updEvery. The busy-safe
    idleNow() rule is unchanged. On load, when BUILD differs from sites-hub.lastBuild, lastBuild and
    lastUpdated are stored (About shows Last updated). API adds every, dueAt, due, dueRule,
    sixAfter, tick, schedule.
  About: "Auto update" card (#autoupdate): Auto update every, Last auto update, Next auto update,
    Last updated (+ build). The old "Last refreshed" row is commented out.
  Search: rows for Hub bar, each switch (hubbar/<key>, Busy meter -> hubbar/trayMeter; old Desktop
    row commented out) and Auto update every (about/autoupdate).
  Tests (system Chrome headless, real pages): H52 64/64 (defaults, every switch live in the bar,
    Start locked, Update dot, reset, storage event across tabs, About card, Search rows, H29 groups,
    rule table, fake-clock runs: 6 AM, missed 6 AM -> 24 h, on-load after 26 h, 7 days day 6 / day 7,
    Phone mode unaffected, no console errors). H29.1 40/40, H29.2 45/45, H29.2b 30/30, H29.3 40/40,
    H50 mesh 35/35, H50 Hub 20/20.
  Bump 20261029a / v108 -> 20261029b / hub-shell-v109 (hub_bump.py --release H52, --check OK).

2026-10-29 IST, H53 (Team 2, week 2): a joined device follows the Screen mode choice.
  Bug: hub/wm/wm_mode.js compute() returned 'phone' whenever window.__hubRemote was set (hub_role.js:
    ?join=CODE, or a saved 'shared-link-join-code' on a touch-primary device), whatever sites-hub.wmMode
    said. A big tablet that had joined a PC once was stuck in Phone mode on every load.
  Fix (old line kept as a comment): a manual 'desktop' / 'phone' always wins. Auto: not joined = unchanged
    ((hover: hover) and (pointer: fine) + >= MIN_WIDTH, R21 hysteresis); joined = no mouse needed,
    Desktop at >= MIN_WIDTH (1024), kept down to MIN_WIDTH - HYST (960), else Phone. HubMode.joined.
  Joined + Desktop checked: .header-right (🎮 #ctrl-btn, #rm-fs, #rm-set) moves to the taskbar tray as
    for any Desktop Hub (wm_taskbar placeTray); hub_remote.js dot / rejoin-on-tap unchanged; the Devices
    pop-up (hub-controller.js remote branch, hub_linkstate.js "⏏ Disconnect from Hub", hub_panels.js
    Join with code) opens above the taskbar (wm.css body.wm-desktop #ctrl-popover). wm.css: Hub bar
    Devices off no longer hides 🎮 on html.hub-remote (Disconnect must stay reachable). hub.js Gamepad
    forceFrame + tiles.js remote links: open as Desktop windows, fine. #rm-fs / #rm-set only follow
    #app-frame (Phone single frame), so a Gamepad window in Desktop mode has no bar extras (own title bar).
  Mode reporting: hub_sync.js mode(), hub_mesh.js myMode(), sec_devices.js myMode() no longer say 'phone'
    for every joined device (old lines kept): roster / HubSync groups follow the real mode.
    hub_meshlink.js desktop() untouched (only used for the host's preferLobby).
  Settings › Desktop: Auto hint + "Now:" note (joined to Hub CODE, follows your choice, Disconnect in
    🎮 Devices); Hub bar Devices hint says it stays on a joined device. Settings ?v=20261029h53.
  Tests (system Chrome headless, real pages, PeerJS stand-in broker): H53 37/37 (touch emulation +
    saved code + Desktop → Desktop, + Phone → Phone, Auto 400 px → Phone, Auto 1280 / 1366 px → Desktop,
    hysteresis 990 / 900 / 1010 / 1280, ?join= + Desktop, not-joined tablet unchanged, mouse PC host
    unchanged, 🎮 + Disconnect reachable with Hub bar Devices off, Disconnect works from Desktop, roster
    shows desktop, Settings note, Gamepad window, no console errors; screenshot /workspace/h53_tablet.png).
    H52 64/64, H29.1 40/40, H29.2 45/45, H29.2b 30/30, H29.3 40/40, H50a 22/22, H50 mesh 35/35, H50 Hub 20/20.
  Bump 20261029b / v109 -> 20261029c / hub-shell-v110 (hub_bump.py --release H53, --check OK).

2026-10-29 IST, H52b (Team 2, week 2): the Hub bar switches apply in Phone mode too.
  Ask (Jor): one set of switches for both modes, no separate Phone set.
  Phone mode's top bar (hub.html #header): .header-left = #cat-btn "Home ▾" (the Phone Start, opens the Hub
    menu) + #home-btn (R42 Home, shown while an app is open); #gamebar / #lab-label (app bar); .header-right =
    #rm-fs / #rm-set (phone-remote Gamepad extras, hub_remote.js) + #chat-btn 🐻 + #ctrl-btn 🎮 + #upd-btn.
    wm_taskbar.js placeTray moves the same .header-right into the taskbar tray in Desktop mode. Show Desktop,
    Search, window buttons, workspaces, the OSK button, busy meter and clock only exist in #wm-taskbar.
  Before H52b: every H52 rule in wm.css was scoped to #wm-taskbar, so Phone mode never matched (by design).
  wm.css (old lines kept as comments): html.hub-bar-off-pooh #chat-btn, html.hub-bar-off-devices:not(.hub-remote)
    #ctrl-btn (H53 joined-device exception kept), html.hub-bar-off-update #upd-btn: no #wm-taskbar scope, so they
    hide in both places. Update dot: html.hub-bar-off-update.hub-upd-ready body:not(.wm-desktop) #header
    #cat-btn::after (same 8 px accent dot as Start; #cat-btn position: relative in Phone mode only). #rm-fs /
    #rm-set, #cat-btn and #home-btn have no switch (Phone essentials). hub_prefs.js unchanged apart from comments
    (same html.hub-bar-off-<item> classes, so live apply / hub-prefs message / storage event work as before).
  Settings › Hub bar (sec_hubbar.js, ?v=20261029h52b; settings.css .bar-donly): help text now "the bar at the
    bottom (or top) in Desktop mode, and the top bar in Phone mode. One set of switches for both modes";
    a "Desktop only" tag on Show Desktop, Search, Window buttons, Workspaces, On-screen keyboard, Busy meter,
    Clock (DESK_ONLY). Bottom note: Pooh / Devices / Update go with the Shared group.
  H29 (hub_profile.js): barPooh, barDevices, barUpdate removed from SYNC_GROUPS.desktop (so Shared); the
    Desktop-only bar keys and trayMeter stay Desktop. Search rows (search_items.js ?v=20261029h52b): Hub bar,
    Pooh, Devices, Update rows also match "phone top bar".
  Behaviour change on phones: Pooh 🐻 and the Update icon are now hidden by default in Phone mode too (H52
    defaults), with the Update dot on Home ▾ when a build waits.
  Tests (system Chrome headless, real pages, PeerJS stand-in broker): H52b 47/47 (Phone defaults, Pooh /
    Devices / Update live in the top bar, Update dot on Home ▾ on/off, Desktop-only switches leave the phone
    bar alone, all off keeps Home ▾ + Home, Pooh Chat still opens, other-tab storage event, same page switched
    to Desktop, Desktop: all 10 switches live + Start dot, H29 groups, joined phone keeps 🎮 with Devices off,
    ⛶ / ⚙ Gamepad extras shown with every item off, 🎮 opens Devices, no console errors; screenshot
    /workspace/h52b_phone.png). H52 64/64 (its Phone-mode and H29-group checks updated for H52b),
    H53 37/37, H29.1 40/40, H29.2 45/45, H29.2b 30/30, H29.3 40/40, H50a 22/22, H50 mesh 35/35, H50 Hub 20/20.
  Bump 20261029c / v110 -> 20261029d / hub-shell-v111 (hub_bump.py --release H52b, --check OK).

2026-10-29 IST, H55 (Team 2, week 2): the public Hub mesh 0000.
  Ask (Jor): every Hub that is not in a private mesh joins one public mesh "0000" so nearby Hubs see each
    other and can invite each other to their own Connect Code. Public PeerJS server as before.
  When a Hub is private (hub/link/hub_meshlink.js check(), old check() kept as a comment): every non-remote
    Hub hosts its own 4-digit code from first boot (hub-controller.js), so "hosting a code" can not mean
    private (no Hub would ever be on 0000). Rule: a joined device (window.__hubRemote) is private once
    SharedLink.connected; a host is private once its code is PAIRED (a device connected to it at least once:
    localStorage 'hub-mesh-paired' = code, sticky so a phone screen-off does not flap the mesh; cleared by the
    host's Disconnect (SharedLink.live false) or a new code). Everything else runs HubMesh.start('0000',
    {preferLobby:false}). A joiner still connecting stops the public mesh and waits. hub-mesh-off still wins.
  Switch: Settings › Devices › Public mesh (#devices/public, sec_devices.js publicCard) "Join public mesh",
    key sites-hub.meshPublic ('' = on, default; '0' = off), Shared group in H29 (not in SYNC_GROUPS). Off =
    leave 0000 at once (storage event / hub-prefs event / HubMeshLink.setPublic). Private meshes unaffected.
  Code generation (link_core.js randomCode, hub-controller.js loadCode, old lines kept): 0000 is never picked
    and a saved 0000 is replaced. Joining 0000 by hand (?join=0000 in hub_role.js, or 0000 in the Devices
    pop-up join box in hub_panels.js) = public: no remote, saved join code removed, meshPublic back on; a
    joined device typing 0000 disconnects from its Hub.
  Mesh-level enforcement (shared/link/hub_mesh.js, me().public, HubMesh.isPublic(), PUBLIC_CODE): on a public
    mesh accept() (incoming, so relayed traffic too: the lobby route() only relays what accept() passed) and
    sendEnv() (outgoing, returns {ok:false, reason:'public'}) allow only CTRL '_mesh' (hello / welcome /
    roster / hb / info / bye) and the reserved 'invite' channel sent to ONE device with data exactly
    {k:'invite', code: 4 digits, not 0000}. Sync, keys, profile, every app channel: dropped (stats.dropPublic).
    channel('invite') throws (reserved). myApps() = {} and roster apps stripped, names cut to 16 (PUB_NAME)
    in hello / info / roster, roster capped at 20 (PUB_ROSTER; private stays 64). Relay stays (presence only).
  Invites: HubMesh.invite(deviceId, code) (target must be in the roster, own code refused, 3 s gap per
    target) → 'invite' event {from, name, code, at}. HubMeshLink keeps the last 5, shows a HubNotify notice
    "NAME invites you" / "Join code X? Tap to join." and lists them in Settings (Join / Dismiss). Accept =
    sessionStorage hub-join-try + location.replace('?join=CODE') (the normal H50 / H53 join path). Invites are
    cleared when the mesh stops. window.HubMeshLink = {PUBLIC_CODE, publicOn, setPublic, isPrivate,
    privateCode, ownCode, invite, invites, accept, dismiss}; 'hub-mesh-invites' window event.
  Settings › Devices: Public mesh card after Connected devices (privacy note, invites, list of up to 20:
    short name, Online, mode, device ID, Lobby, "Invite to my code" on others when this Hub has a code). The
    H50 Hub mesh box notes "on the public mesh 0000". settings.css .pub-*; ?v=20261029h55. Search row "Join
    public mesh" (#devices/public). Old Connect / join behaviour unchanged.
  Open risks (public mesh): anyone can see device names / device IDs / mode on 0000 and send invites (rate
    limited, only a code, only joins after a tap); a hostile peer can claim the 0000 lobby (presence only, no
    data channels); names are self-chosen (spoofing); still no signing (H50 hooks).
  Tests (system Chrome headless, real pages, PeerJS stand-in broker): H55 39/39 (auto-join 0000 on start for
    PC + phones, roster 3, 16-char names, no app identities, sync / keys / profile / app send refused, raw
    envelopes dropped, invite reserved, randomCode never 0000, Settings public list + screenshot
    /workspace/h55_public.png, invite → notice → tap → phone joins the PC code → both private, third Hub alone
    on 0000, phone Disconnect and PC Disconnect back on 0000, switch off / on, Shared group, ?join=0000 public,
    saved code 0000 replaced, join box 0000, no console errors); H55 mesh relay 8/8 (10 devices on 0000, 2
    relayed, lobby drops relayed app envelopes, relayed invite delivered). H52b 47/47, H53 37/37, H52 64/64,
    H29.1 40/40, H29.2 45/45, H50a 22/22, H50 mesh 35/35; updated for H55 (originals *_preH55.py): H50 Hub
    20/20 (PC on 0000 until paired), H29.2b 30/30 and H29.3 40/40 (Devices card list includes 'public').
  Bump 20261029d / v111 -> 20261029e / hub-shell-v112 (hub_bump.py --release H55, --check OK).

2026-10-29 IST, H52c (Team 2, week 2): no Update dot.
  Ask (Jor): with Settings › Hub bar › Update off, show no indicator at all for a waiting build.
  wm.css: the H52 / H52b rules html.hub-bar-off-update.hub-upd-ready #wm-taskbar #wm-start::after (Desktop
    Start) and ... body:not(.wm-desktop) #header #cat-btn::after (Phone Home ▾), plus their position:
    relative anchors, are now one comment block (kept). hub_update.js still sets html.hub-upd-ready (no CSS
    uses it) and still unhides #upd-btn, which the Update switch hides; auto update (H52 interval / 6 AM, idle
    reload) unchanged; Settings › About › Check for update still reports a ready build. Comments only in
    hub_update.js, hub_prefs.js, wm_taskbar.js.
  Settings: sec_hubbar.js (?v=20261029h52c) Update hint "Off: no indicator at all; the Hub still updates
    itself and Settings › About shows a waiting build"; section note adds "With Update off nothing on the bar
    shows a waiting build (see About)". sec_about.js (?v=20261029h52c) Auto update note drops "or a dot on
    Start". Search row Hub bar: Update icon loses the dot / start / home menu words (?v=20261029h52c).
    Old lines kept as comments.
  Tests: H52 64/64 and H52b 48/48 (dot checks now expect no dot on Start / Home ▾ with Update off;
    originals kept as h52test/t52_preH52c.py, h52btest/t52b_preH52c.py; old screenshot kept as
    /workspace/h52b_phone_preH52c.png), H55 39/39.
  Bump 20261029e / v112 -> 20261029f / hub-shell-v113 (hub_bump.py --release H52c, --check OK).

2026-10-29 IST, H55b (Team 2, week 2): the mesh join waits 60 s (public 0000 and private meshes).
  Bug (Jor: laptop and tablet both on 0000, neither sees the other): hub_mesh.js joinLobby() closed the lobby
    connection when 'welcome' had not arrived 5 s after connect() and sent 'hello' only once. lobbyLost()
    then waited 3-4.5 s and claimed -0, got unavailable-id (someone holds it) and joined again 200 ms later:
    a ~9 s loop. On real networks (Jio carrier NAT, Tailscale, TURN) WebRTC setup takes longer than 5 s, so a
    device never linked, on 0000 and on private meshes alike. The tick() heartbeat check could also drop an
    open-but-not-welcomed join after DEAD_MS (6 s). link_core.js (no open deadline, 'hello' resent) worked.
  Fix (shared/link/hub_mesh.js, old joinLobby() kept as a comment block, old lines kept as comments):
    one set of constants for every mesh: JOIN_WAIT_MS 60 s, HELLO_MS 2.5 s, RETRY_MS 5 s (flat), GIVEUP_MS
    5 min (window.HUB_MESH_JOIN_WAIT_MS / HUB_MESH_RETRY_MS / HUB_MESH_GIVEUP_MS override, for tests, like
    H25's HUB_REMOTE_GIVEUP_MS; HubMesh.LIMITS lists them).
    - joinLobby(): up to JOIN_WAIT_MS for the connection to open AND 'welcome' to arrive; a PeerJS close /
      error ends it early; 'hello' resent every HELLO_MS from open until welcome (the lobby ignores extra
      hellos; one welcome handled per join). peer-unavailable (-0 really free) still goes straight to the
      takeover (lobbyMissing() also ends the wait), so a free lobby is claimed at once.
    - tick(): no heartbeat takeover while a join is inside its wait (S.joining); the idle re-join branch
      skips while a retry is scheduled, given up or refused.
    - a failed join (no welcome) = joinFailed(): joinFails++, failStart (first failure of the run), check -0
      at once (claimLobby('probe')): free = this device becomes the lobby; held (unavailable-id) =
      scheduleRetry(): a flat RETRY_MS wait ('retrying', me().retryAt), then join again. The first race on
      start (no failure yet) keeps the 200 ms rejoin. Jor's spec moved from the planned growing back-off
      (2, 4, 8, 15, 30 s) to the flat 5 s.
    - give up: GIVEUP_MS after the first failed attempt of the run (checked when a join fails and before
      each retry): status / joinState 'gaveup', timers cleared, stats.joinGaveUp++ (count). A fresh run
      (failStart reset): HubMesh.retry() (Settings Retry button), document visibilitychange → visible,
      window 'online', and a Connect link opening / closing (hub/link/hub_meshlink.js: SharedLink 'open' /
      'close' → HubMesh.retry() when me().gaveUp). Automatic triggers only restart a run that gave up; a
      joining / linked mesh is left alone. Joining another code / Disconnect restart the mesh anyway (stop +
      start = fresh state). Success (welcome, or becoming the lobby) resets joinFails / failStart.
    - me(): + joinState ('linking' | 'linked' | 'lobby' | 'retrying' | 'refused' | 'gaveup' | ''), joinSince
      (start of the current join wait, 0 when none), retryAt, joinWaitMs, gaveUp. stats(): + joinFails,
      lastJoinMs (open + welcome time of the last successful join), joinState, joinGaveUp.
  Settings › Devices (sec_devices.js ?v=20261029h55b, linkState() + retryBtn()): the H50 Hub mesh note
    (#mesh-note: 'Code C · term N · STATE.') and the Public mesh note (#pub-note: 'Public mesh 0000 · STATE ·
    N online · your code C.'; the online count only once linked; before H55b it said "On the public mesh"
    whatever the state) show Linking… Ns (seconds into the wait), Lobby (you), Linked, Retrying in Ns,
    Refused (reason), Not linked: tap Retry; data-state = the key. Retry button (#mesh-retry / #pub-retry)
    while retrying or given up. Empty public list says "Not linked to the public mesh yet." until linked.
    Both cards redraw every 1 s (was 5 s / 3 s).
  Tests (system Chrome headless, PeerJS stand-in broker; broker.py now takes BK.delay = {peer id or suffix:
    seconds} to delay a connection open (inf = never) and BK.deaf = ids that hold their id but receive
    nothing; original kept as h50test/broker_preH55b.py): H55b core 32/32 (/workspace/h55btest/t55b.py:
    constants, 8 s and 40 s opens link on the first try with no takeover / claim, lastJoinMs >= delay, a lobby
    holding -0 that never answers: still linking at 20 s, hello resent, the attempt ends at 60 s, flat 5 s
    retry, next attempt; shortened constants: give-up, stays stopped, visible / online give one fresh run,
    manual Retry links after the lobby answers again, triggers ignored while linked, a free -0 is claimed
    at once, no console errors); H55b Hub UI 18/18 (t55bh.py: real Hub pages, Lobby (you), Linking… Ns
    counting up with a 25 s open (screenshot /workspace/h55b_linking.png), Linked, Refused (denied),
    Retrying in Ns, Not linked: tap Retry + Retry button → Linked, visible after give-up, private mesh notes
    Lobby (you) / Linked, no console errors). H50 Hub +1 check (mesh note Lobby (you); original
    th_preH55b.py). Reruns: see the H55b commit message.
  Not done (leftovers): the optional lobby -1 fallback (a second lobby id when -0 is held by a device that
    never answers); clearing the H55 pairing (hub-mesh-paired) on give-up; SharedLink open / close retry is
    covered by code review only (the stand-in has no way to fire those events alone).
