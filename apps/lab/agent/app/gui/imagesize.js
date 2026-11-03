/* Agent — app/gui/imagesize.js: AG17 image size chips for the Image page. HR.imgsize.
   Chips: Square 1:1, Portrait 3:4, Landscape 4:3, Phone 9:16, Wide 16:9, Custom (width / height inputs).
   Setting `imageSize` = '1:1' | '3:4' | '4:3' | '9:16' | '16:9' | 'custom:WxH' (default '1:1').
   fit(p) -> {width, height, ratio, note} for provider p: pixel providers (p.size 'px') get the long side 1024 (Custom: as
   typed) rounded to p.mult and clamped to 256..p.max; ratio providers (p.size 'ratio') get the nearest of p.ratios, and a
   note when Custom was mapped. draw(onChange) paints #imgSizes and the custom inputs. */
HR.imgsize = (function () {
  var CHIPS = [['1:1', 'Square'], ['3:4', 'Portrait'], ['4:3', 'Landscape'], ['9:16', 'Phone'], ['16:9', 'Wide'], ['custom', 'Custom']];
  var $ = function (id) { return document.getElementById(id); };
  function val() { var v = String(HR.set.get('imageSize') || '1:1'); return /^(1:1|3:4|4:3|9:16|16:9|custom:\d+x\d+)$/.test(v) ? v : '1:1'; }
  function wh() { var v = val(), m = /^custom:(\d+)x(\d+)$/.exec(v); if (m) return [+m[1], +m[2]]; var r = v.split(':'), a = +r[0], b = +r[1];
    return a >= b ? [1024, Math.round(1024 * b / a)] : [Math.round(1024 * a / b), 1024]; }
  function rnd(x, m, max) { return Math.max(256, Math.min(max, Math.round(x / m) * m)); }
  function nearest(w, h, list) { var r = w / h, best = list[0], d = 1e9;
    list.forEach(function (x) { var p = x.split(':'), q = Math.abs(Math.log(r / (p[0] / p[1]))); if (q < d) { d = q; best = x; } }); return best; }
  function fit(p) {
    var s = wh(), w = s[0], h = s[1], v = val();
    if (p.size === 'ratio') { var r = nearest(w, h, p.ratios || ['1:1']); return { width: w, height: h, ratio: r,
      note: /^custom/.test(v) || (v !== r) ? 'This provider sets its own pixels: using the nearest shape ' + r + '.' : '' }; }
    var m = p.mult || 64, mx = p.max || 2048, k = Math.min(1, mx / Math.max(w, h)), W = rnd(w * k, m, mx), H = rnd(h * k, m, mx);
    return { width: W, height: H, ratio: nearest(W, H, ['1:1', '3:4', '4:3', '9:16', '16:9']), note: (W !== w || H !== h) ? 'Rounded to ' + W + ' × ' + H + ' for this provider.' : '' };
  }
  function draw(onChange) {
    var box = $('imgSizes'), v = val(), cu = /^custom/.test(v); box.innerHTML = '';
    CHIPS.forEach(function (c) {
      var on = c[0] === 'custom' ? cu : c[0] === v, b = document.createElement('button'); b.type = 'button'; b.className = 'ig-chip' + (on ? ' on' : '');
      b.dataset.s = c[0]; b.setAttribute('aria-pressed', String(on)); b.innerHTML = '<b></b><small></small>'; b.firstChild.textContent = c[1]; b.lastChild.textContent = c[0] === 'custom' ? 'W × H' : c[0];
      b.onclick = function () { var s = wh(); HR.set.put('imageSize', c[0] === 'custom' ? 'custom:' + s[0] + 'x' + s[1] : c[0]); draw(onChange); onChange(); };
      box.appendChild(b);
    });
    var cw = $('imgCustom'), s = wh(); cw.hidden = !cu; $('imgW').value = s[0]; $('imgH').value = s[1];
    $('imgW').onchange = $('imgH').onchange = function () {
      var W = Math.max(256, Math.min(4096, parseInt($('imgW').value, 10) || 1024)), H = Math.max(256, Math.min(4096, parseInt($('imgH').value, 10) || 1024));
      HR.set.put('imageSize', 'custom:' + W + 'x' + H); draw(onChange); onChange(); };
  }
  return { val: val, fit: fit, draw: draw };
})();
