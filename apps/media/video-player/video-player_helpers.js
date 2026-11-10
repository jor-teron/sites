/* Video Player helpers (VPL1). Pure functions: no DOM.
   SRT→VTT, natural sort, subtitle name matching, time formatting, resume keys.
   Used by video-player.js and by node tests (test_vpl_helpers.js). */
(function (root) {
  'use strict';

  var RELEASE = 'VPL1';
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
    srtToVtt: srtToVtt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VPL = api;
})(typeof window !== 'undefined' ? window : this);
