/* Read Aloud RA2 -- ra_web.js: fetch a page through News relays and extract readable text.
   Extraction is regex/string only (no DOM, no jsdom). Usable from Node for helper tests.
   Browser fetch uses api.allorigins.win (the News HTML-capable relay). feedrapp.info is RSS-only
   and is not used here. Google News links are resolved when possible; this often fails. */
var RAWeb = (function () {
  var RAW = 'https://api.allorigins.win/raw?url=';
  var GET = 'https://api.allorigins.win/get?url=';
  var ENT = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'",
    rdquo: '"', ldquo: '"', tert: "'", minus: '-', copy: '(c)', reg: '(R)'
  };

  function decodeEntities(s) {
    s = String(s || '');
    s = s.replace(/&#x([0-9a-fA-F]+);/g, function (_, h) {
      var n = parseInt(h, 16);
      return n ? String.fromCharCode(n) : '';
    });
    s = s.replace(/&#(\d+);/g, function (_, n) {
      n = +n;
      return n ? String.fromCharCode(n) : '';
    });
    return s.replace(/&([a-zA-Z]+);/g, function (_, n) {
      var k = n.toLowerCase();
      return ENT[k] != null ? ENT[k] : '&' + n + ';';
    });
  }

  function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, ' ');
  }

  function tidyText(s) {
    s = decodeEntities(stripTags(s));
    s = s.replace(/\u00a0/g, ' ');
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n');
    s = s.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
    return s.trim();
  }

  function stripBlocks(html, tag) {
    var re = new RegExp('<' + tag + '\\b[\\s\\S]*?<\\/' + tag + '>', 'gi');
    return String(html || '').replace(re, ' ');
  }

  function cleanChrome(html) {
    var h = String(html || '');
    h = h.replace(/<!--[\s\S]*?-->/g, ' ');
    ['script', 'style', 'noscript', 'svg', 'canvas', 'form'].forEach(function (t) { h = stripBlocks(h, t); });
    ['nav', 'footer', 'aside'].forEach(function (t) { h = stripBlocks(h, t); });
    return h;
  }

  function firstMatch(html, re) {
    var m = re.exec(html);
    return m ? m[1] : '';
  }

  function attrContent(html, re) {
    var m = re.exec(html);
    return m ? decodeEntities(m[1].trim()) : '';
  }

  function pageTitle(html) {
    var h = String(html || '');
    var og = attrContent(h, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    if (!og) og = attrContent(h, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i);
    var t = tidyText(firstMatch(h, /<title[^>]*>([\s\S]*?)<\/title>/i));
    if (og && og.length > 2) return og;
    return t;
  }

  function collectBlocks(scope) {
    var parts = [], re = /<(h[1-3]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi, m;
    while ((m = re.exec(scope))) {
      var tx = tidyText(m[2]);
      if (tx) parts.push(tx);
    }
    return parts;
  }

  function innerOf(html, tag) {
    var re = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
    var m = re.exec(html);
    return m ? m[1] : '';
  }

  /* Prefer <article>, else <p>/<h1-h3> in <main> or <body>. */
  function extract(html) {
    var raw = String(html || '');
    var title = pageTitle(raw);
    var work = cleanChrome(raw);
    var article = innerOf(work, 'article');
    var text = '';
    if (article) {
      var blocks = collectBlocks(article);
      text = blocks.length ? blocks.join('\n\n') : tidyText(article);
    }
    if (!text) {
      var main = innerOf(work, 'main');
      var scope = main || innerOf(work, 'body') || work;
      var blocks2 = collectBlocks(scope);
      text = blocks2.join('\n\n');
    }
    if (!text) text = tidyText(work);
    if (title && text.toLowerCase().indexOf(title.toLowerCase()) !== 0) {
      /* keep title separate; the UI can read it first */
    }
    return { title: title, text: text };
  }

  function isGoogleNewsUrl(url) {
    return /^https?:\/\/(?:[a-z0-9-]+\.)*news\.google\./i.test(String(url || ''));
  }

  function isGoogleHost(url) {
    return /^https?:\/\/(?:[a-z0-9-]+\.)*(?:google|googleusercontent|gstatic|youtube)\./i.test(String(url || ''));
  }

  function b64urlDecode(s) {
    var t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    try {
      if (typeof atob === 'function') return atob(t);
      if (typeof Buffer !== 'undefined') return Buffer.from(t, 'base64').toString('binary');
    } catch (e) {}
    return '';
  }

  /* Best-effort: Google News article ids sometimes contain the publisher URL. */
  function resolveGoogleUrl(url) {
    var m = /news\.google\.[^/]+\/+(?:rss\/+)?articles\/([^?#]+)/i.exec(String(url || ''));
    if (!m) return '';
    var bin = b64urlDecode(decodeURIComponent(m[1]));
    if (!bin) return '';
    var found = /https?:\/\/[^\s\x00-\x1f"'<>]+/g, hit = '', x;
    while ((x = found.exec(bin))) {
      var u = x[0].replace(/[.,;:)\]]+$/, '');
      if (!isGoogleHost(u) && /^https?:\/\//.test(u)) { hit = u; break; }
      if (!hit && /^https?:\/\//.test(u)) hit = u;
    }
    return hit && !isGoogleHost(hit) ? hit : '';
  }

  function canonicalUrl(html, baseUrl) {
    var h = String(html || '');
    var can = attrContent(h, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i);
    if (!can) can = attrContent(h, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i);
    if (!can) can = attrContent(h, /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    if (!can) {
      var ref = firstMatch(h, /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"';\s]+)["'][^>]*>/i);
      if (!ref) ref = firstMatch(h, /<meta[^>]+content=["'][^"']*url=([^"';\s]+)["'][^>]+http-equiv=["']refresh["'][^>]*>/i);
      can = ref || '';
    }
    can = can.trim();
    if (can && !isGoogleHost(can) && /^https?:\/\//i.test(can) && can !== baseUrl) return can;
    return '';
  }

  function outboundLink(html) {
    var re = /<a\b[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>/gi, m;
    while ((m = re.exec(String(html || '')))) {
      var u = decodeEntities(m[1]).trim();
      if (u && !isGoogleHost(u)) return u;
    }
    return '';
  }

  function looksLikeGoogleHtml(html) {
    var h = String(html || '').slice(0, 8000);
    return /news\.google\.|Google News/i.test(h) && /<a\b/i.test(h);
  }

  function validHttpUrl(url) {
    url = String(url || '').trim();
    if (!/^https?:\/\/[^<\s]+$/i.test(url)) return '';
    return url;
  }

  function fetchViaRelay(url) {
    url = validHttpUrl(url);
    if (!url) return Promise.reject(new Error('bad-url'));
    if (typeof fetch !== 'function') return Promise.reject(new Error('no-fetch'));

    function withTimeout(u, asJson) {
      var ms = 20000, ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var t = setTimeout(function () { if (ctrl) try { ctrl.abort(); } catch (e) {} }, ms);
      var opts = { credentials: 'omit' };
      if (ctrl) opts.signal = ctrl.signal;
      return fetch(u, opts).then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error('relay-' + r.status);
        return asJson ? r.json() : r.text();
      }, function (e) {
        clearTimeout(t);
        throw e;
      });
    }

    var enc = encodeURIComponent(url);
    return withTimeout(RAW + enc, false).then(function (txt) {
      if (!txt || !String(txt).trim()) throw new Error('empty');
      return { html: String(txt), url: url };
    }).catch(function () {
      return withTimeout(GET + enc, true).then(function (j) {
        var html = j && (j.contents || j.body || '');
        if (!html) throw new Error('empty');
        var finalUrl = (j.status && (j.status.url || j.status.response_url)) || url;
        return { html: String(html), url: finalUrl };
      });
    });
  }

  function readPage(url) {
    url = validHttpUrl(url);
    if (!url) return Promise.reject(new Error('bad-url'));
    var start = resolveGoogleUrl(url) || url;

    function fromHtml(html, usedUrl, hops) {
      var dest = canonicalUrl(html, usedUrl) || (looksLikeGoogleHtml(html) ? outboundLink(html) : '');
      if (dest && dest !== usedUrl && hops < 2 && (isGoogleNewsUrl(usedUrl) || looksLikeGoogleHtml(html))) {
        return fetchViaRelay(dest).then(function (res) { return fromHtml(res.html, res.url, hops + 1); }, function () {
          return finish(html, usedUrl);
        });
      }
      return finish(html, usedUrl);
    }

    function finish(html, usedUrl) {
      var out = extract(html);
      out.url = usedUrl;
      out.fromGoogle = isGoogleNewsUrl(url);
      if (!out.text || RAWeb.wordish(out.text) < 20) {
        var err = new Error('blocked');
        err.result = out;
        return Promise.reject(err);
      }
      return out;
    }

    return fetchViaRelay(start).then(function (res) {
      return fromHtml(res.html, res.url, 0);
    }, function (e) {
      if (start !== url) {
        return fetchViaRelay(url).then(function (res) { return fromHtml(res.html, res.url, 0); });
      }
      throw e;
    });
  }

  function wordish(s) {
    return String(s || '').trim().split(/\s+/).filter(Boolean).length;
  }

  function errorMessage(err) {
    var code = err && err.message ? String(err.message) : '';
    if (code === 'bad-url') return 'Please paste a full web address starting with http:// or https://.';
    if (code === 'blocked') return 'The page was reached, but no readable article text was found. The site may have blocked the relay or needs JavaScript. You can paste the article on the Text tab instead.';
    if (/relay-/.test(code) || code === 'empty' || code === 'no-fetch') {
      return 'Could not reach that page. The free relay failed, or the site blocked it. You can paste the article text on the Text tab instead.';
    }
    if (err && err.name === 'AbortError') return 'The request timed out. The free relay may be slow or blocked. You can paste the article on the Text tab instead.';
    return 'Could not load that page. The free relay failed, or the site blocked it. You can paste the article text on the Text tab instead.';
  }

  return {
    extract: extract,
    pageTitle: pageTitle,
    decodeEntities: decodeEntities,
    tidyText: tidyText,
    isGoogleNewsUrl: isGoogleNewsUrl,
    resolveGoogleUrl: resolveGoogleUrl,
    canonicalUrl: canonicalUrl,
    outboundLink: outboundLink,
    fetchViaRelay: fetchViaRelay,
    readPage: readPage,
    errorMessage: errorMessage,
    wordish: wordish,
    validHttpUrl: validHttpUrl
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RAWeb;
