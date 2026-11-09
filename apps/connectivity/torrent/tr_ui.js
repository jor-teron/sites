/* Torrent — tr_ui.js: card, progress, folder row, status, jelly-friendly DOM updates. TR1+TR2 */
(function (root) {
  'use strict';

  var H = root.TRHelpers;

  function createUi(els) {
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
        return;
      }
      els.folderRow.hidden = false;
      if (els.folderFallback) els.folderFallback.hidden = true;
      var label = '';
      if (st === 'ready') label = 'Saving to: ' + (save.folderName() || 'folder');
      else if (st === 'need') label = 'Folder remembered — tap Reconnect to allow access';
      else label = 'No folder chosen — finished files download normally';
      if (els.folderLabel) els.folderLabel.textContent = label;
      if (els.btnChoose) els.btnChoose.hidden = false;
      if (els.btnReconnect) els.btnReconnect.hidden = st !== 'need';
    }

    function showHint(show) {
      if (els.peersHint) els.peersHint.hidden = !show;
    }

    function showCard(show) {
      if (els.card) els.card.hidden = !show;
      if (els.empty) els.empty.hidden = !!show;
    }

    function renderCard(snap) {
      if (!snap || !snap.active) {
        showCard(false);
        showHint(false);
        return;
      }
      showCard(true);
      if (els.cardName) els.cardName.textContent = snap.name || 'Torrent';
      if (els.cardSize) {
        els.cardSize.textContent =
          H.formatBytes(snap.downloaded) + ' / ' + H.formatBytes(snap.length);
      }
      var pct = H.formatPct(snap.progress);
      if (els.cardPct) els.cardPct.textContent = pct;
      if (els.progressBar) {
        els.progressBar.style.width = pct;
        els.progressBar.setAttribute('aria-valuenow', String(Math.floor((snap.progress || 0) * 100)));
      }
      if (els.cardDown) els.cardDown.textContent = '↓ ' + H.formatSpeed(snap.downloadSpeed);
      if (els.cardUp) els.cardUp.textContent = '↑ ' + H.formatSpeed(snap.uploadSpeed);
      if (els.cardPeers) {
        var n = snap.numPeers || 0;
        els.cardPeers.textContent = n + (n === 1 ? ' peer' : ' peers');
      }
      if (els.cardEta) {
        var rem = Math.max(0, (snap.length || 0) - (snap.downloaded || 0));
        els.cardEta.textContent = snap.done ? 'Done' : ('ETA ' + H.formatEta(rem, snap.downloadSpeed));
      }
      if (els.cardStatus) {
        var st = snap.status || '';
        els.cardStatus.textContent =
          st === 'done' ? 'Finished' :
          st === 'downloading' ? 'Downloading' :
          st === 'looking' ? 'Looking for peers…' : st;
      }
    }

    function jelly(el) {
      if (!el) return;
      el.classList.remove('jelly');
      // force reflow
      void el.offsetWidth;
      el.classList.add('jelly');
    }

    return {
      setStatus: setStatus,
      setFolderRow: setFolderRow,
      showHint: showHint,
      showCard: showCard,
      renderCard: renderCard,
      jelly: jelly
    };
  }

  root.TRUi = { createUi: createUi };
})(typeof globalThis !== 'undefined' ? globalThis : this);
