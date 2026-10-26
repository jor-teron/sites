/*
 * apps/office/shared/office-icons.js  (SH4)
 * One shared SVG icon set for the Office ribbons and File menus (Draftly + Spreadsheet).
 * Markup: <button class="tool-btn" data-icon="bold">. On load every [data-icon] element gets
 * <svg viewBox="0 0 24 24">…</svg> prepended. Styling comes from office-tools.css.
 * API: OfficeIcons.svg(name) -> svg string; OfficeIcons.fill(root) fills [data-icon] under root.
 */
var OfficeIcons = (function () {
  var P = {
  "bold": "<path d=\"M7 4.5h6a3.5 3.5 0 0 1 0 7H7z\"/><path d=\"M7 11.5h7a3.75 3.75 0 0 1 0 7.5H7z\"/>",
  "italic": "<path d=\"M10 4.5h8M6 19.5h8M14.5 4.5l-5 15\"/>",
  "underline": "<path d=\"M7 4v7a5 5 0 0 0 10 0V4\"/><path d=\"M5 20.5h14\"/>",
  "alignLeft": "<path d=\"M4 6h16M4 10h10M4 14h16M4 18h10\"/>",
  "alignCenter": "<path d=\"M4 6h16M7 10h10M4 14h16M7 18h10\"/>",
  "alignRight": "<path d=\"M4 6h16M10 10h10M4 14h16M10 18h10\"/>",
  "fileNew": "<path d=\"M6 3h8l4 4v14H6z\"/><path d=\"M14 3v4h4M12 10v7M8.5 13.5h7\"/>",
  "fileOpen": "<path d=\"M3.5 7V19h17V9h-9l-2-2z\"/><path d=\"M12 17v-5.5M9.5 14 12 11.5l2.5 2.5\"/>",
  "fileExport": "<path d=\"M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14\"/>",
  "filePrint": "<path d=\"M7 9V4h10v5\"/><rect x=\"4\" y=\"9\" width=\"16\" height=\"7\" rx=\"1.5\"/><path d=\"M7 14h10v6H7z\"/>",
  "fileSettings": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z\"/>",
  "vTop": "<path d=\"M5 4h14\"/><path d=\"M12 20V8M8.5 11.5 12 8l3.5 3.5\"/>",
  "vMiddle": "<path d=\"M5 12h14\"/><path d=\"M12 3v5M9.5 5.5 12 8l2.5-2.5M12 21v-5M9.5 18.5 12 16l2.5 2.5\"/>",
  "vBottom": "<path d=\"M5 20h14\"/><path d=\"M12 4v12M8.5 12.5 12 16l3.5-3.5\"/>",
  "fileHelp": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 17h.01\"/>"
};
  function svg(name) {
    return P[name] ? '<svg viewBox="0 0 24 24" aria-hidden="true">' + P[name] + '</svg>' : "";
  }
  function fill(root) {
    var els = (root || document).querySelectorAll("[data-icon]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.querySelector("svg")) continue;
      el.insertAdjacentHTML("afterbegin", svg(el.getAttribute("data-icon")));
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { fill(); });
  else fill();
  return { svg: svg, fill: fill };
})();
