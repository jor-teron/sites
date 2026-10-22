/*
 * apps/office/shared/office-page.js
 * Page setup shared by the Office apps: paper sizes, margin presets, custom-margin clamping,
 * the @page rule and a style-tag injector, plus a Custom margins dialog (OfficeDialog.form).
 * No storage here: each app keeps its own keys and settings object.
 *   OfficePage.papers / OfficePage.marginPresets       data (cm, portrait)
 *   OfficePage.clampMargins(m, {min, max, fallback})   → {top,bottom,left,right} rounded to 0.1 cm
 *   OfficePage.margins(preset, custom)                 → {top,bottom,left,right}
 *   OfficePage.pageRule({paper, orientation, margins}) → "@page { size: …; margin: … }"
 *   OfficePage.inject(id, cssText)                     replaces <style id=…> in <head>
 *   OfficePage.customMarginsDialog(current, opts)      → Promise<margins|null>
 */
var OfficePage = window.OfficePage || {};
window.OfficePage = OfficePage;

OfficePage.papers = {
  A4: { label: 'A4', widthCm: 21, heightCm: 29.7 },
  Letter: { label: 'Letter', widthCm: 21.59, heightCm: 27.94 },
  Legal: { label: 'Legal', widthCm: 21.59, heightCm: 35.56 }
};

/* Office-style presets (cm per side) */
OfficePage.marginPresets = {
  normal: { label: 'Normal', top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 },
  narrow: { label: 'Narrow', top: 1.27, bottom: 1.27, left: 1.27, right: 1.27 },
  wide: { label: 'Wide', top: 2.54, bottom: 2.54, left: 5.08, right: 5.08 }
};
OfficePage.MARGIN_MIN = 0.5;
OfficePage.MARGIN_MAX = 5;

OfficePage.clampMargins = function (m, o) {
  o = o || {};
  var min = o.min != null ? o.min : OfficePage.MARGIN_MIN;
  var max = o.max != null ? o.max : OfficePage.MARGIN_MAX;
  var fb = o.fallback != null ? o.fallback : OfficePage.marginPresets.normal.top;
  m = m || {};
  function one(v) {
    v = parseFloat(v);
    if (!isFinite(v)) v = fb;
    return Math.round(Math.min(max, Math.max(min, v)) * 10) / 10;
  }
  return { top: one(m.top), bottom: one(m.bottom), left: one(m.left), right: one(m.right) };
};

OfficePage.margins = function (preset, custom) {
  if (preset === 'custom') return OfficePage.clampMargins(custom);
  var p = OfficePage.marginPresets[preset] || OfficePage.marginPresets.normal;
  return { top: p.top, bottom: p.bottom, left: p.left, right: p.right };
};

OfficePage.pageRule = function (o) {
  var paper = OfficePage.papers[o.paper] ? o.paper : 'A4';
  var orient = o.orientation === 'landscape' ? 'landscape' : 'portrait';
  var m = o.margins || OfficePage.margins('normal');
  var margin = typeof m === 'string' ? m : m.top + 'cm ' + m.right + 'cm ' + m.bottom + 'cm ' + m.left + 'cm';
  return '@page { size: ' + OfficePage.papers[paper].label + ' ' + orient + '; margin: ' + margin + '; }';
};

OfficePage.inject = function (id, css) {
  var st = document.getElementById(id);
  if (!st) {
    st = document.createElement('style');
    st.id = id;
    document.head.appendChild(st);
  }
  st.textContent = css;
  return st;
};

/* Custom margins dialog (cm). Needs office-dialog.js. */
OfficePage.customMarginsDialog = function (current, o) {
  o = o || {};
  var min = o.min != null ? o.min : OfficePage.MARGIN_MIN, max = o.max != null ? o.max : OfficePage.MARGIN_MAX;
  var c = OfficePage.clampMargins(current, o);
  var f = function (k, l) { return { key: k, label: l, type: 'number', min: min, max: max, step: 0.1, value: c[k] }; };
  return OfficeDialog.form({
    title: o.title || 'Custom margins (cm)',
    fields: [f('top', 'Top'), f('bottom', 'Bottom'), f('left', 'Left'), f('right', 'Right')],
    okLabel: 'Apply',
    validate: function (v) {
      for (var k in v) { if (!isFinite(parseFloat(v[k]))) return 'Enter a number from ' + min + ' to ' + max + '.'; }
      return '';
    }
  }).then(function (v) { return v ? OfficePage.clampMargins(v, o) : null; });
};
