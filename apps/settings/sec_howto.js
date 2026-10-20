/*
 * Settings → How-to (apps/settings/sec_howto.js). Plain-language help, shown just above
 * About: what the Hub is, the desktop (Start menu, windows, taskbar, Show Desktop, copies,
 * saved session, taskbar position, screen modes, phone mode), Drives & Files, the Settings sections, wallpaper, updates,
 * and the technical / privacy notes that used to be on the About page.
 * One collapsible card (<details>) per topic, first one open. Written from the real code
 * (hub/wm/wm_*.js, hub/core/hub.js, hub/menu/hub_flyout.js, hub/update/hub_update.js) — keep it in step.
 */
(function () {
  'use strict';
  const ui = window.Settings.ui;
  const TOPICS = [
    { t: 'What is the Hub?', open: true, h: `
      <p>Sites Hub is a little desktop that lives in your browser. It is a launcher for Jor's own
        web apps \u2014 games, lab experiments, tools, media and more \u2014 hosted on GitHub Pages.</p>
      <p>Nothing to install and no account: open the page and pick an app. It works on a computer
        (windows and a taskbar) and on a phone (one app at a time, full screen).</p>` },
    { t: 'The Start menu', h: `
      <ul>
        <li>Click <b>Home</b> on the taskbar to open the menu. With a mouse it also opens when you just
          point at it (switch this off in <b>Desktop</b>).</li>
        <li>Point at a category (Games, Tools, Lab \u2026) and its apps slide out beside the menu, grouped
          under small headings.</li>
        <li>Click a category name to open its page of app tiles instead.</li>
        <li><b>Settings</b> is the last row of the menu.</li>
      </ul>` },
    { t: 'Windows', h: `
      <ul>
        <li>On a computer every app opens in its own window. Apps you open from a category page get
          their own window too; the category page stays where it was.</li>
        <li><b>Move</b>: drag the title bar. <b>Resize</b>: drag any edge or corner.</li>
        <li><b>\u2013</b> minimise, <b>\u25A2</b> maximise / restore (or double-click the title bar),
          <b>\u00D7</b> close.</li>
        <li>Click anywhere in a window to bring it to the front.</li>
      </ul>` },
    { t: 'Snapping windows', h: `
      <ul>
        <li>Drag a window by its title bar to the <b>left</b> or <b>right</b> edge of the screen: it fills that
          half. Drag it to the <b>top</b> edge: it fills the screen. A see-through box shows where it will land.</li>
        <li>Drag a snapped or full-screen window away and it gets its old size back.</li>
        <li>Keys: <b>Ctrl+Alt+←</b> / <b>→</b> left / right half, <b>Ctrl+Alt+↑</b> full screen,
          <b>Ctrl+Alt+↓</b> back to normal. The ⊞ Windows / ⌘ key + arrows does the same where your
          computer lets the browser have it.</li>
        <li>Snapped windows are remembered after a reload. The edges follow the taskbar, top or bottom.</li>
      </ul>` },
    { t: 'Workspaces', h: `
      <ul>
        <li>There are two desktops, <b>1</b> and <b>2</b>, each with its own windows. Switch with the small
          <b>1</b> <b>2</b> buttons next to Show Desktop.</li>
        <li>Keys: <b>Ctrl+Alt+PageUp</b> / <b>PageDown</b> (or ⊞/⌘+Ctrl+← / → where the computer allows it).</li>
        <li>Right-click a title bar or a taskbar button and pick <b>Move to workspace 1 / 2</b>.</li>
        <li>The taskbar and Show Desktop only cover the workspace you are on. Windows on the other one keep
          running. System Monitor shows each window's workspace.</li>
        <li>Want just one? <b>Settings → Windows → Workspaces: 1</b> hides the buttons.</li>
      </ul>` },
    { t: 'The taskbar', h: `
      <ul>
        <li>Each open window has a button. Click it to bring the window forward; click the front
          window's button again to minimise it.</li>
        <li><b>Show Desktop</b> (the screen icon right after Home) minimises everything. Click it again
          to get the same windows back.</li>
        <li>Left to right: Show desktop, desktops 1 and 2, the keyboard (⌨) button, then your windows; on the right: Pooh Chat, the devices button and the clock.</li>
      </ul>` },
    { t: 'Right-click menu', h: `
      <p>Right-click (or press and hold on a phone) for the Hub's own menu:</p>
      <ul>
        <li><b>Desktop</b>: Show desktop, Open Files, Wallpaper, Refresh, Close all windows, About.</li>
        <li><b>Taskbar</b>: Show desktop, taskbar at the top or bottom, Settings. On an app button: New window,
          Move to workspace, Minimise, Close. On Start: Settings, Files, About.</li>
        <li><b>Title bar</b>: New window, Move to workspace, Minimise, Maximise / Restore, Close.</li>
        <li><b>Menu rows, tiles and drives</b>: Open, Open in new window, Open in new tab (tiles also Copy link;
          drives Allow access / Remove).</li>
        <li><b>Inside an app</b>: Back, Reload app, Copy, Select all; in a text box Cut, Copy, Paste, Select all.
          Files has its own menu.</li>
        <li>Hold <b>Shift</b> while right-clicking to get the browser's own menu.</li>
      </ul>` },
    { t: 'More than one copy of an app', h: `
      <p>Clicking an app that is already open just brings its window forward. To open another copy:</p>
      <ul>
        <li><b>Shift+click</b> or <b>middle-click</b> it in the menu, the slide-out list or a category page, or</li>
        <li><b>right-click</b> its taskbar button and choose <b>New window</b> (middle-click works there too).</li>
      </ul>
      <p>Copies are numbered, like \u201c2048 2\u201d.</p>` },
    { t: 'Your windows are remembered', h: `
      <p>On a computer the Hub remembers which windows were open, where they were, their size,
        which were maximised, snapped or minimised, and on which workspace. Reload the page or come back later and they open again.
        Each copy of an app is remembered on its own.</p>` },
    { t: 'Desktop, Phone or Auto', h: `
      <ul>
        <li><b>Auto</b> (normal): a computer-style desktop on a big screen (1024 px wide or more) with a mouse,
          phone style everywhere else.</li>
        <li><b>Desktop</b> or <b>Phone</b> picks one for good. Change it in <b>Settings \u2192 Desktop</b>.</li>
        <li><b>Taskbar position</b>: bottom or top, in <b>Settings \u2192 Sizes</b>. At the top, menus open downward.</li>
      </ul>` },
    { t: 'On a phone', h: `
      <ul>
        <li>One app at a time, full screen. Open the menu with <b>Home</b> at the top left.</li>
        <li>Use the phone's <b>Back</b> to go back to the previous app or to the home screen.</li>
        <li>Each app has its own link (for example <code>hub.html#2048</code>) and the last app you used opens
          again next time.</li>
        <li>A phone can also be a game controller (D-pad) for a tablet through the <b>Controller</b>.</li>
      </ul>` },
    { t: 'Drives & Files', h: `
      <p>On a computer the desktop shows <b>Drives</b> on the left and the QR / link tiles on the right.</p>
      <ul>
        <li><b>Google Drive</b>: sign in with your phone as a key or on this computer (see the Google Drive card).</li>
        <li><b>Local</b> is storage inside this browser, just for this site. It is always there; clearing the
          browser's site data erases it.</li>
        <li><b>Add folder</b> (Chrome or Edge on a computer) lets the Hub use a real folder you pick. After a
          reload, click <b>Allow access</b> once. <b>\u00D7</b> only removes it from the list \u2014 no files are deleted.</li>
        <li>Click a drive to open it in <b>Files</b> (also in Tools). A Files window comes back on the same
          drive and folder after a reload.</li>
      </ul>` },
    { t: 'Google Drive', h: `
      <p><b>Google Drive</b> shows up as a drive (Drives pane and Files) and opens at a folder named
        <b>hub</b> in your Drive (\u201cGoogle Drive \u203A hub\u201d; made if it isn't there). Two ways to sign in:</p>
      <ul>
        <li><b>Phone as a key (full Drive)</b> \u2014 scan the QR with your phone, tap <b>Sign in with Google</b>
          there; the phone hands the sign-in to the Hub over the Hub's phone link (the same one as the Gamepad;
          keep the Hub open). Lasts about <b>an hour</b>, then the tile says <b>Renew from phone</b>
          (or tap <b>Send again</b> if the phone page is still open).</li>
        <li><b>Sign in on this computer</b> \u2014 Google's sign-in window here; same access, same hour.</li>
      </ul>
      <p>Right-click the Google Drive tile \u2192 <b>Sign out</b>. Delete moves items to Drive's Trash.
        (The old QR-code sign-in is switched off: it needs a client secret, and GitHub blocks pushing it.)</p>
      <p><b>Setup (Jor, done once)</b>: Google Cloud project <b>monorepo</b> \u2192 OAuth client of type
        <b>Web application</b> with Authorized JavaScript origin <code>https://jor-teron.github.io</code>;
        <b>Google Drive API</b> enabled; consent screen in <b>Testing</b> with your account as test user.
        Its client ID is <code>hubWebClientId</code> in <code>shared/google/google_config.js</code> (no secret).
        Mail uses its own client. Try it in <b>Lab \u2192 Google Drive Test</b>.</p>
      <p>The sign-in is kept in this browser; sign out on a shared computer.</p>` },
    { t: 'Using Files', h: `
      <ul>
        <li><b>Select</b>: click; <b>Ctrl</b>/<b>\u2318</b>-click adds more; <b>Shift</b>-click picks a range;
          <b>Ctrl+A</b> all. On a phone tap the round check, or press and hold.</li>
        <li><b>Open</b>: double-click (a single tap on a phone) or Enter \u2014 or a single click if you pick that
          in <b>Settings \u2192 Windows</b> or the \u22EF menu. Pictures open in a viewer with
          \u2039 \u203A for the next one; text opens in a text view. <b>Open with\u2026</b> can send text to <b>Notely</b>.</li>
        <li><b>Right-click</b> (or press and hold) for the menu: Open, Open with\u2026, Cut, Copy, Paste, Rename,
          Download, Delete, New folder, Properties. The \u22EF button opens it too.</li>
        <li><b>Cut / Copy / Paste</b> (Ctrl+X / C / V) works between folders and between drives.</li>
        <li><b>Drag</b> items onto a folder, a part of the path or a drive to move them (hold <b>Ctrl</b> to copy).
          Drop files from your computer to upload them.</li>
        <li>If a name is already taken you choose <b>Replace</b>, <b>Keep both</b> or <b>Skip</b>.</li>
        <li><b>Grid / List</b>, <b>sort</b> (name, size, date) and <b>search</b> are above the files; the view and
          sort are remembered.</li>
        <li>Keys: <b>Delete</b>, <b>F2</b> rename, <b>Enter</b> open, <b>Backspace</b> or <b>Alt+\u2191</b> up, arrows to move.</li>
      </ul>` },
    { t: 'System Monitor', h: `
      <p><b>System Monitor</b> (Tools) shows what the browser lets a web page see. It is <b>not</b> your
        device's real task manager: other programs, real CPU use and total RAM stay hidden from web pages.</p>
      <ul>
        <li><b>Tasks</b>: the Hub's open windows, with Focus, Minimise and End task (Desktop mode).</li>
        <li><b>Storage</b>: how much this site uses of what the browser allows, and the size of each drive
          (added folders only on <b>Calculate</b>).</li>
        <li><b>Memory</b> (Chrome / Edge): the Hub's script memory, live. <b>CPU</b>: core count and an
          estimate of how busy the Hub is.</li>
        <li><b>Network</b> and <b>Battery</b>: online / offline, connection estimates and battery level, where
          the browser shares them.</li>
        <li>Graphs show the last minute and pause while the window is minimised or hidden.</li>
        <li>Settings \u2192 Desktop \u2192 <b>Busy meter in the taskbar</b> adds a small live graph by the clock.</li>
      </ul>` },
    { t: 'Settings sections', h: `
      <ul>
        <li><b>Wallpaper</b>: gradients, plain colours, your own colour, pictures, or <b>Your picture</b>.</li>
        <li><b>Desktop</b>: Auto / Desktop / Phone, whether the menu opens on hover, the taskbar busy meter.</li>
        <li><b>Windows</b>: <b>Focus window on hover</b> (point at a window for a moment to bring it forward;
          off at first), Workspaces 1 or 2, title bar size, and single or double click to open items in Files.</li>
        <li><b>Sizes</b>: taskbar position and size.</li>
        <li><b>Look</b>: accent colour, dark or light, and how bouncy the animations are.</li>
      </ul>
      <p>Changes show on the Hub straight away.</p>` },
    { t: 'Wallpaper', h: `
      <ul>
        <li><b>Settings → Wallpaper</b>: colours and gradients, a custom colour, or one of the <b>pictures</b>.
          It changes on the Hub at once and stays after a reload.</li>
        <li><b>Your picture</b>: pick an image from your device. It is kept in this browser
          (<b>Files → Local → Wallpapers</b>); a new pick replaces it. Click its tile again to pick another.</li>
      </ul>` },
    { t: 'Updates', h: `
      <p>The Hub updates itself. While it is open it looks for a new version once a day at
        <b>11 PM</b> (your local time). If it was closed then and the last check is more than a day old,
        it checks when you open it. When there is a new version it reloads once (your windows come back).</p>
      <p>To check right now: <b>About \u2192 Check for update</b>.</p>` },
    { t: 'Privacy & kids', h: `
      <p>No ads, no trackers, no accounts. Nothing is uploaded or shared unless you export or share it
        yourself. Scores, settings and progress stay on your device (in the browser's storage).</p>
      <p>The kids' apps are made for ages 5\u201315.</p>` },
    { t: 'How it\u2019s built', h: `
      <ul>
        <li>Plain HTML, CSS and JavaScript \u2014 no framework, no build step.</li>
        <li>Static files on GitHub Pages; works offline once loaded.</li>
        <li>Optional: a WebSocket relay for using a phone as a remote.</li>
      </ul>
      <a class="tap" href="../../misc/T&amp;C.html">Terms &amp; Conditions</a>
      <a class="tap" href="../../misc/privatedns.html">Private DNS</a>` }
  ];
  Settings.add({
    id: 'howto', title: 'How-to', icon: '\uD83D\uDCA1',
    render(pane) {
      pane.appendChild(ui.note('Tap a topic to open it.'));
      TOPICS.forEach((x) => {
        const d = ui.el('details', 'card howto');
        if (x.open) d.open = true;
        const s = ui.el('summary', '', x.t);
        const body = ui.el('div', 'howto-body');
        body.innerHTML = x.h;
        d.append(s, body);
        pane.appendChild(d);
      });
    }
  });
})();
