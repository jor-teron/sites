/* Password Manager PW2 — vault merge (newest-wins per entry id) and tombstones.
   Pure helpers: used by encrypted backup import and (PW3) device sync. */
(function (root) {
  'use strict';

  var MAX_TOMBSTONES = 200;

  function ts(iso) {
    if (!iso) return 0;
    var n = Date.parse(iso);
    return isNaN(n) ? 0 : n;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function isTombstone(e) {
    return !!(e && e.deleted);
  }

  function indexById(list) {
    var map = Object.create(null);
    (list || []).forEach(function (e) {
      if (e && e.id) map[e.id] = e;
    });
    return map;
  }

  // Compact deleted entries into tombstones {id, updated, deleted:true}.
  function collectTombstones(entries, existing) {
    var map = indexById(existing || []);
    (entries || []).forEach(function (e) {
      if (!isTombstone(e) || !e.id) return;
      var cur = map[e.id];
      if (!cur || ts(e.updated) >= ts(cur.updated)) {
        map[e.id] = { id: e.id, updated: e.updated || e.created || '', deleted: true };
      }
    });
    var list = Object.keys(map).map(function (k) { return map[k]; });
    list.sort(function (a, b) { return ts(b.updated) - ts(a.updated); });
    if (list.length > MAX_TOMBSTONES) list = list.slice(0, MAX_TOMBSTONES);
    return list;
  }

  function liveEntries(entries) {
    return (entries || []).filter(function (e) { return e && e.id && !isTombstone(e); });
  }

  /**
   * Merge two entry lists. Newest `updated` wins. A newer tombstone deletes the entry.
   * @returns {{entries:object[], tombstones:object[], summary:{added:number, updated:number, kept:number, removed:number, incoming:number}}}
   */
  function mergeEntries(localEntries, localTombs, incomingEntries, incomingTombs) {
    var localLive = indexById(liveEntries(localEntries));
    var incLive = indexById(liveEntries(incomingEntries));
    var tombs = collectTombstones(
      [].concat(localTombs || [], incomingTombs || []),
      []
    );
    var tombMap = indexById(tombs);

    var ids = Object.create(null);
    Object.keys(localLive).forEach(function (id) { ids[id] = true; });
    Object.keys(incLive).forEach(function (id) { ids[id] = true; });
    Object.keys(tombMap).forEach(function (id) { ids[id] = true; });

    var out = [];
    var usedTombs = [];
    var summary = { added: 0, updated: 0, kept: 0, removed: 0, incoming: liveEntries(incomingEntries).length };

    Object.keys(ids).forEach(function (id) {
      var loc = localLive[id];
      var inc = incLive[id];
      var tomb = tombMap[id];
      var locT = loc ? ts(loc.updated) : -1;
      var incT = inc ? ts(inc.updated) : -1;
      var tombT = tomb ? ts(tomb.updated) : -1;

      if (tomb && tombT >= locT && tombT >= incT) {
        usedTombs.push(tomb);
        if (loc || inc) summary.removed += 1;
        return;
      }
      if (loc && inc) {
        if (incT > locT) {
          out.push(clone(inc));
          summary.updated += 1;
        } else {
          out.push(clone(loc));
          summary.kept += 1;
        }
        return;
      }
      if (inc && !loc) {
        out.push(clone(inc));
        summary.added += 1;
        return;
      }
      if (loc && !inc) {
        out.push(clone(loc));
        summary.kept += 1;
      }
    });

    out.sort(function (a, b) { return ts(b.updated) - ts(a.updated); });
    usedTombs = collectTombstones(usedTombs, []);
    return { entries: out, tombstones: usedTombs, summary: summary };
  }

  function emptySettings() {
    return { autoLockMin: 5, lockHiddenMin: 0, clipboardSec: 30 };
  }

  function mergeSettings(local, incoming, replace) {
    if (replace && incoming && typeof incoming === 'object') {
      var s = {};
      s.autoLockMin = incoming.autoLockMin;
      s.lockHiddenMin = incoming.lockHiddenMin;
      s.clipboardSec = incoming.clipboardSec;
      return s;
    }
    return local && typeof local === 'object' ? clone(local) : emptySettings();
  }

  /**
   * Merge or replace a local vault with an incoming (already decrypted) vault.
   * `mode` is 'merge' or 'replace'. Settings are kept on merge; replaced only on replace.
   * The current master-password wrapping is not part of the vault JSON.
   */
  function mergeVaults(localVault, incomingVault, mode) {
    var local = localVault && typeof localVault === 'object' ? localVault : { version: 2, settings: emptySettings(), entries: [], tombstones: [] };
    var incoming = incomingVault && typeof incomingVault === 'object' ? incomingVault : { version: 2, settings: emptySettings(), entries: [], tombstones: [] };
    var replace = mode === 'replace';
    var merged;
    if (replace) {
      merged = mergeEntries([], [], incoming.entries || [], incoming.tombstones || []);
    } else {
      merged = mergeEntries(local.entries || [], local.tombstones || [], incoming.entries || [], incoming.tombstones || []);
    }
    return {
      vault: {
        version: 2,
        settings: mergeSettings(local.settings, incoming.settings, replace),
        entries: merged.entries,
        tombstones: merged.tombstones
      },
      summary: merged.summary
    };
  }

  function summaryText(summary) {
    summary = summary || {};
    var parts = [];
    parts.push((summary.incoming || 0) + ' incoming');
    parts.push((summary.added || 0) + ' added');
    parts.push((summary.updated || 0) + ' updated');
    parts.push((summary.kept || 0) + ' kept');
    if (summary.removed) parts.push(summary.removed + ' removed');
    return parts.join(', ') + '.';
  }

  var api = {
    MAX_TOMBSTONES: MAX_TOMBSTONES,
    ts: ts,
    isTombstone: isTombstone,
    liveEntries: liveEntries,
    collectTombstones: collectTombstones,
    mergeEntries: mergeEntries,
    mergeVaults: mergeVaults,
    summaryText: summaryText
  };

  root.PMMerge = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
