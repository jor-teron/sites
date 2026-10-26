/* Card: Sun & Moon (PD2.1) — fully offline.
   Location: the Weather card's saved place (store 'weather.place'), else Guwahati.
   Shows sunrise / solar noon / sunset / solar midnight, civil twilight, day length,
   a countdown to the next event, moon phase, and a 24-hour dial (SVG):
     full circle = 24 h (15 deg per hour), solar noon at TOP, solar midnight at BOTTOM;
     a straight chord from the sunrise point to the sunset point splits day (noon side) from night;
     civil twilight is a soft band between the dawn/dusk chord and the sunrise/sunset chord.
   Re-renders every minute. */
(function(){
  var NS = 'http://www.w3.org/2000/svg';
  var FALLBACK = { lat: 26.14, lon: 91.74, name: 'Guwahati' };
  var timer = null;

  function hhmm(d) {
    if (!d) return '—';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function dur(ms) {
    var m = Math.round(ms / 60000);
    var h = Math.floor(m / 60);
    m = m % 60;
    return h ? h + ' h ' + m + ' min' : m + ' min';
  }

  function shortDate(d) {
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function svg(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* Dial angle (deg, clockwise from top) for an instant: 0 at solar noon */
  function angleOf(t, noon) {
    return (t - noon) / 3600000 * 15;
  }

  function point(cx, cy, r, deg) {
    return {
      x: cx + r * Math.sin(deg * Math.PI / 180),
      y: cy - r * Math.cos(deg * Math.PI / 180)
    };
  }

  /* Circle segment on the noon side of the chord a1..a2 (a1 < 0 < a2) */
  function segment(cx, cy, r, a1, a2) {
    var p1 = point(cx, cy, r, a1);
    var p2 = point(cx, cy, r, a2);
    var large = a2 - a1 > 180 ? 1 : 0;
    return 'M' + p1.x + ' ' + p1.y + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p2.x + ' ' + p2.y + ' Z';
  }

  function dial(s, mo, now, place) {
    var W = 370;
    var c = W / 2;
    var R = 92;
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + W, 'class': 'sun-dial', role: 'img',
      'aria-label': '24-hour sun dial: sunrise ' + hhmm(s.sunrise) + ', sunset ' + hhmm(s.sunset) });
    root.appendChild(svg('circle', { cx: c, cy: c, r: R, 'class': 'sd-night' }));
    if (s.dawn && s.dusk) {
      root.appendChild(svg('path', { d: segment(c, c, R, angleOf(s.dawn, s.noon), angleOf(s.dusk, s.noon)), 'class': 'sd-twi' }));
    }
    if (s.sunrise && s.sunset) {
      root.appendChild(svg('path', { d: segment(c, c, R, angleOf(s.sunrise, s.noon), angleOf(s.sunset, s.noon)), 'class': 'sd-day' }));
    }
    root.appendChild(svg('circle', { cx: c, cy: c, r: R, 'class': 'sd-rim' }));
    /* Hour ticks every 3 h */
    for (var h = 0; h < 24; h += 3) {
      var a = h * 15;
      var t1 = point(c, c, R, a);
      var t2 = point(c, c, R - 6, a);
      root.appendChild(svg('line', { x1: t1.x, y1: t1.y, x2: t2.x, y2: t2.y, 'class': 'sd-tick' }));
    }
    /* Rim labels */
    var labels = [
      [s.noon, '☀ ' + hhmm(s.noon)],
      [s.midnight, '☾ ' + hhmm(s.midnight)],
      [s.sunrise, '↑ ' + hhmm(s.sunrise)],
      [s.sunset, '↓ ' + hhmm(s.sunset)]
    ];
    labels.forEach(function(l) {
      if (!l[0]) return;
      var a = angleOf(l[0], s.noon);
      var p = point(c, c, R + 8, a);
      /* Left-side labels end at the rim, right-side ones start there, so nothing is clipped */
      var sx = Math.sin(a * Math.PI / 180);
      var anchor = sx < -0.3 ? 'end' : (sx > 0.3 ? 'start' : 'middle');
      var dy = Math.cos(a * Math.PI / 180) > 0.7 ? -2 : 10;
      if (anchor !== 'middle') dy = 4;
      var txt = svg('text', { x: p.x, y: p.y + dy, 'class': 'sd-label', 'text-anchor': anchor });
      txt.textContent = l[1];
      root.appendChild(txt);
    });
    /* Now hand, centre (location), sun and moon */
    var aNow = angleOf(now, s.noon);
    var hand = point(c, c, R - 10, aNow);
    root.appendChild(svg('line', { x1: c, y1: c, x2: hand.x, y2: hand.y, 'class': 'sd-hand' }));
    root.appendChild(svg('circle', { cx: c, cy: c, r: 5, 'class': 'sd-home' }));
    var name = svg('text', { x: c, y: c + 20, 'class': 'sd-place', 'text-anchor': 'middle' });
    name.textContent = place.name;
    root.appendChild(name);
    var sun = point(c, c, R, aNow);
    root.appendChild(svg('circle', { cx: sun.x, cy: sun.y, r: 9, 'class': 'sd-sun' }));
    /* Moon lags the sun by phase x 24 h around the dial */
    var mp = point(c, c, R, aNow - mo.phase * 360);
    var mt = svg('text', { x: mp.x, y: mp.y + 7, 'class': 'sd-moon', 'text-anchor': 'middle' });
    mt.textContent = mo.emoji;
    root.appendChild(mt);
    return root;
  }

  /* Next upcoming event today (or tomorrow's sunrise) */
  function nextEvent(s, now, lat, lon) {
    var list = [['Sunrise', s.sunrise], ['Solar noon', s.noon], ['Sunset', s.sunset], ['Dusk ends', s.dusk]];
    for (var i = 0; i < list.length; i++) {
      if (list[i][1] && list[i][1] > now) return list[i];
    }
    var tomorrow = new Date(now.getTime() + 86400000);
    return ['Sunrise', MDSun.sunTimes(tomorrow, lat, lon).sunrise];
  }

  function row(el, label, value) {
    return el('div', { 'class': 'sun-row' }, [el('span', { text: label }), el('b', { text: value })]);
  }

  function render(box, api) {
    var el = api.el;
    var place = api.store.get('weather.place', null) || FALLBACK;
    var now = new Date();
    var s = MDSun.sunTimes(now, place.lat, place.lon);
    var mo = MDSun.moon(now);
    var nx = nextEvent(s, now, place.lat, place.lon);
    var wrap = el('div', { 'class': 'sun-wrap' });
    wrap.appendChild(dial(s, mo, now, place));
    var info = el('div', { 'class': 'sun-info' }, [
      el('div', { 'class': 'sun-next', text: nx[0] + ' in ' + dur(nx[1] - now) }),
      row(el, 'Dawn (civil)', hhmm(s.dawn)),
      row(el, 'Sunrise', hhmm(s.sunrise)),
      row(el, 'Solar noon', hhmm(s.noon)),
      row(el, 'Sunset', hhmm(s.sunset)),
      row(el, 'Dusk (civil)', hhmm(s.dusk)),
      row(el, 'Solar midnight', hhmm(s.midnight)),
      row(el, 'Day length', s.dayLength ? dur(s.dayLength) : '—'),
      el('div', { 'class': 'sun-moon' }, [
        el('span', { 'class': 'sun-moon-emoji', text: mo.emoji }),
        el('div', {}, [
          el('b', { text: mo.name + ' · ' + mo.lit + '% lit' }),
          el('div', { 'class': 'wx-small', text: 'Full: ' + shortDate(mo.nextFull) + ' · New: ' + shortDate(mo.nextNew) })
        ])
      ])
    ]);
    wrap.appendChild(info);
    box.appendChild(wrap);
    if (timer) clearTimeout(timer);
    timer = setTimeout(function() {
      if (box.isConnected) api.rerender();
    }, 60000 - now.getSeconds() * 1000);
  }

  MyDay.register({ id: 'sun', title: 'Sun & Moon', defaultOn: true, after: 'weather', render: render });
})();
