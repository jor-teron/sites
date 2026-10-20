/*
 * File: llm-calc-wordcount.js
 * Project: llm-calc (Lab) — R15 2026-10-20
 * Purpose: Dataset word counter. Counts total words (whitespace-separated) from
 *          chosen files or a URL, streaming in chunks (never loads a whole file).
 *          URL may be: a text file; a "URL list" text file (every non-blank,
 *          non-# line is an http(s) URL — each fetched and summed); a GitHub
 *          folder (github.com/o/r/tree/branch/path) or a Hugging Face dataset
 *          folder (huggingface.co/datasets/id/tree/rev/path) — .txt files listed.
 *          Result fills the Words box (mode -> Words) and recalculates.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const CORS = 'This site blocks browser reading; download and use Choose file.';
  const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);

  // Streams a ReadableStream; returns { words, head } (head = first 64KB for URL-list check).
  async function countStream(stream, onBytes) {
    const rd = stream.getReader(), dec = new TextDecoder();
    let words = 0, inWord = false, head = '', bytes = 0;
    const scan = s => { for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i), ws = c === 32 || (c >= 9 && c <= 13) || c === 160;
      if (ws) inWord = false; else if (!inWord) { inWord = true; words++; } } };
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      bytes += value.length; if (onBytes) onBytes(bytes);
      const s = dec.decode(value, { stream: true });
      if (head.length < 65536) head += s.slice(0, 65536 - head.length);
      scan(s);
    }
    scan(dec.decode());
    return { words, head, bytes };
  }

  async function get(url) {
    let r;
    try { r = await fetch(url); } catch (e) { throw new Error(CORS); }
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
    return r;
  }

  const isUrlList = t => { const ls = t.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    return ls.length > 0 && ls.every(l => /^https?:\/\/\S+$/.test(l)) ? ls : null; };

  async function folderFiles(url) {
    let m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/?(.*)$/);
    if (m) { const j = await (await get('https://api.github.com/repos/' + m[1] + '/' + m[2] + '/contents/' + m[4] + '?ref=' + m[3])).json();
      return j.filter(f => f.type === 'file' && /\.txt$/i.test(f.name)).map(f => f.download_url); }
    m = url.match(/^https?:\/\/huggingface\.co\/datasets\/([^/]+\/[^/]+)\/tree\/([^/]+)\/?(.*)$/);
    if (m) { const j = await (await get('https://huggingface.co/api/datasets/' + m[1] + '/tree/' + m[2] + '/' + m[3])).json();
      return j.filter(f => f.type === 'file' && /\.txt$/i.test(f.path)).map(f => 'https://huggingface.co/datasets/' + m[1] + '/resolve/' + m[2] + '/' + f.path); }
    return null;
  }

  let busy = false;
  const status = t => { $('wcOut').textContent = t; };
  function apply(files, words) {
    status(files + (files === 1 ? ' file, ' : ' files, ') + fmt(words) + ' words');
    const mode = $('dataMode');
    if (mode && mode.value !== 'words') { mode.value = 'words'; mode.dispatchEvent(new Event('change')); }
    $('words').value = words; $('words').dispatchEvent(new Event('input'));
  }
  async function run(job) {
    if (busy) return; busy = true;
    try { await job(); } catch (e) { status(e.message || String(e)); } finally { busy = false; }
  }

  function countFiles(list) {
    run(async () => { let w = 0, i = 0;
      for (const f of list) { i++; w += (await countStream(f.stream(), b =>
        status('Counting ' + i + '/' + list.length + ' — ' + Math.round(100 * b / (f.size || 1)) + '%'))).words; }
      apply(list.length, w); });
  }

  function countUrl(url) {
    run(async () => {
      status('Fetching…');
      let urls = await folderFiles(url), w = 0;
      if (!urls) {
        const r = await countStream((await get(url)).body, b => status('Counting — ' + fmt(b) + 'B'));
        const list = isUrlList(r.head);
        if (!list) return apply(1, r.words);
        urls = list;
      }
      if (!urls.length) return status('No .txt files found.');
      for (let i = 0; i < urls.length; i++)
        w += (await countStream((await get(urls[i])).body, b => status('Counting ' + (i + 1) + '/' + urls.length + ' — ' + fmt(b) + 'B'))).words;
      apply(urls.length, w);
    });
  }

  function init() {
    if (!$('wcFile')) return;
    $('wcPick').addEventListener('click', () => $('wcFile').click());
    $('wcFile').addEventListener('change', e => { const l = [...e.target.files]; if (l.length) countFiles(l); e.target.value = ''; });
    $('wcGo').addEventListener('click', () => { const u = $('wcUrl').value.trim(); if (u) countUrl(u); });
    $('wcUrl').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('wcGo').click(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
