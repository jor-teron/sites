/*
 * Hub service worker (loaded by the root /sw.js stub, so its scope is the whole site).
 * R16b: cache-first shell + "Update ready" notice.
 * Install (a new build = a new CACHE name): precache the shell (SHELL).
 * (before H176) every file fetched with cache:'reload' so the browser's HTTP cache can't hand back an old copy.
 * H176: install uses the default HTTP cache so files the page already downloaded (staged boot) are not refetched.
 * A new worker WAITS (only the very first install activates at once); hub_update.js shows "Update ready · Reload"
 * and posts {type:'skip-waiting'} when Jor clicks Reload. Activate deletes old hub-shell-* caches.
 * Fetch (same-origin GET only; cross-origin — Google APIs / OAuth / Drive, PeerJS signalling,
 * CDNs — is never touched; no-store / reload requests and Range requests pass straight through):
 *   · shell files (SHELL, no ?v= or ?v= this build V): cache first, refreshed in the background
 *     (stale-while-revalidate), so a push shows on the next load.
 *   · shell files with a NEWER ?v= than V (a release arrived before its worker): network first.
 *   · *.csv and hub/version.txt: network first, cached copy when offline.
 *   · pages and files under apps/ (and other same-origin html/css/js): network first, stored in
 *     RUNTIME the first time they're opened, so they also open offline. H74: stored under the bare
 *     URL (query stripped), so each file keeps one copy however many ?v= labels it was fetched with.
 *   · same-origin images: cached copy at once (RUNTIME); a new image is fetched and stored on its first
 *     request. R58: a cached image is re-fetched in the background at most once per worker lifetime,
 *     and only when the cached copy is over a day old (its Date header), not on every request
 *     (R25 did that), so an edited icon / wallpaper still shows within a day. Fonts: cache first (RUNTIME).
 *   · (before H176) H165: apps/learn/dictionary and apps/learn/blood-group shell files were in SHELL,
 *     so they opened offline on a first visit.
 *     H176: those app shells (and Phone, Terminal, wallpaper photos, App Hub, Mesh Viewer, API Keys,
 *     the notifications app, duplicate jsQR copies) are no longer precached; the first open stores
 *     them in RUNTIME (hub-rt-1). Dictionary data shards under apps/learn/dictionary/data/ are
 *     not precached (about 7.6 MB gzipped); they use cache-first after the first fetch.
 *     H173: those shards live in DICT (hub-dict-1), not RUNTIME; a data rebuild bumps DICT only.
 *     Activate deletes stale hub-dict-* caches and purges leftover dictionary data from hub-rt-1.
 *   · navigations not in a cache when offline: hub/update/hub_offline.html.
 *   · H129d: a navigation to / is the index.html shell copy; one to the removed /hub.html gets that same copy.
 * R16c: message {type:'refresh'} re-fetches every SHELL file (cache:'reload') and replaces the
 *   changed ones in place (the cache is never wiped); replies {type:'sw-refreshed', changed:[paths]}.
 * R58: install logs every SHELL file it could not fetch (console.warn) and records it in 'hub-meta'
 *   ('__hub_failed__'); the install itself still succeeds. The 09:00 refresh re-fetches all SHELL
 *   files anyway, and {type:'retry-failed'} (sent by HubUpdate.check) re-fetches only the recorded
 *   ones; a file that then loads is cleared from the list. Activate keeps 'hub-meta'.
 * Release: bump V + CACHE here AND the ?v= in the root sw.js (so the browser sees a new worker).
 */
