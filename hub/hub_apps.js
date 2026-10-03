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
 */
window.HUB_APPS_CSV = `
CATEGORY, NAME,                  ENTRY_URL,                                  ICON_URL, NEW_TAB, HIDDEN, ORDER
Favorite, TV,                    tv/,                                        ,         0,       0,      10
Favorite, Transcribe,            apps/tools/transcribe/,                     ,         0,       1,      20
Favorite, Caption for NEI,       apps/tools/caption-for-nei/,                ,         0,       0,      70

Games,    D-Pad Controller,      controller/,                                ,         1,       0,      199
Games,    2048,                  apps/games/2048/,                           ,         0,       0,      101
Games,    Swell Foop,            apps/games/swell-foop/,                     ,         0,       0,      102
Games,    Ping Pong,             apps/games/pong/,                           ,         0,       0,      105
Games,    Tetris,                apps/games/tetris/,                         ,         0,       0,      110
Games,    Tic-Tac-Toe,           apps/games/tic-tac-toe/,                    ,         0,       0,      115
Games,    Snake,                 apps/games/snake/,                          ,         0,       0,      120
Games,    Dino Run,              apps/games/dino-run/,                       ,         0,       0,      130
Games,    Car Run,               apps/games/car-run/,                        ,         0,       0,      140
Games,    Tennis Ball Blitz,     apps/games/tennis-throw/,                   ,         0,       0,      150
Games,    Desert Road,           apps/games/desert-road/,                    ,         0,       0,      160
Games,    Contra (alpha),        apps/games/contra-alpha/,                   ,         0,       0,      170
Games,    Space Invaders,        apps/games/space-invader/,                  ,         0,       0,      175
Games,    AR Game,               apps/games/ar-game/,                        ,         0,       0,      180
Games,    Browser FPS,           apps/games/browser-fps/,                    ,         0,       0,      190
Games,    Island (Alpha),        apps/games/island-alpha/,                   ,         0,       0,      192
Games,    Tower Defence,         apps/games/tower-defence/,                  ,         0,       0,      111
Games,    Demolisher,            apps/games/demolisher/,                     ,         0,       0,      195

Media,    TV,                    tv/,                                        ,         0,       0,      210
Media,    Webcam,                apps/media/webcam/,                         ,         0,       0,      220
Media,    3D Viewer,             apps/media/3d-viewer/,                      ,         0,       0,      240
Media,    Paint,                 apps/media/paint/,                          ,         0,       0,      230
Media,    Draw,                  apps/media/draw/,                           ,         0,       0,      225
Media,    Photo Editor,          apps/media/photo-editor/,                   ,         0,       0,      260
Media,    Photo Editor v2,       apps/media/photo-editor-v2/,                ,         0,       0,      265

Office,   Spreadsheet,           apps/office/spreadsheet/,                   ,         0,       0,      320
Office,   Draft-ly,              apps/office/draftly/,                       ,         0,       0,      310
Office,   OCR,                   apps/office/ocr/,                           ,         0,       0,      360
Office,   MS Word Diff,          apps/tools/msword_diff/,                    ,         0,       0,      440

Connectivity, AirDrop,           apps/connectivity/airdrop-web/,             ,         0,       0,      405
Connectivity, QR Scanner,        apps/connectivity/qr-scanner/,              ,         0,       0,      406
Connectivity, Pooh Chat,         apps/connectivity/pooh-chat/,               ,         0,       0,      450
Connectivity, WebChat,           apps/connectivity/webrtc-chat/,             ,         0,       0,      455
Connectivity, Peer Chat,         apps/connectivity/p2pchat.html,             ,         0,       0,      460

Tools,    Calculator,            apps/tools/calculator/,                     ,         0,       0,      410
Tools,    FileDrop,              apps/lab/file-drop/,                        ,         0,       1,      410
Tools,    NE-India Dictionary,   apps/tools/nei-dict/,                       ,         0,       0,      430
Tools,    Notepad,               apps/tools/notepad/,                        ,         0,       0,      450
Tools,    Weather,               apps/tools/weather-chart/,                  ,         0,       0,      420
Tools,    Weather Hourly,        apps/tools/weather-hourly/,                 ,         0,       0,      465
Tools,    Caption for NEI,       apps/tools/caption-for-nei/,                ,         0,       0,      440

Desktop,  Learning HTML (Basic), apps/tools/learning-html/,                  ,         0,       0,      910
Desktop,  vDesktop,              apps/tools/vDesktop/,                       ,         1,       0,      900

Lab,      Phone,                 apps/media/phone/,                          ,         0,       0,      1070
Lab,      Paper Keyboard,        apps/lab/paper-keyboard/,                   ,         0,       0,      1040

About,    About,                 apps/about/,                                ,         0,       0,      2000
About,    Contact,               apps/about/contact.txt,                     ,         0,       0,      2020
About,    Feedback,              apps/about/feedback.txt,                    ,         0,       1,      2030
`;
