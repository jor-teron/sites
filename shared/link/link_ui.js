/*
  Project: sites (shared)
  File: shared/link/link_ui.js
  Role: Small SharedLink widgets. mountDevices(el) keeps a live list of
  connected devices (name + green online dot) inside el; mountName(el)
  adds an editable "This device" name box. Plain DOM, no framework.
*/
(function () {
  'use strict';

  function mountDevices(box) {
    if (!box || !window.SharedLink) return;
    box.classList.add('sl-devices');
    function paint(list) {
      list = (list || SharedLink.devices).filter(function (d) { return d.id !== 'host'; });
      box.textContent = '';
      if (!list.length) {
        var e = document.createElement('div');
        e.className = 'sl-empty';
        e.textContent = 'No devices connected';
        box.appendChild(e);
        return;
      }
      list.forEach(function (d) {
        var row = document.createElement('div');
        row.className = 'sl-dev' + (d.online ? ' on' : '');
        var dot = document.createElement('span');
        dot.className = 'sl-dot';
        var n = document.createElement('span');
        n.textContent = d.name || 'Device';
        row.append(dot, n);
        box.appendChild(row);
      });
    }
    SharedLink.on('devices', paint);
    paint();
  }

  function mountName(box) {
    if (!box || !window.SharedLinkDevices) return;
    var label = document.createElement('label');
    label.className = 'sl-name';
    label.textContent = 'This device ';
    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 40;
    input.value = SharedLinkDevices.name();
    input.addEventListener('change', function () { input.value = SharedLinkDevices.setName(input.value); });
    label.appendChild(input);
    box.appendChild(label);
  }

  window.SharedLinkUI = { mountDevices: mountDevices, mountName: mountName };
})();
