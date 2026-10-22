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
  var toastTimeout = null;

  function buildList() {
    channelList.innerHTML = '';

    state.items.forEach(function (item, idx) {
      var div = document.createElement('div');
      div.className = 'channel' +
        (item.type === 'category' || item.type === 'link' || item.type === 'action' ? ' category' : '') +
        (item.httpOnly ? ' http-only' : '');
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
        item.type === 'link' || item.type === 'action' ? (item.group || 'Link') :
        item.group || 'Live';

      info.appendChild(nameEl);
      info.appendChild(groupEl);

      div.appendChild(numberSpan);
      div.appendChild(img);
      div.appendChild(info);
      if (item.httpOnly) {
        var badge = document.createElement('span');
        badge.className = 'http-badge';
        badge.textContent = 'HTTP';
        badge.title = 'http:// stream: blocked on https pages';
        div.appendChild(badge);
      }
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

  // Columns actually rendered (TV5): tiles that share the first tile's row.
  function columns() {
    var tiles = channelList.children;
    if (!tiles.length) return 1;
    var top = tiles[0].offsetTop;
    var n = 0;
    while (n < tiles.length && Math.abs(tiles[n].offsetTop - top) < 2) n++;
    if (n === tiles.length && tiles.length > 1 && !channelList.offsetHeight) {
      // not laid out (e.g. display:none): fall back to the CSS grid
      var cols = getComputedStyle(channelList).gridTemplateColumns.split(' ').filter(Boolean).length;
      return Math.max(1, Math.min(cols || 1, tiles.length));
    }
    return Math.max(1, n);
  }

  // Short, non-blocking error message (TV5). Text only, auto-hides.
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = String(msg);
    el.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () {
      el.classList.remove('show');
    }, config.TOAST_DELAY);
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
    showList: showList,
    columns: columns,
    toast: toast
  };
})();
