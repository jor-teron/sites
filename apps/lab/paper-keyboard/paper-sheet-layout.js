/*
  Project: paper-keyboard
  File: paper-sheet-layout.js
  Role: Shared A4 landscape key grid in millimetres. Used by the printable
  sheet page now, and by the future camera key-map (same numbers).
  Exposes window.PAPER_LAYOUT. Pitch 18 mm, keyboard 15 units wide, top at
  y = 52 mm, centred on the 297 mm page. Corner shapes are 18 mm, inset 10 mm.
*/

(function () {
  var PITCH = 18;
  var UNITS = 15;
  var PAGE_W = 297;
  var PAGE_H = 210;
  var ORIGIN_X = (PAGE_W - UNITS * PITCH) / 2; /* 13.5 mm */
  var ORIGIN_Y = 52;

  /* Each row: { l: label, u: width in units }. Labels match the printed glyphs. */
  var rows = [
    [
      { l: "`", u: 1 }, { l: "1", u: 1 }, { l: "2", u: 1 }, { l: "3", u: 1 },
      { l: "4", u: 1 }, { l: "5", u: 1 }, { l: "6", u: 1 }, { l: "7", u: 1 },
      { l: "8", u: 1 }, { l: "9", u: 1 }, { l: "0", u: 1 }, { l: "-", u: 1 },
      { l: "=", u: 1 }, { l: "Backspace", u: 2 }
    ],
    [
      { l: "Tab", u: 1.5 },
      { l: "Q", u: 1 }, { l: "W", u: 1 }, { l: "E", u: 1 }, { l: "R", u: 1 },
      { l: "T", u: 1 }, { l: "Y", u: 1 }, { l: "U", u: 1 }, { l: "I", u: 1 },
      { l: "O", u: 1 }, { l: "P", u: 1 }, { l: "[", u: 1 }, { l: "]", u: 1 },
      { l: "\\", u: 1.5 }
    ],
    [
      { l: "Caps", u: 1.75 },
      { l: "A", u: 1 }, { l: "S", u: 1 }, { l: "D", u: 1 }, { l: "F", u: 1 },
      { l: "G", u: 1 }, { l: "H", u: 1 }, { l: "J", u: 1 }, { l: "K", u: 1 },
      { l: "L", u: 1 }, { l: ";", u: 1 }, { l: "'", u: 1 },
      { l: "Enter", u: 2.25 }
    ],
    [
      { l: "Shift", u: 2.25 },
      { l: "Z", u: 1 }, { l: "X", u: 1 }, { l: "C", u: 1 }, { l: "V", u: 1 },
      { l: "B", u: 1 }, { l: "N", u: 1 }, { l: "M", u: 1 }, { l: ",", u: 1 },
      { l: ".", u: 1 }, { l: "/", u: 1 },
      { l: "Shift", u: 2.75 }
    ],
    [
      { l: "Esc", u: 1.25 }, { l: "Ctrl", u: 1.25 }, { l: "Alt", u: 1.25 },
      { l: "Space", u: 5.25 },
      { l: "←", u: 1 }, { l: "↑", u: 1 }, { l: "↓", u: 1 }, { l: "→", u: 1 },
      { l: "Del", u: 2 }
    ]
  ];

  window.PAPER_LAYOUT = {
    page: { w: PAGE_W, h: PAGE_H },
    pitch: PITCH,
    units: UNITS,
    origin: { x: ORIGIN_X, y: ORIGIN_Y },
    corners: {
      size: 18,
      inset: 10,
      /* TL circle, TR square, BL triangle, BR plus (bar 6 mm). */
      shapes: { tl: "circle", tr: "square", bl: "triangle", br: "plus" },
      plusBar: 6
    },
    rows: rows
  };
})();
