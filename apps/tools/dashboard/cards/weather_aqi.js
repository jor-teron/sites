/* Weather add-on (PD3): Air quality via Open-Meteo air-quality API (free, no key).
   MDAqi.render(box, api, place) appends a coloured US-AQI pill + PM2.5 inside the Weather card.
   Cache in store 'weather.aqi' {t,key,aqi,pm}; refresh if older than 30 min. Hidden when no data (offline).
   AQI > 100 pushes a top-strip alert 'wx-aqi'. */
(function(){
  var API = 'https://air-quality-api.open-meteo.com/v1/air-quality';
  var MAX_AGE = 30 * 60 * 1000, busy = false, lastTry = 0;
  /* US AQI bands -> [max, label, class] */
  var BANDS = [[50,'Good','g'],[100,'Moderate','m'],[150,'Unhealthy for sensitive','s'],[200,'Unhealthy','u'],[300,'Very unhealthy','v'],[1e9,'Hazardous','h']];
  function band(a){ for (var i = 0; i < BANDS.length; i++) if (a <= BANDS[i][0]) return BANDS[i]; }
  function fetchAqi(api, place){
    if (busy) return; busy = true; lastTry = Date.now();
    fetch(API + '?latitude=' + place.lat + '&longitude=' + place.lon + '&current=us_aqi,pm2_5&timezone=auto')
      .then(function(r){ if (!r.ok) throw 0; return r.json(); })
      .then(function(j){ var c = j.current || {}; if (c.us_aqi == null) throw 0;
        api.store.set('weather.aqi', { t: Date.now(), key: place.lat + ',' + place.lon, aqi: c.us_aqi, pm: c.pm2_5 });
        busy = false; api.rerender(); })
      .catch(function(){ busy = false; });
  }
  function render(box, api, place){
    var key = place.lat + ',' + place.lon, c = api.store.get('weather.aqi', null);
    if (c && c.key !== key) c = null;
    if ((!c || Date.now() - c.t > MAX_AGE) && !busy && Date.now() - lastTry > 60000 && navigator.onLine !== false)
      setTimeout(function(){ fetchAqi(api, place); }, 0);
    if (!c || Date.now() - c.t > 6 * 3600 * 1000) { MyDay.clearAlert('wx-aqi'); return; }
    var a = Math.round(c.aqi), b = band(a);
    box.appendChild(api.el('div', { 'class': 'aqi-row' }, [
      api.el('span', { 'class': 'aqi-pill aqi-' + b[2], title: 'US AQI' }, ['AQI ' + a + ' · ' + b[1]]),
      c.pm != null ? api.el('span', { 'class': 'wx-small', text: 'PM2.5 ' + Math.round(c.pm) + ' µg/m³' }) : null
    ]));
    if (a > 100) MyDay.alert('wx-aqi', '😷 Air quality ' + b[1].toLowerCase() + ' (AQI ' + a + ')', a > 150 ? 'high' : 'med');
    else MyDay.clearAlert('wx-aqi');
  }
  window.MDAqi = { render: render };
})();
