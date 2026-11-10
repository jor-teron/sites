/* Read Aloud RA2 -- ra_ui.js: source switch (News, Text, PDF, Web), player, sleep timer, settings, boot. */
var RELEASE = 'RA2';

(function () {
  var source = 'news', newsTab = 'india', index = 0, queue = [];
  var playing = false, paused = false, textTimer = 0, testUtter = false;
  var pdfPages = [], pdfPageCount = 0, pdfName = '';
  var webTitle = '', webText = '', webUrl = '';
  var sleepMode = 'off', sleepUntil = 0, stopAfterItem = false, sleepTick = 0;
  var SLEEP_OPTS = [
    ['off', 'Off'],
    ['5', '5 min'],
    ['10', '10 min'],
    ['15', '15 min'],
    ['30', '30 min'],
    ['60', '60 min'],
    ['item', 'End of item']
  ];

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

  function rate() { return +RAStore.get('rate') || 1; }

  function speechOpts() {
    var list = RASpeech.voices();
    var voice = RASpeech.pickVoice(list, RAStore.get('voice') || '');
    return { rate: rate(), pitch: +RAStore.get('pitch') || 1, voice: voice, lang: voice && voice.lang ? voice.lang : 'en-IN' };
  }

  function banner(msg) {
    var b = document.getElementById('banner');
    if (!msg) { b.hidden = true; b.textContent = ''; return; }
    b.hidden = false;
    b.textContent = msg;
  }

  function setStatus(t) { document.getElementById('status').textContent = t || ''; }

  function posTab() { return source === 'news' ? newsTab : ''; }

  function savePos() {
    var item = queue[index];
    var rec = { i: index, id: item ? (item.id || '') : '' };
    if (item && item.page) rec.page = item.page;
    if (source === 'pdf' && pdfName) rec.name = pdfName;
    RAStore.setPos(source, posTab(), rec);
  }

  function restorePos() {
    var rec = RAStore.getPos(source, posTab());
    if (!rec || !queue.length) { index = 0; return; }
    if (source === 'pdf' && rec.name && pdfName && rec.name !== pdfName) { index = 0; return; }
    var i = -1;
    if (rec.id) {
      for (var n = 0; n < queue.length; n++) { if (queue[n].id === rec.id) { i = n; break; } }
    }
    if (i < 0 && rec.page && source === 'pdf') {
      for (var p = 0; p < queue.length; p++) { if (queue[p].page === rec.page) { i = p; break; } }
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

  function pdfQueue() {
    var out = [];
    pdfPages.forEach(function (p) {
      RAText.sentences(p.text).forEach(function (s, i) {
        out.push({ id: 'p' + p.page + ':' + i + ':' + s.slice(0, 40), title: s, speak: s, kind: 'pdf', page: p.page, pages: pdfPageCount });
      });
    });
    return out;
  }

  function webQueue() {
    var body = webText || '';
    var list = [];
    if (webTitle) {
      list.push({ id: 'wt:' + webTitle.slice(0, 40), title: webTitle, speak: webTitle, kind: 'web', isTitle: true });
    }
    RAText.sentences(body).forEach(function (s, i) {
      list.push({ id: 'w' + i + ':' + s.slice(0, 40), title: s, speak: s, kind: 'web' });
    });
    return list;
  }

  function rebuildQueue(keepPos) {
    queue = source === 'news' ? newsQueue() : source === 'pdf' ? pdfQueue() : source === 'web' ? webQueue() : textQueue();
    if (keepPos) restorePos();
    else index = Math.max(0, Math.min(index, Math.max(0, queue.length - 1)));
    if (!queue.length) index = 0;
    savePos();
  }

  function sourceText() {
    if (source === 'text') return RAText.stripMd(document.getElementById('textIn').value || '');
    if (source === 'pdf') return pdfPages.map(function (p) { return p.text; }).join('\n');
    if (source === 'web') return ((webTitle ? webTitle + '\n' : '') + (webText || '')).trim();
    return '';
  }

  /* ---------- render ---------- */
  function drawSource() {
    document.querySelectorAll('#srcSeg [data-src]').forEach(function (b) {
      var on = b.getAttribute('data-src') === source;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.getElementById('paneNews').hidden = source !== 'news';
    document.getElementById('paneText').hidden = source !== 'text';
    document.getElementById('panePdf').hidden = source !== 'pdf';
    document.getElementById('paneWeb').hidden = source !== 'web';
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
        only ? 'No new stories in this tab. Turn off Only new stories in Settings to hear all headlines.' :
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
        var read = item.link ? el('button', { type: 'button', 'class': 'card-open', text: 'Read article', onclick: function (e) { e.preventDefault(); e.stopPropagation(); readArticle(item); } }) : null;
        var acts = el('div', { 'class': 'card-acts' }, [read, open]);
        var card = el('article', { 'class': 'card' + (i === index ? ' on' : ''), id: 'item-' + i, tabindex: '0', role: 'button',
          'aria-current': i === index ? 'true' : 'false',
          onclick: function () { playFrom(i); },
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); playFrom(i); } } },
          [el('div', { 'class': 'card-body' }, [el('div', { 'class': 'card-h', text: item.title }), el('div', { 'class': 'card-m' }, metaKids)]), acts]);
        box.appendChild(card);
      });
    }
    pane.appendChild(box);
    scrollCurrent();
  }

  function fillSentenceList(listEl, emptyMsg, noSentMsg, hasContent) {
    listEl.innerHTML = '';
    if (!hasContent) {
      listEl.appendChild(el('p', { 'class': 'empty', text: emptyMsg }));
      return;
    }
    if (!queue.length) {
      listEl.appendChild(el('p', { 'class': 'empty', text: noSentMsg }));
      return;
    }
    var lastPage = 0;
    queue.forEach(function (item, i) {
      if (item.page && item.page !== lastPage) {
        lastPage = item.page;
        listEl.appendChild(el('div', { 'class': 'page-lab', text: 'Page ' + item.page + (item.pages ? ' of ' + item.pages : '') }));
      }
      if (item.isTitle) {
        listEl.appendChild(el('button', { type: 'button', 'class': 'sent' + (i === index ? ' on' : ''), id: 'item-' + i,
          'aria-current': i === index ? 'true' : 'false', onclick: function () { playFrom(i); }, text: item.title }));
        return;
      }
      listEl.appendChild(el('button', { type: 'button', 'class': 'sent' + (i === index ? ' on' : ''), id: 'item-' + i,
        'aria-current': i === index ? 'true' : 'false', onclick: function () { playFrom(i); }, text: item.title }));
    });
    scrollCurrent();
  }

  function drawTextPane() {
    var raw = document.getElementById('textIn').value;
    document.getElementById('textMeta').textContent = raw ? RAText.metaLine(RAText.stripMd(raw), rate()) : '';
    fillSentenceList(document.getElementById('sentList'),
      'Paste text or open a .txt or .md file, then press Play.',
      'No sentences found in that text.',
      !!raw.trim());
  }

  function drawPdfPane() {
    document.getElementById('pdfName').textContent = pdfName || '';
    var goto = document.getElementById('pdfGoto');
    goto.hidden = !pdfPageCount;
    document.getElementById('pdfPages').textContent = String(pdfPageCount || 0);
    var cur = queue[index] && queue[index].page;
    if (cur) document.getElementById('pdfPage').value = String(cur);
    var extra = pdfPageCount ? (pdfPageCount + (pdfPageCount === 1 ? ' page' : ' pages')) : '';
    document.getElementById('pdfMeta').textContent = pdfPages.length ? RAText.metaLine(sourceText(), rate(), extra) : '';
    var msg = pdfName && !pdfPages.length ? 'This PDF is not loaded. Open it again to continue from where you left off.' :
      'Open a PDF from this device. Text is read page by page, sentence by sentence. Scanned PDFs with no text layer cannot be read here.';
    fillSentenceList(document.getElementById('pdfList'), msg, 'No sentences found in this PDF.', pdfPages.length > 0);
  }

  function drawWebPane() {
    if (document.activeElement !== document.getElementById('webUrl')) {
      document.getElementById('webUrl').value = webUrl || RAStore.get('webUrl') || '';
    }
    var t = document.getElementById('webTitle');
    if (webTitle) { t.hidden = false; t.textContent = webTitle; }
    else { t.hidden = true; t.textContent = ''; }
    document.getElementById('webMeta').textContent = webText ? RAText.metaLine((webTitle ? webTitle + ' ' : '') + webText, rate()) : '';
    fillSentenceList(document.getElementById('webList'),
      'Paste a web address and tap Fetch. Pages are loaded through a free relay, and many sites block that, so this often fails. You can paste the article on the Text tab instead.',
      'No readable text was found on that page.',
      !!(webText || webTitle));
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

  function paneStatus() {
    if (source === 'news') { newsStatus(); return; }
    if (source === 'pdf' && pdfName && pdfPageCount) {
      var cur = queue[index] && queue[index].page;
      setStatus((pdfName || 'PDF') + (cur ? ' · page ' + cur + ' of ' + pdfPageCount : ''));
      return;
    }
    if (source === 'web' && webTitle) { setStatus(webTitle); return; }
    setStatus('');
  }

  function render() {
    drawSource();
    if (source === 'news') {
      drawNewsTabs();
      drawNewsList();
    } else if (source === 'pdf') {
      drawPdfPane();
    } else if (source === 'web') {
      drawWebPane();
    } else {
      drawTextPane();
    }
    paneStatus();
    updatePlayer();
    updateSleepChip();
  }

  function scrollCurrent() {
    var node = document.getElementById('item-' + index);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ---------- player ---------- */
  function nowText() {
    if (!queue.length) {
      if (source === 'news') return 'No stories to read';
      if (source === 'pdf') return pdfName ? 'No text to read in this PDF' : 'Open a PDF to read';
      if (source === 'web') return 'Nothing to read yet';
      return 'Nothing to read yet';
    }
    var item = queue[index];
    if (!item) return '';
    var n = (index + 1) + ' of ' + queue.length;
    var prefix = playing || paused ? (paused ? 'Paused · ' : 'Reading · ') : '';
    if (item.page) return prefix + n + ' · page ' + item.page + ' · ' + item.title;
    return prefix + n + ' · ' + item.title;
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
    if (source === 'pdf') {
      var cur = queue[index] && queue[index].page;
      if (cur) document.getElementById('pdfPage').value = String(cur);
    }
    updateSleepChip();
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
    paneStatus();
  }

  function sleepExpired() { return sleepUntil && Date.now() >= sleepUntil; }

  function finishSleep(reason) {
    stopAfterItem = false;
    sleepUntil = 0;
    if (sleepMode === 'item') setSleepMode('off', false);
    stopPlay();
    banner(reason === 'item' ? 'Sleep timer: stopped at the end of the item.' : 'Sleep timer: time is up.');
    updateSleepChip();
  }

  function onItemEnd() {
    if (stopAfterItem || sleepMode === 'item' && playing) {
      finishSleep('item');
      return true;
    }
    if (sleepExpired()) {
      finishSleep('time');
      return true;
    }
    return false;
  }

  function armSleepOnPlay() {
    if (sleepMode === 'item') stopAfterItem = true;
    var mins = parseInt(sleepMode, 10);
    if (mins && !sleepUntil) sleepUntil = Date.now() + mins * 60000;
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
    armSleepOnPlay();
    highlight();
    RASpeech.speak(item.speak, speechOpts(), function (why) {
      if (testUtter) { testUtter = false; return; }
      if (!playing) return;
      if (why === 'canceled' || why === 'interrupted') return;
      if (onItemEnd()) return;
      if (index + 1 < queue.length) {
        index += 1;
        highlight();
        setTimeout(function () { if (playing && !paused) speakCurrent(); }, 80);
      } else {
        playing = false; paused = false;
        sleepUntil = 0;
        stopAfterItem = false;
        updatePlayer();
      }
    }, function () {
      if (!playing) return;
      if (onItemEnd()) return;
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
      if (source === 'text' || source === 'web' || source === 'pdf') rebuildQueue(true);
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
      if (RASpeech.resume() && RASpeech.paused() === false) { paused = false; playing = true; armSleepOnPlay(); updatePlayer(); return; }
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
      if (playing) stopPlay();
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

  /* ---------- PDF ---------- */
  function goPdfPage(num, startPlay) {
    num = parseInt(num, 10);
    if (!num || !pdfPageCount) return;
    if (num < 1 || num > pdfPageCount) {
      banner('That page is not in this PDF (1 to ' + pdfPageCount + ').');
      return;
    }
    banner('');
    var i = -1;
    for (var n = 0; n < queue.length; n++) { if (queue[n].page === num) { i = n; break; } }
    if (i < 0) {
      banner('No readable text on page ' + num + '.');
      return;
    }
    index = i;
    highlight();
    if (startPlay || (playing && !paused)) speakCurrent();
  }

  function openPdf(file) {
    if (!file) return;
    var name = file.name || 'document.pdf';
    banner('Loading PDF…');
    var btn = document.getElementById('btnOpenPdf');
    btn.classList.add('spin');
    btn.disabled = true;
    var reader = new FileReader();
    reader.onload = function () {
      var buf = reader.result;
      var data = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
      RAPdf.extract(data).then(function (res) {
        btn.classList.remove('spin');
        btn.disabled = false;
        pdfName = name;
        pdfPages = res.pages || [];
        pdfPageCount = res.pageCount || pdfPages.length;
        RAStore.set('pdfName', pdfName);
        stopPlay();
        if (res.empty) {
          queue = [];
          index = 0;
          render();
          banner(RAPdf.emptyMessage());
          return;
        }
        banner('');
        rebuildQueue(true);
        render();
      }, function (err) {
        btn.classList.remove('spin');
        btn.disabled = false;
        banner(RAPdf.errorMessage(err));
      });
    };
    reader.onerror = function () {
      btn.classList.remove('spin');
      btn.disabled = false;
      banner('Could not read that file.');
    };
    reader.readAsArrayBuffer(file);
  }

  /* ---------- web ---------- */
  function applyWeb(out, url) {
    webUrl = out.url || url || '';
    webTitle = out.title || '';
    webText = (out.text || '').slice(0, 200000);
    RAStore.set('webUrl', webUrl);
    RAStore.set('webTitle', webTitle);
    RAStore.set('webText', webText);
  }

  function fetchWeb(url, thenPlay) {
    url = RAWeb.validHttpUrl(url);
    if (!url) { banner(RAWeb.errorMessage({ message: 'bad-url' })); return; }
    var btn = document.getElementById('btnFetch');
    btn.classList.add('spin');
    btn.disabled = true;
    banner('Loading page…');
    RAWeb.readPage(url).then(function (out) {
      btn.classList.remove('spin');
      btn.disabled = false;
      applyWeb(out, url);
      stopPlay();
      banner('');
      rebuildQueue(false);
      index = 0;
      savePos();
      render();
      if (thenPlay) playFrom(0);
    }, function (err) {
      btn.classList.remove('spin');
      btn.disabled = false;
      banner(RAWeb.errorMessage(err));
    });
  }

  function readArticle(item) {
    if (!item || !item.link) return;
    banner('Loading article…');
    RAWeb.readPage(item.link).then(function (out) {
      applyWeb(out, item.link);
      stopPlay();
      source = 'web';
      RAStore.set('source', 'web');
      banner('');
      rebuildQueue(false);
      index = 0;
      savePos();
      render();
      playFrom(0);
    }, function (err) {
      banner(RAWeb.errorMessage(err) + ' Reading the headline instead.');
      var i = 0;
      for (var n = 0; n < queue.length; n++) { if (queue[n].id === item.id) { i = n; break; } }
      playFrom(i);
    });
  }

  /* ---------- sleep ---------- */
  function normSleep(v) {
    v = v == null ? 'off' : String(v);
    if (v === 'item' || v === 'off') return v;
    if (['5', '10', '15', '30', '60'].indexOf(v) >= 0) return v;
    return 'off';
  }

  function setSleepMode(mode, fromPlay) {
    mode = normSleep(mode);
    sleepMode = mode;
    RAStore.set('sleep', mode);
    stopAfterItem = mode === 'item' && (playing || fromPlay);
    var mins = parseInt(mode, 10);
    if (mode === 'off' || mode === 'item') {
      sleepUntil = 0;
    } else if (playing && !paused) {
      sleepUntil = Date.now() + mins * 60000;
    } else {
      sleepUntil = 0;
    }
    updateSleepChip();
    drawSleepSegs();
  }

  function sleepChipLabel() {
    if (sleepMode === 'item') return 'Sleep: this item';
    if (sleepUntil && sleepMode !== 'off') {
      var s = Math.max(0, Math.round((sleepUntil - Date.now()) / 1000));
      var m = Math.floor(s / 60), r = s % 60;
      return 'Sleep ' + m + ':' + (r < 10 ? '0' : '') + r;
    }
    if (sleepMode !== 'off') return 'Sleep ' + sleepMode + ' min';
    return 'Sleep off';
  }

  function updateSleepChip() {
    var b = document.getElementById('btnSleep');
    if (!b) return;
    if (sleepExpired() && playing) {
      stopAfterItem = true;
    }
    b.textContent = sleepChipLabel();
    b.classList.toggle('on', sleepMode !== 'off');
  }

  function drawSleepSegs() {
    function fill(id) {
      var box = document.getElementById(id);
      if (!box) return;
      box.innerHTML = '';
      SLEEP_OPTS.forEach(function (o) {
        var on = sleepMode === o[0];
        box.appendChild(el('button', { type: 'button', 'class': 'nb', role: 'radio', 'aria-checked': on ? 'true' : 'false', text: o[1],
          onclick: function () { setSleepMode(o[0]); } }));
      });
    }
    fill('setSleep');
    fill('sleepSeg');
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
    var r = rate();
    var pitch = +RAStore.get('pitch') || 1;
    document.getElementById('setRate').value = r;
    document.getElementById('setRateVal').textContent = r.toFixed(2).replace(/0$/, '').replace(/\.0$/, '') + '×';
    document.getElementById('setPitch').value = pitch;
    document.getElementById('setPitchVal').textContent = String(+pitch.toFixed(2));
    document.getElementById('setOnlyNew').checked = !!RAStore.get('onlyNew');
    drawSleepSegs();
  }

  function testVoice() {
    if (!RASpeech.available()) { banner('This browser cannot read aloud (speechSynthesis is missing).'); return; }
    if (playing) stopPlay();
    testUtter = true;
    RASpeech.speak('This is the Read Aloud voice.', speechOpts(), function () { testUtter = false; }, function () { testUtter = false; });
  }

  /* ---------- boot ---------- */
  function typingTarget(node) {
    if (!node) return false;
    var tag = (node.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!node.isContentEditable;
  }

  function init() {
    applyTheme();
    if (window.HubTheme) HubTheme.onChange(function () { if (RAStore.get('theme') === 'auto') applyTheme(); });

    var src = RAStore.get('source');
    source = (src === 'text' || src === 'pdf' || src === 'web') ? src : 'news';
    newsTab = RAStore.get('newsTab') || 'india';
    if (newsTab !== 'saved' && newsTab.slice(0, 2) !== 'q:' && typeof NF !== 'undefined' && !NF.tabs().some(function (t) { return t[0] === newsTab; })) {
      newsTab = 'india';
    }
    document.getElementById('textIn').value = RAStore.get('text') || '';
    webUrl = RAStore.get('webUrl') || '';
    webTitle = RAStore.get('webTitle') || '';
    webText = RAStore.get('webText') || '';
    pdfName = RAStore.get('pdfName') || '';
    sleepMode = normSleep(RAStore.get('sleep'));
    document.getElementById('webUrl').value = webUrl;

    if (!RASpeech.available()) {
      banner('This browser cannot read aloud (speechSynthesis is missing). Try Chrome, Edge, Safari, or Firefox.');
    } else {
      RASpeech.whenVoices(function (list) {
        if (!list.length) banner('No voices are installed on this device. You can still browse headlines.');
        else if (document.getElementById('banner').textContent.indexOf('speechSynthesis') === -1 &&
          document.getElementById('banner').textContent.indexOf('voices') === -1) { /* keep other banners */ }
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

    document.getElementById('btnOpenPdf').addEventListener('click', function () { document.getElementById('pdfIn').click(); });
    document.getElementById('pdfIn').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (f) openPdf(f);
    });
    document.getElementById('btnGoPage').addEventListener('click', function () {
      goPdfPage(document.getElementById('pdfPage').value, false);
    });
    document.getElementById('pdfPage').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); goPdfPage(this.value, false); }
    });

    document.getElementById('webForm').addEventListener('submit', function (e) {
      e.preventDefault();
      fetchWeb(document.getElementById('webUrl').value, false);
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
      if (source === 'text' || source === 'pdf' || source === 'web') render();
    });
    document.getElementById('setPitch').addEventListener('input', function () {
      var v = +this.value;
      RAStore.set('pitch', v);
      document.getElementById('setPitchVal').textContent = String(+v.toFixed(2));
    });
    document.getElementById('setOnlyNew').addEventListener('change', function () {
      RAStore.set('onlyNew', !!this.checked);
      if (source === 'news') {
        if (playing) stopPlay();
        rebuildQueue(true);
        render();
      }
    });
    document.getElementById('btnTest').addEventListener('click', testVoice);

    var sd = document.getElementById('sleepDlg');
    document.getElementById('btnSleep').addEventListener('click', function () { drawSleepSegs(); sd.showModal(); });
    document.getElementById('sleepClose').addEventListener('click', function () { sd.close(); });
    sd.addEventListener('click', function (e) { if (e.target === sd) sd.close(); });

    document.addEventListener('keydown', function (e) {
      if (typingTarget(e.target) || dlg.open || sd.open) return;
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
    sleepTick = setInterval(function () {
      updateSleepChip();
      if (sleepExpired() && playing && !paused) stopAfterItem = true;
    }, 1000);

    rebuildQueue(true);
    render();
    if (source === 'news') autoCheck();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
