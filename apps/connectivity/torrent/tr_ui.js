/* Torrent — tr_ui.js: multi-card list, file picks, player, settings, peers hint. TR3–TR5 */
(function (root) {
  'use strict';

  var H = root.TRHelpers;

  function createUi(els) {
    var playHandlers = { onPlay: null, onToggleFile: null, onPause: null, onResume: null, onRemove: null, onSeed: null };

    function setStatus(text, kind) {
      if (!els.status) return;
      els.status.textContent = text || '';
      els.status.classList.remove('error', 'busy', 'warn');
      if (kind) els.status.classList.add(kind);
    }

    function setFolderRow(save) {
      if (!els.folderRow) return;
      var st = save.state();
      if (st === 'unsupported') {
        els.folderRow.hidden = true;
        if (els.folderFallback) {
          els.folderFallback.hidden = false;
          els.folderFallback.textContent =
            'This browser cannot pick a save folder. Finished files go to your normal Downloads folder.';
        }
        if (els.btnChoose) els.btnChoose.hidden = true;
        if (els.btnReconnect) els.btnReconnect.hidden = true;
        return;
      }
      els.folderRow.hidden = false;
      if (els.folderFallback) els.folderFallback.hidden = true;
      if (els.btnChoose) els.btnChoose.hidden = false;
      var label = '';
      if (st === 'ready') label = 'Saving to: ' + (save.folderName() || 'folder');
      else if (st === 'need') label = 'Folder remembered — tap Reconnect to allow access';
      else label = 'No folder chosen — finished files download normally';
      if (els.folderLabel) els.folderLabel.textContent = label;
      if (els.btnReconnect) els.btnReconnect.hidden = st !== 'need';
    }

    function setSettingsForm(settings) {
      if (!settings) return;
      if (els.inUp) els.inUp.value = settings.uploadLimitKBs < 0 ? '' : String(settings.uploadLimitKBs);
      if (els.inDown) els.inDown.value = settings.downloadLimitKBs < 0 ? '' : String(settings.downloadLimitKBs);
      if (els.chkSeedDefault) els.chkSeedDefault.checked = settings.seedDefault !== false;
    }

    function statusLabel(snap) {
      switch (snap.status) {
        case 'seeding': return 'Seeding';
        case 'done': return 'Finished';
        case 'downloading': return 'Downloading';
        case 'looking': return 'Looking for peers…';
        case 'queued': return 'Queued';
        case 'paused': return 'Paused';
        default: return snap.status || '';
      }
    }

    function renderFiles(snap) {
      if (!snap.files || !snap.files.length) {
        return '<p class="muted">Waiting for file list…</p>';
      }
      return '<ul class="file-list">' + snap.files.map(function (f) {
        var id = 'f-' + snap.id + '-' + encodeURIComponent(f.path).replace(/%/g, '');
        var note = f.mayNotPlay ? ' <em class="codec-note">may not play</em>' : '';
        var playBtn = f.playable
          ? ('<button type="button" class="btn btn-tiny" data-act="play" data-id="' + snap.id +
            '" data-path="' + escapeAttr(f.path) + '">Play</button>')
          : '';
        return '<li>' +
          '<label class="file-check">' +
          '<input type="checkbox" data-act="file" data-id="' + snap.id + '" data-path="' + escapeAttr(f.path) + '"' +
          (f.selected ? ' checked' : '') + '>' +
          '<span>' + escapeHtml(f.name) + ' <span class="mute">(' + H.formatBytes(f.length) + ', ' +
          H.formatPct(f.progress) + ')</span>' + note + '</span>' +
          '</label>' + playBtn +
          '</li>';
      }).join('') + '</ul>';
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function escapeAttr(s) {
      return escapeHtml(s).replace(/\n/g, ' ');
    }

    function renderCard(snap) {
      var rem = Math.max(0, (snap.length || 0) - (snap.downloaded || 0));
      var eta = snap.done ? 'Done' : ('ETA ' + H.formatEta(rem, snap.downloadSpeed));
      var seedChecked = snap.seed ? ' checked' : '';
      var peersHint = snap.noPeers
        ? ('<div class="peers-hint"><strong>No WebTorrent peers</strong>' +
          'Browsers only reach WebTorrent / WebRTC peers — not ordinary qBittorrent or µTorrent seeds. ' +
          'Try a torrent also seeded by WebTorrent, one with web seeds, or wait and tap Resume later.</div>')
        : '';
      return '<article class="card" data-id="' + snap.id + '">' +
        '<div class="card-head">' +
        '<div class="card-name">' + escapeHtml(snap.name) + '</div>' +
        '<div class="card-status">' + escapeHtml(statusLabel(snap)) + '</div>' +
        '</div>' +
        '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
        Math.floor((snap.progress || 0) * 100) + '"><span style="width:' + H.formatPct(snap.progress) + '"></span></div>' +
        '<div class="card-meta">' +
        '<span class="mute">' + H.formatPct(snap.progress) + '</span>' +
        '<span>' + H.formatBytes(snap.downloaded) + ' / ' + H.formatBytes(snap.length) + '</span>' +
        '<span>↓ ' + H.formatSpeed(snap.downloadSpeed) + '</span>' +
        '<span>↑ ' + H.formatSpeed(snap.uploadSpeed) + '</span>' +
        '<span>' + snap.numPeers + (snap.numPeers === 1 ? ' peer' : ' peers') + '</span>' +
        '<span>' + eta + '</span>' +
        '<span>Ratio ' + escapeHtml(snap.ratio) + '</span>' +
        '<span>↑ total ' + H.formatBytes(snap.uploaded) + '</span>' +
        '</div>' +
        peersHint +
        '<details class="files" ' + (snap.files && snap.files.length ? '' : '') + '>' +
        '<summary>Files (' + (snap.files ? snap.files.length : 0) + ')</summary>' +
        renderFiles(snap) +
        '</details>' +
        '<div class="card-actions">' +
        (snap.userPaused || snap.slot === 'queued' || snap.status === 'paused'
          ? '<button type="button" class="btn" data-act="resume" data-id="' + snap.id + '">Resume</button>'
          : '<button type="button" class="btn" data-act="pause" data-id="' + snap.id + '">Pause</button>') +
        '<button type="button" class="btn btn-danger" data-act="remove" data-id="' + snap.id + '">Remove</button>' +
        '<label class="seed-toggle"><input type="checkbox" data-act="seed" data-id="' + snap.id + '"' + seedChecked +
        '> Seed when done</label>' +
        '</div></article>';
    }

    function renderList(snapAll) {
      var list = (snapAll && snapAll.torrents) || [];
      if (els.empty) els.empty.hidden = list.length > 0;
      if (els.list) {
        els.list.innerHTML = list.map(renderCard).join('');
      }
      if (els.clientRatio) {
        els.clientRatio.textContent = 'Client ratio ' + ((snapAll && snapAll.clientRatio) || '0.00');
      }
      if (snapAll && snapAll.settings) setSettingsForm(snapAll.settings);
    }

    function jelly(el) {
      if (!el) return;
      el.classList.remove('jelly');
      void el.offsetWidth;
      el.classList.add('jelly');
    }

    function bindListClicks() {
      if (!els.list) return;
      els.list.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t) return;
        var btn = t.closest ? t.closest('[data-act]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-act');
        var id = btn.getAttribute('data-id');
        var path = btn.getAttribute('data-path');
        jelly(btn.tagName === 'BUTTON' ? btn : null);
        if (act === 'pause' && playHandlers.onPause) playHandlers.onPause(id);
        if (act === 'resume' && playHandlers.onResume) playHandlers.onResume(id);
        if (act === 'remove' && playHandlers.onRemove) playHandlers.onRemove(id);
        if (act === 'play' && playHandlers.onPlay) playHandlers.onPlay(id, path);
      });
      els.list.addEventListener('change', function (ev) {
        var t = ev.target;
        if (!t || !t.getAttribute) return;
        var act = t.getAttribute('data-act');
        var id = t.getAttribute('data-id');
        if (act === 'seed' && playHandlers.onSeed) playHandlers.onSeed(id, !!t.checked);
        if (act === 'file' && playHandlers.onToggleFile) {
          // collect all checked for this card
          var card = t.closest('.card');
          var paths = [];
          if (card) {
            card.querySelectorAll('input[data-act="file"]').forEach(function (cb) {
              if (cb.checked) paths.push(cb.getAttribute('data-path'));
            });
          }
          playHandlers.onToggleFile(id, paths);
        }
      });
    }

    function showPlayer(show, title) {
      if (!els.playerPanel) return;
      els.playerPanel.hidden = !show;
      if (els.playerTitle) els.playerTitle.textContent = title || 'Player';
    }

    return {
      setStatus: setStatus,
      setFolderRow: setFolderRow,
      setSettingsForm: setSettingsForm,
      renderList: renderList,
      showPlayer: showPlayer,
      jelly: jelly,
      bindListClicks: bindListClicks,
      handlers: playHandlers
    };
  }

  root.TRUi = { createUi: createUi };
})(typeof globalThis !== 'undefined' ? globalThis : this);
