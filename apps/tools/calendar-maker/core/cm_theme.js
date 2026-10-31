/* Calendar Maker CM13 core: colours and presets in one place, plus the text-colour rule.
   window.CM.Theme. Loaded before every other CM file (plain script, works from file://). */
window.CM = window.CM || {};
window.CM.Theme = (function () {
  'use strict';
  const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
  const HEX = /^#[0-9a-f]{6}$/i; /* CM6 */
  const isHex = (v) => HEX.test(v || '');

  /* Holiday colours: key -> [tile, text]. Text always uses the font colour (CM6), [1] kept for callers. */
  /* const COLOURS = { green: ['#15803d', '#fff'], red: ['#b91c1c', '#fff'], yellow: ['#facc15', '#111'],
       blue: ['#1d4ed8', '#fff'], orange: ['#ea580c', '#fff'] };  (CM1-CM5: dark tiles, white text) */
  /* CM6: light print colours, black text readable on all; [1] kept for callers but text uses the font colour */
  /* const COLOURS = { green: ['#92d36e', '#000'], red: ['#f4a6a6', '#000'], yellow: ['#fde68a', '#000'],
       blue: ['#a5c8f5', '#000'], orange: ['#fdba74', '#000'] };  (CM6-CM12-F3: light tints only) */
  /* CM12-F4: original strong CM1-CM5 colours back (black text kept), CM6 light tints kept as 'Light ...' presets */
  const COLOURS = {
    green: ['#15803d', '#000'], red: ['#b91c1c', '#000'], yellow: ['#facc15', '#000'],
    blue: ['#1d4ed8', '#000'], orange: ['#ea580c', '#000'],
    lgreen: ['#92d36e', '#000'], lred: ['#f4a6a6', '#000'], lyellow: ['#fde68a', '#000'],
    lblue: ['#a5c8f5', '#000'], lorange: ['#fdba74', '#000']
  };
  const COLOUR_NAMES = { /* CM12-F4 */
    green: 'Green', red: 'Red', yellow: 'Yellow', blue: 'Blue', orange: 'Orange',
    lgreen: 'Light green', lred: 'Light red (pink)', lyellow: 'Light yellow',
    lblue: 'Light blue', lorange: 'Light orange'
  };
  /* CM9: restricted presets */
  const RCOLOURS = { grey: '#cfcfcf', silver: '#e3e3e3', stone: '#d6d3c4', lilac: '#d9c8ee', sky: '#c9e7f2' };
  /* CM18: Public / School tile presets (first = default) */
  const PCOLOURS = { purple: '#d9d2e9', blue: '#cfe2f3', pink: '#f4cccc' };
  const SCOLOURS = { yellow: '#fff2cc', orange: '#fce5cd', teal: '#d0e0e3' };
  /* CM12: Classic list header row presets */
  const HCOLOURS = { blue: '#2e75b6', navy: '#1f3864', green: '#00b050', grey: '#7f7f7f', orange: '#c55a11' };
  /* CM12-F3: month-name row fill presets [value, label]; white = no fill */
  const MFILLS = [['#ffffff', 'White (no fill)'], ['#d9d9d9', 'Light grey']];
  /* CM2: soft page background presets */
  const SOFTS = ['#fef9e7', '#ecfdf5', '#eff6ff', '#fdf2f8', '#f5f3ff', '#f3f4f6'];
  /* Grid borders (CM7 'All Borders'): one colour, one weight */
  const GRID = { colour: '#333', width: 3 };

  const cap1 = (k) => k[0].toUpperCase() + k.slice(1);
  const colourName = (k) => COLOUR_NAMES[k] || cap1(k);
  /* resolved colours (o.* values from settings): preset key or #rrggbb */
  const fontColour = (v) => (isHex(v) ? v : '#000000');
  const holidayColour = (v) => (isHex(v) ? v : (COLOURS[v] || COLOURS.green)[0]);
  const restrictedColour = (v) => (isHex(v) ? v : RCOLOURS.grey);
  const publicColour = (v) => (isHex(v) ? v : PCOLOURS.purple), schoolColour = (v) => (isHex(v) ? v : SCOLOURS.yellow); /* CM18 */
  const headerColour = (v) => (isHex(v) ? v : (HCOLOURS[v] || HCOLOURS.blue));
  /* text-colour rule: text uses the font colour, except white on a dark fill (Classic header row) */
  const isDark = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 150;
  };
  const textOn = (fill, fc) => (isDark(fill) ? '#ffffff' : fc);

  return {
    FONT, HEX, isHex, COLOURS, COLOUR_NAMES, RCOLOURS, PCOLOURS, SCOLOURS, HCOLOURS, MFILLS, SOFTS, GRID,
    cap1, colourName, fontColour, holidayColour, restrictedColour, publicColour, schoolColour, headerColour, isDark, textOn
  };
})();
