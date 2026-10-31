/* Sudoku SD1 — UI and logic.
   Click a cell, tap a number. Check button validates. New loads a random easy puzzle. */
(function () {
  'use strict';

  var board = [];
  var given = [];
  var selected = -1;
  var status = '';

  function loadPuzzle() {
    var p = SD_PUZZLES[Math.floor(Math.random() * SD_PUZZLES.length)];
    board = p.slice();
    given = p.map(function (n) { return n !== 0; });
    selected = -1;
    status = '';
    render();
  }

  function render() {
    var cells = board.map(function (n, i) {
      var cls = 'sd-cell';
      if (given[i]) cls += ' given';
      if (i === selected) cls += ' selected';
      return '<div class="' + cls + '" data-i="' + i + '">' + (n || '') + '</div>';
    }).join('');

    var pad = '';
    for (var d = 1; d <= 9; d++) pad += '<button type="button" data-n="' + d + '">' + d + '</button>';
    pad += '<button type="button" data-n="0">✕</button>';

    document.getElementById('app').innerHTML =
      '<div class="sd-wrap">' +
        '<h1 class="sd-title">🔢 Sudoku</h1>' +
        '<div class="sd-board">' + cells + '</div>' +
        '<div class="sd-pad">' + pad + '</div>' +
        '<div class="sd-status' + (status === 'ok' ? ' ok' : status === 'bad' ? ' bad' : '') + '">' +
          (status === 'ok' ? 'Correct!' : status === 'bad' ? 'Some numbers are wrong' : 'Tap a cell, then a number') +
        '</div>' +
        '<div class="sd-actions">' +
          '<button type="button" class="primary" id="sd-check">Check</button>' +
          '<button type="button" id="sd-new">New puzzle</button>' +
        '</div>' +
      '</div>';

    bind();
  }

  function bind() {
    document.querySelectorAll('.sd-cell').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = parseInt(el.getAttribute('data-i'), 10);
        if (given[i]) return;
        selected = i;
        status = '';
        render();
      });
    });

    document.querySelectorAll('.sd-pad button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (selected < 0 || given[selected]) return;
        var n = parseInt(btn.getAttribute('data-n'), 10);
        board[selected] = n;
        status = '';
        render();
      });
    });

    var check = document.getElementById('sd-check');
    if (check) check.addEventListener('click', doCheck);

    var neu = document.getElementById('sd-new');
    if (neu) neu.addEventListener('click', loadPuzzle);
  }

  function doCheck() {
    if (board.some(function (n) { return n === 0; })) {
      status = 'bad';
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
