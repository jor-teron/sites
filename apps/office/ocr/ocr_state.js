/*
 * OCR — ocr_state.js
 * App state and a tiny event bus. No DOM here.
 */
(function (OCR) {
  'use strict';

  OCR.state = {
    doc: null,        // { name, kind:'image'|'pdf', file, pdf, pages, page, previewUrl }
    busy: false,      // an OCR / load job is running (page nav, new files, engine switch locked)
    job: null,        // 'one' | 'all' | 'queue' | 'load'
    engine: 'tesseract',
    hasResult: false, // the text box holds a result (or user text)
    tab: 'preview'    // narrow screens: which panel is shown
  };

  const listeners = [];
  OCR.on = (fn) => { listeners.push(fn); };
  OCR.emit = (kind, data) => { for (const fn of listeners) fn(kind, data); };

  OCR.setBusy = (on, job) => {
    OCR.state.busy = !!on;
    OCR.state.job = on ? (job || 'one') : null;
    OCR.emit('busy');
  };

  // Status line: msg + kind ('', 'ok', 'err', 'work')
  OCR.status = (msg, kind) => OCR.emit('status', { msg: msg, kind: kind || '' });

  OCR.absUrl = (rel) => new URL(rel, location.href).href;
})(window.OCR);
