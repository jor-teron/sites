/*
 * Files preview (apps/tools/files/files_preview.js) — full-window viewer for a text file
 * (shown as plain text, first 2 MB) or an image; Download + Close buttons, Esc closes.
 * API window.FilesPreview: kind(name, type) → 'text' | 'image' | '' ; show(file, onDownload).
 */
window.FilesPreview = (function () {
  'use strict';
  const TEXT = /\.(txt|md|csv|tsv|json|js|mjs|ts|css|html?|xml|svg|log|ini|cfg|conf|yml|yaml|m3u8?|srt|vtt|py|sh|c|h|cpp|java|rs|go|sql)$/i;
  const IMG = /\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i;
  const MAX_TEXT = 2 * 1024 * 1024;
  function kind(name, type) {
    if (IMG.test(name) || /^image\/(?!svg)/.test(type || '')) return 'image';
    if (TEXT.test(name) || /^text\/|json|xml/.test(type || '')) return 'text';
    return '';
  }
  async function show(file, onDownload) {
    const k = kind(file.name, file.type);
    const back = document.createElement('div');
    back.className = 'pv';
    const bar = document.createElement('div'); bar.className = 'pv-bar';
    const t = document.createElement('b'); t.className = 'pv-name'; t.textContent = file.name;
    const dl = document.createElement('button'); dl.type = 'button'; dl.className = 'btn'; dl.textContent = '\u2B07 Download';
    const x = document.createElement('button'); x.type = 'button'; x.className = 'btn primary'; x.textContent = 'Close';
    bar.append(t, dl, x);
    const body = document.createElement('div'); body.className = 'pv-body';
    let url = '';
    if (k === 'image') {
      url = URL.createObjectURL(file);
      const img = document.createElement('img'); img.src = url; img.alt = file.name;
      body.appendChild(img);
    } else {
      const pre = document.createElement('pre');
      const text = await file.slice(0, MAX_TEXT).text();
      pre.textContent = text + (file.size > MAX_TEXT ? '\n\n\u2026 (only the first 2 MB is shown)' : '');
      body.appendChild(pre);
    }
    back.append(bar, body);
    document.body.appendChild(back);
    const close = () => { back.remove(); if (url) URL.revokeObjectURL(url); document.removeEventListener('keydown', key, true); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    document.addEventListener('keydown', key, true);
    x.addEventListener('click', close);
    dl.addEventListener('click', () => onDownload(file));
    x.focus();
  }
  return { kind, show };
})();
