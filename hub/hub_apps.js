/*
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
 * its files stay in apps/tools/vDesktop/ and #vDesktop still opens it.
 * Lab "Legacy" (R15, lab-apps.csv section): Paint, Photo Editor, Notepad, Calculator (Legacy),
 * Webcam, Keyboard — orders 1900+ so they come last in Lab. Sling Birds / Pacman are in Games
 * (Arcade), Device Benchmark in Tools (System), as in the CSVs.
 * About is HIDDEN too: its cards moved into the Settings app (About section); apps/about/
 * redirects to apps/settings/#about. Settings itself is opened by the "⚙ Settings" row
 * at the bottom of the menu (hub_settings.js), so its row is HIDDEN here.
 */
window.HUB_APPS_CSV = `
CATEGORY, NAME,                  ENTRY_URL,                                  ICON_URL, NEW_TAB, HIDDEN, ORDER
Favorite, Favorite Page,         apps/favorite/favorite.html,                ,         0,       0,      9
Favorite, TV,                    tv/,                                        ,         0,       0,      10
Favorite, Transcribe,            apps/tools/transcribe/,                     ,         0,       1,      20
Favorite, Caption for NEI,       apps/tools/caption-for-nei/,                ,         0,       0,      70

Games,    Games Page,            apps/games/games.html,                      ,         0,       0,      100
Games,    D-Pad Controller,      hub/controller/,                            ,         1,       0,      199
Games,    2048,                  apps/games/2048/,                           ,         0,       0,      101
Games,    Swell Foop,            apps/games/swell-foop/,                     ,         0,       0,      102
Games,    Ping Pong,             apps/games/pong/,                           ,         0,       0,      105
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

Media,    Media Page,            apps/media/media.html,                      ,         0,       0,      209
Media,    TV,                    tv/,                                        ,         0,       0,      210
Media,    3D Viewer,             apps/media/3d-viewer/,                      ,         0,       0,      240
Media,    Draw,                  apps/media/draw/,                           ,         0,       0,      225
Media,    Photo Editor v2,       apps/media/photo-editor-v2/,                ,         0,       0,      265

Office,   Office Page,           apps/office/office.html,                    ,         0,       0,      309
Office,   Spreadsheet,           apps/office/spreadsheet/,                   ,         0,       0,      320
Office,   Draftly,               apps/office/draftly/,                       ,         0,       0,      310
Office,   OCR,                   apps/office/ocr/,                           ,         0,       0,      360
Office,   MS Word Diff,          apps/tools/msword_diff/,                    ,         0,       0,      440
Office,   Notely,                apps/office/notely/,                        ,         0,       0,      450
Office,   Print,                 apps/office/print/,                         ,         0,       0,      460
Office,   Mail,                  apps/office/mail/,                          ,         0,       0,      470
Office,   Paper Scan,            apps/office/paper-scan/,                    ,         0,       0,      480

Connectivity,Connectivity Page,     apps/connectivity/connectivity.html,        ,         0,       0,      404
Connectivity, File Drop,         apps/connectivity/filedrop/,                ,         0,       0,      405
Connectivity, QR Scanner,        apps/connectivity/qr-scanner/,              ,         0,       0,      406
Connectivity, Pooh Chat,         apps/connectivity/pooh-chat/,               ,         0,       0,      450

Tools,    Tools Page,            apps/tools/tools.html,                      ,         0,       0,      409
Tools,    Files,                 apps/tools/files/,                          ,         0,       0,      405
Tools,    Viewer,                apps/tools/viewer/,                         ,         0,       0,      407
Tools,    System Monitor,        apps/tools/sysmon/,                         ,         0,       0,      406
Tools,    Device Benchmark,      apps/tools/devbench/,                       ,         0,       0,      408
Tools,    Calculator,            apps/tools/calculator/,                     ,         0,       0,      410
Tools,    NE-India Dictionary,   apps/tools/nei-dict/,                       ,         0,       0,      430
Tools,    Weather,               apps/tools/weather-chart/,                  ,         0,       0,      420
Tools,    Weather Hourly,        apps/tools/weather-hourly/,                 ,         0,       0,      465
Tools,    Caption for NEI,       apps/tools/caption-for-nei/,                ,         0,       0,      440

Tools,    Learning HTML (Basic), apps/tools/learning-html/,                  ,         0,       0,      910
Desktop,  vDesktop,              apps/tools/vDesktop/,                       ,         0,       1,      900

Lab,      Lab Page,              apps/lab/lab.html,                          ,         0,       0,      1000
Lab,      Island Game Demo,      apps/lab/island-demo/,                      ,         0,       0,      1080
Lab,      Phone,                 apps/media/phone/,                          ,         0,       0,      1070
Lab,      Paper Keyboard,        apps/lab/paper-keyboard/,                   ,         0,       0,      1040
Lab,      Notebook,              apps/lab/notebook/,                         ,         0,       0,      1045
Lab,      AoE RTS,               apps/lab/aoe-rts/,                          ,         0,       0,      1086
Lab,      WebRTC Chat,           apps/connectivity/webrtc-chat/,             ,         0,       0,      1095
Lab,      P2P Chat,              apps/connectivity/p2pchat.html,             ,         0,       0,      1096
Lab,      Paint,                 apps/media/paint/,                          ,         0,       0,      1900
Lab,      Photo Editor,          apps/media/photo-editor/,                   ,         0,       0,      1901
Lab,      Notepad,               apps/office/notepad/,                       ,         0,       0,      1902
Lab,      Calculator (Legacy),   apps/tools/calculator-beta/,                ,         0,       0,      1903
Lab,      Webcam,                apps/media/webcam/,                         ,         0,       0,      1904
Lab,      Keyboard,              apps/lab/keyboard/,                         ,         0,       0,      1905

About,    About,                 apps/about/,                                ,         0,       1,      2000
About,    Contact,               apps/about/contact.html,                    ,         0,       1,      2020
About,    Feedback,              apps/about/feedback.html,                   ,         0,       1,      2030

Settings, Settings,              apps/settings/,                             ,         0,       1,      2100
`;
