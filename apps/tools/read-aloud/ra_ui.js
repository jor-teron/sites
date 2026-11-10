/* Read Aloud RA1 -- ra_ui.js: source switch, News/Text panes, player, settings, keyboard, boot. */
var RELEASE = 'RA1';

(function () {
  var source = 'news', newsTab = 'india', index = 0, queue = [];
  var playing = false, paused = false, textTimer = 0, testUtter = false;

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null) return;
        if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else if (k === 'checked') e.checked = !!v;
        else e.setAttribute(k, v);
      });
    }
    (kids || []).forEach(function (c) {
      if (!c) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function themeEff() {
    var m = RAStore.get('theme');
    if (m === 'light' || m === 'dark') return m;
    if (window.HubTheme) return HubTheme.hub();
    try { return localStorage.getItem('sites-hub.theme') === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }

  function applyTheme() {
    var t = themeEff();
    document.documentElement.dataset.ra = t;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'light' ? '#f5f6fa' : '#141821';
  }

  function speechOpts() {
    var list = RASpeech.voices();
    var voice = RASpeech.pickVoice(list, RAStore.get('voice') || '');
    return { rate: +RAStore.get('rate') || 1, pitch: +RAStore.get('pitch') || 1, voice: voice, lang: voice && voice.lang ? voice.lang : 'en-IN' };
  }

  function banner(msg) {
    var b = document.getElementById('banner');
    if (!msg) { b.hidden = true; b.textContent = ''; return; }
    b.hidden = false;
    b.textContent = msg;
  }

  function setStatus(t) { document.getElementById('status').textContent = t || ''; }

  function savePos() {
    var item = queue[index];
    var rec = { i: index, id: item ? (item.id || '') : '' };
    RAStore.setPos(source, source === 'news' ? newsTab : '', rec);
  }

  function restorePos() {
    var rec = RAStore.getPos(source, source === 'news' ? newsTab : '');
    if (!rec || !queue.length) { index = 0; return; }
    var i = -1;
    if (rec.id) {
      for (var n = 0; n < queue.length; n++) { if (queue[n].id === rec.id) { i = n; break; } }
    }
    if (i < 0) i = Math.max(0, Math.min(queue.length - 1, +rec.i || 0));
    index = i;
  }

  /* ---------- queue builders ---------- */
  function newsQueue() {
    var only = !!RAStore.get('onlyNew');
    return RANews.items(newsTab, only).map(function (s, i) {
      return {
        id: s.link || ('n' + i),
        title: s.title || '',
        src: s.src || '',
        t: s.t || 0,
        link: s.link || '',
        isNew: newsTab !== 'saved' && RANews.isNew(s),
        speak: RANews.speakText(s),
        kind: 'news'
      };
    });
  }

  function textQueue() {
    var raw = document.getElementById('textIn').value;
    var clean = RAText.stripMd(raw);
    return RAText.sentences(clean).map(function (s, i) {
      return { id: 's' + i + ':' + s.slice(0, 40), title: s, speak: s, kind: 'text' };
    });
  }

  function rebuildQueue(keepPos) {
    queue = source === 'news' ? newsQueue() : textQueue();
    if (keepPos) restorePos();
    else index = Math.max(0, Math.min(index, Math.max(0, queue.length - 1)));
    if (!queue.length) index = 0;
    savePos();
  }

  /* ---------- render ---------- */
  function drawSource() {
    document.querySelectorAll('#srcSeg [data-src]').forEach(function (b) {
      var on = b.getAttribute('data-src') === source;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.getElementById('paneNews').hidden = source !== 'news';
    document.getElementById('paneText').hidden = source !== 'text';
    document.getElementById('newsTabs').hidden = source !== 'news';
    document.getElementById('btnRef').hidden = source !== 'news';
    document.getElementById('btnRef').disabled = source !== 'news' || newsTab === 'saved';
  }

  function drawNewsTabs() {
    var row = document.getElementById('newsTabs');
    row.innerHTML = '';
    function btn(key, name) {
      var on = key === newsTab, dot = !on && RANews.unseen(key) > 0;
      return el('button', { type: 'button', 'class': 'nt' + (on ? ' on' : ''), role: 'tab', 'aria-selected': on ? 'true' : 'false', onclick: function () { goTab(key); } },
        [name, dot ? el('span', { 'class': 'nt-dot', 'aria-label': 'new stories' }) : null]);
    }
    RANews.places().forEach(function (p) { row.appendChild(btn(p[0], p[1])); });
    row.appendChild(el('span', { 'class': 'nt-sep' }));
    RANews.topics().forEach(function (t) { row.appendChild(btn(t[0], t[1])); });
    var n = (typeof NF !== 'undefined' && NF.saved) ? NF.saved().length : 0;
    row.appendChild(btn('saved', 'Saved' + (n ? ' ' + n : '')));
    var cur = row.querySelector('.nt.on');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function drawNewsList() {
    var pane = document.getElementById('paneNews');
    pane.innerHTML = '';
    var box = el('div', { 'class': 'grid' });
    if (!queue.length) {
      var only = !!RAStore.get('onlyNew');
      var msg = newsTab === 'saved' ? 'Nothing saved yet. Open the News app and tap the star on a story to keep it here.' :
        only ? "No new stories in this tab. Turn off Only new stories in Settings to hear all headlines." :
        (RANews.busy(newsTab) || (!RANews.updated(newsTab) && navigator.onLine !== false) ? 'Loading stories…' :
          (RANews.updated(newsTab) ? 'No news for ' + RANews.label(newsTab) + ' right now.' : 'Could not load news. Check the connection and tap Refresh.'));
      box.appendChild(el('p', { 'class': 'empty', text: msg }));
    } else {
      queue.forEach(function (item, i) {
        var metaKids = [];
        if (item.isNew) metaKids.push(el('span', { 'class': 'dot-new', title: 'New' }));
        var meta = (item.src ? item.src + ' · ' : '') + (item.t ? (typeof NS !== 'undefined' ? NS.when(item.t) : RANews.rel(item.t)) : '');
        metaKids.push(document.createTextNode(meta));
        var open = item.link ? el('a', { 'class': 'card-open', href: item.link, target: '_blank', rel: 'noopener noreferrer', text: 'Open', onclick: function (e) { e.stopPropagation(); } }) : null;
        var card = el('article', { 'class': 'card' + (i === index ? ' on' : ''), id: 'item-' + i, tabindex: '0', role: 'button',
          'aria-current': i === index ? 'true' : 'false',
          onclick: function () { playFrom(i); },
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); playFrom(i); } } },
          [el('div', { 'class': 'card-body' }, [el('div', { 'class': 'card-h', text: item.title }), el('div', { 'class': 'card-m' }, metaKids)]), open]);
        box.appendChild(card);
      });
    }
    pane.appendChild(box);
    scrollCurrent();
  }

  function drawSentences() {
    var list = document.getElementById('sentList');
    list.innerHTML = '';
    var raw = document.getElementById('textIn').value;
    var n = queue.length;
    document.getElementById('textMeta').textContent = raw ? (n + (n === 1 ? ' sentence' : ' sentences')) : '';
    if (!raw.trim()) {
      list.appendChild(el('p', { 'class': 'empty', text: 'Paste text or open a .txt or .md file, then press Play.' }));
      return;
    }
    if (!n) {
      list.appendChild(el('p', { 'class': 'empty', text: 'No sentences found in that text.' }));
      return;
    }
    queue.forEach(function (item, i) {
      list.appendChild(el('button', { type: 'button', 'class': 'sent' + (i === index ? ' on' : ''), id: 'item-' + i,
        'aria-current': i === index ? 'true' : 'false', onclick: function () { playFrom(i); }, text: item.title }));
    });
    scrollCurrent();
  }

  function newsStatus() {
    if (source !== 'news') return;
    var busy = RANews.busy(newsTab);
    var rb = document.getElementById('btnRef');
    rb.classList.toggle('spin', busy);
    rb.disabled = newsTab === 'saved';
    var t = RANews.updated(newsTab);
    var n = queue.length;
    var only = !!RAStore.get('onlyNew');
    var note = newsTab === 'saved' ? (n ? n + ' saved · readable offline' : '') :
      t ? ('Updated ' + (typeof NS !== 'undefined' ? NS.fmtTime(t) : new Date(t).toLocaleTimeString()) +
        ((navigator.onLine === false) ? ' · offline, showing saved' : '') +
        (only ? ' · new stories only' : '') +
        (n ? ' · ' + n + (n === 1 ? ' story' : ' stories') : '')) : '';
    setStatus(busy ? (note ? note + ' · refreshing…' : 'Loading…') : note);
  }

  function render() {
    drawSource();
    if (source === 'news') {
      drawNewsTabs();
      drawNewsList();
      newsStatus();
    } else {
      setStatus('');
      drawSentences();
    }
    updatePlayer();
  }

  function scrollCurrent() {
    var node = document.getElementById('item-' + index);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ---------- player ---------- */
  function nowText() {
    if (!queue.length) return source === 'news' ? 'No stories to read' : 'Nothing to read yet';
    var item = queue[index];
    if (!item) return '';
    var n = (index + 1) + ' of ' + queue.length;
    if (item.kind === 'news') return (playing || paused ? (paused ? 'Paused · ' : 'Reading · ') : '') + n + ' · ' + item.title;
    return (playing || paused ? (paused ? 'Paused · ' : 'Reading · ') : '') + n + ' · ' + item.title;
  }

  function updatePlayer() {
    document.getElementById('nowPlaying').textContent = nowText();
    var btn = document.getElementById('btnPlay');
    var can = queue.length > 0 && RASpeech.available();
    btn.disabled = !can && !playing;
    document.getElementById('btnPrev').disabled = !queue.length;
    document.getElementById('btnNext').disabled = !queue.length;
    document.getElementById('btnStop').disabled = !playing && !paused;
    if (playing && !paused) {
      btn.textContent = '⏸';
      btn.title = 'Pause';
      btn.setAttribute('aria-label', 'Pause');
    } else {
      btn.textContent = '▶';
      btn.title = 'Play';
      btn.setAttribute('aria-label', 'Play');
    }
  }

  function highlight() {
    document.querySelectorAll('.card.on, .sent.on').forEach(function (n) {
      n.classList.remove('on');
      n.removeAttribute('aria-current');
    });
    var node = document.getElementById('item-' + index);
    if (node) {
      node.classList.add('on');
      node.setAttribute('aria-current', 'true');
    }
    updatePlayer();
    scrollCurrent();
    savePos();
  }

  function speakCurrent() {
    if (!queue.length) { playing = false; paused = false; updatePlayer(); return; }
    if (!RASpeech.available()) {
      banner('This browser cannot read aloud (speechSynthesis is missing). Try Chrome, Edge, Safari, or Firefox.');
      playing = false; paused = false; updatePlayer(); return;
    }
    var item = queue[index];
    if (!item) return;
    testUtter = false;
    playing = true; paused = false;
    highlight();
    RASpeech.speak(item.speak, speechOpts(), function (why) {
      if (testUtter) { testUtter = false; return; }
      if (!playing) return;
      if (why === 'canceled' || why === 'interrupted') return;
      if (index + 1 < queue.length) {
        index += 1;
        highlight();
        setTimeout(function () { if (playing && !paused) speakCurrent(); }, 80);
      } else {
        playing = false; paused = false;
        updatePlayer();
      }
    }, function () {
      if (!playing) return;
      if (index + 1 < queue.length) {
        index += 1;
        highlight();
        setTimeout(function () { if (playing && !paused) speakCurrent(); }, 80);
      } else {
        playing = false; paused = false;
        updatePlayer();
      }
    });
    updatePlayer();
  }

  function playFrom(i) {
    if (!queue.length) return;
    index = Math.max(0, Math.min(queue.length - 1, i));
    paused = false;
    speakCurrent();
  }

  function playPause() {
    if (!queue.length) {
      if (source === 'text') rebuildQueue(true);
      if (!queue.length) return;
    }
    if (playing && !paused) {
      var ok = RASpeech.pause();
      if (ok) { paused = true; updatePlayer(); return; }
      playing = false;
      paused = true;
      RASpeech.stop();
      updatePlayer();
      return;
    }
    if (paused) {
      if (RASpeech.resume() && RASpeech.paused() === false) { paused = false; playing = true; updatePlayer(); return; }
      paused = false;
      speakCurrent();
      return;
    }
    speakCurrent();
  }

  function stopPlay() {
    playing = false; paused = false; testUtter = false;
    RASpeech.stop();
    updatePlayer();
  }

  function prev() {
    if (!queue.length) return;
    index = Math.max(0, index - 1);
    highlight();
    if (playing && !paused) speakCurrent();
  }

  function next() {
    if (!queue.length) return;
    index = Math.min(queue.length - 1, index + 1);
    highlight();
    if (playing && !paused) speakCurrent();
  }

  /* ---------- news load ---------- */
  function goTab(key) {
    if (key === newsTab && source === 'news') return;
    stopPlay();
    newsTab = key;
    RAStore.set('newsTab', newsTab);
    rebuildQueue(true);
    render();
    autoCheck();
  }

  function goSource(src) {
    if (src === source) return;
    stopPlay();
    source = src;
    RAStore.set('source', source);
    rebuildQueue(true);
    render();
    if (source === 'news') autoCheck();
  }

  function afterRefresh(k) {
    if (source !== 'news' || newsTab !== k) return;
    var id = queue[index] && queue[index].id;
    queue = newsQueue();
    if (id) {
      var i = -1;
      for (var n = 0; n < queue.length; n++) { if (queue[n].id === id) { i = n; break; } }
      if (i >= 0) index = i;
      else if (index >= queue.length) index = Math.max(0, queue.length - 1);
    } else if (!playing) {
      restorePos();
    }
    if (index >= queue.length) index = Math.max(0, queue.length - 1);
    savePos();
    render();
  }

  function doRefresh() {
    if (source !== 'news' || newsTab === 'saved' || RANews.busy(newsTab)) return;
    var k = newsTab;
    render();
    RANews.refresh(k).then(function () {
      afterRefresh(k);
    }, function (e) {
      if (e === 'busy') return;
      afterRefresh(k);
      if (source === 'news' && newsTab === k) {
        if (!RANews.updated(k)) setStatus('Could not load news. Check the connection and tap Refresh.');
        else {
          var note = document.getElementById('status').textContent;
          setStatus((note ? note + ' · ' : '') + 'Could not refresh - showing saved stories.');
        }
      }
    });
  }

  function autoCheck() {
    if (source !== 'news') return;
    if (navigator.onLine === false) return;
    if (RANews.due(newsTab) && !RANews.busy(newsTab)) doRefresh();
  }

  /* ---------- text ---------- */
  function onTextChange() {
    RAStore.set('text', document.getElementById('textIn').value.slice(0, 200000));
    if (textTimer) clearTimeout(textTimer);
    textTimer = setTimeout(function () {
      var was = playing;
      if (was) stopPlay();
      rebuildQueue(true);
      render();
    }, 300);
  }

  function openFile(file) {
    if (!file) return;
    var name = (file.name || '').toLowerCase();
    if (name && !/\.(txt|md|markdown|text)$/.test(name) && file.type && file.type.indexOf('text') !== 0) {
      banner('Please choose a .txt or .md file.');
      return;
    }
    banner('');
    var reader = new FileReader();
    reader.onload = function () {
      document.getElementById('textIn').value = String(reader.result || '').slice(0, 200000);
      RAStore.set('text', document.getElementById('textIn').value);
      stopPlay();
      rebuildQueue(false);
      index = 0;
      savePos();
      render();
    };
    reader.onerror = function () { banner('Could not read that file.'); };
    reader.readAsText(file);
  }

  /* ---------- settings ---------- */
  function fillVoices() {
    var sel = document.getElementById('setVoice');
    var list = RASpeech.voices();
    var saved = RAStore.get('voice') || '';
    var picked = RASpeech.pickVoice(list, saved);
    sel.innerHTML = '';
    if (!RASpeech.available()) {
      sel.appendChild(el('option', { text: 'Not available in this browser', value: '' }));
      sel.disabled = true;
      return;
    }
    if (!list.length) {
      sel.appendChild(el('option', { text: 'Loading voices…', value: '' }));
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    list.forEach(function (v, i) {
      var label = v.name + (v.lang ? ' (' + v.lang + ')' : '');
      var o = el('option', { value: v.voiceURI || String(i), text: label });
      if (picked && v.voiceURI === picked.voiceURI) o.selected = true;
      sel.appendChild(o);
    });
  }

  function drawSettings() {
    var box = document.getElementById('setTheme');
    box.innerHTML = '';
    [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].forEach(function (o) {
      var on = RAStore.get('theme') === o[0];
      box.appendChild(el('button', { type: 'button', 'class': 'nb', role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-v': o[0], text: o[1],
        onclick: function () { RAStore.set('theme', o[0]); applyTheme(); drawSettings(); } }));
    });
    fillVoices();
    var rate = +RAStore.get('rate') || 1;
    var pitch = +RAStore.get('pitch') || 1;
    document.getElementById('setRate').value = rate;
    document.getElementById('setRateVal').textContent = rate.toFixed(2).replace(/0$/, '').replace(/\.0$/, '') + '×';
    document.getElementById('setPitch').value = pitch;
    document.getElementById('setPitchVal').textContent = String(+pitch.toFixed(2));
    document.getElementById('setOnlyNew').checked = !!RAStore.get('onlyNew');
  }

  function testVoice() {
    if (!RASpeech.available()) { banner('This browser cannot read aloud (speechSynthesis is missing).'); return; }
    var was = playing;
    if (was) stopPlay();
    testUtter = true;
    RASpeech.speak('This is the Read Aloud voice.', speechOpts(), function () { testUtter = false; }, function () { testUtter = false; });
  }

  /* ---------- boot ---------- */
  function typingTarget(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!el.isContentEditable;
  }

  function init() {
    applyTheme();
    if (window.HubTheme) HubTheme.onChange(function () { if (RAStore.get('theme') === 'auto') applyTheme(); });

    source = RAStore.get('source') === 'text' ? 'text' : 'news';
    newsTab = RAStore.get('newsTab') || 'india';
    if (newsTab !== 'saved' && newsTab.slice(0, 2) !== 'q:' && typeof NF !== 'undefined' && !NF.tabs().some(function (t) { return t[0] === newsTab; })) {
      newsTab = 'india';
    }
    document.getElementById('textIn').value = RAStore.get('text') || '';

    if (!RASpeech.available()) {
      banner('This browser cannot read aloud (speechSynthesis is missing). Try Chrome, Edge, Safari, or Firefox.');
    } else {
      RASpeech.whenVoices(function (list) {
        if (!list.length) banner('No voices are installed on this device. You can still browse headlines.');
        else banner('');
        var dlg = document.getElementById('settings');
        if (dlg.open) fillVoices();
      });
    }

    document.querySelectorAll('#srcSeg [data-src]').forEach(function (b) {
      b.addEventListener('click', function () { goSource(b.getAttribute('data-src')); });
    });
    document.getElementById('btnRef').addEventListener('click', function () { doRefresh(); });
    document.getElementById('btnPlay').addEventListener('click', playPause);
    document.getElementById('btnPrev').addEventListener('click', prev);
    document.getElementById('btnNext').addEventListener('click', next);
    document.getElementById('btnStop').addEventListener('click', stopPlay);

    document.getElementById('textIn').addEventListener('input', onTextChange);
    document.getElementById('btnClear').addEventListener('click', function () {
      document.getElementById('textIn').value = '';
      RAStore.set('text', '');
      stopPlay();
      rebuildQueue(false);
      index = 0;
      render();
    });
    document.getElementById('btnOpen').addEventListener('click', function () { document.getElementById('fileIn').click(); });
    document.getElementById('fileIn').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (f) openFile(f);
    });

    var dlg = document.getElementById('settings');
    document.getElementById('btnSet').addEventListener('click', function () { drawSettings(); dlg.showModal(); });
    document.getElementById('setClose').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    document.getElementById('setVoice').addEventListener('change', function () {
      RAStore.set('voice', this.value);
    });
    document.getElementById('setRate').addEventListener('input', function () {
      var v = +this.value;
      RAStore.set('rate', v);
      document.getElementById('setRateVal').textContent = v.toFixed(2).replace(/0$/, '').replace(/\.0$/, '') + '×';
    });
    document.getElementById('setPitch').addEventListener('input', function () {
      var v = +this.value;
      RAStore.set('pitch', v);
      document.getElementById('setPitchVal').textContent = String(+v.toFixed(2));
    });
    document.getElementById('setOnlyNew').addEventListener('change', function () {
      RAStore.set('onlyNew', !!this.checked);
      if (source === 'news') {
        var was = playing;
        if (was) stopPlay();
        rebuildQueue(true);
        render();
      }
    });
    document.getElementById('btnTest').addEventListener('click', testVoice);

    document.addEventListener('keydown', function (e) {
      if (typingTarget(e.target) || dlg.open) return;
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); playPause(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'Escape') { e.preventDefault(); stopPlay(); }
    });

    window.addEventListener('pagehide', stopPlay);
    window.addEventListener('online', function () { if (source === 'news') { render(); autoCheck(); } });
    window.addEventListener('offline', function () { if (source === 'news') render(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && source === 'news') { render(); autoCheck(); }
    });
    setInterval(function () { if (!document.hidden && source === 'news') autoCheck(); }, 60000);

    rebuildQueue(true);
    render();
    if (source === 'news') autoCheck();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
