/* Agent — app/gui/browsercard.js: the Browser model's tap-to-download card in the chat and Settings → Browser model (AG2).
   show(): card with the sizes (model + engine, once) and a Download button; nothing is fetched before the tap.
   While downloading: progress bar + MB, Cancel. Done -> setting browserModel 'ready' (remembered), card says ready.
   check(): card unless the model is really cached. Settings: status line + "Remove browser model" (deletes our cache). */
HR.bcard = (function () {
  var card = null, ctrl = null, $ = function (id) { return document.getElementById(id); };
  function mb(b) { return (b / 1048576).toFixed(1); }
  function hide() { if (card && !ctrl) { card.remove(); card = null; } }
  function show() {
    if (card && card.isConnected) { HR.view.bottom(true); return; }
    var v = HR.view, s = HR.browser.size;
    card = v.el('div', 'dcard');
    var t = v.el('div', 'ec-t', '📦 Browser model · Story Mini'), p = v.el('div', 'ec-b'),
      bar = v.el('progress', 'dbar'), st = v.el('div', 'hint'), row = v.el('div', 'ec-row start'),
      go = v.el('button', 'hb wide', 'Download ' + Math.round(s.model + s.engine) + ' MB'), x = v.el('button', 'hb', '✕');
    p.textContent = 'Runs in this browser with no Ollama and no API key. One-time download: model ' + s.model + ' MB (TinyStories-3M from Hugging Face) + engine '
      + s.engine + ' MB (about 3 MB compressed, from this site). Uses Wi-Fi or mobile data. It writes short children\'s stories — tools are off. Remove it any time in Settings ⚙.';
    bar.hidden = true; go.type = x.type = 'button'; x.setAttribute('aria-label', 'Dismiss');
    x.onclick = function () { if (ctrl) ctrl.abort(); ctrl = null; hide(); };
    go.onclick = function () {
      if (ctrl) { ctrl.abort(); return; }
      ctrl = new AbortController(); go.textContent = 'Cancel'; bar.hidden = false; bar.removeAttribute('value'); st.textContent = 'Starting the engine…';
      HR.browser.download(function (l, tot) { bar.max = tot; bar.value = l; st.textContent = mb(l) + ' / ' + mb(tot) + ' MB'; }, ctrl.signal).then(function () {
        ctrl = null; t.textContent = '✓ Browser model ready'; p.textContent = 'Story Mini is saved in this browser. Type the start of a story (e.g. "Once upon a time, a cat") and send.';
        bar.hidden = true; st.textContent = ''; row.hidden = true; HR.steps.note('Browser model downloaded and cached (' + HR.browser.id + ').');
        if (document.hidden) HR.notify({ icon: '📦', title: 'Agent', text: 'Browser model ready', onClick: function () { window.focus(); } });
        setTimeout(hide, 6000);
      }, function (e) {
        ctrl = null; go.textContent = 'Download ' + Math.round(s.model + s.engine) + ' MB'; bar.hidden = true;
        st.textContent = e.kind === 'abort' ? 'Cancelled. Files already fetched stay cached.' : '⚠️ ' + e.message;
      });
    };
    row.append(go, x); card.append(t, p, bar, st, row);
    var h = document.querySelector('#log .hello'); if (h) h.remove();
    $('log').appendChild(card); v.bottom(true);
  }
  function check() {
    if (!HR.browser.ready()) { show(); return; }
    HR.browser.cached().then(function (ok) { if (ok) hide(); else { HR.set.put('browserModel', ''); show(); } });
  }
  function draw() {
    var on = HR.browser.ready(); $('btnBrowserRm').disabled = !on;
    $('browserStat').textContent = on ? 'Story Mini (' + HR.browser.id + ') is downloaded in this browser (~' + HR.browser.size.model + ' MB).'
      : 'Not downloaded. Pick Browser above (or use it when another provider is offline) and tap Download in the chat.';
  }
  function init() {
    $('btnSet').addEventListener('click', draw);
    $('btnBrowserRm').onclick = function () {
      if (HR.chat.busy() && HR.models.id() === 'browser') return;
      HR.browser.remove().then(function () { draw(); $('browserStat').textContent = 'Removed. Space freed.'; if (HR.models.id() === 'browser') HR.model.load(HR.models.fallen()); });
    };
  }
  return { show: show, hide: hide, check: check, draw: draw, init: init };
})();
