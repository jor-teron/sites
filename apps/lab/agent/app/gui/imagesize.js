/* Agent — app/gui/imagesize.js: picture shape + size for the Image page (AG17 chips; AG19: two small native dropdowns).
   HR.imgsize. #imgRatio: 1:1, 3:4, 4:3, 9:16, 16:9, Custom (Custom shows #imgW / #imgH number boxes on the same line).
   #imgSize: long-side sizes (512…2048) that fit the provider, shown as rounded 'W × H'; providers that take a ratio only
   (p.size 'ratio': Gemini, OpenRouter) get it disabled, title 'set by provider'. Settings: `imageSize` '1:1' … '16:9' |
   'custom:WxH' (AG17), `imageLong` long side in px (AG19, default 1024). fit(p) -> {width, height, ratio, note}: pixel
   providers round to p.mult and clamp to 256..p.max; ratio providers get the nearest of p.ratios (note when mapped). */
HR.imgsize = (function () {
  var RATIOS = [['1:1', '1:1 Square'], ['3:4', '3:4 Portrait'], ['4:3', '4:3 Landscape'], ['9:16', '9:16 Phone'], ['16:9', '16:9 Wide'], ['custom', 'Custom']];
  var LONGS = [512, 768, 1024, 1280, 1536, 2048];
  var $ = function (id) { return document.getElementById(id); };
  function val() { var v = String(HR.set.get('imageSize') || '1:1'); return /^(1:1|3:4|4:3|9:16|16:9|custom:\d+x\d+)$/.test(v) ? v : '1:1'; }
  function long() { var l = parseInt(HR.set.get('imageLong'), 10); return LONGS.indexOf(l) >= 0 ? l : 1024; }
  function wh(L) { var v = val(), m = /^custom:(\d+)x(\d+)$/.exec(v); if (m) return [+m[1], +m[2]]; var r = v.split(':'), a = +r[0], b = +r[1]; L = L || long();
    return a >= b ? [L, Math.round(L * b / a)] : [Math.round(L * a / b), L]; }
  function rnd(x, m, max) { return Math.max(256, Math.min(max, Math.round(x / m) * m)); }
  function nearest(w, h, list) { var r = w / h, best = list[0], d = 1e9;
    list.forEach(function (x) { var p = x.split(':'), q = Math.abs(Math.log(r / (p[0] / p[1]))); if (q < d) { d = q; best = x; } }); return best; }
  function px(p, s) { var w = s[0], h = s[1], m = p.mult || 64, mx = p.max || 2048, k = Math.min(1, mx / Math.max(w, h)); return [rnd(w * k, m, mx), rnd(h * k, m, mx)]; }
  function fit(p, L) {
    var s = wh(L), v = val();
    if (p.size === 'ratio') { var r = nearest(s[0], s[1], p.ratios || ['1:1']); return { width: s[0], height: s[1], ratio: r,
      note: /^custom/.test(v) || v !== r ? 'Shape set to the nearest the provider takes: ' + r + '.' : '' }; }
    var d = px(p, s);
    return { width: d[0], height: d[1], ratio: nearest(d[0], d[1], ['1:1', '3:4', '4:3', '9:16', '16:9']), note: /^custom/.test(v) && (d[0] !== s[0] || d[1] !== s[1]) ? 'Rounded to ' + d[0] + ' × ' + d[1] + ' for this provider.' : '' };
  }
  function draw(p, onChange) {
    var rs = $('imgRatio'), ss = $('imgSize'), v = val(), cu = /^custom/.test(v);
    rs.innerHTML = ''; RATIOS.forEach(function (r) { var o = document.createElement('option'); o.value = r[0]; o.textContent = r[1]; rs.appendChild(o); });
    rs.value = cu ? 'custom' : v;
    ss.innerHTML = ''; ss.hidden = cu;
    if (p.size === 'ratio') { var o = document.createElement('option'); o.textContent = 'Auto'; ss.appendChild(o); ss.disabled = true; ss.title = 'set by provider'; }
    else {
      ss.disabled = false; ss.title = 'Picture size'; var seen = {};
      LONGS.filter(function (L) { return L <= (p.max || 2048); }).forEach(function (L) {
        var d = px(p, wh(L)), k = d[0] + 'x' + d[1]; if (seen[k]) return; seen[k] = 1;
        var o = document.createElement('option'); o.value = L; o.textContent = d[0] + ' × ' + d[1]; ss.appendChild(o);
      });
      ss.value = String(long()); if (ss.selectedIndex < 0) ss.selectedIndex = Math.max(0, [].findIndex.call(ss.options, function (o) { return +o.value >= 1024; }));
    }
    var s = wh(); $('imgCustom').hidden = !cu; $('imgW').value = s[0]; $('imgH').value = s[1];
    rs.onchange = function () { var c = wh(); HR.set.put('imageSize', rs.value === 'custom' ? 'custom:' + c[0] + 'x' + c[1] : rs.value); draw(p, onChange); onChange(); };
    ss.onchange = function () { HR.set.put('imageLong', +ss.value); draw(p, onChange); onChange(); };
    $('imgW').onchange = $('imgH').onchange = function () {
      var W = Math.max(256, Math.min(4096, parseInt($('imgW').value, 10) || 1024)), H = Math.max(256, Math.min(4096, parseInt($('imgH').value, 10) || 1024));
      HR.set.put('imageSize', 'custom:' + W + 'x' + H); draw(p, onChange); onChange(); };
  }
  return { val: val, fit: fit, draw: draw };
})();
