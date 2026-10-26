/* Card: Sun & Moon (PD2.1) — fully offline.
   Location: the Weather card's saved place (store 'weather.place'), else Guwahati.
   Shows sunrise / solar noon / sunset / solar midnight, civil twilight, day length,
   a countdown to the next event, moon phase, and a 24-hour dial (SVG):
     full circle = 24 h (15 deg per hour), solar noon at TOP, solar midnight at BOTTOM;
     a straight chord from the sunrise point to the sunset point splits day (noon side) from night;
     civil twilight is a soft band between the dawn/dusk chord and the sunrise/sunset chord.
   Re-renders every minute.
   PD2.2: tighter dial filling its box, 2-column card on >=900px, no centre hand,
   curved progress arrow (sunrise->now by day, sunset->now by night), bigger outside labels. */
(function(){
  var NS = 'http://www.w3.org/2000/svg';
  var FALLBACK = { lat: 26.14, lon: 91.74, name: 'Guwahati' };
  var timer = null;

  function hhmm(d) {
    if (!d) return '—';
    return MDStore.fmtTime(d);
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

  /* PD4.3: dial angle (deg, clockwise from top) by local CLOCK time: 12:00 top, 18:00 right, 00:00 bottom, 06:00 left.
     Second arg kept for old call sites and ignored. */
  function angleOf(t) {
    var d = new Date(t);
    return (d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 - 720) / 4;
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

  /* Arc path along the rim from angle a1 to a2 (clockwise, a2 > a1) */
  function arc(cx, cy, r, a1, a2) {
    var p1 = point(cx, cy, r, a1);
    var p2 = point(cx, cy, r, a2);
    var large = a2 - a1 > 180 ? 1 : 0;
    return 'M' + p1.x + ' ' + p1.y + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p2.x + ' ' + p2.y;
  }

  /* Start of the current day or night stretch: sunrise (day), sunset (evening),
     or yesterday's sunset (before sunrise; approximated as today's sunset - 24 h). */
  function progressStart(s, now) {
    if (!s.sunrise || !s.sunset) return null;
    if (now < s.sunrise) return { t: new Date(s.sunset.getTime() - 86400000), night: true };
    if (now > s.sunset) return { t: s.sunset, night: true };
    return { t: s.sunrise, night: false };
  }

  /* PD4.4: silver-grey moon in its phase (0 new, .5 full). Northern view: waxing lit on right, waning on left.
     Lit shape = semicircle + terminator half-ellipse (rx = r·|cos 2πp|). Group is .sd-up so it stays upright on the night flip. */
  function moonIcon(x, y, r, p) {
    var g = svg('g', { 'class': 'sd-moon sd-up' });
    g.appendChild(svg('circle', { cx: x, cy: y, r: r, 'class': 'sd-moon-dark' }));
    var rx = Math.abs(Math.cos(2 * Math.PI * p)) * r, wax = p < 0.5, gib = p > 0.25 && p < 0.75;
    var top = x + ' ' + (y - r), bot = x + ' ' + (y + r);
    var d = 'M' + top + ' A' + r + ' ' + r + ' 0 0 ' + (wax ? 1 : 0) + ' ' + bot +
      ' A' + rx + ' ' + r + ' 0 0 ' + (wax ? (gib ? 1 : 0) : (gib ? 0 : 1)) + ' ' + top + ' Z';
    if (p > 0.02 && p < 0.98) g.appendChild(svg('path', { d: d, 'class': 'sd-moon-lit' }));
    return g;
  }

  /* PD2.2 dial: tight viewBox (wider than tall so side labels fit), bigger rim labels outside
     the rim, curved progress arrow instead of a centre hand, place name below the centre dot. */
  function dial(s, mo, now, place) {
    var W = 470, H = 316;
    var cx = W / 2, cy = H / 2;
    var R = 126;
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'sun-dial', role: 'img',
      'aria-label': '24-hour sun dial: sunrise ' + hhmm(s.sunrise) + ', sunset ' + hhmm(s.sunset) });
    /* Arrowhead marker for the progress arc; orient=auto follows the arc's clockwise direction */
    var defs = svg('defs', {});
    ['day', 'night'].forEach(function(k) {
      var mk = svg('marker', { id: 'sd-arrow-' + k, viewBox: '0 0 10 10', refX: 5, refY: 5,
        markerWidth: 3.2, markerHeight: 3.2, orient: 'auto', markerUnits: 'strokeWidth' });
      mk.appendChild(svg('path', { d: 'M0 0 L10 5 L0 10 Z', 'class': 'sd-arrowhead ' + k }));
      defs.appendChild(mk);
    });
    root.appendChild(defs);
    /* PD4.2: everything below goes in a group that rotates 180° at night (midnight on top).
       Text inside it (.sd-up) counter-rotates about its own box so it stays upright. Place name sits outside. */
    var outer = root;
    root = svg('g', { 'class': 'sd-rot' });
    outer.appendChild(root);

    root.appendChild(svg('circle', { cx: cx, cy: cy, r: R, 'class': 'sd-night' }));
    if (s.dawn && s.dusk) {
      root.appendChild(svg('path', { d: segment(cx, cy, R, angleOf(s.dawn, s.noon), angleOf(s.dusk, s.noon)), 'class': 'sd-twi' }));
    }
    if (s.sunrise && s.sunset) {
      root.appendChild(svg('path', { d: segment(cx, cy, R, angleOf(s.sunrise, s.noon), angleOf(s.sunset, s.noon)), 'class': 'sd-day' }));
    }
    /* Stars on the night side (opposite noon) */
    [[150,40],[170,20],[195,55],[215,30],[240,62],[260,24],[285,48],[205,8],[160,58],[300,15]].forEach(function(st) {
      var a = 180 + (st[0] - 225) * 0.9;
      var p = point(cx, cy, R - st[1] - 8, a);
      root.appendChild(svg('circle', { cx: p.x, cy: p.y, r: st[1] % 3 ? 1.4 : 2.2, 'class': 'sd-star' }));
    });
    /* PD4.3: faint fixed 6 AM – 6 PM reference line through the centre */
    var p6a = point(cx, cy, R, -90), p6p = point(cx, cy, R, 90);
    root.appendChild(svg('line', { x1: p6a.x, y1: p6a.y, x2: p6p.x, y2: p6p.y, 'class': 'sd-ref' }));
    root.appendChild(svg('circle', { cx: cx, cy: cy, r: R, 'class': 'sd-rim' }));
    /* Solar noon: small marker on the rim (time is in the list) */
    if (s.noon) { var pn = point(cx, cy, R, angleOf(s.noon)); root.appendChild(svg('circle', { cx: pn.x, cy: pn.y, r: 4, 'class': 'sd-noon' })); }

    /* Rim labels, outside the rim */
    var labels = [
      [s.midnight, '☾ ' + hhmm(s.midnight)],
      [s.sunrise, '↑ ' + hhmm(s.sunrise)],
      [s.sunset, '↓ ' + hhmm(s.sunset)]
    ];
    labels.forEach(function(l) {
      if (!l[0]) return;
      var a = angleOf(l[0], s.noon);
      var p = point(cx, cy, R + 9, a);
      var sx = Math.sin(a * Math.PI / 180), cyA = Math.cos(a * Math.PI / 180);
      var anchor = sx < -0.3 ? 'end' : (sx > 0.3 ? 'start' : 'middle');
      var dy = anchor !== 'middle' ? 5 : (cyA > 0 ? -3 : 14);
      var txt = svg('text', { x: p.x, y: p.y + dy, 'class': 'sd-label sd-up', 'text-anchor': anchor });
      txt.textContent = l[1];
      root.appendChild(txt);
    });

    /* Curved progress arrow: from the start of this day/night stretch to the sun */
    var aNow = angleOf(now, s.noon);
    var st = progressStart(s, now);
    if (st) {
      var a1 = angleOf(st.t, s.noon);
      while (a1 > aNow) a1 -= 360;
      var a2 = aNow - 9; /* stop short so the arrowhead touches the sun dot */
      if (a2 - a1 > 4) {
        root.appendChild(svg('path', { d: arc(cx, cy, R, a1, a2),
          'class': 'sd-prog' + (st.night ? ' night' : ''), 'marker-end': 'url(#sd-arrow-' + (st.night ? 'night' : 'day') + ')' }));
      }
    }

    /* Centre (location) with the place name just below it */
    root.appendChild(svg('circle', { cx: cx, cy: cy, r: 5, 'class': 'sd-home' }));
    var name = svg('text', { x: cx, y: cy + 22, 'class': 'sd-place', 'text-anchor': 'middle' });
    name.textContent = place.name;
    outer.appendChild(name);

    var sun = point(cx, cy, R, aNow);
    root.appendChild(svg('circle', { cx: sun.x, cy: sun.y, r: 10, 'class': 'sd-sun' }));
    /* Moon lags the sun by phase x 24 h around the dial (derived from phase, not an ephemeris; rotates with the dial) */
    var mp = point(cx, cy, R, aNow - mo.phase * 360);
    root.appendChild(moonIcon(mp.x, mp.y, 10, mo.phase));
    return outer;
  }

  /* Test hook: ?now=HH:MM forces the dial time (screenshots); ignored otherwise */
  function currentTime() {
    var m = /[?&]now=(\d{1,2}):(\d{2})/.exec(location.search);
    var d = new Date();
    if (m) d.setHours(+m[1], +m[2], 0, 0);
    return d;
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
    var now = currentTime();
    var s = MDSun.sunTimes(now, place.lat, place.lon);
    var mo = MDSun.moon(now);
    var nx = nextEvent(s, now, place.lat, place.lon);
    var wrap = el('div', { 'class': 'sun-wrap' });
    var dl = dial(s, mo, now, place);
    wrap.appendChild(dl);
    /* PD4.2: night = before sunrise or after sunset -> flip. Start from the previous state so the switch animates. */
    var night = !!(s.sunrise && s.sunset && (now < s.sunrise || now > s.sunset));
    var rot = dl.querySelector('.sd-rot');
    if (box._flip) rot.classList.add('flip');
    if (box._flip !== undefined && box._flip !== night) requestAnimationFrame(function() { requestAnimationFrame(function() { rot.classList.toggle('flip', night); }); });
    else rot.classList.toggle('flip', night);
    box._flip = night;
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
    /* Wide card on big screens (CSS spans 2 columns) */
    var card = box.closest && box.closest('.card');
    if (card) card.classList.add('card-sun');
    if (timer) clearTimeout(timer);
    timer = setTimeout(function() {
      if (box.isConnected) api.rerender();
    }, 60000 - now.getSeconds() * 1000);
  }

  MyDay.register({ id: 'sun', title: 'Sun & Moon', defaultOn: true, after: 'weather', render: render });
})();
