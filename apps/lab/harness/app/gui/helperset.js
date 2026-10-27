/* Harness — app/gui/helperset.js: Settings → Helper (HR5). On / Off (default Off), URL, token (password field), Test
   button and a status line. Turning On or Test calls HR.helper.test(); run_shell is offered only while the test passed. */
HR.helperSet = (function () {
  var stat;
  function paint(s, i) {
    if (!stat) return;
    stat.textContent = s === 'ok' ? '✓ Connected · helper ' + (i.version || '') + ' · root ' + (i.root || '') + ' — run_shell is available (every command asks first).'
      : s === 'checking' ? 'Checking…' : s === 'fail' ? '✕ ' + ((i && i.error) || 'Not connected') : 'Off. Start the helper, paste its token, turn On and Test.';
    stat.className = 'hint' + (s === 'fail' ? ' warn' : '');
  }
  function draw() {
    document.getElementById('setHelperUrl').value = HR.helper.url();
    document.getElementById('setHelperTok').value = HR.set.get('helperToken') || '';
    paint(HR.helper.state(), HR.helper.info());
  }
  function init() {
    stat = document.getElementById('helperStat');
    var u = document.getElementById('setHelperUrl'), t = document.getElementById('setHelperTok');
    u.addEventListener('change', function () { var v = u.value.trim().replace(/\/+$/, '') || 'http://127.0.0.1:11500'; if (!/^https?:\/\//.test(v)) v = 'http://' + v; HR.set.put('helperUrl', v); u.value = v; });
    t.addEventListener('change', function () { HR.set.put('helperToken', t.value.trim()); });
    document.getElementById('btnHelperTest').onclick = function () {
      HR.set.put('helperToken', t.value.trim()); u.dispatchEvent(new Event('change'));
      if (HR.set.get('helper') !== 'on') { HR.set.put('helper', 'on'); HR.set.redraw(); }
      HR.helper.test();
    };
    HR.helper.onChange(paint);
    document.getElementById('btnSet').addEventListener('click', draw);
    if (HR.set.get('helper') === 'on') HR.helper.test(); else paint('off');
  }
  return { init: init };
})();
