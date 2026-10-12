/*
  File: mail.js
  Project: mail
  Purpose: Personal Gmail client. Google sign-in, then Gmail API.
  Theme default is mail-config.js. Browser override key is basic-mail-theme.
  No sample inbox. Empty until Connect succeeds.
  Sign-in and token life: mail-auth.js. Mail rendering: mail-view.js and
  mail-sanitize.js. D-pad and keys: mail-keys.js.
*/

/* Browser key for the theme override. Does not rewrite config. */
var THEME_KEY = "basic-mail-theme";

/* Active folder key. */
var currentFolder = "inbox";

/* Open Gmail message id. */
var currentId = "";

/* Search box text. */
var query = "";

/* Bumped by every list load. A reply for an older number is ignored. */
var listSeq = 0;

/* Bumped by every open. A late reply for an older message is ignored. */
var openSeq = 0;

/* Debounce timer for typing in Search. */
var searchTimer = 0;

/* Wait after the last key before searching. */
var SEARCH_WAIT_MS = 400;

/* Last list from Gmail, already shaped for the row renderer. */
var rows = [];

/* Open message record. */
var openItem = null;

/* Gmail search for each rail button. */
var FOLDER_QUERY = {
  inbox: "in:inbox",
  sent: "in:sent",
  drafts: "in:drafts",
  all: "-in:spam -in:trash"
};

/* Paint dark or light. Unknown names become dark. */
function applyTheme(name) {
  var theme = name === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  document.getElementById("theme-toggle").textContent = theme === "dark" ? "Light" : "Dark";
}

/* Config first, then a saved browser choice. */
function loadTheme() {
  var saved = "";
  try {
    saved = localStorage.getItem(THEME_KEY) || "";
  } catch (err) {
    saved = "";
  }
  var fromConfig = (window.BASIC_MAIL_CONFIG && BASIC_MAIL_CONFIG.theme) || "dark";
  applyTheme(saved || fromConfig);
  if (window.BASIC_MAIL_CONFIG && BASIC_MAIL_CONFIG.appName) {
    document.getElementById("brand").textContent = BASIC_MAIL_CONFIG.appName;
    document.title = BASIC_MAIL_CONFIG.appName;
  }
}

/* Flip theme and store the override. */
function toggleTheme() {
  var now = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  applyTheme(now);
  try {
    localStorage.setItem(THEME_KEY, now);
  } catch (err) {
    /* Storage can fail in private mode. Theme still applies this visit. */
  }
}

/* Status line in the list pane. */
function setStatus(text) {
  document.getElementById("status").textContent = text;
}

/* Decode Gmail base64url into text using the part's charset (default UTF-8). */
function decodeB64(data, charset) {
  if (!data) {
    return "";
  }
  var pad = data.replace(/-/g, "+").replace(/_/g, "/");
  while (pad.length % 4) {
    pad += "=";
  }
  var bin;
  try {
    bin = atob(pad);
  } catch (err) {
    return "";
  }
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch (err) {
    return new TextDecoder("utf-8").decode(bytes);   // unknown charset label
  }
}

/* charset=… from a MIME part's Content-Type header ("" if none). */
function partCharset(part) {
  var ct = header(part.headers || [], "Content-Type");
  var m = /charset\s*=\s*"?([^";\s]+)/i.exec(ct);
  return m ? m[1] : "";
}

