/*
  File: basic-mail-sanitize.js
  Project: basic-mail
  Purpose: Turn untrusted email HTML into a srcdoc page for the sandboxed reader frame.
  Removes active content (scripts, frames, forms, handlers, javascript:/data: links).
  Keeps the mail's own CSS so it looks right, but the frame contains it.
  Remote images are neutralised unless showImages is true. A strict CSP is written
  into the page head as a second wall (the sandbox has no scripts and no same-origin).
*/

/* Elements removed with their content. */
var BM_DROP_TAGS = "script, noscript, iframe, frame, frameset, object, embed, applet, form, base, meta, link, " +
  "template, portal, animate, set, title";

/* Attributes that carry a URL. Checked for dangerous schemes. */
var BM_URL_ATTRS = ["href", "src", "xlink:href", "action", "formaction", "background", "poster", "lowsrc",
  "dynsrc", "data", "codebase", "cite", "longdesc", "ping", "manifest", "srcset"];

/* Attributes removed whatever their value. */
var BM_DROP_ATTRS = ["srcdoc", "formaction", "action", "ping", "http-equiv"];

/* Text of a URL with spaces and control characters removed, lower case, for scheme checks. */
function bmCleanUrl(value) {
  return String(value || "").replace(/[\u0000-\u0020\u007f-\u00a0\u2028\u2029]+/g, "").toLowerCase();
}

/* True when a URL would run code or smuggle a document. data:image is allowed for img only. */
function bmBadUrl(value, allowDataImage) {
  var url = bmCleanUrl(value);
  if (/^(javascript|vbscript|livescript|mocha|file|filesystem|blob):/.test(url)) {
    return true;
  }
  if (url.indexOf("data:") === 0) {
    return !(allowDataImage && /^data:image\/(png|gif|jpe?g|webp|bmp|avif);/.test(url));
  }
  return false;
}

/* True for a URL that would fetch from the network (http, https, or protocol-relative). */
function bmRemote(value) {
  var url = bmCleanUrl(value);
  return /^(https?:)?\/\//.test(url);
}

/* Replace remote url(...) in CSS text with none. Returns { text, hits }. */
function bmBlockCssUrls(text) {
  var hits = 0;
  var out = String(text).replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, function (all, quote, inner) {
    if (bmRemote(inner) || bmBadUrl(inner, true)) {
      hits++;
      return "none";
    }
    return all;
  });
  /* @import pulls a remote sheet. CSP blocks it too; drop it here anyway. */
  out = out.replace(/@import[^;]*;?/gi, function () {
    hits++;
    return "";
  });
  return { text: out, hits: hits };
}

/* CSP for the mail page. Images from the network only when the user asked. */
function bmFrameCsp(showImages) {
  return "default-src 'none'; style-src 'unsafe-inline'; font-src data:; " +
    "img-src data: cid:" + (showImages ? " https: http:" : "") + "; " +
    "media-src 'none'; form-action 'none'; base-uri 'none'";
}

/* Untrusted mail HTML in, { html, blocked } out. blocked counts hidden remote images. */
function bmSanitize(raw, showImages) {
  var doc = new DOMParser().parseFromString(String(raw || ""), "text/html");
  var blocked = 0;
  doc.querySelectorAll(BM_DROP_TAGS).forEach(function (node) {
    node.remove();
  });
  doc.querySelectorAll("*").forEach(function (node) {
    var tag = node.tagName.toLowerCase();
    Array.prototype.slice.call(node.attributes).forEach(function (attr) {
      var name = attr.name.toLowerCase();
      var value = attr.value || "";
      if (name.indexOf("on") === 0 || BM_DROP_ATTRS.indexOf(name) !== -1) {
        node.removeAttribute(attr.name);
        return;
      }
      if (BM_URL_ATTRS.indexOf(name) !== -1 || name === "href" || /:href$/.test(name)) {
        var isImg = (tag === "img" || tag === "image") && (name === "src" || /href$/.test(name));
        if (bmBadUrl(value, isImg)) {
          node.removeAttribute(attr.name);
          return;
        }
        var fetches = name !== "href" && name !== "cite" && name !== "longdesc" && !/:href$/.test(name);
        if (tag === "image" || tag === "use" || tag === "feimage") {
          fetches = true;
        }
        if (fetches && !showImages && (bmRemote(value) || name === "srcset")) {
          node.removeAttribute(attr.name);
          blocked++;
        }
        return;
      }
      if (name === "style") {
        var css = bmBlockCssUrls(value);
        if (!showImages && css.hits) {
          node.setAttribute("style", css.text);
          blocked += css.hits;
        } else if (showImages && /url\(\s*['"]?\s*(javascript|vbscript|data:(?!image\/))/i.test(value)) {
          node.setAttribute("style", css.text);
        }
      }
    });
    if (tag === "a" || tag === "area") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    if (tag === "style" && !showImages) {
      var sheet = bmBlockCssUrls(node.textContent);
      if (sheet.hits) {
        node.textContent = sheet.text;
        blocked += sheet.hits;
      }
    }
  });
  var head = doc.head;
  var first = head.firstChild;
  function put(html) {
    var holder = doc.createElement("div");
    holder.innerHTML = html;
    head.insertBefore(holder.firstChild, first);
  }
  /* Our own head comes first so the CSP applies before any mail markup. */
  put('<meta http-equiv="Content-Security-Policy" content="' + bmFrameCsp(showImages) + '">');
  put('<meta name="referrer" content="no-referrer">');
  put('<base target="_blank">');
  put("<style>html{background:#fff;color:#222;}body{margin:12px;font:15px/1.45 system-ui,sans-serif;overflow-wrap:anywhere;}" +
    "img{max-width:100%;height:auto;}pre{white-space:pre-wrap;}</style>");
  return { html: "<!DOCTYPE html>\n" + doc.documentElement.outerHTML, blocked: blocked };
}
