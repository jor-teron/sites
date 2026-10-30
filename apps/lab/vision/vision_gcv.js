/* Vision VS2: Google Cloud Vision engine (images:annotate) + the Hub 'gvision' key.
   Key: window.top.HubKeys.get('gvision') first (memory only), else the own key from Settings (standalone fallback).
   Errors carry .kind: nokey | invalid | disabled | billing | blocked | quota | unreachable | http. */
(function () {
  'use strict';
  const NAME = 'gvision', EP = 'https://vision.googleapis.com/v1/images:annotate?key=';
  const MODES = {
    labels: { label: 'Labels', f: [{ type: 'LABEL_DETECTION', maxResults: 15 }] },
    text: { label: 'Read text', f: [{ type: 'DOCUMENT_TEXT_DETECTION' }] },
    objects: { label: 'Objects', f: [{ type: 'OBJECT_LOCALIZATION', maxResults: 20 }] },
    landmarks: { label: 'Landmarks & logos', f: [{ type: 'LANDMARK_DETECTION', maxResults: 5 }, { type: 'LOGO_DETECTION', maxResults: 5 }] },
    colours: { label: 'Colours', f: [{ type: 'IMAGE_PROPERTIES' }] },
    safe: { label: 'Safe search', f: [{ type: 'SAFE_SEARCH_DETECTION' }] },
  };
  MODES.all = { label: 'All', f: [].concat(...['labels', 'text', 'objects', 'landmarks', 'colours', 'safe'].map((k) => MODES[k].f)) };
  let hubVal = '';
  const hub = () => { try { const h = window.top && window.top.HubKeys; return h && typeof h.get === 'function' ? h : null; } catch (_) { return null; } };
  async function loadHub() { const h = hub(); if (!h) { hubVal = ''; return ''; } try { hubVal = (await h.get(NAME)) || ''; } catch (_) { hubVal = ''; } return hubVal; }
  function onHubChange(fn) { const h = hub(); if (h && h.onChange) try { h.onChange((e) => { if (!e || !e.name || e.name === NAME) loadHub().then(fn); }); } catch (_) { /* */ } }
  function openHub() { const h = hub(); if (h && h.open) { try { h.open(NAME); return true; } catch (_) { /* */ } } return false; }
  const err = (kind, message) => Object.assign(new Error(message), { kind });

  async function annotate({ key, b64, mode, signal }) {
    if (!key) throw err('nokey', 'No Cloud Vision key');
    const m = MODES[mode] || MODES.labels;
    let r;
    try {
      r = await fetch(EP + encodeURIComponent(key), { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ image: { content: b64 }, features: m.f }] }) });
    } catch (e) { if (e && e.name === 'AbortError') throw e; throw err('unreachable', 'Could not reach vision.googleapis.com'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = j.error || {};
      const why = (e.details || []).map((d) => d && d.reason).filter(Boolean).join(' ') + ' ' + (e.status || '') + ' ' + (e.message || '');
      const msg = e.message || ('HTTP ' + r.status);
      if (/API_KEY_INVALID|API key not valid/i.test(why)) throw err('invalid', msg);
      if (/SERVICE_DISABLED|accessNotConfigured|has not been used|is disabled/i.test(why)) throw err('disabled', msg);
      if (/BILLING_DISABLED|billing/i.test(why)) throw err('billing', msg);
      if (/REFERRER_BLOCKED|referer|API_KEY_SERVICE_BLOCKED|blocked/i.test(why)) throw err('blocked', msg);
      if (r.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(why)) throw err('quota', msg);
      throw err('http', msg);
    }
    const res = (j.responses && j.responses[0]) || {};
    if (res.error && res.error.message) throw err('http', res.error.message);
    return { res, text: format(res, mode) };
  }

  const pc = (s) => Math.round((s || 0) * 100) + '%';
  const LIKE = { VERY_UNLIKELY: 'very unlikely', UNLIKELY: 'unlikely', POSSIBLE: 'possible', LIKELY: 'likely', VERY_LIKELY: 'very likely', UNKNOWN: 'unknown' };
  const hex = (c) => '#' + ['red', 'green', 'blue'].map((k) => Math.round(c[k] || 0).toString(16).padStart(2, '0')).join('');
  /* plain-text result (used for chat bubble, Copy, .txt and history) */
  function format(r, mode) {
    const out = [], all = mode === 'all';
    const sec = (title, lines) => { out.push((all ? title + '\n' : '') + (lines.length ? lines.join('\n') : 'Nothing found.')); };
    if (all || mode === 'labels') sec('Labels', (r.labelAnnotations || []).map((l) => '\u2022 ' + l.description + ' \u2014 ' + pc(l.score)));
    if (all || mode === 'text') { const t = (r.fullTextAnnotation && r.fullTextAnnotation.text) || ((r.textAnnotations || [])[0] || {}).description || ''; sec('Text', t ? [t.replace(/\s+$/, '')] : ['No text found.']); }
    if (all || mode === 'objects') sec('Objects', (r.localizedObjectAnnotations || []).map((o) => '\u2022 ' + o.name + ' \u2014 ' + pc(o.score)));
    if (all || mode === 'landmarks') {
      const L = (r.landmarkAnnotations || []).map((l) => { const ll = l.locations && l.locations[0] && l.locations[0].latLng; return '\u2022 Landmark: ' + l.description + ' \u2014 ' + pc(l.score) + (ll ? ' (' + ll.latitude.toFixed(4) + ', ' + ll.longitude.toFixed(4) + ')' : ''); });
      const G = (r.logoAnnotations || []).map((l) => '\u2022 Logo: ' + l.description + ' \u2014 ' + pc(l.score));
      sec('Landmarks & logos', L.concat(G));
    }
    if (all || mode === 'colours') {
      const cs = ((r.imagePropertiesAnnotation || {}).dominantColors || {}).colors || [];
      sec('Colours', cs.slice(0, 10).map((c) => '\u25a0 ' + hex(c.color || {}) + ' \u2014 ' + pc(c.pixelFraction) + ' of pixels'));
    }
    if (all || mode === 'safe') {
      const s = r.safeSearchAnnotation;
      sec('Safe search', s ? [['adult', 'Adult'], ['spoof', 'Spoof / edited'], ['medical', 'Medical'], ['violence', 'Violence'], ['racy', 'Racy']].map(([k, n]) => '\u2022 ' + n + ': ' + (LIKE[s[k]] || s[k] || 'unknown')) : []);
    }
    return out.join(all ? '\n\n' : '\n');
  }
  window.VSGcv = { NAME, MODES, hub, loadHub, hubKey: () => hubVal, onHubChange, openHub, annotate, format };
})();
