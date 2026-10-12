/*
 * basic-mail — addresses and attachments (basic-mail-attach.js). Loaded before basic-mail.js.
 * - Address lists: split "Name <a@b>, c@d" safely, drop own address, RFC 2047 display names.
 * - Received attachments: list from the Gmail payload, download through the Gmail attachments
 *   API into a Blob (application/octet-stream) with a cleaned file name. Never opened or shown.
 * - Sent attachments: file picker files (and a forward's original attachments) as
 *   multipart/mixed base64 parts; total guard ATTACH_MAX bytes.
 */
var ATTACH_MAX = 20 * 1024 * 1024;   // ~20 MB total per message (Gmail's own limit is 25 MB)

/* "A <a@x>, \"B, Jr\" <b@x>, c@x" → ["A <a@x>", "\"B, Jr\" <b@x>", "c@x"] (commas in quotes kept). */
function splitAddresses(list) {
  var out = [], cur = "", quoted = false, angle = false;
  String(list || "").split("").forEach(function (ch) {
    if (ch === '"' && !angle) quoted = !quoted;
    else if (ch === "<" && !quoted) angle = true;
    else if (ch === ">" && !quoted) angle = false;
    if (ch === "," && !quoted && !angle) { if (cur.trim()) out.push(cur.trim()); cur = ""; return; }
    cur += ch;
  });
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* Bare lower-case address of "Name <a@x>" or "a@x". */
function addrOf(entry) {
  var m = /<([^>]+)>/.exec(entry);
  return (m ? m[1] : entry).trim().toLowerCase();
}

/* Keep unique addresses, minus the ones in `drop` (bare, lower-case). */
function uniqueAddresses(list, drop) {
  var seen = {};
  (drop || []).forEach(function (a) { if (a) seen[a] = true; });
  return list.filter(function (e) {
    var a = addrOf(e);
    if (!a || seen[a]) return false;
    seen[a] = true;
    return true;
  });
}

/* One header address list: display names that are not plain ASCII → RFC 2047. */
function encodeAddressList(value) {
  return splitAddresses(value).map(function (e) {
    var m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(e);
    if (!m || !m[1]) return e;
    var name = m[1].trim();
    if (/^[\x20-\x7e]*$/.test(name)) return '"' + name.replace(/["\\]/g, "") + '" <' + m[2].trim() + ">";
    return encodeHeaderWord(name) + " <" + m[2].trim() + ">";
  }).join(", ");
}

/* Safe download name: no paths, control or reserved characters, not hidden, max 120 chars. */
function safeFileName(name) {
  var n = String(name || "").replace(/[\u0000-\u001f\u007f]/g, "").split(/[\\/]/).pop();
  n = n.replace(/[<>:"|?*]/g, "_").replace(/^[.\s]+/, "").trim();
  if (n.length > 120) {
    var dot = n.lastIndexOf(".");
    var ext = dot > 0 && n.length - dot <= 10 ? n.slice(dot) : "";
    n = n.slice(0, 120 - ext.length) + ext;
  }
  return n || "attachment";
}

function sizeLabel(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes || 0) + " B";
}

/* Attachments of a Gmail payload: [{ filename, mimeType, size, attachmentId, data }]. */
function listAttachments(payload) {
  var out = [];
  (function walk(part) {
    if (!part) return;
    if (part.filename && part.body && (part.body.attachmentId || part.body.data)) {
      out.push({
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId || "",
        data: part.body.data || ""
      });
    }
    (part.parts || []).forEach(walk);
  })(payload);
  return out;
}

/* base64url → standard base64 (padded). */
function b64urlToB64(data) {
  var s = String(data || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return s;
}

/* Bytes (standard base64) of one received attachment. */
function fetchAttachment(messageId, att) {
  if (att.data) return Promise.resolve(b64urlToB64(att.data));
  return gmail("/messages/" + messageId + "/attachments/" + att.attachmentId).then(function (r) {
    return b64urlToB64(r.data);
  });
}

/* Download as a file. octet-stream + download attribute: the browser saves, never renders. */
function downloadAttachment(messageId, att, button) {
  if (button) button.disabled = true;
  setStatus("Downloading " + safeFileName(att.filename) + "…");
  fetchAttachment(messageId, att).then(function (b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = safeFileName(att.filename);
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    setStatus("");
  }).catch(function (err) {
    setStatus(err.message || "Download failed.");
  }).then(function () {
    if (button) button.disabled = false;
  });
}

/* Reader: one button per attachment (name + size). Text only, never HTML from the mail. */
function renderAttachments(item) {
  var box = document.getElementById("read-attach");
  box.textContent = "";
  var list = item.attachments || [];
  box.hidden = !list.length;
  list.forEach(function (att) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "ghost attach-btn";
    b.textContent = "📎 " + safeFileName(att.filename) + " (" + sizeLabel(att.size) + ")";
    b.title = "Download (not opened)";
    b.addEventListener("click", function () { downloadAttachment(item.id, att, b); });
    box.appendChild(b);
  });
}

/* File picker File → { filename, mimeType, size, b64 }. */
function readFileB64(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () {
      var s = String(r.result || "");
      resolve({ filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size, b64: s.slice(s.indexOf(",") + 1) });
    };
    r.onerror = function () { reject(new Error("Could not read " + file.name)); };
    r.readAsDataURL(file);
  });
}

/* MIME part headers for one attachment. Non-ASCII names: RFC 2231 filename* plus ASCII fallback. */
function attachmentPart(att) {
  var name = safeFileName(att.filename);
  var ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_");
  var star = /^[\x20-\x7e]*$/.test(name) ? "" : "; filename*=UTF-8''" + encodeURIComponent(name);
  var type = /^[\w.+-]+\/[\w.+-]+$/.test(att.mimeType) ? att.mimeType : "application/octet-stream";
  return "Content-Type: " + type + '; name="' + ascii + '"\r\n' +
    'Content-Disposition: attachment; filename="' + ascii + '"' + star + "\r\n" +
    "Content-Transfer-Encoding: base64\r\n\r\n" +
    (att.b64.match(/.{1,76}/g) || []).join("\r\n");
}