/* UTF-8 string → standard base64. */
function b64utf8(text) {
  var bytes = new TextEncoder().encode(text);
  var bin = "";
  for (var i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

/* Encode a raw RFC822 message (already pure ASCII) for Gmail send (base64url). */
function encodeRaw(text) {
  return b64utf8(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* RFC 2047 header value: ASCII stays as is; anything else becomes =?UTF-8?B?…?= words
   (split on whole characters so no word exceeds ~75 chars). */
function encodeHeaderWord(value) {
  if (/^[\x20-\x7e]*$/.test(value)) {
    return value;
  }
  var words = [];
  var chunk = "";
  Array.from(value).forEach(function (ch) {
    if (new TextEncoder().encode(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  });
  if (chunk) {
    words.push(chunk);
  }
  return words.map(function (w) { return "=?UTF-8?B?" + b64utf8(w) + "?="; }).join("\r\n ");
}

/* Body as base64 lines of 76 chars (Content-Transfer-Encoding: base64). */
function bodyBase64(text) {
  return (b64utf8(text).match(/.{1,76}/g) || []).join("\r\n");
}

/* Plain text from an HTML-only mail, for reply / forward quotes. DOMParser never runs scripts
   or loads resources; only textContent is read. */
function htmlToText(html) {
  try {
    var doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,head").forEach(function (n) { n.remove(); });
    doc.querySelectorAll("br").forEach(function (n) { n.replaceWith("\n"); });
    doc.querySelectorAll("p,div,li,tr,h1,h2,h3,h4").forEach(function (n) { n.append("\n"); });
    return (doc.body ? doc.body.textContent : "").replace(/\n{3,}/g, "\n\n").trim();
  } catch (err) {
    return "";
  }
}

/* Quote: every line prefixed with "> ". */
function quoteText(text) {
  return String(text || "").split(/\r?\n/).map(function (l) { return "> " + l; }).join("\n");
}

/* Header value from a Gmail payload header list. */
function header(headers, name) {
  var want = name.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if ((headers[i].name || "").toLowerCase() === want) {
      return headers[i].value || "";
    }
  }
  return "";
}

/* First text/plain part, used for reply quotes. */
function bodyText(payload) {
  var found = "";
  function walk(part) {
    if (!part || found) {
      return;
    }
    if (part.mimeType === "text/plain" && part.body && part.body.data) {
      found = decodeB64(part.body.data, partCharset(part));
      return;
    }
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  if (!found && payload.body && payload.body.data && payload.mimeType === "text/plain") {
    found = decodeB64(payload.body.data, partCharset(payload));
  }
  return found || "";
}

/* First text/html part. Empty if the mail is plain only. */
function bodyHtml(payload) {
  var found = "";
  function walk(part) {
    if (!part || found) {
      return;
    }
    if (part.mimeType === "text/html" && part.body && part.body.data) {
      found = decodeB64(part.body.data, partCharset(part));
      return;
    }
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  if (!found && payload.body && payload.body.data && payload.mimeType === "text/html") {
    found = decodeB64(payload.body.data, partCharset(payload));
  }
  return found;
}

/* Readable text from a Gmail error body. Falls back to the HTTP status. */
function gmailError(text, status) {
  try {
    var data = JSON.parse(text);
    if (data && data.error && data.error.message) {
      return data.error.message;
    }
  } catch (err) {
    /* Not JSON. */
  }
  return "Gmail error " + status + ".";
}

/* Gmail REST call with the current token. A 401 or an expired token ends the session. */
function gmail(path, options) {
  if (!hasToken()) {
    var had = !!accessToken;
    if (had) {
      expireSession();
    }
    return Promise.reject(new Error(had ? "Session expired. Tap Connect." : "Connect Gmail first."));
  }
  return fetch("https://gmail.googleapis.com/gmail/v1/users/me" + path, {
    method: (options && options.method) || "GET",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: options && options.body ? JSON.stringify(options.body) : undefined,
    referrerPolicy: "no-referrer"
  }).then(function (res) {
    if (res.status === 401) {
      expireSession();
      throw new Error("Session expired. Tap Connect.");
    }
    if (!res.ok) {
      return res.text().then(function (text) {
        throw new Error(gmailError(text, res.status));
      });
    }
    return res.json();
  });
}

/* Short time label from an internal date. */
function timeLabel(ms) {
  var date = new Date(Number(ms));
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/* Load the active folder from Gmail. */
function loadList() {
  loadProfile();
  var seq = ++listSeq;
  if (!hasToken()) {
    if (accessToken) {
      expireSession();
    } else {
      setStatus("Connect Gmail first.");
    }
    return;
  }
  setStatus("Loading…");
  var q = FOLDER_QUERY[currentFolder] || "in:inbox";
  if (query) {
    q += " " + query;
  }
  gmail("/messages?maxResults=20&q=" + encodeURIComponent(q)).then(function (data) {
    if (seq !== listSeq) {
      return;
    }
    var ids = data.messages || [];
    if (!ids.length) {
      rows = [];
      renderList();
      setStatus("No messages.");
      return;
    }
    return Promise.all(ids.map(function (item) {
      return gmail("/messages/" + item.id + "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date");
    })).then(function (list) {
      if (seq !== listSeq) {
        return;
      }
      rows = list.map(function (msg) {
        var from = header(msg.payload.headers, "From");
        return {
          id: msg.id,
          threadId: msg.threadId,
          from: from.replace(/<[^>]+>/, "").trim() || from,
          email: (from.match(/<([^>]+)>/) || [, from])[1],
          subject: header(msg.payload.headers, "Subject") || "(No subject)",
          time: timeLabel(msg.internalDate),
          unread: (msg.labelIds || []).indexOf("UNREAD") !== -1,
          snippet: msg.snippet || ""
        };
      });
      renderList();
      setStatus("");
    });
  }).catch(function (err) {
    if (seq === listSeq) {
      setStatus(err.message || "Could not load mail.");
    }
  });
}

/* Paint rows from the last Gmail list. */
function renderList() {
  var list = document.getElementById("list");
  list.innerHTML = "";
  rows.forEach(function (item) {
    var li = document.createElement("li");
    var button = document.createElement("button");
    button.type = "button";
    button.className = "row" + (item.unread ? " unread" : "") + (item.id === currentId ? " is-on" : "");
    button.innerHTML = '<div class="row-top"><span class="who"></span><time></time></div><div class="subject"></div><div class="preview"></div>';
    button.querySelector(".who").textContent = item.from;
    button.querySelector("time").textContent = item.time;
    button.querySelector(".subject").textContent = item.subject;
    button.querySelector(".preview").textContent = item.snippet;
    button.addEventListener("click", function () {
      openMail(item.id);
    });
    li.appendChild(button);
    list.appendChild(li);
  });
}

/* Open one full message. */
function openMail(id) {
  var seq = ++openSeq;
  setStatus("Opening…");
  gmail("/messages/" + id + "?format=full").then(function (msg) {
    if (seq !== openSeq) {
      return;
    }
    var from = header(msg.payload.headers, "From");
    openItem = {
      id: msg.id,
      threadId: msg.threadId,
      from: from.replace(/<[^>]+>/, "").trim() || from,
      email: (from.match(/<([^>]+)>/) || [, /^[^\s@<>]+@[^\s@<>]+$/.test(from.trim()) ? from.trim() : ""])[1],
      subject: header(msg.payload.headers, "Subject") || "(No subject)",
      time: header(msg.payload.headers, "Date"),
      body: bodyText(msg.payload),
      html: bodyHtml(msg.payload),
      messageId: header(msg.payload.headers, "Message-ID") || header(msg.payload.headers, "Message-Id"),
      fromRaw: from,
      to: header(msg.payload.headers, "To"),
      cc: header(msg.payload.headers, "Cc"),
      attachments: listAttachments(msg.payload),
      references: header(msg.payload.headers, "References")
    };
    currentId = id;
    document.getElementById("read-subject").textContent = openItem.subject;
    document.getElementById("read-from").textContent = openItem.from;
    document.getElementById("read-email").textContent = openItem.email;
    document.getElementById("read-time").textContent = openItem.time;
    showBody(openItem, false);
    renderAttachments(openItem);
    document.getElementById("read-pane").hidden = false;
    document.getElementById("app").classList.add("is-reading");
    gmail("/messages/" + id + "/modify", { method: "POST", body: { removeLabelIds: ["UNREAD"] } }).catch(function () {});
    rows.forEach(function (row) {
      if (row.id === id) {
        row.unread = false;
      }
    });
    setStatus("");
    renderList();
  }).catch(function (err) {
    if (seq === openSeq) {
      setStatus(err.message || "Could not open message.");
    }
  });
}

/* Leave the reader on a phone. */
function closeRead() {
  openSeq++;
  currentId = "";
  openItem = null;
  document.getElementById("read-pane").hidden = true;
  document.getElementById("read-body").innerHTML = "";
  document.getElementById("read-attach").textContent = "";
  document.getElementById("app").classList.remove("is-reading");
  renderList();
}

/* Reply context for the open compose sheet: { threadId, inReplyTo, references } or null. */
var replyCtx = null;

/* Compose sheet for new, reply, or forward. */
function openCompose(kind) {
  replyCtx = null;
  document.getElementById("cc").value = "";
  document.getElementById("files").value = "";
  document.getElementById("compose-attach").textContent = "";
  var title = document.getElementById("compose-title");
  var to = document.getElementById("to");
  var subject = document.getElementById("subject");
  var body = document.getElementById("body");
  title.textContent = "New message";
  to.value = "";
  subject.value = "";
  body.value = "";
  setComposeStatus("");
  if (openItem && kind === "replyall") {
    // To = original sender + other To; Cc kept; own address dropped everywhere.
    var me = myEmail ? [myEmail.toLowerCase()] : [];
    var toList = uniqueAddresses([openItem.fromRaw].concat(splitAddresses(openItem.to)), me);
    var ccList = uniqueAddresses(splitAddresses(openItem.cc), me.concat(toList.map(addrOf)));
    kind = "reply";
    setTimeout(function () {
      to.value = toList.join(", ");
      document.getElementById("cc").value = ccList.join(", ");
      title.textContent = "Reply all";
    }, 0);
  }
  if (openItem && kind === "reply") {
    title.textContent = "Reply";
    to.value = openItem.email;
    subject.value = openItem.subject.indexOf("Re:") === 0 ? openItem.subject : "Re: " + openItem.subject;
    body.value = "\n\nOn " + openItem.time + ", " + openItem.from + " wrote:\n" + quoteText(openItem.body || htmlToText(openItem.html));
    replyCtx = {
      threadId: openItem.threadId,
      inReplyTo: headerSafe(openItem.messageId),
      references: headerSafe(((openItem.references || "") + " " + (openItem.messageId || "")).trim())
    };
  }
  if (openItem && kind === "forward") {
    title.textContent = "Forward";
    subject.value = openItem.subject.indexOf("Fwd:") === 0 ? openItem.subject : "Fwd: " + openItem.subject;
    // forward stays in the thread and carries the original attachments
    replyCtx = { threadId: openItem.threadId, inReplyTo: "", references: "", messageId: openItem.id, attachments: openItem.attachments || [] };
    if (replyCtx.attachments.length) {
      document.getElementById("compose-attach").textContent = "Original attachments included: " +
        replyCtx.attachments.map(function (a) { return safeFileName(a.filename); }).join(", ");
    }
    body.value = "\n\n---------- Forwarded ----------\nFrom: " + openItem.from + (openItem.email ? " <" + openItem.email + ">" : "") +
      "\nDate: " + openItem.time + "\nSubject: " + openItem.subject + "\n\n" + (openItem.body || htmlToText(openItem.html));
  }
  document.getElementById("compose").hidden = false;
  (to.value ? body : to).focus();
}

/* Message line inside the compose sheet (the list status is behind it). */
function setComposeStatus(text) {
  document.getElementById("compose-status").textContent = text;
}

/* One header line value: no CR or LF, so a value cannot add headers. */
function headerSafe(value) {
  return String(value || "").replace(/[\r\n\u2028\u2029]+/g, " ").trim();
}

/* Hide compose. */
function closeCompose() {
  document.getElementById("compose").hidden = true;
}

/* Own address (for Reply all), fetched once after connect. */
var myEmail = "";
function loadProfile() {
  if (myEmail) return;
  gmail("/profile").then(function (p) { myEmail = p.emailAddress || ""; }).catch(function () {});
}

/* Send through Gmail and refresh Sent. Attachments → multipart/mixed via the upload endpoint. */
function sendMail(event) {
  event.preventDefault();
  var to = headerSafe(document.getElementById("to").value);
  var cc = headerSafe(document.getElementById("cc").value);
  var subject = headerSafe(document.getElementById("subject").value);
  var body = document.getElementById("body").value.replace(/\r?\n/g, "\r\n");
  if (!to) {
    setComposeStatus("Add a recipient.");
    return;
  }
  var ctx = replyCtx;
  var files = Array.from(document.getElementById("files").files || []);
  var fwd = (ctx && ctx.attachments) || [];
  var total = files.reduce(function (n, f) { return n + f.size; }, 0) + fwd.reduce(function (n, a) { return n + (a.size || 0); }, 0);
  if (total > ATTACH_MAX) {
    setComposeStatus("Attachments too big: " + sizeLabel(total) + " (max " + sizeLabel(ATTACH_MAX) + "). Remove some files.");
    return;
  }
  setComposeStatus(files.length || fwd.length ? "Preparing attachments…" : "Sending…");
  Promise.all(files.map(readFileB64).concat(fwd.map(function (a) {
    return fetchAttachment(ctx.messageId, a).then(function (b64) {
      return { filename: a.filename, mimeType: a.mimeType, size: a.size, b64: b64 };
    });
  }))).then(function (atts) {
    // Headers are pure ASCII: non-ASCII subject / names → RFC 2047, body → UTF-8 base64.
    var lines = ["To: " + encodeAddressList(to)];
    if (cc) {
      lines.push("Cc: " + encodeAddressList(cc));
    }
    lines.push("Subject: " + encodeHeaderWord(subject));
    if (ctx && ctx.inReplyTo) {
      lines.push("In-Reply-To: " + ctx.inReplyTo);
      lines.push("References: " + (ctx.references || ctx.inReplyTo));
    }
    lines.push("MIME-Version: 1.0");
    var textPart = "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" + bodyBase64(body);
    var raw;
    if (!atts.length) {
      raw = lines.join("\r\n") + "\r\n" + textPart;
    } else {
      var bnd = "bm_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      raw = lines.join("\r\n") + "\r\nContent-Type: multipart/mixed; boundary=\"" + bnd + "\"\r\n\r\n" +
        "--" + bnd + "\r\n" + textPart + "\r\n" +
        atts.map(function (a) { return "--" + bnd + "\r\n" + attachmentPart(a) + "\r\n"; }).join("") +
        "--" + bnd + "--\r\n";
    }
    setComposeStatus("Sending…");
    return atts.length ? sendUpload(raw, ctx && ctx.threadId) : gmail("/messages/send", {
      method: "POST",
      body: ctx && ctx.threadId ? { raw: encodeRaw(raw), threadId: ctx.threadId } : { raw: encodeRaw(raw) }
    });
  }).then(function () {
    replyCtx = null;
    closeCompose();
    setFolder("sent");
  }).catch(function (err) {
    setComposeStatus(err.message || "Send failed.");
    setStatus(err.message || "Send failed.");
  });
}

/* Large messages: Gmail upload endpoint (multipart: JSON metadata with threadId + message/rfc822). */
function sendUpload(raw, threadId) {
  if (!hasToken()) {
    return Promise.reject(new Error("Session expired. Tap Connect."));
  }
  var bnd = "up_" + Date.now().toString(36);
  var meta = JSON.stringify(threadId ? { threadId: threadId } : {});
  var payload = "--" + bnd + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta + "\r\n" +
    "--" + bnd + "\r\nContent-Type: message/rfc822\r\n\r\n" + raw + "\r\n--" + bnd + "--";
  return fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart", {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": "multipart/related; boundary=" + bnd },
    body: payload,
    referrerPolicy: "no-referrer"
  }).then(function (res) {
    if (res.status === 401) {
      expireSession();
      throw new Error("Session expired. Tap Connect.");
    }
    if (!res.ok) {
      return res.text().then(function (text) { throw new Error(gmailError(text, res.status)); });
    }
    return res.json();
  });
}

/* Remove the Inbox label. Message stays in All Mail. */
function archiveMail() {
  if (!currentId) {
    return;
  }
  gmail("/messages/" + currentId + "/modify", { method: "POST", body: { removeLabelIds: ["INBOX"] } }).then(function () {
    closeRead();
    loadList();
  }).catch(function (err) {
    setStatus(err.message || "Archive failed.");
  });
}

/* Move the open message to Trash. */
function deleteMail() {
  if (!currentId) {
    return;
  }
  gmail("/messages/" + currentId + "/trash", { method: "POST", body: {} }).then(function () {
    closeRead();
    loadList();
  }).catch(function (err) {
    setStatus(err.message || "Delete failed.");
  });
}

/* Switch folder and reload from Gmail. */
function setFolder(name) {
  currentFolder = name;
  closeRead();
  document.querySelectorAll(".rail-btn").forEach(function (button) {
    button.classList.toggle("is-on", button.dataset.folder === name);
  });
  loadList();
}

/* Search after typing stops, or at once with Enter. */
function searchSoon(now) {
  clearTimeout(searchTimer);
  query = document.getElementById("search").value.trim();
  if (now) {
    loadList();
    return;
  }
  searchTimer = setTimeout(loadList, SEARCH_WAIT_MS);
}

/* Wire controls. */
function bind() {
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
  document.getElementById("connect").addEventListener("click", connect);
  document.getElementById("sign-out").addEventListener("click", signOut);
  document.getElementById("img-show").addEventListener("click", showImagesNow);
  document.getElementById("compose-open").addEventListener("click", function () {
    openCompose("new");
  });
  document.getElementById("compose-close").addEventListener("click", closeCompose);
  document.getElementById("compose-form").addEventListener("submit", sendMail);
  document.getElementById("back").addEventListener("click", closeRead);
  document.getElementById("act-reply").addEventListener("click", function () {
    openCompose("reply");
  });
  document.getElementById("act-replyall").addEventListener("click", function () {
    loadProfile();
    openCompose("replyall");
  });
  document.getElementById("act-forward").addEventListener("click", function () {
    openCompose("forward");
  });
  document.getElementById("act-archive").addEventListener("click", archiveMail);
  document.getElementById("act-delete").addEventListener("click", deleteMail);
  document.getElementById("search").addEventListener("input", function () {
    searchSoon(false);
  });
  document.getElementById("search").addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      searchSoon(true);
    }
  });
  document.querySelectorAll(".rail-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      setFolder(button.dataset.folder);
    });
  });
}

loadTheme();
bind();
if (restoreToken()) {
  markConnected(true);
  loadList();
}
