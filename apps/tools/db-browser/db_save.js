/* DB Browser — db_save.js: save .db / CSV via showSaveFilePicker or download. Never overwrite silently. DB2 */
(function (root) {
  'use strict';

  var H = root.DBHelpers;
  var savePickerOk = typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

  function downloadBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60_000);
    return fileName || 'download';
  }

  async function saveDbBytes(u8, suggestedName) {
    var name = H.ensureDbExt(suggestedName || 'database-copy.db');
    var blob = new Blob([u8], { type: 'application/x-sqlite3' });
    if (savePickerOk) {
      try {
        var handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{
            description: 'SQLite database',
            accept: { 'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3'] }
          }]
        });
        var writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { method: 'picker', name: handle.name || name };
      } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        // Fall through to download
      }
    }
    downloadBlob(blob, name);
    return { method: 'download', name: name };
  }

  async function saveCsvText(text, suggestedName) {
    var name = String(suggestedName || 'export.csv');
    if (!/\.csv$/i.test(name)) name += '.csv';
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    if (savePickerOk) {
      try {
        var handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{
            description: 'CSV',
            accept: { 'text/csv': ['.csv'] }
          }]
        });
        var writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { method: 'picker', name: handle.name || name };
      } catch (err) {
        if (err && err.name === 'AbortError') throw err;
      }
    }
    downloadBlob(blob, name);
    return { method: 'download', name: name };
  }

  root.DBSave = {
    supportedPicker: savePickerOk,
    downloadBlob: downloadBlob,
    saveDbBytes: saveDbBytes,
    saveCsvText: saveCsvText
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
