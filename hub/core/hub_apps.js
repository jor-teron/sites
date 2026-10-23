/*
 * ===== LEGACY APP LIST (R30) — do not add new apps here; add them to the category CSV =====
 * R33a: this file now keeps ONLY the category list + order (the "<Category> Page" rows) and the
 * hidden system rows (R58: only Settings is left; the Desktop/vDesktop, About, Contact, Feedback and
 * Transcribe rows are gone — hub.js OLD_IDS maps their old deep links — not in any category CSV). Every app row moved to the archive block at the end (not parsed); hub.js
 * registers the apps from the category CSVs (hub_flyout.js window.HubStartList).
 * Source of truth for which apps a category shows: apps/<category>/<category>-apps.csv
 * (mapped in hub_config.js HUB_CAT_CSV, parsed by TilesCsv in shared/tiles/tiles.js). Those
 * CSVs draw the category pages (apps/<cat>/<cat>.html) and the Desktop Start flyouts
 * (hub_flyout.js). Every visible category here has a "<Category> Page" row, so the Hub menu /
 * Start lists only the category rows from this file; a click opens that category's page.
 * Still read from this file (window.HUB_APPS_CSV), so the rows are KEPT ON PURPOSE:
 *   - hub/core/hub.js: the menu's category rows and their order, the hash ids / last-app memory
 *     (#snake …), names / icons / NEW_TAB of known apps, window session restore (an app not
 *     listed here is re-checked with a HEAD request), __hubOpenApp (hub_chat.js) and the
 *     load-error message when this file is broken;
 *   - hub/menu/hub_tiles.js (home tiles): icon and NEW_TAB fallback of the same app;
 *   - hub/menu/hub_flyout.js: a hash of this text — a change drops the cached Start list;
 *   - hub/update/hub_sw.js SHELL and hub.html <script> (precached, loaded before hub.js).
 * An app that is only in a category CSV still opens (from its page / flyout) as a hidden extra.
 * Do not remove, reorder or "clean up" rows without checking the readers above.
 * ==========================================================================================
 *
 * sites hub — app list (hub_apps.js). Loaded by hub.html before hub.js
 * (replaces hub-apps.csv; a script works over http AND file:// with no fetch).
 *
 * window.HUB_APPS_CSV is plain CSV text, one app per line, columns by HEADER NAME
 * (order does not matter, spaces around cells are ignored so the table can be aligned):
 *   CATEGORY   menu group (groups appear in the order of their first app)
 *   NAME       text in the menu
 *   ENTRY_URL  folder (games/snake/ → its index.html), file (tools/x.html) or
 *              text file (about/contact.txt → shown in script/txt-view.html)
 *   ICON_URL   optional icon; empty = the app's own icon:
 *                folder xxx/ → xxx/xxx_icon.png, file dir/name.ext → dir/name_icon.png
 *   NEW_TAB    0 = open inside the hub (default, also when empty), 1 = open in a new browser tab
 *   HIDDEN     1 = not in the menu (the row can still be used, e.g. by hub_tiles.js)
 *   ORDER      sort number (smaller first)
 *
 * Rules: no backtick (`) and no "${" anywhere in the text (they would end / break the
 * JS string), no commas inside a cell, one app per line. A broken file shows
 * "hub_apps.js failed to load or has an error" in the hub instead of the menu.
 * Desktop (vDesktop) is HIDDEN since the Hub has its own Desktop mode (windows + taskbar);
 * its files stay in apps/tools/vDesktop/ (R58: nothing in the Hub links there any more; an old
 * #vDesktop link shows home).
 * Lab "Legacy" (R15, lab-apps.csv section): Paint, Photo Editor, Notepad, Calculator (Legacy),
 * Webcam, Keyboard — orders 1900+ so they come last in Lab. Sling Birds / Pacman are in Games
 * (Arcade), Device Benchmark in Tools (System), as in the CSVs.
 * About is HIDDEN too: its cards moved into the Settings app (About section); apps/system/about/
 * redirects to apps/system/settings/#about (R53: both moved under apps/system/; the old
 * apps/settings/ and apps/about/ folders are now only redirect pages to them). Settings itself is opened by the "⚙ Settings" row
 * at the bottom of the menu (hub_settings.js), so its row is HIDDEN here.
 */
