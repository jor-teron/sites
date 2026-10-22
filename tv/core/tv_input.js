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

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      state.currentIndex = (state.currentIndex + 1) % items.length;
      TV.ui.highlight();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      state.currentIndex = (state.currentIndex - 1 + items.length) % items.length;
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

  TV.input = { onKeyDown: onKeyDown };
})();
