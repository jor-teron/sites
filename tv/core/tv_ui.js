/*
 * TV: UI (tv/core/tv_ui.js)
 * Channel grid (built with textContent, never innerHTML for list data),
 * highlight, the big number display and grid show / auto-hide.
 */
(function () {
  'use strict';
  var TV = window.TV;
  var config = TV.config;
  var state = TV.state;
  var channelList = document.getElementById('channel-list');
  var hideTimeout = null;

  function buildList() {
    channelList.innerHTML = '';

    state.items.forEach(function (item, idx) {
      var div = document.createElement('div');
      div.className = 'channel' + (item.type === 'category' || item.type === 'link' ? ' category' : '');
      div.dataset.index = String(idx);

      var numberSpan = document.createElement('div');
      numberSpan.className = 'channel-number';
      numberSpan.textContent = idx + 1 + '.';

      var img = document.createElement('img');
      img.alt = '';
      img.src = item.logo || config.PLACEHOLDER_LOGO;
      img.onerror = function () {
        img.src = config.PLACEHOLDER_LOGO;
      };

      var info = document.createElement('div');
      info.className = 'channel-info';

      var nameEl = document.createElement('div');
      nameEl.className = 'channel-name';
      nameEl.textContent = item.name;

      var groupEl = document.createElement('div');
      groupEl.className = 'channel-group';
      groupEl.textContent =
        item.type === 'category' ? 'Category' :
        item.type === 'link' ? (item.group || 'Link') :
        item.group || 'Live';

      info.appendChild(nameEl);
      info.appendChild(groupEl);

      div.appendChild(numberSpan);
      div.appendChild(img);
      div.appendChild(info);
      div.onclick = function () {
        TV.app.activate(idx);
      };
      channelList.appendChild(div);
    });
  }

  function highlight() {
    document.querySelectorAll('.channel').forEach(function (el) {
      el.classList.remove('active');
    });
    var active = document.querySelector('.channel[data-index="' + state.currentIndex + '"]');
    if (active) {
      active.classList.add('active');
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function showNumber(num) {
    var display = document.getElementById('number-display');
    if (!display) {
      display = document.createElement('div');
      display.id = 'number-display';
      document.body.appendChild(display);
    }
    display.textContent = num;
    display.style.display = 'block';
  }

  function hideNumber() {
    var display = document.getElementById('number-display');
    if (display) display.style.display = 'none';
  }

  function startHideTimer() {
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(function () {
      channelList.classList.add('hidden');
    }, config.HIDE_DELAY);
  }

  function showList() {
    channelList.classList.remove('hidden');
    startHideTimer();
  }

  TV.ui = {
    buildList: buildList,
    highlight: highlight,
    showNumber: showNumber,
    hideNumber: hideNumber,
    startHideTimer: startHideTimer,
    showList: showList
  };
})();