const V = '20261123e';
const CACHE = 'hub-shell-v197';  // 2026-11-23e: H178
const RUNTIME = 'hub-rt-1';     // app pages / images opened at least once (kept across releases)
const DICT = 'hub-dict-1';      // H173: dictionary letter data; a data rebuild bumps only this number
// R16c / R58: tiny bookkeeping cache, kept across releases (activate never deletes it):
//   '__hub_dirty__'  shell files a background refresh replaced (the 09:00 refresh reports them)
//   '__hub_failed__' shell files the install could not fetch (retried, see below)
const META = 'hub-meta';
const SHELL = [
  // (before H176) previous first-install SHELL (229 entries). Dropped paths are cached on first open via hub-rt-1:
  // (before H176) 'index.html', 'desktop/desktop.html', 'hub/index.html', 'desktop/index.html', 'desktop/mode/hub_osmode.js',
  // (before H176) 'manifest.webmanifest', 'hub/core/hub_main.css', 'desktop/controller/hub_controller.css',
  // (before H176) 'desktop/notify/hub_notification.css', 'desktop/menu/hub_flyout.css', 'desktop/wm/wm.css',
  // (before H176) 'desktop/panels/hub_chat.css', 'hub/drives/hub_drives.css', 'hub/update/hub_update.css', 'hub/core/hub_glass.css',
  // (before H176) 'hub/core/hub_role.js', 'hub/core/hub_config.js', 'hub/core/hub_appindex.js', 'hub/core/hub_catalog.js',
  // (before H176) 'hub/core/hub_apps.js', 'desktop/menu/hub_tiles.js', 'hub/core/hub.js', 'desktop/menu/hub_flyout.js',
  // (before H176) 'hub/core/hub_prefs.js', 'hub/core/hub_daynight.js', 'hub/core/hub_autotheme.js', 'hub/core/hub_eye.js',
  // (before H176) 'hub/drives/hub_wallpapers.js', 'hub/drives/hub_live_wallpaper.js', 'desktop/menu/hub_settings.js',
  // (before H176) 'desktop/wm/wm_mode.js', 'desktop/wm/wm_windows.js', 'desktop/wm/wm_taskbar.js', 'desktop/wm/wm_snap.js',
  // (before H176) 'desktop/wm/wm_workspaces.js', 'desktop/wm/wm_warm.js', 'desktop/menu/hub_ctx.js', 'desktop/menu/hub_ctx_menus.js',
  // (before H176) 'hub/drives/hub_traymeter.js', 'desktop/controller/hub_controller_config.js', 'desktop/notify/hub_notify.js',
  // (before H176) 'hub/viewer/hub_viewer.js', 'hub/viewer/hub_viewer_pdf.js', 'desktop/link/hub_pointer.js',
  // (before H176) 'desktop/link/hub_receive.js', 'desktop/link/hub_remote.js', 'desktop/controller/hub-controller.js',
  // (before H176) 'desktop/controller/hub_textedit.js', 'hub/link/hub_link.js', 'hub/link/hub_linkstate.js', 'desktop/panels/hub_chat.js',
  // (before H176) 'desktop/gamebar/hub-gamebar.js', 'hub/drives/hub_drives.js', 'hub/link/hub_phonekey.js', 'hub/update/hub_update.js',
  // (before H176) 'hub/core/hub_loader.js', 'hub/core/hub_saver.js', 'hub/controller/kb_common.js', 'hub/osk/osk_layout.js',
  // (before H176) 'hub/osk/osk_board.js', 'hub/osk/osk_drag.js', 'hub/osk/osk.js', 'hub/osk/osk.css', 'shared/style/no-scrollbar.css',
  // (before H176) 'shared/wallpaper/wallpapers.js', 'shared/perf/busy_meter.js', 'shared/vendor/qrcode.js', 'shared/fs/fs_drives.js',
  // (before H176) 'shared/fs/fs_ops.js', 'shared/fs/fs_ref.js', 'shared/fs/filetypes.js', 'shared/fs/thumbs_store.js',
  // (before H176) 'shared/fs/webdav_fs.js', 'shared/fs/webdav_accounts.js', 'shared/fs/sftp_fs.js', 'shared/fs/sftp_accounts.js',
  // (before H176) 'shared/google/google_config.js', 'shared/google/google_auth.js', 'shared/google/gdrive_fs.js',
  // (before H176) 'shared/google/gdrive_connect.js', 'shared/google/google_gis.js', 'shared/google/phonekey.js',
  // (before H176) 'shared/google/google.css', 'shared/ctxmenu/ctxmenu.js', 'shared/ctxmenu/ctxmenu.css', 'shared/ctxmenu/ctx_in_app.js',
  // (before H176) 'shared/dialog/dialog.js', 'shared/dialog/dialog.css', 'shared/tiles/tiles.js', 'shared/tiles/tiles.css',
  // (before H176) 'shared/favorites/favorites.js', 'shared/theme/hub_theme.js', 'shared/theme/hub_glass_apps.css', 'hub/core/hub_xp.css',
  // (before H176) 'shared/theme/hub_xp_apps.css', 'shared/wallpaper/hub_hills.jpg', 'shared/wallpaper/thumbs/hub_hills.webp',
  // (before H176) 'shared/link/link_core.js', 'shared/link/link_devices.js', 'shared/link/link_files.js', 'shared/link/link_ui.js',
  // (before H176) 'shared/link/link_chat.js', 'shared/link/link_scan.js', 'shared/link/link.css', 'shared/image/hub_icon_192.png',
  // (before H176) 'shared/image/hub_icon_512.png', 'apps/favorite/favorite_icon.png', 'apps/games/games_icon.png',
  // (before H176) 'apps/media/media_icon.png', 'apps/office/office_icon.png', 'apps/connectivity/connectivity_icon.png',
  // (before H176) 'apps/tools/tools_icon.png', 'apps/lab/lab_icon.png', 'apps/learn/learn_icon.png', 'apps/system/system_icon.png',
  // (before H176) 'apps/system/settings/settings_icon.png', 'apps/system/apphub/', 'apps/system/apphub/index.html',
  // (before H176) 'apps/system/apphub/apphub.js', 'apps/system/apphub/apphub.css', 'apps/system/apphub/apphub_icon.png',
  // (before H176) 'shared/search/search_core.js', 'shared/search/search_bar.js', 'shared/search/search_bar.css',
  // (before H176) 'apps/system/files/files_icon.png', 'apps/system/disk/disk_icon.png',
  // (before H176) 'apps/connectivity/qr-scanner/qr-scanner_icon.png', 'hub/controller/controller_icon.png',
  // (before H176) 'hub/controller/controller_qr_icon.png', 'apps/office/writer/writer_icon.png',
  // (before H176) 'apps/office/spreadsheet/spreadsheet_icon.png', 'apps/office/tables/tables_icon.svg', 'apps/office/base/base_icon.png',
  // (before H176) 'apps/office/slides/slides_icon.png', 'apps/favorite/favorite-apps.csv', 'apps/games/games-apps.csv',
  // (before H176) 'apps/media/media-apps.csv', 'apps/office/office-apps.csv', 'apps/connectivity/connectivity-apps.csv',
  // (before H176) 'apps/tools/tools-apps.csv', 'apps/lab/lab-apps.csv', 'apps/learn/learn-apps.csv', 'apps/system/system-apps.csv',
  // (before H176) 'hub/version.txt', 'hub/update/hub_offline.html', 'apps/system/terminal/terminal_bb.js',
  // (before H176) 'apps/system/terminal/terminal_etc.js', 'apps/system/terminal/bin/busybox.js', 'apps/system/terminal/bin/busybox.wasm',
  // (before H176) 'apps/system/terminal/terminal_worker.js', 'apps/system/terminal/terminal_rc.js', 'desktop/panels/hub_panels.css',
  // (before H176) 'desktop/panels/hub_panels.js', 'apps/system/api-keys/index.html', 'apps/system/api-keys/api-keys.js',
  // (before H176) 'apps/system/api-keys/api-keys.css', 'apps/system/api-keys/api-keys_icon.png', 'hub/core/hub_credentials.js',
  // (before H176) 'hub/core/hub_keys.js', 'hub/keys.readme.md', 'hub/core/hub_embeddings.js', 'hub/core/hub_api.js',
  // (before H176) 'hub/core/hub_providers.js', 'hub/core/hub_profile.js', 'hub/link/hub_sync.js', 'shared/link/hub_mesh.js',
  // (before H176) 'hub/link/hub_meshlink.js', 'hub/link/hub_line.js', 'hub/link/hub_trust.js', 'hub/link/hub_meshlog.js',
  // (before H176) 'hub/core/hub_core.js', 'apps/system/mesh-viewer/', 'apps/system/mesh-viewer/index.html',
  // (before H176) 'apps/system/mesh-viewer/mv.js', 'apps/system/mesh-viewer/mv.css', 'apps/system/mesh-viewer/mesh-viewer_icon.png',
  // (before H176) 'desktop/notify/hub_notifcenter.js', 'desktop/notify/hub_notifcenter.css', 'apps/system/notifications/',
  // (before H176) 'apps/system/notifications/index.html', 'apps/system/notifications/nc.js', 'apps/system/notifications/nc.css',
  // (before H176) 'apps/system/notifications/notifications_icon.png', 'hub/controller/vendor/jsQR.js', 'hub/core/hub_dialog_bridge.js',
  // (before H176) 'hub/core/hub_dnd.js', 'hub/core/hub_attention.js', 'hub/core/hub_break.js', 'hub/core/hub_break.css',
  // (before H176) 'hub/core/hub_lock_core.js', 'hub/core/hub_lock.js', 'hub/core/hub_lock.css', 'shared/vendor/peerjs.min.js',
  // (before H176) 'hub/core/hub_splash.js', 'hub/core/hub_splash.css', 'hub/core/hub_perf.js', 'hub/core/hub_clock.js',
  // (before H176) 'hub/core/hub_clock.css', 'unlock.html', 'hub/core/hub_unlock.js', 'phone.html', 'phone/', 'phone/index.html',
  // (before H176) 'phone/phone.css', 'phone/phone_notify.js', 'phone/phone_save.js', 'phone/phone_apps.js', 'phone/phone_gesture.js',
  // (before H176) 'phone/phone_app.js', 'phone/hidden-apps.csv', 'phone/phone_connect.js', 'phone/vendor/jsQR.js',
  // (before H176) 'apps/learn/dictionary/', 'apps/learn/dictionary/index.html', 'apps/learn/dictionary/dictionary.html',
  // (before H176) 'apps/learn/dictionary/dictionary_icon.png', 'apps/learn/dictionary/core/dict.js', 'apps/learn/dictionary/ui/app.js',
  // (before H176) 'apps/learn/dictionary/ui/dictionary.css', 'apps/learn/blood-group/', 'apps/learn/blood-group/index.html',
  // (before H176) 'apps/learn/blood-group/blood-group.html', 'apps/learn/blood-group/blood-group_icon.png',
  // (before H176) 'apps/learn/blood-group/core/blood.js', 'apps/learn/blood-group/ui/app.js', 'apps/learn/blood-group/ui/blood.css',
  // (before H176) 'apps/learn/common/ui/learn.css', 'apps/learn/common/core/state.js', 'apps/learn/shared/learn-hubbar.js',
  // 'hub.html',   // H129a: now the tiny redirect to desktop/desktop.html (kept, so an offline hub.html link still lands)   (before H129d: removed)
  // (before H129b) 'hub/core/hub_main.css', 'hub/controller/hub_controller.css', 'hub/viewer/hub_notification.css', 'hub/menu/hub_flyout.css', 'hub/wm/wm.css', 'hub/link/hub_chat.css', 'hub/drives/hub_drives.css', 'hub/update/hub_update.css', 'hub/core/hub_glass.css',   // H61: + hub_glass.css
  // (before H129c) 'hub/core/hub_main.css', 'hub/controller/hub_controller.css', 'hub/viewer/hub_notification.css', 'desktop/menu/hub_flyout.css', 'desktop/wm/wm.css', 'hub/link/hub_chat.css', 'hub/drives/hub_drives.css', 'hub/update/hub_update.css', 'hub/core/hub_glass.css',
  // (before H64) 'hub/core/hub_role.js', ... 'hub/core/hub_prefs.js', 'hub/core/hub_daynight.js', 'hub/core/hub_eye.js', 'hub/drives/hub_wallpapers.js', 'hub/menu/hub_settings.js',   // H63: + hub_daynight.js, hub_eye.js
  // (before H129b) 'hub/core/hub_role.js', 'hub/core/hub_config.js', 'hub/core/hub_appindex.js', 'hub/core/hub_catalog.js', 'hub/core/hub_apps.js', 'hub/menu/hub_tiles.js', 'hub/core/hub.js', 'hub/menu/hub_flyout.js', 'hub/core/hub_prefs.js', 'hub/core/hub_daynight.js', 'hub/core/hub_autotheme.js', 'hub/core/hub_eye.js', 'hub/drives/hub_wallpapers.js', 'hub/menu/hub_settings.js',   // H63: + hub_daynight.js, hub_eye.js; H64: + hub_autotheme.js
  // (before H129b) 'hub/wm/wm_mode.js', 'hub/wm/wm_windows.js', 'hub/wm/wm_taskbar.js', 'hub/wm/wm_snap.js', 'hub/wm/wm_workspaces.js',
  // (before H129b) 'hub/menu/hub_ctx.js', 'hub/menu/hub_ctx_menus.js', 'hub/drives/hub_traymeter.js', 'hub/controller/hub_controller_config.js', 'hub/viewer/hub_notify.js', 'hub/viewer/hub_viewer.js', 'hub/viewer/hub_viewer_pdf.js',
  // (before H129c) 'desktop/menu/hub_ctx.js', 'desktop/menu/hub_ctx_menus.js', 'hub/drives/hub_traymeter.js', 'hub/controller/hub_controller_config.js', 'hub/viewer/hub_notify.js', 'hub/viewer/hub_viewer.js', 'hub/viewer/hub_viewer_pdf.js',
  // (before H129c) 'hub/link/hub_pointer.js', 'hub/link/hub_receive.js', 'hub/link/hub_remote.js', 'hub/controller/hub-controller.js', 'hub/controller/hub_textedit.js', 'hub/link/hub_link.js', 'hub/link/hub_linkstate.js',
  // (before H129c) 'hub/link/hub_chat.js', 'hub/link/hub-gamebar.js', 'hub/drives/hub_drives.js', 'hub/link/hub_phonekey.js', 'hub/update/hub_update.js', 'hub/core/hub_loader.js', 'hub/core/hub_saver.js',
  // Start menu / taskbar / home icons and the app lists, so a first visit also works offline
  /* (before DF25) 'apps/office/draftly/draftly_icon.png', 'apps/office/spreadsheet/spreadsheet_icon.png', 'apps/office/tables/tables_icon.svg', */  // H148
  /* (before H161) 'apps/office/writer/writer_icon.png', 'apps/office/spreadsheet/spreadsheet_icon.png', 'apps/office/tables/tables_icon.svg',   // H148: Files Office format thumbnails (.how / .hos / .hot) */
  // (before H129c) 'hub/link/hub_panels.css', 'hub/link/hub_panels.js',
  // (before H129c) 'hub/viewer/hub_notifcenter.js', 'hub/viewer/hub_notifcenter.css',
  'index.html', 'desktop/desktop.html', 'desktop/index.html', 'desktop/mode/hub_osmode.js', 'manifest.webmanifest',
  'hub/core/hub_main.css', 'desktop/controller/hub_controller.css', 'desktop/notify/hub_notification.css', 'desktop/menu/hub_flyout.css',
  'desktop/wm/wm.css', 'desktop/panels/hub_chat.css', 'hub/drives/hub_drives.css', 'hub/update/hub_update.css', 'hub/core/hub_glass.css',
  'hub/core/hub_role.js', 'hub/core/hub_config.js', 'hub/core/hub_appindex.js', 'hub/core/hub_catalog.js', 'hub/core/hub_apps.js',
  'desktop/menu/hub_tiles.js', 'hub/core/hub.js', 'desktop/menu/hub_flyout.js', 'hub/core/hub_prefs.js', 'hub/core/hub_daynight.js',
  'hub/core/hub_autotheme.js', 'hub/core/hub_eye.js', 'hub/drives/hub_wallpapers.js', 'hub/drives/hub_live_wallpaper.js',
  'desktop/menu/hub_settings.js', 'desktop/wm/wm_mode.js', 'desktop/wm/wm_windows.js', 'desktop/wm/wm_taskbar.js', 'desktop/wm/wm_snap.js',
  'desktop/wm/wm_workspaces.js', 'desktop/wm/wm_warm.js', 'desktop/menu/hub_ctx.js', 'desktop/menu/hub_ctx_menus.js',
  'hub/drives/hub_traymeter.js', 'desktop/controller/hub_controller_config.js', 'desktop/notify/hub_notify.js', 'hub/viewer/hub_viewer.js',
  'hub/viewer/hub_viewer_pdf.js', 'desktop/link/hub_pointer.js', 'desktop/link/hub_receive.js', 'desktop/link/hub_remote.js',
  'desktop/controller/hub-controller.js', 'desktop/controller/hub_textedit.js', 'hub/link/hub_link.js', 'hub/link/hub_linkstate.js',
  'desktop/panels/hub_chat.js', 'hub/core/hub_titlebar.js', 'desktop/gamebar/hub-gamebar.js', 'hub/drives/hub_drives.js',
  'hub/link/hub_phonekey.js', 'hub/update/hub_update.js', 'hub/core/hub_loader.js', 'hub/core/hub_saver.js', 'hub/controller/kb_common.js',
  'hub/osk/osk_layout.js', 'hub/osk/osk_board.js', 'hub/osk/osk_drag.js', 'hub/osk/osk.js', 'hub/osk/osk.css',
  'shared/style/no-scrollbar.css', 'shared/wallpaper/wallpapers.js', 'shared/perf/busy_meter.js', 'shared/vendor/qrcode.js',
  'shared/fs/fs_drives.js', 'shared/fs/fs_ops.js', 'shared/fs/fs_ref.js', 'shared/fs/filetypes.js', 'shared/fs/thumbs_store.js',
  'shared/fs/webdav_fs.js', 'shared/fs/webdav_accounts.js', 'shared/fs/sftp_fs.js', 'shared/fs/sftp_accounts.js',
  'shared/google/google_config.js', 'shared/google/google_auth.js', 'shared/google/gdrive_fs.js', 'shared/google/gdrive_connect.js',
  'shared/google/google_gis.js', 'shared/google/phonekey.js', 'shared/google/google.css', 'shared/ctxmenu/ctxmenu.js',
  'shared/ctxmenu/ctxmenu.css', 'shared/ctxmenu/ctx_in_app.js', 'shared/dialog/dialog.js', 'shared/dialog/dialog.css',
  'shared/tiles/tiles.js', 'shared/tiles/tiles.css', 'shared/favorites/favorites.js', 'hub/core/hub_xp.css', 'shared/link/link_core.js',
  'shared/link/link_devices.js', 'shared/link/link_files.js', 'shared/link/link_ui.js', 'shared/link/link_chat.js',
  'shared/link/link_scan.js', 'shared/link/link.css', 'shared/image/hub_icon_192.png', 'shared/image/hub_icon_512.png',
  'apps/favorite/favorite_icon.png', 'apps/games/games_icon.png', 'apps/media/media_icon.png', 'apps/office/office_icon.png',
  'apps/connectivity/connectivity_icon.png', 'apps/tools/tools_icon.png', 'apps/lab/lab_icon.png', 'apps/learn/learn_icon.png',
  'apps/system/system_icon.png', 'apps/system/settings/settings_icon.png', 'apps/system/apphub/apphub_icon.png',
  'apps/system/files/files_icon.png', 'apps/system/disk/disk_icon.png', 'apps/connectivity/qr-scanner/qr-scanner_icon.png',
  'hub/controller/controller_icon.png', 'hub/controller/controller_qr_icon.png', 'apps/office/writer/writer_icon.png',
  'apps/office/spreadsheet/spreadsheet_icon.png', 'apps/office/tables/tables_icon.svg', 'apps/office/base/base_icon.png',
  'apps/office/slides/slides_icon.png', 'apps/favorite/favorite-apps.csv', 'apps/games/games-apps.csv', 'apps/media/media-apps.csv',
  'apps/office/office-apps.csv', 'apps/connectivity/connectivity-apps.csv', 'apps/tools/tools-apps.csv', 'apps/lab/lab-apps.csv',
  'apps/learn/learn-apps.csv', 'apps/system/system-apps.csv', 'hub/version.txt', 'hub/update/hub_offline.html',
  'desktop/panels/hub_panels.css', 'desktop/panels/hub_panels.js', 'apps/system/api-keys/api-keys_icon.png', 'hub/core/hub_credentials.js',
  'hub/core/hub_keys.js', 'hub/core/hub_embeddings.js', 'hub/core/hub_api.js', 'hub/core/hub_providers.js', 'hub/core/hub_profile.js',
  'hub/link/hub_sync.js', 'shared/link/hub_mesh.js', 'hub/link/hub_meshlink.js', 'hub/link/hub_line.js', 'hub/link/hub_trust.js',
  'hub/link/hub_meshlog.js', 'apps/system/mesh-viewer/mesh-viewer_icon.png', 'desktop/notify/hub_notifcenter.js',
  'desktop/notify/hub_notifcenter.css', 'apps/system/notifications/notifications_icon.png', 'hub/core/hub_dialog_bridge.js',
  'hub/core/hub_dnd.js', 'hub/core/hub_attention.js', 'hub/core/hub_break.js', 'hub/core/hub_break.css', 'hub/core/hub_lock_core.js',
  'hub/core/hub_lock.js', 'hub/core/hub_lock.css', 'shared/vendor/peerjs.min.js', 'hub/core/hub_splash.js', 'hub/core/hub_splash.css',
  'hub/core/hub_perf.js', 'hub/core/hub_clock.js', 'hub/core/hub_clock.css', 'unlock.html', 'hub/core/hub_unlock.js',   // H166: + hub_perf.js
  'apps/learn/dictionary/dictionary_icon.png', 'apps/learn/blood-group/blood-group_icon.png',
];
const OFFLINE = 'hub/update/hub_offline.html';
const abs = (p) => new URL(p, self.registration.scope).href;
const SHELL_SET = new Set(SHELL.map(abs));
const ROOT_KEY = abs('index.html');   // H129d: the mode entry; a navigation to / (or an old /hub.html) is served this copy
const DESK_KEY = abs('desktop/index.html');   // H129a: a navigation to desktop/ is served the desktop/index.html redirect
const SCOPE_PATH = new URL(self.registration.scope).pathname;   // H129a: only the Hub's own desktop/, not e.g. apps/…/desktop/

