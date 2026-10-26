/*
 * Device tab (apps/system/sysmon/sm_device.js), H21 — what the browser tells about this device:
 * screen (CSS px and physical px), devicePixelRatio, orientation, touch points, pointer (coarse / fine),
 * OS and browser (navigator.userAgentData, else a parse of the user agent), languages, time zone,
 * CPU cores, deviceMemory, Hub mode (window.parent.HubMode when same origin), display mode (PWA),
 * colour scheme, reduced motion. Live on resize / orientation change. Missing → 'Not available'.
 */
(function () {
  'use strict';
  const { el, card, kv } = SM;
  const NA = 'Not available';
  const mq = (q) => { try { return window.matchMedia(q).matches; } catch (_) { return false; } };
  let box = null, hiOs = '', hiBr = '';

  function parseUA(ua) {
    let os = NA, br = NA, m;
    if ((m = /Windows NT ([\d.]+)/.exec(ua))) os = 'Windows' + ({ '10.0': ' 10/11', '6.3': ' 8.1', '6.1': ' 7' }[m[1]] || '');
    else if ((m = /Android ([\d.]+)/.exec(ua))) os = 'Android ' + m[1];
    else if ((m = /(iPhone|iPad|iPod).*? OS ([\d_]+)/.exec(ua))) os = 'iOS ' + m[2].replace(/_/g, '.');
    else if ((m = /Mac OS X ([\d_.]+)/.exec(ua))) os = 'macOS ' + m[1].replace(/_/g, '.');
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    if ((m = /Edg(?:A|iOS)?\/([\d]+)/.exec(ua))) br = 'Edge ' + m[1];
    else if ((m = /OPR\/([\d]+)/.exec(ua))) br = 'Opera ' + m[1];
    else if ((m = /SamsungBrowser\/([\d]+)/.exec(ua))) br = 'Samsung Internet ' + m[1];
    else if ((m = /(?:Firefox|FxiOS)\/([\d]+)/.exec(ua))) br = 'Firefox ' + m[1];
    else if ((m = /(?:Chrome|CriOS)\/([\d]+)/.exec(ua))) br = 'Chrome ' + m[1];
    else if ((m = /Version\/([\d.]+).*Safari/.exec(ua))) br = 'Safari ' + m[1];
    return { os, br };
  }
  const ua = parseUA(navigator.userAgent || '');
  const uad = navigator.userAgentData;
  if (uad && uad.getHighEntropyValues) {
    uad.getHighEntropyValues(['platformVersion', 'fullVersionList']).then((h) => {
      if (uad.platform) hiOs = uad.platform + (h.platformVersion ? ' ' + h.platformVersion : '');
      const b = (h.fullVersionList || uad.brands || []).filter((x) => !/Not.?A.?Brand|Chromium/i.test(x.brand))[0];
      if (b) hiBr = b.brand + ' ' + String(b.version).split('.')[0];
      draw();
    }).catch(() => { /* ignore */ });
  }
  function os() {
    if (hiOs) return hiOs;
    if (uad && uad.platform) return uad.platform + (ua.os !== NA && ua.os.indexOf(uad.platform) !== 0 ? ' (' + ua.os + ')' : '');
    return ua.os;
  }
  function browser() {
    if (hiBr) return hiBr;
    const b = uad && (uad.brands || []).filter((x) => !/Not.?A.?Brand|Chromium/i.test(x.brand))[0];
    return b ? b.brand + ' ' + b.version : ua.br;
  }
  function hubMode() {
    try {
      const p = window.parent;
      if (p === window) return 'Not in the Hub';
      const M = p.HubMode;
      if (!M) return 'unknown';
      return M.isDesktop() ? 'Desktop' : 'Phone';
    } catch (_) { return 'unknown'; }
  }
  function displayMode() {
    for (const m of ['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay']) if (mq('(display-mode: ' + m + ')')) return m === 'standalone' ? 'Installed app (standalone)' : m;
    if (navigator.standalone) return 'Installed app (standalone)';
    return 'Browser tab';
  }
  function tz() {
    let z = NA;
    try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || NA; } catch (_) { /* ignore */ }
    const off = -new Date().getTimezoneOffset(), s = off >= 0 ? '+' : '-', a = Math.abs(off);
    return z + ' (UTC' + s + Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0') + ')';
  }
  function orient() {
    const o = screen.orientation;
    if (o && o.type) return o.type.replace('-primary', '').replace('-secondary', ' (upside down)') + (o.angle ? ', ' + o.angle + '\u00b0' : '');
    return mq('(orientation: portrait)') ? 'portrait' : 'landscape';
  }
  function pointer() {
    const p = mq('(pointer: coarse)') ? 'Coarse (touch)' : mq('(pointer: fine)') ? 'Fine (mouse / pen)' : mq('(pointer: none)') ? 'None' : NA;
    const any = mq('(any-pointer: coarse)') && mq('(any-pointer: fine)') ? ' \u00b7 both available' : '';
    return p + any;
  }
  function draw() {
    if (!box) return;
    const d = window.devicePixelRatio || 1, S = window.screen || {};
    const phys = (w, h) => Math.round(w * d) + ' \u00d7 ' + Math.round(h * d);
    const langs = navigator.languages && navigator.languages.length ? navigator.languages.join(', ') : (navigator.language || NA);
    box.replaceChildren(
      card('Screen', kv([
        ['Screen (CSS px)', S.width ? S.width + ' \u00d7 ' + S.height : NA],
        ['Screen (physical px)', S.width ? phys(S.width, S.height) : NA],
        ['This window (CSS px)', window.innerWidth + ' \u00d7 ' + window.innerHeight],
        ['Pixel ratio', String(+d.toFixed(3))],
        ['Orientation', orient()],
        ['Colour depth', S.colorDepth ? S.colorDepth + '-bit' : NA]
      ])),
      card('Input', kv([
        ['Touch points', navigator.maxTouchPoints != null ? String(navigator.maxTouchPoints) : NA],
        ['Pointer', pointer()],
        ['Hover', mq('(hover: hover)') ? 'Yes' : 'No']
      ])),
      card('System', kv([
        ['OS', os() || NA],
        ['Browser', browser() || NA],
        ['CPU cores', navigator.hardwareConcurrency ? String(navigator.hardwareConcurrency) : NA],
        ['Memory (rough)', navigator.deviceMemory ? navigator.deviceMemory + ' GB or more' : NA],
        ['Languages', langs],
        ['Time zone', tz()]
      ])),
      card('Hub and display', kv([
        ['Hub mode', hubMode()],
        ['Display', displayMode()],
        ['Colour scheme (device)', mq('(prefers-color-scheme: dark)') ? 'Dark' : mq('(prefers-color-scheme: light)') ? 'Light' : NA],
        ['Hub theme in this app', document.documentElement.classList.contains('light') ? 'Light' : 'Dark'],
        ['Reduced motion', mq('(prefers-reduced-motion: reduce)') ? 'On' : 'Off']
      ]), el('p', 'muted small', 'What the browser reports. Memory is capped and rounded for privacy.'))
    );
  }
  const redraw = () => { if (SM.current && SM.current.id === 'device') draw(); };
  window.addEventListener('resize', redraw);
  window.addEventListener('orientationchange', redraw);
  try { if (screen.orientation) screen.orientation.addEventListener('change', redraw); } catch (_) { /* ignore */ }
  try { window.parent.addEventListener('hub-wm-mode', redraw); } catch (_) { /* cross-origin */ }
  SM.tab({
    id: 'device', title: 'Device', icon: '\uD83D\uDCF1',
    render(pane) { box = el('div', 'dev-cards'); pane.append(box); draw(); },
    draw
  });
})();
