/* Card: Weather (PD2) — Open-Meteo, free, no key. Current, next 12 hours, next 3 days.
   Place: "Use my location" or name search (Open-Meteo geocoding); saved in store 'weather.place'.
   Last response cached in store 'weather.cache' {t,data}; refresh on open if older than 30 min.
   Pushes top-strip alerts: rain, heat, storm, wind. PD3: AQI pill via cards/weather_aqi.js. */
(function(){
  var API = 'https://api.open-meteo.com/v1/forecast';
  var GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  var MAX_AGE = 30 * 60 * 1000;
  var busy = false;
  var lastTry = 0;

  /* WMO weather code -> [text, emoji] */
  function wmo(code) {
    if (code === 0) return ['Clear sky', '☀️'];
    if (code <= 2) return ['Partly cloudy', '⛅'];
    if (code === 3) return ['Overcast', '☁️'];
    if (code <= 48) return ['Fog', '🌫️'];
    if (code <= 57) return ['Drizzle', '🌦️'];
    if (code <= 67) return ['Rain', '🌧️'];
    if (code <= 77) return ['Snow', '❄️'];
    if (code <= 82) return ['Rain showers', '🌦️'];
    if (code <= 86) return ['Snow showers', '🌨️'];
    return ['Thunderstorm', '⛈️'];
  }

  function hhmm(t) {
    var d = new Date(t);
    return MDStore.fmtTime(d);
  }

  function forecastUrl(p) {
    return API + '?latitude=' + p.lat + '&longitude=' + p.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m' +
      '&hourly=temperature_2m,weather_code,precipitation_probability' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max' +
      '&forecast_days=4&timezone=auto';
  }

  /* Top-strip alerts from today's numbers; cleared when not applicable */
  function setAlerts(data) {
    var d = data && data.daily;
    var c = data && data.current;
    if (!d) return;
    var rainP = d.precipitation_probability_max[0];
    var rainMm = d.precipitation_sum[0];
    var tmax = d.temperature_2m_max[0];
    var gust = Math.max(d.wind_gusts_10m_max[0] || 0, c ? c.wind_gusts_10m || 0 : 0);
    var storm = (c && c.weather_code >= 95) || d.weather_code[0] >= 95;
    if (rainP >= 70 || rainMm >= 20) MyDay.alert('wx-rain', '🌧️ Heavy rain likely today (' + rainP + '%, ' + rainMm + ' mm)', 'med');
    else MyDay.clearAlert('wx-rain');
    if (tmax >= 38) MyDay.alert('wx-heat', '🔥 Heat: up to ' + Math.round(tmax) + '°C today', 'high');
    else MyDay.clearAlert('wx-heat');
    if (storm) MyDay.alert('wx-storm', '⛈️ Thunderstorm expected today', 'high');
    else MyDay.clearAlert('wx-storm');
    if (gust >= 50) MyDay.alert('wx-wind', '💨 Strong wind: gusts ' + Math.round(gust) + ' km/h', 'med');
    else MyDay.clearAlert('wx-wind');
  }

  function fetchWeather(api, place) {
    if (busy) return;
    busy = true;
    lastTry = Date.now();
    fetch(forecastUrl(place))
      .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(data) {
        api.store.set('weather.cache', { t: Date.now(), key: place.lat + ',' + place.lon, data: data });
        api.store.set('weather.err', null);
      })
      .catch(function(e) { api.store.set('weather.err', navigator.onLine ? 'Could not update (' + e.message + ')' : 'Offline'); })
      .then(function() { busy = false; api.rerender(); });
  }

  function placeForm(box, api) {
    var el = api.el;
    var input = el('input', { type: 'search', placeholder: 'Town or city, e.g. Guwahati', 'aria-label': 'Place name' });
    var results = el('div', { 'class': 'wx-form' });
    var msg = el('div', { 'class': 'wx-small' });
    function pick(p) {
      api.store.set('weather.place', p);
      api.store.set('weather.cache', null);
      box._form = false;
      api.rerender();
    }
    function search() {
      var q = input.value.trim();
      if (!q) return;
      msg.textContent = 'Searching…';
      fetch(GEO + '?count=5&language=en&format=json&name=' + encodeURIComponent(q))
        .then(function(r) { return r.json(); })
        .then(function(j) {
          results.innerHTML = '';
          var list = j.results || [];
          msg.textContent = list.length ? 'Pick one:' : 'No place found.';
          list.forEach(function(g) {
            var name = g.name + (g.admin1 ? ', ' + g.admin1 : '') + (g.country_code ? ' (' + g.country_code + ')' : '');
            results.appendChild(el('button', { 'class': 'btn small', text: name, onclick: function() {
              pick({ name: name, lat: g.latitude, lon: g.longitude });
            } }));
          });
        })
        .catch(function() { msg.textContent = 'Search needs internet.'; });
    }
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') search(); });
    function useGps() {
      if (!navigator.geolocation) { msg.textContent = 'Location not available.'; return; }
      msg.textContent = 'Finding you…';
      navigator.geolocation.getCurrentPosition(function(pos) {
        var lat = Math.round(pos.coords.latitude * 100) / 100;
        var lon = Math.round(pos.coords.longitude * 100) / 100;
        pick({ name: 'My location', lat: lat, lon: lon });
      }, function() { msg.textContent = 'Location permission denied. Search by name instead.'; }, { timeout: 15000 });
    }
    box.appendChild(el('div', { 'class': 'wx-form' }, [
      el('button', { 'class': 'btn primary', text: '📍 Use my location', onclick: useGps }),
    ]));
    box.appendChild(el('div', { 'class': 'wx-form' }, [input, el('button', { 'class': 'btn', text: 'Search', onclick: search })]));
    box.appendChild(msg);
    box.appendChild(results);
    if (api.store.get('weather.place', null)) {
      box.appendChild(el('button', { 'class': 'btn small', text: 'Cancel', onclick: function() { box._form = false; api.rerender(); } }));
    }
  }

  function render(box, api) {
    var el = api.el;
    var place = api.store.get('weather.place', null);
    if (!place || box._form) {
      box.appendChild(el('p', { 'class': 'hint', text: 'Choose a place to see the weather.' }));
      placeForm(box, api);
      return;
    }
    var cache = api.store.get('weather.cache', null);
    var key = place.lat + ',' + place.lon;
    if (cache && cache.key !== key) cache = null;
    var fresh = cache && Date.now() - cache.t < MAX_AGE;
    if (!fresh && !busy && Date.now() - lastTry > 60000 && navigator.onLine !== false) setTimeout(function() { fetchWeather(api, place); }, 0);

    box.appendChild(el('div', { 'class': 'wx-place' }, [
      el('strong', { text: '📍 ' + place.name }),
      el('span', {}, [
        el('button', { 'class': 'btn small', text: 'Change', onclick: function() { box._form = true; api.rerender(); } }),
        ' ',
        el('button', { 'class': 'btn small', text: busy ? '…' : '↻', 'aria-label': 'Refresh weather', onclick: function() { fetchWeather(api, place); } })
      ])
    ]));
    if (!cache) {
      box.appendChild(el('div', { 'class': 'empty', text: api.store.get('weather.err', null) || 'Loading weather…' }));
      return;
    }
    var d = cache.data;
    var c = d.current;
    var w = wmo(c.weather_code);
    box.appendChild(el('div', { 'class': 'wx-now' }, [
      el('div', { 'class': 'wx-ico', 'aria-hidden': 'true', text: w[1] }),
      el('div', { 'class': 'wx-temp', text: Math.round(c.temperature_2m) + '°C' }),
      el('div', { 'class': 'wx-meta' }, [
        el('div', { text: w[0] + ' · feels ' + Math.round(c.apparent_temperature) + '°' }),
        el('div', { text: '💧 ' + c.relative_humidity_2m + '%  ·  💨 ' + Math.round(c.wind_speed_10m) + ' km/h' })
      ])
    ]));
    if (window.MDAqi) MDAqi.render(box, api, place);

    /* Next 12 hours from the current hour */
    var hrs = el('div', { 'class': 'wx-hours', role: 'list', 'aria-label': 'Next 12 hours' });
    var now = c.time.slice(0, 13);
    var start = 0;
    for (var i = 0; i < d.hourly.time.length; i++) {
      if (d.hourly.time[i].slice(0, 13) >= now) { start = i; break; }
    }
    for (var j = start; j < Math.min(start + 12, d.hourly.time.length); j++) {
      var hw = wmo(d.hourly.weather_code[j]);
      hrs.appendChild(el('div', { 'class': 'wx-h', role: 'listitem' }, [
        el('div', { 'class': 'wx-small', text: MDStore.fmtTime(d.hourly.time[j].slice(11, 16), true) }),
        el('div', { text: hw[1] }),
        el('div', { text: Math.round(d.hourly.temperature_2m[j]) + '°' }),
        el('div', { 'class': 'wx-small', text: '☔' + (d.hourly.precipitation_probability[j] || 0) + '%' })
      ]));
    }
    box.appendChild(hrs);

    /* Next 3 days (skip today) */
    var days = el('div', { 'class': 'wx-days' });
    for (var k = 1; k <= 3 && k < d.daily.time.length; k++) {
      var dw = wmo(d.daily.weather_code[k]);
      var label = new Date(d.daily.time[k] + 'T12:00').toLocaleDateString([], { weekday: 'short' });
      days.appendChild(el('div', { 'class': 'wx-d' }, [
        el('div', { text: label }),
        el('div', { text: dw[1], title: dw[0] }),
        el('div', { text: Math.round(d.daily.temperature_2m_max[k]) + '° / ' + Math.round(d.daily.temperature_2m_min[k]) + '°' }),
        el('div', { 'class': 'wx-small', text: '☔ ' + d.daily.precipitation_probability_max[k] + '%' })
      ]));
    }
    box.appendChild(days);

    var err = api.store.get('weather.err', null);
    var foot = 'Updated ' + hhmm(cache.t);
    box.appendChild(el('div', { 'class': 'wx-small', text: foot + ' · Open-Meteo' }));
    if (!fresh || err) box.appendChild(el('div', { 'class': 'wx-stale', text: (err || 'Data may be old') + ' — showing last saved weather.' }));
    setAlerts(d);
  }

  MyDay.register({ id: 'weather', title: 'Weather', defaultOn: true, first: true, render: render });
  window.addEventListener('online', function() { MyDay.renderAll(); });
})();