const DIRTY = abs('__hub_dirty__'), FAILED = abs('__hub_failed__');
async function metaList(key) {
  try { const hit = await (await caches.open(META)).match(key); return hit ? await hit.json() : []; } catch (_) { return []; }
}
async function setMetaList(key, list) {
  try { const m = await caches.open(META); if (list.length) await m.put(key, new Response(JSON.stringify(list))); else await m.delete(key); } catch (_) { /* ignore */ }
}
/** Fetch one shell file into the cache; true when stored.
 *  (before H176) fetch(new Request(abs(p), { cache: 'reload' }))
 *  H176: default HTTP cache — files the page already has (staged boot, max-age=600) are not refetched. */
function fetchShell(c, p) {
  // (before H176) return fetch(new Request(abs(p), { cache: 'reload' }))
  return fetch(new Request(abs(p)))
    .then((res) => (res.ok ? c.put(abs(p), res).then(() => true) : false)).catch(() => false);
}
/** R58: re-fetch the shell files the install missed; returns the ones still missing. */
async function retryFailed() {
  const list = await metaList(FAILED);
  if (!list.length) return list;
  const c = await caches.open(CACHE);
  const ok = await Promise.all(list.map((p) => fetchShell(c, p)));
  const left = list.filter((p, i) => !ok[i]);
  await setMetaList(FAILED, left);
  if (left.length) console.warn('Hub SW: shell files still missing', left);
  return left;
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((p) => fetchShell(c, p))))   // one missing file must not break install
    .then((ok) => {   // R58: log + record the misses so a later refresh / update check retries them
      const failed = SHELL.filter((p, i) => !ok[i]);
      if (failed.length) console.warn('Hub SW install: could not cache', failed);
      return setMetaList(FAILED, failed);
    })
    .then(() => { if (!self.registration.active) return self.skipWaiting(); }));   // first install only; updates wait for "Reload"
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()   // R58: 'hub-meta' is kept (R16c–R57 deleted it here)
    // (before H173) .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('hub-shell-') && k !== CACHE) || (k.startsWith('hub-rt-') && k !== RUNTIME)).map((k) => caches.delete(k))))
    .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('hub-shell-') && k !== CACHE) || (k.startsWith('hub-rt-') && k !== RUNTIME) || (k.startsWith('hub-dict-') && k !== DICT)).map((k) => caches.delete(k))))
    .then(async () => {   // H173: one-time purge of Dictionary data left in RUNTIME
      try {
        const rt = await caches.open(RUNTIME);
        const reqs = await rt.keys();
        await Promise.all(reqs.filter((r) => {
          try { return new URL(r.url).pathname.includes('/apps/learn/dictionary/data/'); }
          catch (_) { return String(r.url || '').includes('/apps/learn/dictionary/data/'); }
        }).map((r) => rt.delete(r)));
      } catch (_) { /* ignore */ }
    })
    .then(() => self.clients.claim()));
});

