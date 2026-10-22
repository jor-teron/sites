/*
 * TV: input (tv/core/tv_input.js)
 * Remote / keyboard: arrows move (wrapping), Enter or Space plays, digits
 * zap to a channel number after NUMBER_DELAY. Any other key, a click or a
 * tap (touch fires click) shows the grid.
 */
(function () {
  'use strict';
  var TV = window.TV;
  var config = TV.config;
  var state = TV.state;
  var numberBuffer = '';
  var numberTimeout = null;

  // Next tile for an arrow key in a grid of `count` tiles and `cols` columns
  // (TV5). Left / Right: one tile, wrapping end <-> start. Up / Down: one row,
  // same column. Down from the row above a short last row (no tile below)
  // goes to the last tile; Down from the last row wraps to the top row,
  // Up from the top row wraps to the bottom of that column.
  function move(index, key, count, cols) {
    if (count <= 0) return -1;
    cols = Math.max(1, Math.min(cols || 1, count));
    if (index < 0 || index >= count) return 0;
    var col = index % cols;
    var lastRowStart = Math.floor((count - 1) / cols) * cols;
    if (key === 'ArrowRight') return (index + 1) % count;
    if (key === 'ArrowLeft') return (index - 1 + count) % count;
    if (key === 'ArrowDown') {
      if (index + cols < count) return index + cols;
      if (index < lastRowStart) return count - 1;
      return col;
    }
    if (key === 'ArrowUp') {
      if (index - cols >= 0) return index - cols;
      var target = lastRowStart + col;
      return target < count ? target : target - cols;
    }
    return index;
  }

  function handleNumberInput(digit) {
    numberBuffer += digit;
    TV.ui.showNumber(numberBuffer);

    clearTimeout(numberTimeout);
    numberTimeout = setTimeout(function () {
      var channelNum = parseInt(numberBuffer, 10);
      if (!isNaN(channelNum) && channelNum >= 1 && channelNum <= state.items.length) {
        TV.app.activate(channelNum - 1);
      }
      numberBuffer = '';
      TV.ui.hideNumber();
    }, config.NUMBER_DELAY);
  }

  function onKeyDown(e) {
    var items = state.items;
    // Digits: number zap only; never open the list, never force-close it.
    if (e.key >= '0' && e.key <= '9') {
      if (items.length === 0) return;
      handleNumberInput(e.key);
      return;
    }

    // Browse / GUI: arrows, Enter, etc. open the channel list.
    TV.ui.showList();
    if (items.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      state.currentIndex = move(state.currentIndex, e.key, items.length, TV.ui.columns());
      TV.ui.highlight();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      TV.app.activate(state.currentIndex);
    }
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('click', function () {
    TV.ui.showList();
  });

  TV.input = { onKeyDown: onKeyDown, move: move };
})();
