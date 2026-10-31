/* Sudoku SD1/SDQ1a/SDQ1b — UI and logic.
   Click a cell, tap a number (or arrows + 1-9 / Backspace on a keyboard). Clashes show live. Check validates.
   SDQ1b: 1000 seeded levels (core/gen.js); type a level 000-999 and Go. Last level, per-level progress and solved levels persist in localStorage ('sudoku.*'). */
(function () {
  'use strict';

  var board = [];
  var given = [];
  var selected = -1;
  var status = '';
  var refocus = false;
  var level = 0;
  var MAX_SAVED = 60;   // SDQ1b: cap on levels with saved progress (oldest dropped)

  // SDQ1b: storage helpers; any corrupt or missing value is ignored
  function lsGet(k, def) { try { var v = JSON.parse(localStorage.getItem('sudoku.' + k)); return v == null ? def : v; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem('sudoku.' + k, JSON.stringify(v)); } catch (e) {} }
  function pad3(n) { return ('00' + n).slice(-3); }

  function saveProgress() {
    var prog = lsGet('progress', {}), order = lsGet('order', []);
    if (typeof prog !== 'object' || Array.isArray(prog)) prog = {};
    if (!Array.isArray(order)) order = [];
    var s = board.map(function (n, i) { return given[i] ? 0 : n; }).join('');
    order = order.filter(function (l) { return l !== level; });
    if (/[1-9]/.test(s)) { prog[level] = s; order.push(level); } else delete prog[level];
    while (order.length > MAX_SAVED) delete prog[order.shift()];
    lsSet('progress', prog); lsSet('order', order); lsSet('last', level);
  }

  function loadLevel(l) {
    level = l;
    var p = SD_GEN.generate(l).puzzle, prog = lsGet('progress', {}), s = prog && prog[l];
    board = p.slice();
    given = p.map(function (n) { return n !== 0; });
    if (typeof s === 'string' && /^[0-9]{81}$/.test(s)) for (var i = 0; i < 81; i++) if (!given[i] && s[i] !== '0') board[i] = +s[i];
    selected = -1;
    status = '';
    lsSet('last', l);
    render();
  }

  function goLevel() {   // SDQ1b: digits only; empty/letters ignored kindly, >999 clamped
    var el = document.getElementById('sd-level'), v = String(el ? el.value : '').replace(/\D/g, '');
    if (!v) { status = 'Type a level from 000 to 999'; render(); return; }
    saveProgress();
    loadLevel(Math.min(999, parseInt(v, 10)));
  }

  function isSolved(l) { var s = lsGet('solved', []); return Array.isArray(s) && s.indexOf(l) >= 0; }

  function render() {
    var bad = clashes();
    var cells = board.map(function (n, i) {
      var cls = 'sd-cell', r = Math.floor(i / 9), c = i % 9;
      cls += given[i] ? ' given' : n ? ' user' : '';
      if (bad[i]) cls += ' bad';
      if (i === selected) cls += ' selected';
      var lab = 'Row ' + (r + 1) + ' column ' + (c + 1) + ', ' + (n ? n + (given[i] ? ', given' : '') + (bad[i] ? ', clash' : '') : 'empty');
      // SDQ1a: grid tracks hold the thick box lines, so place each cell explicitly; roving tabindex for keyboard play
      return '<div class="' + cls + '" data-i="' + i + '" role="gridcell" aria-label="' + lab + '" tabindex="' + (i === (selected < 0 ? 0 : selected) ? 0 : -1) +
        '" style="grid-row:' + (r + 1 + Math.floor(r / 3)) + ';grid-column:' + (c + 1 + Math.floor(c / 3)) + '">' + (n || '') + '</div>';
    }).join('');

    var pad = '';
    for (var d = 1; d <= 9; d++) pad += '<button type="button" data-n="' + d + '">' + d + '</button>';
    pad += '<button type="button" data-n="0">✕</button>';

    document.getElementById('app').innerHTML =
      '<div class="sd-wrap">' +
        '<h1 class="sd-title">🔢 Sudoku</h1>' +
        '<div class="sd-board" role="grid" aria-label="Sudoku board">' + cells + '</div>' +
        '<div class="sd-side">' +
        '<div class="sd-level"><span class="sd-label">Level ' + pad3(level) + ' \u00b7 ' + SD_GEN.band(level) + (isSolved(level) ? ' \u2713' : '') + '</span>' +
          '<input id="sd-level" type="text" inputmode="numeric" maxlength="3" pattern="[0-9]*" aria-label="Level number 000 to 999" placeholder="000" value="' + pad3(level) + '">' +
          '<button type="button" id="sd-go">Go</button></div>' +
        '<div class="sd-pad">' + pad + '</div>' +
        '<div class="sd-status' + (status === 'ok' ? ' ok' : status ? ' bad' : '') + '" aria-live="polite">' +
          (status === 'ok' ? 'Correct!' : status === 'bad' ? 'Some numbers are wrong' : status || 'Tap a cell, then a number') +
        '</div>' +
        '<div class="sd-actions">' +
          '<button type="button" class="primary" id="sd-check">Check</button>' +
        '</div>' +
        '</div>' +
      '</div>';

    bind();
    if (refocus && selected >= 0) document.querySelector('.sd-cell[data-i="' + selected + '"]').focus();
    refocus = false;
  }

  function clashes() {   // SDQ1a: cells sharing a number with another cell in their row, column or box
    var bad = [];
    for (var i = 0; i < 81; i++) for (var j = i + 1; j < 81; j++) {
      if (!board[i] || board[i] !== board[j]) continue;
      var ri = Math.floor(i / 9), rj = Math.floor(j / 9), ci = i % 9, cj = j % 9;
      if (ri === rj || ci === cj || (Math.floor(ri / 3) === Math.floor(rj / 3) && Math.floor(ci / 3) === Math.floor(cj / 3))) bad[i] = bad[j] = 1;
    }
    return bad;
  }

  function put(n) { if (selected < 0 || given[selected]) return; board[selected] = n; status = ''; saveProgress(); render(); }

  function onKey(e) {   // SDQ1a: keyboard play on the focused cell
    var i = selected < 0 ? 0 : selected, k = e.key, mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[k];
    if (mv) {
      var r = Math.floor(i / 9), c = i % 9;
      if ((k === 'ArrowLeft' && c === 0) || (k === 'ArrowRight' && c === 8) || (k === 'ArrowUp' && r === 0) || (k === 'ArrowDown' && r === 8)) { e.preventDefault(); return; }
      selected = i + mv;
    } else if (/^[1-9]$/.test(k)) { selected = i; refocus = true; put(+k); e.preventDefault(); return; }
    else if (k === 'Backspace' || k === 'Delete' || k === '0') { selected = i; refocus = true; put(0); e.preventDefault(); return; }
    else return;
    e.preventDefault(); refocus = true; render();
  }

  function bind() {
    document.querySelectorAll('.sd-cell').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = parseInt(el.getAttribute('data-i'), 10);
        if (given[i]) return;
        selected = i;
        status = '';
        refocus = true;   // SDQ1a: keep the keyboard on the board after a tap
        render();
      });
    });

    document.querySelectorAll('.sd-pad button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (selected < 0 || given[selected]) return;
        var n = parseInt(btn.getAttribute('data-n'), 10);
        put(n);
      });
    });

    var bd = document.querySelector('.sd-board');
    if (bd) bd.addEventListener('keydown', onKey);
    var check = document.getElementById('sd-check');
    if (check) check.addEventListener('click', doCheck);

    var go = document.getElementById('sd-go'), inp = document.getElementById('sd-level');
    if (go) go.addEventListener('click', goLevel);
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); goLevel(); } });
  }

  function doCheck() {
    var n = clashes().filter(Boolean).length;
    if (board.some(function (n) { return n === 0; })) {   // SDQ1a: an unfinished board is not "wrong"
      status = 'Not finished yet' + (n ? ' \u00b7 ' + n + ' cells clash' : '');
      render();
      return;
    }
    if (isValid()) {
      status = 'ok';
      var sv = lsGet('solved', []);
      if (!Array.isArray(sv)) sv = [];
      if (sv.indexOf(level) < 0) { sv.push(level); lsSet('solved', sv); }
    }
    else status = 'bad';
    render();
  }

  function isValid() {
    function unique(arr) {
      var s = {};
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] < 1 || arr[i] > 9 || s[arr[i]]) return false;
        s[arr[i]] = 1;
      }
      return true;
    }
    for (var r = 0; r < 9; r++) {
      var row = [];
      for (var c = 0; c < 9; c++) row.push(board[r * 9 + c]);
      if (!unique(row)) return false;
    }
    for (var c2 = 0; c2 < 9; c2++) {
      var col = [];
      for (var r2 = 0; r2 < 9; r2++) col.push(board[r2 * 9 + c2]);
      if (!unique(col)) return false;
    }
    for (var br = 0; br < 3; br++) {
      for (var bc = 0; bc < 3; bc++) {
        var box = [];
        for (var i = 0; i < 3; i++) {
          for (var j = 0; j < 3; j++) {
            box.push(board[(br * 3 + i) * 9 + (bc * 3 + j)]);
          }
        }
        if (!unique(box)) return false;
      }
    }
    return true;
  }

  var last = lsGet('last', 0);
  loadLevel(typeof last === 'number' && last >= 0 && last <= 999 ? Math.floor(last) : 0);
})();