// R33a: categories ("<Category> Page" rows) + hidden system rows only. Apps: apps/<category>/<category>-apps.csv.
window.HUB_APPS_CSV = `
CATEGORY,     NAME,                  ENTRY_URL,                                  ICON_URL, NEW_TAB, HIDDEN, ORDER
Favorite,     Favorite Page,         apps/favorite/favorite.html,                ,         0,       1,      9
Games,        Games Page,            apps/games/games.html,                      ,         0,       0,      100
Media,        Media Page,            apps/media/media.html,                      ,         0,       0,      209
Office,       Office Page,           apps/office/office.html,                    ,         0,       0,      309
Connectivity, Connectivity Page,     apps/connectivity/connectivity.html,        ,         0,       0,      404
Tools,        Tools Page,            apps/tools/tools.html,                      ,         0,       0,      409
Lab,          Lab Page,              apps/lab/lab.html,                          ,         0,       0,      1000
System,       System Page,           apps/system/system.html,                    ,         0,       0,      1100
Settings,     Settings,              apps/system/settings/,                      ,         0,       1,      2100
`;

/* ===== R33a ARCHIVE (not parsed): the app rows that lived here until R33a =====
 * R33a: kept for reference; source is the category CSVs (apps/<category>/<category>-apps.csv).
 * Every row below exists in a category CSV with the same entry path, name, icon and new-tab
 * flag (checked at R33a). Do not copy rows back; edit the category CSV instead.
CATEGORY, NAME,                  ENTRY_URL,                                  ICON_URL, NEW_TAB, HIDDEN, ORDER
Favorite, TV,                    tv/,                                        ,         0,       0,      10
Favorite, Caption for NEI,       apps/tools/caption-for-nei/,                ,         0,       0,      70
Games,    D-Pad Controller,      hub/controller/,                            ,         1,       0,      199
Games,    2048,                  apps/games/2048/,                           ,         0,       0,      101
Games,    Swell Foop,            apps/games/swell-foop/,                     ,         0,       0,      102
Games,    Ping Pong,             apps/games/ping-pong/,                     ,         0,       0,      105
Games,    Tetris,                apps/games/tetris/,                         ,         0,       0,      110
Games,    Tic-Tac-Toe,           apps/games/tic-tac-toe/,                    ,         0,       0,      115
Games,    Snake,                 apps/games/snake/,                          ,         0,       0,      120
Games,    Dino Run,              apps/games/dino-run/,                       ,         0,       0,      130
Games,    Car Run,               apps/games/car-run/,                        ,         0,       0,      140
Games,    Tennis Ball Blitz,     apps/games/tennis-throw/,                   ,         0,       0,      150
Games,    Sling Birds,           apps/games/sling-birds/,                    ,         0,       0,      151
Games,    Pacman,                apps/games/pacman/,                         ,         0,       0,      152
Games,    Desert Road,           apps/games/desert-road/,                    ,         0,       0,      160
Games,    Contra (alpha),        apps/games/contra-alpha/,                   ,         0,       0,      170
Games,    Space Invaders,        apps/games/space-invader/,                  ,         0,       0,      175
Games,    AR Game,               apps/games/ar-game/,                        ,         0,       0,      180
Games,    Browser FPS,           apps/games/browser-fps/,                    ,         0,       0,      190
Games,    Island (Alpha),        apps/games/island-alpha/,                   ,         0,       0,      192
Games,    Tower Defence,         apps/games/tower-defence/,                  ,         0,       0,      111
Games,    Demolisher,            apps/games/demolisher/,                     ,         0,       0,      195
Games,    AoE RTS,               apps/games/aoe-rts/,                        ,         0,       0,      196   (R45: was Lab apps/lab/aoe-rts/, moved by PR #56)
Media,    TV,                    tv/,                                        ,         0,       0,      210
Media,    3D Viewer,             apps/media/3d-viewer/,                      ,         0,       0,      240
Media,    Draw,                  apps/media/draw/,                           ,         0,       0,      225
Media,    Photo Editor v2,       apps/media/photo-editor-v2/,                ,         0,       0,      265
Office,   Spreadsheet,           apps/office/spreadsheet/,                   ,         0,       0,      320
Office,   Draftly,               apps/office/draftly/,                       ,         0,       0,      310
Office,   OCR,                   apps/office/ocr/,                           ,         0,       0,      360
Office,   MS Word Diff,          apps/tools/msword_diff/,                    ,         0,       0,      440
Office,   Notely,                apps/office/notely/,                        ,         0,       0,      450
Office,   Print,                 apps/office/print/,                         ,         0,       0,      460
Office,   Mail,                  apps/office/mail/,                          ,         0,       0,      470
Office,   Paper Scan,            apps/office/paper-scan/,                    ,         0,       0,      480
Connectivity, File Drop,         apps/connectivity/filedrop/,                ,         0,       0,      405
Connectivity, QR Scanner,        apps/connectivity/qr-scanner/,              ,         0,       0,      406
Connectivity, Pooh Chat,         apps/connectivity/pooh-chat/,               ,         0,       0,      450
System,   Files,                 apps/system/files/,                         ,         0,       0,      405   (R58: was Tools apps/tools/files/, moved by R53b; apps/tools/files/ only redirects)
Tools,    Viewer,                apps/tools/viewer/,                         ,         0,       0,      407
Tools,    System Monitor,        apps/tools/sysmon/,                         ,         0,       0,      406
Tools,    Device Benchmark,      apps/tools/devbench/,                       ,         0,       0,      408
Tools,    Calculator,            apps/tools/calculator/,                     ,         0,       0,      410
Tools,    NE-India Dictionary,   apps/tools/nei-dict/,                       ,         0,       0,      430
Tools,    Weather,               apps/tools/weather-chart/,                  ,         0,       0,      420
Tools,    Weather Hourly,        apps/tools/weather-hourly/,                 ,         0,       0,      465
Tools,    Caption for NEI,       apps/tools/caption-for-nei/,                ,         0,       0,      440
Tools,    Learning HTML (Basic), apps/tools/learning-html/,                  ,         0,       0,      910
Lab,      Island Game Demo,      apps/lab/island-demo/,                      ,         0,       0,      1080
Lab,      Phone,                 apps/media/phone/,                          ,         0,       0,      1070
Lab,      Paper Keyboard,        apps/lab/paper-keyboard/,                   ,         0,       0,      1040
Lab,      Notebook,              apps/lab/notebook/,                         ,         0,       0,      1045
(R45: moved to Games, see above) Lab,      AoE RTS,               apps/lab/aoe-rts/,                          ,         0,       0,      1086
Lab,      WebRTC Chat,           apps/connectivity/webrtc-chat/,             ,         0,       0,      1095
Lab,      P2P Chat,              apps/connectivity/p2pchat.html,             ,         0,       0,      1096
Lab,      Paint,                 apps/media/paint/,                          ,         0,       0,      1900
Lab,      Photo Editor,          apps/media/photo-editor/,                   ,         0,       0,      1901
Lab,      Notepad,               apps/office/notepad/,                       ,         0,       0,      1902
Lab,      Calculator (Legacy),   apps/tools/calculator-beta/,                ,         0,       0,      1903
Lab,      Webcam,                apps/media/webcam/,                         ,         0,       0,      1904
Lab,      Keyboard,              apps/lab/keyboard/,                         ,         0,       0,      1905
Lab,      MyBookmark,            apps/lab/mybookmark/,                       ,         0,       0,      1906   (R46: replaces Bookmark Manager)
(R46: replaced by MyBookmark) Lab,      Bookmark Manager,      apps/lab/bookmark-manager/,                ,         0,       0,      1906
 * ===== end of R33a archive ===== */

