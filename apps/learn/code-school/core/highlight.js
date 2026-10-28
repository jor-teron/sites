/* Code School CS1a — a small syntax highlighter for one HTML page with <style> (CSS) and <script> (JavaScript) inside.
   CS.highlight(text) returns escaped HTML with <span class="h-…"> around tags, attributes, strings, comments, CSS
   selectors and properties, JS keywords, numbers and function names. It never changes the text, only wraps it, so the
   coloured layer lines up exactly with the textarea above it. Unclosed strings/comments simply run to the end. */
window.CS = window.CS || {};
(() => {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sp = (c, s) => c ? '<span class="h-' + c + '">' + esc(s) + '</span>' : esc(s);
  // rules: [class or fn(match) -> html|null, sticky regex]; the first rule that matches at i wins
  function lex(src, rules) {
    let out = '', plain = '', i = 0;
    next: while (i < src.length) {
      for (const [c, re] of rules) {
        re.lastIndex = i; const m = re.exec(src);
        if (!m || !m[0]) continue;
        const html = typeof c === 'function' ? c(m[0]) : sp(c, m[0]);
        if (html == null) continue;
        out += esc(plain) + html; plain = ''; i += m[0].length; continue next;
      }
      plain += src[i++];
    }
    return out + esc(plain);
  }
  const KW = /(?:var|let|const|function|return|if|else|for|while|do|break|continue|new|this|class|extends|of|in|typeof|instanceof|switch|case|default|try|catch|finally|throw|async|await|true|false|null|undefined)(?![\w$])/y;
  const js = src => lex(src, [
    ['com', /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y],
    ['str', /'(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?|`(?:\\[\s\S]|[^`\\])*`?/y],
    ['kw', KW],
    ['fn', /[A-Za-z_$][\w$]*(?=\s*\()/y],
    ['num', /\d[\w.]*/y],
    ['', /[A-Za-z_$][\w$]*|\s+/y]
  ]);
  function css(src) {
    let depth = 0;
    return lex(src, [
      ['com', /\/\*[\s\S]*?(?:\*\/|$)/y],
      ['str', /"[^"\n]*"?|'[^'\n]*'?/y],
      [s => { depth = Math.max(0, depth + (s === '{' ? 1 : -1)); return sp('pun', s); }, /[{}]/y],
      ['kw', /@[\w-]+|!important/y],
      [s => depth ? null : sp('sel', s), /[^{}"'\/@]+/y],
      [s => depth ? sp('prop', s) : null, /[-\w]+(?=\s*:)/y],
      ['num', /#[0-9a-fA-F]{3,8}(?![\w-])|-?\.?\d[\d.]*(?:px|em|rem|vh|vw|vmin|vmax|deg|ms|s|fr|%)?/y],
      ['', /[-\w]+|\s+/y]
    ]);
  }
  const ATTR = /(\s+)|([^\s"'>\/=]+)|(=)|("[^"]*"?|'[^']*'?)|(\/)|(>)/y;
  function html(src) {
    const low = src.toLowerCase(), n = src.length, TAG = /<(\/?)([A-Za-z!][\w-]*)/y;
    let out = '', i = 0;
    while (i < n) {
      const lt = src.indexOf('<', i);
      if (lt < 0) { out += esc(src.slice(i)); break; }
      out += esc(src.slice(i, lt)); i = lt;
      if (src.startsWith('<!--', i)) { let e = src.indexOf('-->', i + 4); e = e < 0 ? n : e + 3; out += sp('com', src.slice(i, e)); i = e; continue; }
      TAG.lastIndex = i; const t = TAG.exec(src);
      if (!t) { out += '&lt;'; i++; continue; }
      out += sp('pun', '<' + t[1]) + sp('tag', t[2]); i += t[0].length;
      let closed = false, m, wasName = '';
      while (i < n && !closed) {
        ATTR.lastIndex = i; m = ATTR.exec(src); if (!m) { out += esc(src[i++]); continue; }
        if (m[1]) out += m[1];
        else if (m[2]) out += sp(wasName === '=' ? 'str' : 'attr', m[2]);
        else if (m[4]) out += sp('str', m[4]);
        else { out += sp('pun', m[0]); closed = !!m[6]; }
        if (!m[1]) wasName = m[3] ? '=' : '';
        i += m[0].length;
      }
      const name = t[2].toLowerCase();
      if (closed && !t[1] && (name === 'style' || name === 'script')) {
        let e = low.indexOf('</' + name, i); if (e < 0) e = n;
        out += (name === 'style' ? css : js)(src.slice(i, e)); i = e;
      }
    }
    return out;
  }
  window.CS.highlight = html; window.CS.hlCss = css; window.CS.hlJs = js;
})();
