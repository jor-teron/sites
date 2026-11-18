/* ============================================================
   FILE: modules/writer-txt.js
   PROJECT: Writer
   ROLE: DW9 plain-text .txt reader. Turns .txt into Writer
         editor HTML: one paragraph per line, blank lines kept,
         HTML escaped so the text is never markup. Used by
         File → Open .docx / .odt / .txt, drag-and-drop, and
         Hub #drive=&file= links (via writer-docxopen.js).
   API:  Writer.txt.txtToParagraphs(text) -> [html paragraph, ...]
         Writer.txt.toHtml(text)          -> joined html
         Writer.txt.read(text)            -> { html, page: null,
           hf: { head:[3], foot:[3] }, notes: [] }
         Writer.txt.stem(name)            -> file stem (notes.txt -> notes)
   Pure functions: no DOM, no storage. Works from file:// and node --test.
   ============================================================ */
(function (root) {
  'use strict';

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* Strip a UTF-8 BOM, normalise CR/LF, one paragraph per line.
     A trailing newline is a line terminator, not an extra blank
     paragraph. An empty file is one empty paragraph. Tabs stay. */
  function txtToParagraphs(text) {
    text = String(text == null ? '' : text);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (text.charAt(text.length - 1) === '\n') text = text.slice(0, -1);
    var lines = text.split('\n');
    if (!lines.length) lines = [''];
    return lines.map(function (line) {
      return line === '' ? '<p><br></p>' : '<p>' + esc(line) + '</p>';
    });
  }

  function toHtml(text) {
    var html = txtToParagraphs(text).join('');
    return html || '<p><br></p>';
  }

  function read(text) {
    return {
      html: toHtml(text),
      page: null,
      hf: { head: ['', '', ''], foot: ['', '', ''] },
      notes: []
    };
  }

  function stem(name) {
    var s = String(name == null ? '' : name).replace(/\.txt$/i, '');
    s = s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s || 'Document';
  }

  var api = {
    txtToParagraphs: txtToParagraphs,
    toHtml: toHtml,
    read: read,
    stem: stem
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.Writer = root.Writer || {};
    root.Writer.txt = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
