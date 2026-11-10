/* Remote — rm_dav_xml.js: parse a WebDAV PROPFIND multistatus body into file entries.
 * Uses DOMParser in the browser. In node tests (or if DOMParser is missing) a small
 * fallback parser is used. No network, so node can unit-test it.
 *
 * Each entry is { href, name, isDir, size, mtime } (mtime in ms, or 0).
 * The collection that was listed (the "self" href) is omitted when baseUrl is given.
 */
(function (root) {
  'use strict';

  /* URL helpers, used to name entries and skip the listed collection itself. */
  var Url = root.RMDavUrl || (typeof require === 'function' ? require('./rm_dav_url.js') : {});

  /* Decode the common XML entities that appear in href and displayname text. */
  function unescapeXml(s) {
    return String(s || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  /* Local tag name, lower-cased, with any namespace prefix removed. */
  function localName(tag) {
    var n = String(tag || '');
    var i = n.indexOf(':');
    return (i >= 0 ? n.slice(i + 1) : n).toLowerCase();
  }

  /**
   * Tiny XML tree builder used when DOMParser is not available.
   * Returns a root node { name, text, children }. Good enough for well-formed
   * PROPFIND replies (prefixed or default-namespace tags, comments, self-closing tags).
   */
  function parseXmlFallback(xml) {
    var s = String(xml || '').replace(/<\?xml[^?]*\?>/i, '').replace(/<!--[\s\S]*?-->/g, '');
    var i = 0;
    function skipSpace() { while (i < s.length && /\s/.test(s.charAt(i))) i++; }
    function parseNode() {
      skipSpace();
      if (s.charAt(i) !== '<' || s.substr(i, 2) === '</') return null;
      /* Skip doctype or processing instructions. */
      if (s.substr(i, 2) === '<?' || s.substr(i, 2) === '<!') {
        var bang = s.indexOf('>', i);
        if (bang < 0) return null;
        i = bang + 1;
        return parseNode();
      }
      var m = /^<([A-Za-z_][\w.\-:]*)([^>]*)>/.exec(s.slice(i));
      if (!m) return null;
      i += m[0].length;
      var node = { name: localName(m[1]), text: '', children: [] };
      if (/\/\s*$/.test(m[2]) || m[0].slice(-2) === '/>') return node;
      var textParts = [];
      while (i < s.length) {
        if (s.substr(i, 2) === '</') {
          var close = s.indexOf('>', i);
          i = close < 0 ? s.length : close + 1;
          break;
        }
        if (s.charAt(i) === '<') {
          var child = parseNode();
          if (child) node.children.push(child);
          else break;
        } else {
          var j = s.indexOf('<', i);
          if (j < 0) j = s.length;
          textParts.push(s.slice(i, j));
          i = j;
        }
      }
      node.text = unescapeXml(textParts.join('')).trim();
      return node;
    }
    var rootNode = { name: '#doc', text: '', children: [] };
    while (i < s.length) {
      skipSpace();
      if (i >= s.length) break;
      var n = parseNode();
      if (!n) break;
      rootNode.children.push(n);
    }
    return rootNode;
  }

  /* Walk a fallback tree and return every descendant (including the node) with this local name. */
  function findAllTree(node, name, out) {
    out = out || [];
    if (!node) return out;
    if (node.name === name) out.push(node);
    (node.children || []).forEach(function (ch) { findAllTree(ch, name, out); });
    return out;
  }

  /* First descendant with this local name, or null. */
  function findOneTree(node, name) {
    var all = findAllTree(node, name);
    return all[0] || null;
  }

  /* Text of the first descendant with this local name. */
  function textTree(node, name) {
    var el = findOneTree(node, name);
    return el ? String(el.text || '').trim() : '';
  }

  /* Wrap a DOM element so the same find helpers work as for the fallback tree. */
  function fromDom(el) {
    if (!el) return null;
    var node = { name: localName(el.localName || el.tagName || el.nodeName), text: '', children: [] };
    var kids = el.childNodes || [];
    var texts = [];
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 1) node.children.push(fromDom(k));
      else if (k.nodeType === 3 || k.nodeType === 4) texts.push(k.nodeValue || '');
    }
    node.text = texts.join('').trim();
    return node;
  }

  /* Parse an XML string into the fallback tree shape, via DOMParser when it exists. */
  function toTree(xml) {
    var Parser = (typeof DOMParser !== 'undefined') ? DOMParser : (root.DOMParser || null);
    if (Parser) {
      try {
        var doc = new Parser().parseFromString(String(xml || ''), 'application/xml');
        var err = doc.getElementsByTagName('parsererror')[0];
        if (err) return parseXmlFallback(xml);
        return fromDom(doc.documentElement);
      } catch (e) {
        return parseXmlFallback(xml);
      }
    }
    return parseXmlFallback(xml);
  }

  /* Parse an HTTP last-modified date into milliseconds, or 0. */
  function parseTime(raw) {
    if (!raw) return 0;
    var t = Date.parse(raw);
    return isNaN(t) ? 0 : t;
  }

  /**
   * Parse a multistatus XML body.
   * baseUrl, if given, is the collection that was listed; its own response is skipped.
   * Returns an array of { href, name, isDir, size, mtime }.
   */
  function parseMultistatus(xml, baseUrl) {
    var tree = toTree(xml);
    if (!tree) return [];
    var responses = findAllTree(tree, 'response');
    var out = [];
    responses.forEach(function (resp) {
      var href = textTree(resp, 'href');
      if (!href) return;
      /* Prefer a 2xx propstat; if none, still read the first prop. */
      var props = findAllTree(resp, 'propstat').filter(function (ps) {
        var st = textTree(ps, 'status');
        return !st || /\s2\d\d\s/.test(st);
      });
      var propSrc = props[0] || resp;
      var isDir = !!findOneTree(propSrc, 'collection');
      var size = parseInt(textTree(propSrc, 'getcontentlength'), 10) || 0;
      var mtime = parseTime(textTree(propSrc, 'getlastmodified'));
      var display = textTree(propSrc, 'displayname');
      var name = display || (Url.nameFromHref ? Url.nameFromHref(href, baseUrl) : href);
      if (baseUrl && Url.sameHref && Url.sameHref(href, baseUrl)) return;
      if (!name) return;
      out.push({ href: href, name: name, isDir: isDir, size: size, mtime: mtime });
    });
    return out;
  }

  /* Public API, also exported for Node tests. */
  var api = {
    parseMultistatus: parseMultistatus,
    parseXmlFallback: parseXmlFallback,
    unescapeXml: unescapeXml
  };
  root.RMDavXml = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
