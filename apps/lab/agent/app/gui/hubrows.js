/* Agent — app/gui/hubrows.js: Settings and the Hub's keys (AG9, AG10). HR.hubRows.paint() after each Settings draw.
   AG10: inside the Hub (window.top.HubKeys) every key / base field (.hub-hide: Ollama URL, OpenAI-compatible base,
   API key + note, Tavily key + note) is hidden and the Model / Web cards show one line "Keys come from Hub › API Keys"
   with ✓ / "not set" for the key in use and an Open button (HubKeys.open(name)). Standalone: the fields show as before.
   Hub values are never shown or copied. Hub key changes repaint open Settings and reload models. */
HR.hubRows = (function () {
  function modelKey() {
    var p = HR.models.def(), b = HR.models.base(p);
    return p === 'browser' ? '' : p === 'ollama' ? 'ollama_url' : HR.hubKeys.forProvider(p, b) || 'openai_key';
  }
  function line(id, n, what) {
    var el = document.getElementById(id); if (!el) return;
    el.hidden = !n; el.innerHTML = ''; if (!n) return;
    var t = document.createElement('span'), b = document.createElement('button');
    t.textContent = 'Keys come from Hub › API Keys · ' + n + (HR.hubKeys.has(n) ? ' ✓' : ' not set' + (what ? ' (' + what + ')' : ''));
    t.className = HR.hubKeys.has(n) ? 'hub-ok' : 'hub-no';
    b.type = 'button'; b.className = 'hb wide hub-open'; b.textContent = 'Open'; b.onclick = function () { HR.hubKeys.open(n); };
    el.append(t, b);
  }
  function paint() {
    var inHub = HR.hubKeys.inHub();
    [].forEach.call(document.querySelectorAll('#settings .hub-hide'), function (e) { e.hidden = inHub; });
    var p = HR.models.def();
    line('hubModelLine', inHub ? modelKey() : '', p === 'ollama' ? 'default http://localhost:11434' : 'needed for ' + p);
    line('hubWebLine', inHub ? 'tavily' : '', 'web tools stay hidden');
  }
  function init() {
    HR.hubKeys.onChange(function (n) {
      var d = document.getElementById('settings'); if (d && d.open) { HR.set.redraw(); HR.provider.draw(); }
      if (n !== 'tavily') HR.model.load();
    });
  }
  return { init: init, paint: paint };
})();
