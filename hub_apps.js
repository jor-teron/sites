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
Favorite, Caption for NEI,       tools/caption-for-nei/caption-for-nei.html, ,         0,       0,      70
Games,    Swell Foop,            games/swell-foop/,                          ,         0,       0,      100
Games,    Ping Pong,             games/pong/,                                ,         0,       0,      105
Games,    Tetris,                games/tetris/,                              ,         0,       0,      110
Games,    Tic-Tac-Toe,           games/tic-tac-toe/,                         ,         0,       0,      115
Games,    Snake,                 games/snake/,                               ,         0,       0,      120
Games,    Dino Run,              games/dino-run/,                            ,         0,       0,      130
Games,    Car Run,               games/car-run/,                             ,         0,       0,      140
Games,    Tennis Ball Blitz,     games/tennis-throw/,                        ,         0,       0,      150
Games,    Desert Road,           games/desert-road/,                         ,         0,       0,      160
Games,    Contra (alpha),        games/contra-alpha/,                        ,         0,       0,      170
Games,    Space Invaders,        games/space-invader/,                       ,         0,       0,      175
Games,    AR Game,               games/ar-game/,                             ,         0,       0,      180
Games,    Browser FPS,           games/browser-fps/,                         ,         0,       0,      190
Games,    Island (Alpha),        games/island-alpha/,                        ,         0,       0,      192
Games,    D-Pad Controller,      controller/,                                ,         0,       1,      195
Media,    TV,                    tv/,                                        ,         0,       0,      210
Media,    Webcam,                media/webcam/,                              ,         0,       0,      220
Media,    Paint,                 media/paint/,                               ,         0,       0,      230
Media,    Photo Editor,          media/photo-editor/,                        ,         0,       0,      260
Media,    Phone,                 media/phone/,                               ,         0,       0,      270
Office,   Spreadsheet,           office/spreadsheet/,                        ,         0,       0,      360
Tools,    Calculator,            tools/calculator/,                          ,         0,       0,      410
Tools,    NE-India Dictionary,   tools/nei-dict/,                            ,         0,       0,      430
Tools,    MS Word Diff,          tools/msword_diff/,                         ,         0,       0,      440
Tools,    Notepad,               tools/notepad/,                             ,         0,       0,      450
Tools,    Weather,               tools/weather-chart/,                       ,         0,       0,      460
Tools,    Weather Hourly,        tools/weather-hourly/,                      ,         0,       0,      465
Tools,    Caption for NEI,       tools/caption-for-nei/,                     ,         0,       0,      470
Tools,    Learning HTML (basic), tools/learning-html/,                       ,         0,       0,      499
Desktop,  vDesktop,              tools/vDesktop/,                            ,         0,       0,      900
About,    About,                 about/,                                     ,         0,       0,      1000
About,    Contact,               about/contact.txt,                          ,         0,       0,      1020
About,    Feedback,              about/feedback.txt,                         ,         0,       1,      1030
`;
