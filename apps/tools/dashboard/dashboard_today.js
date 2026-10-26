/* My Day — Today strip (PD3): weekday/date line, today's fixed-date holiday, counts "3 todos · 2 events left".
   Holidays come from the Calendar app (../calendar/calendar_holidays.js, window.CalHolidays).
   Refreshes on the clock tick and whenever MDStore saves 'todo' or 'schedule'. */
(function(){
  function draw(){
    var host = document.getElementById('today'); if (!host) return;
    var d = new Date(), p = function(n){ return (n < 10 ? '0' : '') + n; };
    var iso = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    var hol = window.CalHolidays ? CalHolidays.get(iso) : null;
    var todos = (MDStore.get('todo', []) || []).filter(function(x){ return !x.done; }).length;
    var now = d.getHours() * 60 + d.getMinutes();
    var ev = (MDStore.get('schedule', []) || []).filter(function(x){ var t = (x.time || '0:0').split(':'); return +t[0] * 60 + +t[1] > now; }).length;
    host.innerHTML = '';
    if (hol) host.appendChild(MyDay.el('span', { 'class': 'td-pill td-hol', text: '🎉 ' + hol[0] }));
    host.appendChild(MyDay.el('span', { 'class': 'td-pill', text: '✅ ' + todos + ' todo' + (todos === 1 ? '' : 's') + ' · 📅 ' + ev + ' event' + (ev === 1 ? '' : 's') + ' left' }));
  }
  var set = MDStore.set;
  MDStore.set = function(k, v){ set(k, v); if (k === 'todo' || k === 'schedule') draw(); };
  var tick = MyDay.tick;
  MyDay.tick = function(){ tick(); draw(); };
  window.MDToday = { draw: draw };
})();
