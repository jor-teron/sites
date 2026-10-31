/* Password Generator PG2 — UI app.
   Length slider, character-set checkboxes, generate, copy. */
(function () {
  'use strict';

  var state = {
    length: 16,
    lower: true,
    upper: true,
    digit: true,
    symbol: true
  };

  function render() {
    var root = document.getElementById('app');
    var pw = PG.generate(state);
    var str = PG.strength(pw);

    root.innerHTML =
      '<div class="pg-wrap">' +
        '<h1 class="pg-title">🔐 Password Generator</h1>' +
        '<div class="pg-result">' +
          '<input id="pg-out" type="text" readonly value="' + escapeHtml(pw) + '">' +
          '<button type="button" id="pg-copy">Copy</button>' +
        '</div>' +
        '<div class="pg-strength ' + str.cls + '">' + (str.label ? 'Strength: ' + str.label : '') + '</div>' +
        '<div class="pg-opts">' +
          '<div class="pg-row">' +
            '<label for="pg-len">Length</label>' +
            '<input id="pg-len" type="range" min="8" max="48" value="' + state.length + '">' +
            '<span class="pg-len" id="pg-len-val">' + state.length + '</span>' +
          '</div>' +
          '<div class="pg-checks">' +
            '<label><input type="checkbox" id="pg-lower"' + (state.lower ? ' checked' : '') + '> a-z</label>' +
            '<label><input type="checkbox" id="pg-upper"' + (state.upper ? ' checked' : '') + '> A-Z</label>' +
            '<label><input type="checkbox" id="pg-digit"' + (state.digit ? ' checked' : '') + '> 0-9</label>' +
            '<label><input type="checkbox" id="pg-symbol"' + (state.symbol ? ' checked' : '') + '> Symbols</label>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="pg-gen" id="pg-gen">Generate new</button>' +
        '<p class="pg-note">Generated in your browser. Nothing is sent anywhere.</p>' +
      '</div>';

    bind();
  }

  function bind() {
    var len = document.getElementById('pg-len');
    var lenVal = document.getElementById('pg-len-val');
    if (len) {
      len.addEventListener('input', function () {
        state.length = parseInt(len.value, 10);
        if (lenVal) lenVal.textContent = state.length;
        refresh();
      });
    }

    ['lower', 'upper', 'digit', 'symbol'].forEach(function (key) {
      var el = document.getElementById('pg-' + key);
      if (el) {
        el.addEventListener('change', function () {
          // Keep at least one set ticked.
          if (!el.checked && !['lower', 'upper', 'digit', 'symbol'].some(function (k) { return k !== key && state[k]; })) {
            el.checked = true;
            return;
          }
          state[key] = el.checked;
          refresh();
        });
      }
    });

    var gen = document.getElementById('pg-gen');
    if (gen) gen.addEventListener('click', render);

    var copy = document.getElementById('pg-copy');
    if (copy) {
      copy.addEventListener('click', function () {
        var out = document.getElementById('pg-out');
        if (!out) return;
        function done(ok) {
          copy.textContent = ok ? 'Copied' : 'Copy failed';
          setTimeout(function () { copy.textContent = 'Copy'; }, 1200);
        }
        function fallback() {
          out.select();
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
          done(ok);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(out.value).then(function () { done(true); }, fallback);
        } else {
          fallback();
        }
      });
    }
  }

  // New password into the existing output, without rebuilding the controls.
  function refresh() {
    var out = document.getElementById('pg-out');
    var st = document.querySelector('.pg-strength');
    var pw = PG.generate(state);
    var str = PG.strength(pw);
    if (out) out.value = pw;
    if (st) {
      st.className = 'pg-strength ' + str.cls;
      st.textContent = str.label ? 'Strength: ' + str.label : '';
    }
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
