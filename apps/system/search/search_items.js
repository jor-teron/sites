/*
 * Hub Search items (apps/system/search/search_items.js), H48 — the Hub things that are not apps.
 * window.HUB_SEARCH_ITEMS.settings: Settings pages / options → opens apps/system/settings/#<hash>.
 *   hash 'section' opens that page; 'section/sub' also scrolls to that card (only subs the section
 *   really handles: devices/device, devices/connected, devices/profile, devices/sync (H29.2b; were about/device (H46),
 *   about/profile; the old ones still redirect), devices/undo (H29.3), hubbar/<key> (H52), about/autoupdate (H52)). Keep in step with apps/system/settings/sec_*.js
 *   (Settings.add ids and their ui.title() rows) when a page or option is added or renamed.
 *   words: extra search words (not shown; the top-level pages also have 'settings', so the query
 *   'settings' lists the pages, not every option).
 * window.HUB_SEARCH_ITEMS.actions: Hub actions, run on the parent Hub's window.HubWM (Desktop mode only);
 *   search.js knows each id. Only safe, undoable ones (nothing closes or deletes).
 */
window.HUB_SEARCH_ITEMS = {
  settings: [
    { name: 'Wallpaper', hash: 'wallpaper', icon: '\uD83D\uDDBC\uFE0F', where: 'Settings', words: 'settings background picture colours gradients desktop image' },
    { name: 'Desktop', hash: 'desktop', icon: '\uD83D\uDDA5\uFE0F', where: 'Settings', words: 'settings screen mode phone home screen home button start menu taskbar screen saver' },
    { name: 'Screen mode (Desktop / Phone)', hash: 'desktop', icon: '\uD83D\uDDA5\uFE0F', where: 'Settings \u203A Desktop', words: 'phone mode desktop mode auto' },
    { name: 'Open windows maximised', hash: 'desktop', icon: '\uD83D\uDDA5\uFE0F', where: 'Settings \u203A Desktop', words: 'maximize fullscreen new windows' },
    { name: 'Start menu: open on hover', hash: 'desktop', icon: '\uD83D\uDDA5\uFE0F', where: 'Settings \u203A Desktop', words: 'menu hover start' },
    { name: 'Show Files on the desktop', hash: 'desktop', icon: '\uD83D\uDDA5\uFE0F', where: 'Settings \u203A Desktop', words: 'drives icons home' },
    // { name: 'Busy meter in the taskbar', hash: 'desktop', icon: '\uD83D\uDDA5\uFE0F', where: 'Settings \u203A Desktop', words: 'cpu graph tray clock' },   // H52: moved to Hub bar
    // H52: Settings → Hub bar (sec_hubbar.js): the page + one row per switch (#hubbar/<key> scrolls to it)
    { name: 'Hub bar', hash: 'hubbar', icon: '\uD83C\uDF9A\uFE0F', where: 'Settings', words: 'settings taskbar tray icons show hide toggle bar items start phone top bar' },   // H52b: + phone top bar
    { name: 'Hub bar: Show Desktop button', hash: 'hubbar/barShowDesk', icon: '\uD83C\uDF9A\uFE0F', where: 'Settings \u203A Hub bar', words: 'taskbar minimise all hide' },
    { name: 'Hub bar: Search button', hash: 'hubbar/barSearch', icon: '\uD83C\uDF9A\uFE0F', where: 'Settings \u203A Hub bar', words: 'taskbar magnifier hide' },
    { name: 'Hub bar: Window buttons', hash: 'hubbar/barTasks', icon: '\uD83C\uDF9A\uFE0F', where: 'Settings \u203A Hub bar', words: 'taskbar open windows tasks hide' },
    { name: 'Hub bar: Workspaces switcher', hash: 'hubbar/barWorkspaces', icon: '\uD83C\uDF9A\uFE0F', where: 'Settings \u203A Hub bar', words: 'taskbar workspace 1 2 hide' },
    { name: 'Hub bar: On-screen keyboard button', hash: 'hubbar/barOsk', icon: '\uD83C\uDF9A\uFE0F', where: 'Settings \u203A Hub bar', words: 'taskbar osk keyboard hide' },
    { name: 'Hub bar: Pooh Chat icon', hash: 'hubbar/barPooh', icon: '\uD83C\uDF9A\uFE0F', where: 'Settings \u203A Hub bar', words: 'taskbar tray pooh chat bear hide show phone top bar' },   // H52b
    { name: 'Hub bar: Devices button', hash: 'hubbar/barDevices', icon: '\uD83C\uDF9A\uFE0F', where: 'Settings \u203A Hub bar', words: 'taskbar tray gamepad devices controller hide phone top bar' },   // H52b
    // { name: 'Hub bar: Update icon', hash: 'hubbar/barUpdate', icon: '\uD83C\uDF9A\uFE0F', where: 'Settings \u203A Hub bar', words: 'taskbar tray update ready dot start hide show phone top bar home menu' },   // H52b
    { name: 'Hub bar: Update icon', hash: 'hubbar/barUpdate', icon: '\uD83C\uDF9A\uFE0F', where: 'Settings \u203A Hub bar', words: 'taskbar tray update ready indicator hide show phone top bar' },   // H52c: no dot
    // H55: Settings › Devices › Public mesh
    { name: 'Join public mesh', hash: 'devices/public', icon: '\uD83D\uDCF2', where: 'Settings \u203A Devices', words: 'mesh 0000 public nearby hubs invite code devices presence' },
    { name: 'Busy meter in the taskbar', hash: 'hubbar/trayMeter', icon: '\uD83C\uDF9A\uFE0F', where: 'Settings \u203A Hub bar', words: 'cpu graph tray clock busy meter' },
    { name: 'Hub bar: Clock', hash: 'hubbar/barClock', icon: '\uD83C\uDF9A\uFE0F', where: 'Settings \u203A Hub bar', words: 'taskbar tray time clock hide' },
    { name: 'Screen saver', hash: 'desktop', icon: '\uD83D\uDDA5\uFE0F', where: 'Settings \u203A Desktop', words: 'saver idle clock lock' },
    { name: 'Windows', hash: 'windows', icon: '\uD83E\uDE9F', where: 'Settings', words: 'settings focus hover snapping snap magnetic edges workspaces title bar thumbnails notifications' },
    { name: 'Workspaces', hash: 'windows', icon: '\uD83E\uDE9F', where: 'Settings \u203A Windows', words: 'virtual desktops two one' },
    { name: 'Snap windows to screen edges', hash: 'windows', icon: '\uD83E\uDE9F', where: 'Settings \u203A Windows', words: 'snapping half magnet magnetic' },
    { name: 'Files: open items with', hash: 'windows', icon: '\uD83E\uDE9F', where: 'Settings \u203A Windows', words: 'click double files thumbnails' },
    { name: 'Notification timeout', hash: 'windows', icon: '\uD83E\uDE9F', where: 'Settings \u203A Windows', words: 'toast notify cards' },
    { name: 'Sizes', hash: 'sizes', icon: '\uD83D\uDCCF', where: 'Settings', words: 'settings taskbar position taskbar size title bar height bottom top' },
    { name: 'Look', hash: 'look', icon: '\uD83C\uDFA8', where: 'Settings', words: 'settings theme dark light accent colour color animations motion' },
    { name: 'Theme (Dark / Light)', hash: 'look', icon: '\uD83C\uDFA8', where: 'Settings \u203A Look', words: 'dark mode light mode' },
    { name: 'Accent colour', hash: 'look', icon: '\uD83C\uDFA8', where: 'Settings \u203A Look', words: 'color accent' },
    { name: 'API Keys', hash: 'keys', icon: '\uD83D\uDD11', where: 'Settings', words: 'settings api key keys services tavily token secret custom' },
    // H29.2b: Device name and Profile moved from About to the new Devices section (old rows kept as comments)
    // { name: 'Device name', hash: 'about/device', icon: '\u2139\uFE0F', where: 'Settings \u203A About', words: 'device name rename sharedlink link gamepad phone' },
    // { name: 'Profile (save / load settings)', hash: 'about/profile', icon: '\u2139\uFE0F', where: 'Settings \u203A About', words: 'profile backup export import restore keys' },
    { name: 'Devices', hash: 'devices', icon: '\uD83D\uDCF2', where: 'Settings', words: 'settings devices device name profile sync send connected link phone pc' },
    { name: 'Device name', hash: 'devices/device', icon: '\uD83D\uDCF2', where: 'Settings \u203A Devices', words: 'device name rename sharedlink link gamepad phone' },
    { name: 'Connected devices', hash: 'devices/connected', icon: '\uD83D\uDCF2', where: 'Settings \u203A Devices', words: 'connected devices linked connect code phone pc online offline' },
    { name: 'Profile (save / load settings)', hash: 'devices/profile', icon: '\uD83D\uDCF2', where: 'Settings \u203A Devices', words: 'profile backup export import restore keys' },
    { name: 'Send profile (sync to a device)', hash: 'devices/sync', icon: '\uD83D\uDCF2', where: 'Settings \u203A Devices', words: 'sync send profile phone pc share settings api keys' },
    { name: 'Undo last sync', hash: 'devices/undo', icon: '\uD83D\uDCF2', where: 'Settings \u203A Devices', words: 'undo sync revert restore backup profile previous settings keys' },   // H29.3
    // H56: How-to moved below Devices (was above it, right after API Keys)
    { name: 'How-to', hash: 'howto', icon: '\uD83D\uDCA1', where: 'Settings', words: 'settings help tips guide shortcuts keyboard' },
    { name: 'About', hash: 'about', icon: '\u2139\uFE0F', where: 'Settings', words: 'settings version build release update contact feedback github' },
    { name: 'Auto update every', hash: 'about/autoupdate', icon: '\u2139\uFE0F', where: 'Settings \u203A About', words: 'auto update automatic daily days 6 am interval refresh last updated' },   // H52
    { name: 'Contact & Feedback', hash: 'about', icon: '\u2139\uFE0F', where: 'Settings \u203A About', words: 'bug issue github idea' }
  ],
  actions: [
    { id: 'showdesk', name: 'Show desktop', icon: '\u2B1C', words: 'minimise minimize all windows home desktop' },
    { id: 'ws1', name: 'Switch to workspace 1', icon: '1\uFE0F\u20E3', words: 'workspace desktop virtual switch one' },
    { id: 'ws2', name: 'Switch to workspace 2', icon: '2\uFE0F\u20E3', words: 'workspace desktop virtual switch two' }
  ]
};
