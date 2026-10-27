/* Harness — app/tools/time.js: get_time test tool (HR2). Returns local date/time as ISO with offset,
   a 12-hour string, the IANA time zone and UTC offset. */
HR.tools.register({
  name: 'get_time', where: 'browser',
  description: 'Get the current local date and time of the user (ISO 8601 with offset, 12-hour text, time zone).',
  parameters: { type: 'object', properties: {} },
  run: function () {
    var d = new Date(), off = -d.getTimezoneOffset(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var oz = (off >= 0 ? '+' : '-') + p(Math.floor(Math.abs(off) / 60)) + ':' + p(Math.abs(off) % 60);
    var iso = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + oz;
    var h = d.getHours();
    return {
      iso: iso,
      text: d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + (h % 12 || 12) + ':' + p(d.getMinutes()) + ' ' + (h < 12 ? 'AM' : 'PM'),
      timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''), utc_offset: oz
    };
  }
});
