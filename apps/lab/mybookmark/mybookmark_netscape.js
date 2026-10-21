/* ============================================================
   FILE: mybookmark_netscape.js
   PROJECT: MyBookmark
   ROLE: Netscape bookmark HTML (Chrome / Edge / Firefox / Safari exports).
     MBNetscape.parse(html) → {title:'', children:[item]}   item = folder {type:'folder', title, added, children}
                                                           or bookmark {type:'bm', title, url, added, icon}
     MBNetscape.build(tree)  → html string (nested, re-importable)
   ADD_DATE is seconds since 1970 (kept as ms inside the app).
   ============================================================ */
const MBNetscape = (() => {
  const secToMs = (v) => (/^\d+$/.test(v || '') ? +v * 1000 : null);

  function parse(html) {
    if (!/<dl/i.test(html) || !/<a\s|<h3/i.test(html)) throw new Error('This file does not look like a bookmarks export (no <DL> list found).');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const used = new Set();
    function list(container, out) {
      for (const el of Array.from(container.children)) {
        const tag = el.tagName;
        if (tag === 'DT') item(el, out);
        else if ((tag === 'P' || tag === 'DL' || tag === 'DD') && !used.has(el)) { used.add(el); list(el, out); }
      }
      return out;
    }
    function item(dt, out) {
      const a = Array.from(dt.children).find((c) => c.tagName === 'A');
      const h = Array.from(dt.children).find((c) => c.tagName === 'H3');
      if (a) {
        out.push({ type: 'bm', title: (a.textContent || '').trim() || a.getAttribute('href') || '', url: a.getAttribute('href') || '',
          added: secToMs(a.getAttribute('add_date')), icon: /^data:image\//i.test(a.getAttribute('icon') || '') ? a.getAttribute('icon') : null });
      } else if (h) {
        const f = { type: 'folder', title: (h.textContent || '').trim() || 'Folder', added: secToMs(h.getAttribute('add_date')), children: [] };
        let dl = Array.from(dt.children).find((c) => c.tagName === 'DL');
        if (!dl) { let n = dt.nextElementSibling; while (n && n.tagName === 'P') n = n.nextElementSibling; if (n && n.tagName === 'DL') dl = n; }
        if (dl && !used.has(dl)) { used.add(dl); list(dl, f.children); }
        out.push(f);
      }
      /* a DT may also wrap following DTs when the file leaves tags open */
      for (const c of Array.from(dt.children)) if (c.tagName === 'DT') item(c, out);
    }
    const top = doc.body.querySelector('dl');
    if (!top) throw new Error('No bookmark list found in the file.');
    used.add(top);
    const children = list(top, []);
    return { title: (doc.querySelector('h1') || {}).textContent || '', children };
  }

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const sec = (ms) => (ms ? ' ADD_DATE="' + Math.floor(ms / 1000) + '"' : '');

  function build(tree, title) {
    const out = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>' + esc(title || 'Bookmarks') + '</TITLE>', '<H1>' + esc(title || 'Bookmarks') + '</H1>', '<DL><p>'];
    (function walk(items, ind) {
      for (const it of items) {
        if (it.type === 'folder') {
          out.push(ind + '<DT><H3' + sec(it.added) + '>' + esc(it.title) + '</H3>', ind + '<DL><p>');
          walk(it.children || [], ind + '    ');
          out.push(ind + '</DL><p>');
        } else {
          out.push(ind + '<DT><A HREF="' + esc(it.url) + '"' + sec(it.added) + (it.icon ? ' ICON="' + esc(it.icon) + '"' : '') + '>' + esc(it.title) + '</A>');
        }
      }
    })(tree, '    ');
    out.push('</DL><p>', '');
    return out.join('\n');
  }
  return { parse, build };
})();
