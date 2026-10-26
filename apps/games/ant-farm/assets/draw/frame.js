// AFV1 wooden frame + glass reflection. The frame (with wood grain) is drawn
// once into an offscreen canvas and only rebuilt when the view size changes.
(function () {
  var cache = document.createElement('canvas'), key = '';
  function build(fw, fh, t) {
    cache.width = fw; cache.height = fh; var g = cache.getContext('2d');
    var wood = g.createLinearGradient(0, 0, 0, fh); wood.addColorStop(0, '#9a6a3c'); wood.addColorStop(0.5, '#7d522c'); wood.addColorStop(1, '#5e3c1f');
    g.fillStyle = wood; g.fillRect(0, 0, fw, fh); g.clearRect(t, t, fw - 2 * t, fh - 2 * t);
    // grain: wavy darker lines along each rail
    g.save(); g.beginPath(); g.rect(0, 0, fw, fh); g.rect(t, t, fw - 2 * t, fh - 2 * t); g.clip('evenodd');
    g.strokeStyle = 'rgba(50,28,12,.35)'; g.lineWidth = 1; var r = 7;
    function rnd() { r = (r * 16807) % 2147483647; return r / 2147483647; }
    for (var n = 0; n < 6; n++) { var off = (n + 0.5) / 6 * t, a = rnd() * 6, f = 0.01 + rnd() * 0.02; g.beginPath();
      for (var x = 0; x <= fw; x += 8) { var y = off + Math.sin(x * f + a) * t * 0.08; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      for (x = 0; x <= fw; x += 8) { y = fh - off + Math.sin(x * f + a + 2) * t * 0.08; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      g.beginPath(); for (y = 0; y <= fh; y += 8) { x = off + Math.sin(y * f + a) * t * 0.08; y ? g.lineTo(x, y) : g.moveTo(x, y); }
      for (y = 0; y <= fh; y += 8) { x = fw - off + Math.sin(y * f + a + 1) * t * 0.08; y ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    for (n = 0; n < 5; n++) { g.fillStyle = 'rgba(60,32,14,.4)'; g.beginPath(); g.ellipse(rnd() * fw, rnd() < .5 ? t / 2 : fh - t / 2, t * .25, t * .12, 0, 0, 7); g.fill(); }  // knots
    g.restore();
    // bevel: light outer top/left, dark inner edge
    g.strokeStyle = 'rgba(255,220,170,.35)'; g.lineWidth = 1; g.strokeRect(.5, .5, fw - 1, fh - 1);
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.strokeRect(t - 1, t - 1, fw - 2 * t + 2, fh - 2 * t + 2);
  }
  AF.drawFrame = function (c, ox, oy, gw, gh, k) {
    var t = Math.max(6, Math.round(k * 1.4)), fw = Math.round(gw + 2 * t), fh = Math.round(gh + 2 * t), id = fw + 'x' + fh + 'x' + t;
    if (id !== key) { build(fw, fh, t); key = id; }
    // glass: a soft diagonal sheen plus a thin bright streak
    var gl = c.createLinearGradient(ox, oy, ox + gw * .6, oy + gh);
    gl.addColorStop(0, 'rgba(255,255,255,.13)'); gl.addColorStop(.25, 'rgba(255,255,255,0)'); gl.addColorStop(.5, 'rgba(255,255,255,0)');
    gl.addColorStop(.54, 'rgba(255,255,255,.07)'); gl.addColorStop(.58, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(ox, oy, gw, gh);
    c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(ox, oy, gw, Math.max(2, k * .5));
    c.drawImage(cache, ox - t, oy - t);
  };
})();
