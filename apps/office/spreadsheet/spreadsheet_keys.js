/*
 * spreadsheet_keys.js
 * App shortcuts (Ctrl or Cmd), handled by the app itself:
 *   (Z undo · Y or Shift+Z redo · S save · P print: ../shared/office-quick.js, HO1) · A select all · C / X / V copy, cut, paste ·
 *   D fill down · R fill right.
 * While typing in a cell or the formula bar the browser's own text shortcuts apply.
 */
SHEET_INIT.push(function () {
  document.addEventListener("keydown", function (ev) {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    if (!clipTarget()) return;                         // typing: native text editing
    var k = String(ev.key).toLowerCase();
    /* HO1: Z / Y / Shift+Z (and S / P) go through ../shared/office-quick.js (spreadsheet_quick.js) */
    if (k === "a") { ev.preventDefault(); selectAll(); }
    else if (k === "d") { ev.preventDefault(); fillBlock(true); }
    else if (k === "r") { ev.preventDefault(); fillBlock(false); }
    else if (k === "c" || k === "x" || k === "v") clipKey(k);   // native copy/cut/paste events do the work
  });
});
