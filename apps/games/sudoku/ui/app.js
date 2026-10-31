/* Sudoku SD1/SDQ1a — UI and logic.
   Click a cell, tap a number (or arrows + 1-9 / Backspace on a keyboard). Clashes show live. Check validates. New loads a random easy puzzle. */
(function () {
  'use strict';

  var board = [];
  var given = [];
  var selected = -1;
  var status = '';
  var refocus = false;

  function loadPuzzle() {
    var p = SD_PUZZLES[Math.floor(Math.random() * SD_PUZZLES.length)];
    board = p.slice();
    given = p.map(function (n) { return n !== 0; });
    selected = -1;
    status = '';
    render();
  }

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
        '<div class="sd-pad">' + pad + '</div>' +
        '<div class="sd-status' + (status === 'ok' ? ' ok' : status ? ' bad' : '') + '" aria-live="polite">' +
          (status === 'ok' ? 'Correct!' : status === 'bad' ? 'Some numbers are wrong' : status || 'Tap a cell, then a number') +
        '</div>' +
        '<div class="sd-actions">' +
          '<button type="button" class="primary" id="sd-check">Check</button>' +
          '<button type="button" id="sd-new">New puzzle</button>' +
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

  function put(n) { if (selected < 0 || given[selected]) return; board[selected] = n; status = ''; render(); }

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

    var neu = document.getElementById('sd-new');
    if (neu) neu.addEventListener('click', loadPuzzle);
  }

  function doCheck() {
    var n = clashes().filter(Boolean).length;
    if (board.some(function (n) { return n === 0; })) {   // SDQ1a: an unfinished board is not "wrong"
      status = 'Not finished yet' + (n ? ' \u00b7 ' + n + ' cells clash' : '');
      render();
      return;
    }
    if (isValid()) status = 'ok';
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

  loadPuzzle();
})();