// R16c: shell files that changed since the page that loaded them (the background refresh above
// already stored the new copy) — kept in the 'hub-meta' cache so the 09:00 refresh can report them.
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
async function dirty(add) {
  const m = await caches.open(META);
  const hit = await m.match(DIRTY);
  const list = hit ? await hit.json() : [];
  if (add === null) { await m.delete(DIRTY); return list; }
  if (add && list.indexOf(add) < 0) { list.push(add); await m.put(DIRTY, new Response(JSON.stringify(list))); }
  return list;
}
async function putIfChanged(key, res) {
  try {
    const c = await caches.open(CACHE);
    const old = await c.match(key);
    const a = new Uint8Array(await res.clone().arrayBuffer());
    if (old && same(a, new Uint8Array(await old.arrayBuffer()))) return;
    await c.put(key, res);
    if (old) await dirty(key);
  } catch (_) { /* ignore */ }
}

/** R16c daily refresh: re-fetch every shell file, replace the ones that changed (cache kept, never wiped). */
async function refreshShell() {
  const c = await caches.open(CACHE);
  const changed = [];
  await Promise.all(SHELL.map(async (p) => {
    try {
      const res = await fetch(new Request(abs(p), { cache: 'reload' }));
      if (!ok(res)) return;
      const old = await c.match(abs(p));
      const a = new Uint8Array(await res.clone().arrayBuffer());
      const b = old ? new Uint8Array(await old.arrayBuffer()) : null;
      if (b && same(a, b)) return;
      await c.put(abs(p), res);
      changed.push(p);
    } catch (_) { /* offline: keep the cached copy */ }
  }));
  const failed = await metaList(FAILED);   // R58: every SHELL file was just re-fetched: keep only the misses
  if (failed.length) await setMetaList(FAILED, failed.filter((p) => changed.indexOf(p) < 0));
  const seen = await dirty(null);   // changed earlier by a background refresh
  return changed.concat(seen.filter((k) => changed.indexOf(k) < 0));
}

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'skip-waiting') self.skipWaiting();
  if (e.data && e.data.type === 'refresh') {
    e.waitUntil(refreshShell().then((changed) => { if (e.source) e.source.postMessage({ type: 'sw-refreshed', changed }); }));
  }
  if (e.data && e.data.type === 'retry-failed') e.waitUntil(retryFailed());   // R58 (HubUpdate.check)
  if (e.data && e.data.type === 'version') e.source && e.source.postMessage({ type: 'sw-version', v: V, cache: CACHE });
});

