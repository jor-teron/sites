/*
 * Settings → How-to (apps/settings/sec_howto.js). Plain-language help, shown just above
 * About: what the Hub is, the desktop (Start menu, windows, taskbar, Show Desktop, copies,
 * saved session, taskbar position, screen modes, phone mode), Drives & Files, the Settings sections, updates,
 * and the technical / privacy notes that used to be on the About page.
 * One collapsible card (<details>) per topic, first one open. Written from the real code
 * (hub/wm_*.js, hub/hub.js, hub/hub_flyout.js, hub/hub_update.js) — keep it in step.
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
    { t: 'The taskbar', h: `
      <ul>
        <li>Each open window has a button. Click it to bring the window forward; click the front
          window's button again to minimise it.</li>
        <li><b>Show Desktop</b> (the screen icon right after Home) minimises everything. Click it again
          to get the same windows back.</li>
        <li>On the right: Pooh Chat, the devices button, the Hub version and the clock.</li>
      </ul>` },
    { t: 'Right-click menu', h: `
      <p>Right-click (or press and hold on a phone) for the Hub's own menu:</p>
      <ul>
        <li><b>Desktop</b>: Show desktop, Open Files, Wallpaper, Refresh, Close all windows, About.</li>
        <li><b>Taskbar</b>: Show desktop, taskbar at the top or bottom, Settings. On an app button: New window,
          Minimise, Close. On Start: Settings, Files, About.</li>
        <li><b>Title bar</b>: New window, Minimise, Maximise / Restore, Close.</li>
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
      <p>On a computer the Hub remembers which windows were open, where they were, their size, and
        which were maximised or minimised. Reload the page or come back later and they open again.
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
        <li><b>Local</b> is storage inside this browser, just for this site. It is always there; clearing the
          browser's site data erases it.</li>
        <li><b>Add folder</b> (Chrome or Edge on a computer) lets the Hub use a real folder you pick. After a
          reload, click <b>Allow access</b> once. <b>\u00D7</b> only removes it from the list \u2014 no files are deleted.</li>
        <li>Click a drive to open it in <b>Files</b> (also in Tools). A Files window comes back on the same
          drive and folder after a reload.</li>
      </ul>` },
    { t: 'Using Files', h: `
      <ul>
        <li><b>Select</b>: click; <b>Ctrl</b>/<b>\u2318</b>-click adds more; <b>Shift</b>-click picks a range;
          <b>Ctrl+A</b> all. On a phone tap the round check, or press and hold.</li>
        <li><b>Open</b>: double-click (a single tap on a phone) or Enter. Pictures open in a viewer with
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
    { t: 'Settings sections', h: `
      <ul>
        <li><b>Wallpaper</b>: gradients, plain colours or your own colour.</li>
        <li><b>Desktop</b>: Auto / Desktop / Phone, and whether the menu opens on hover.</li>
        <li><b>Sizes</b>: taskbar position and size, window title bar size.</li>
        <li><b>Look</b>: accent colour, dark or light, and how bouncy the animations are.</li>
      </ul>
      <p>Changes show on the Hub straight away.</p>` },
    { t: 'Updates', h: `
      <p>The Hub updates itself. It looks for a new version when it starts, every 30 minutes and when
        you come back to the tab, then reloads once (your windows come back).</p>
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
