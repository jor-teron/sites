/* Video Player helpers (VPL2). Pure functions: no DOM.
   SRT→VTT, natural sort, subtitle name matching, time formatting, resume keys.
   Used by video-player.js and by node tests (test_vpl_helpers.js). */
(function (root) {
  'use strict';

  var RELEASE = 'VPL2';
  var VIDEO_EXT = ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'ogv', '3gp'];
  var SUB_EXT = ['srt', 'vtt'];

  function ext(name) {
    var n = String(name || ''), i = n.lastIndexOf('.');
    return i < 0 ? '' : n.slice(i + 1).toLowerCase();
  }
  function baseName(name) {
    var n = String(name || '').split('/').pop() || '';
    var i = n.lastIndexOf('.');
    return i < 0 ? n : n.slice(0, i);
  }
  function dirName(path) {
    var p = String(path || ''), i = p.lastIndexOf('/');
    return i < 0 ? '' : p.slice(0, i);
  }
  function isVideo(name) { return VIDEO_EXT.indexOf(ext(name)) >= 0; }
  function isSubtitle(name) { return SUB_EXT.indexOf(ext(name)) >= 0; }

  function naturalCmp(a, b) {
    return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
  }
  function sortByPath(list) {
    return (list || []).slice().sort(function (a, b) {
      return naturalCmp(a.path || a.name || a, b.path || b.name || b);
    });
  }

  /* Same base name (clip.mp4 + clip.srt / clip.vtt). Prefer the same folder, then .vtt over .srt. */
  function matchSubtitle(videoPath, subtitleFiles) {
    var base = baseName(videoPath).toLowerCase();
    if (!base) return null;
    var dir = dirName(videoPath);
    var cands = (subtitleFiles || []).filter(function (s) {
      return baseName(s.path || s.name).toLowerCase() === base;
    });
    if (!cands.length) return null;
    var same = cands.filter(function (s) { return dirName(s.path || s.name) === dir; });
    var pool = same.length ? same : cands;
    pool.sort(function (a, b) {
      var ea = ext(a.name || a.path), eb = ext(b.name || b.path);
      if (ea === 'vtt' && eb !== 'vtt') return -1;
      if (eb === 'vtt' && ea !== 'vtt') return 1;
      return naturalCmp(a.path || a.name, b.path || b.name);
    });
    return pool[0] || null;
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + ':' + pad2(m) + ':' + pad2(s) : m + ':' + pad2(s);
  }

  function resumeKey(name, size) {
    return String(name || '') + '|' + String(size || 0);
  }

  /* Convert SRT (and SRT-like) text to WebVTT. Already-VTT input is returned as-is.
     Timestamp commas become dots; commas in dialogue are left alone. */
  function srtToVtt(text) {
    var src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (/^\s*WEBVTT\b/.test(src)) return src.replace(/^\s+/, '');
    var body = src.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, function (_, t, ms) {
      ms = (ms + '000').slice(0, 3);
      return t + '.' + ms;
    });
    return 'WEBVTT\n\n' + body.replace(/^\s+|\s+$/g, '') + (body.trim() ? '\n' : '');
  }


  /* VTT / SRT-style timestamp → seconds. Accepts H:MM:SS.mmm, MM:SS.mmm, commas or dots. */
  function parseTs(s) {
    var m = String(s || '').trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
    if (!m) return 0;
    var h = m[1] ? parseInt(m[1], 10) : 0;
    var min = parseInt(m[2], 10), sec = parseInt(m[3], 10), ms = parseInt((m[4] + '000').slice(0, 3), 10);
    return h * 3600 + min * 60 + sec + ms / 1000;
  }
  function formatTs(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var ms = Math.round(sec * 1000);
    var h = Math.floor(ms / 3600000); ms -= h * 3600000;
    var min = Math.floor(ms / 60000); ms -= min * 60000;
    var s = Math.floor(ms / 1000); ms -= s * 1000;
    function p2(n) { return n < 10 ? '0' + n : String(n); }
    function p3(n) { return n < 10 ? '00' + n : (n < 100 ? '0' + n : String(n)); }
    return p2(h) + ':' + p2(min) + ':' + p2(s) + '.' + p3(ms);
  }
  /* Shift every cue timestamp in a VTT (or SRT) string by offset seconds. Times are clamped at 0. */
  function shiftVtt(text, offset) {
    var src = String(text || '');
    var off = Number(offset) || 0;
    if (!off) return src;
    return src.replace(/(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})/g, function (_, a, b) {
      return formatTs(Math.max(0, parseTs(a) + off)) + ' --> ' + formatTs(Math.max(0, parseTs(b) + off));
    });
  }

  var api = {
    RELEASE: RELEASE,
    VERSION: RELEASE,
    VIDEO_EXT: VIDEO_EXT,
    SUB_EXT: SUB_EXT,
    ext: ext,
    baseName: baseName,
    dirName: dirName,
    isVideo: isVideo,
    isSubtitle: isSubtitle,
    naturalCmp: naturalCmp,
    sortByPath: sortByPath,
    matchSubtitle: matchSubtitle,
    formatTime: formatTime,
    resumeKey: resumeKey,
    srtToVtt: srtToVtt,
    parseTs: parseTs,
    formatTs: formatTs,
    shiftVtt: shiftVtt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VPL = api;
})(typeof window !== 'undefined' ? window : this);
