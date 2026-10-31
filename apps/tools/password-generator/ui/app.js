/* Password Generator PG1 — UI app.
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
      });
    }

    ['lower', 'upper', 'digit', 'symbol'].forEach(function (key) {
      var el = document.getElementById('pg-' + key);
      if (el) {
        el.addEventListener('change', function () {
          state[key] = el.checked;
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
        out.select();
        try {
          document.execCommand('copy');
          copy.textContent = 'Copied';
          setTimeout(function () { copy.textContent = 'Copy'; }, 1200);
        } catch (e) {
          copy.textContent = 'Select & copy';
        }
      });
    }
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