const ok = (res) => res && res.status === 200 && res.type === 'basic';
const imgChecked = new Set(), DAY = 24 * 3600 * 1000;   // R58: images re-checked at most once per worker, if > 1 day old
function put(name, key, res) { const copy = res.clone(); caches.open(name).then((c) => c.put(key, copy)).catch(() => {}); }

/** Network first; store in `name` under `key`; offline → cached copy (→ offline page for navigations). */
function networkFirst(req, name, key, nav) {
  return fetch(req, { cache: 'no-cache' }).then((res) => { if (ok(res)) put(name, key, res); return res; })
    .catch(() => caches.match(key, { ignoreSearch: true }).then((hit) => hit || (nav ? caches.match(abs(OFFLINE)) : Response.error())));
}
/** Cache first, refresh in the background (the next load gets the new copy). */
function staleWhileRevalidate(e, req, key) {
  const net = fetch(req, { cache: 'no-cache' }).then((res) => { if (ok(res)) putIfChanged(key, res.clone()); return res; });
  e.waitUntil(net.catch(() => {}));
  return caches.open(CACHE).then((c) => c.match(key)).then((hit) => hit || net)
    .catch(() => net);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                    // Google / OAuth / Drive / PeerJS / CDNs: never cached
  if (req.cache === 'no-store' || req.cache === 'reload' || req.headers.has('range')) return;   // update checks, media ranges
  const bare = url.origin + url.pathname;
  const nav = req.mode === 'navigate';
  const v = url.searchParams.get('v');
  const path = url.pathname;

  if (/\.csv$/i.test(path) || path.endsWith('/hub/version.txt')) {
    e.respondWith(networkFirst(req, RUNTIME, bare, false)); return;
  }
  // hub.html (also opened as / or /hub.html?join=…): the shell copy, keyed without the query   (before H129d; see below)
  // (before H129a) const shellKey = nav && /\/hub\.html$/.test(path) ? bare : (SHELL_SET.has(bare) ? bare : '');
  // H129a: the desktop Hub page is desktop/desktop.html (a SHELL file); desktop/ = its folder-index redirect
  // (cached as desktop/index.html), and hub.html is a redirect too
  // const shellKey = nav && path === SCOPE_PATH + 'desktop/' ? DESK_KEY
  //   : nav && /\/hub\.html$/.test(path) ? bare : (SHELL_SET.has(bare) ? bare : '');   (before H129d)
  // H129d: hub.html was removed. Old bookmarks, installed apps (start_url hub.html before H129d), Connect QR links
  // (hub.html?join=CODE) and hub.html#app links still land: a navigation to the site's own /hub.html is answered
  // with the index.html copy (the address bar keeps hub.html?…#…; index.html's relative targets still resolve from
  // the root and it passes ?join / #hash on). Cache first (offline too); the network fetch goes to index.html, never hub.html.
  if (nav && path === SCOPE_PATH + 'hub.html') {
    const idx = new Request(ROOT_KEY, { credentials: 'same-origin' });
    e.respondWith(staleWhileRevalidate(e, idx, ROOT_KEY).catch(() => caches.match(abs(OFFLINE)))); return;
  }
  const shellKey = nav && path === SCOPE_PATH + 'desktop/' ? DESK_KEY
    : nav && path === SCOPE_PATH ? ROOT_KEY : (SHELL_SET.has(bare) ? bare : '');   // H129d: / = index.html
  if (shellKey && (!v || v === V)) { e.respondWith(staleWhileRevalidate(e, req, shellKey)); return; }
  if (shellKey) { e.respondWith(networkFirst(req, CACHE, shellKey, nav)); return; }   // newer ?v= than this worker
  if (/\.(png|jpe?g|gif|webp|svg|ico)$/i.test(path)) {   // R25 / R58: see the header (images)
    const get = () => fetch(req).then((res) => { if (ok(res)) put(RUNTIME, bare, res); return res; });
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (!hit) return get();   // first request: fetch and store
      if (!imgChecked.has(bare)) {   // at most one background check per image per worker lifetime
        imgChecked.add(bare);
        const at = Date.parse(hit.headers.get('date') || '') || 0;
        if (Date.now() - at > DAY) e.waitUntil(get().catch(() => {}));
      }
      return hit;
    }));
    return;
  }
  if (/\.(woff2?|ttf|otf)$/i.test(path)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => { if (ok(res)) put(RUNTIME, bare, res); return res; })));
    return;
  }
  // H165: Dictionary data shards are not in SHELL (too large to precache). Cache-first after the first
  // fetch, so a letter file used once still opens offline.
  // (before H165) these paths used the general apps/ network-first rule below
  // H173: stored in DICT (not RUNTIME) under the bare URL, so a data rebuild can drop stale shards.
  if (path.includes('/apps/learn/dictionary/data/')) {
    // (before H173) e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => { if (ok(res)) put(RUNTIME, bare, res); return res; })));
    e.respondWith(caches.open(DICT).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => { if (ok(res)) put(DICT, bare, res); return res; }))));
    return;
  }
  if (nav || path.includes('/apps/') || /\.(html?|css|m?js|json|txt|md|webmanifest)$/i.test(path) || path.endsWith('/')) {
    // (before H74) e.respondWith(networkFirst(req, RUNTIME, nav ? bare : req.url, nav)); return;
    e.respondWith(networkFirst(req, RUNTIME, bare, nav)); return;   // H74: bare URL key (query stripped) = one cached copy per file, no ?v= pile-up
  }
});
