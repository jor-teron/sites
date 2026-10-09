/*
  File: basic-mail.js
  Project: basic-mail
  Purpose: Personal Gmail client. Google sign-in, then Gmail API.
  Theme default is basic-mail-config.js. Browser override key is basic-mail-theme.
  No sample inbox. Empty until Connect succeeds.
  Access token survives refresh in this tab for 60 minutes. No refresh token.
*/

/* Browser key for the theme override. Does not rewrite config. */
var THEME_KEY = "basic-mail-theme";

/* Access token from Google. Restored from this tab only, never a refresh token. */
var accessToken = "";

/* Session key for the access token and its hard expiry. Dies with the tab. */
var TOKEN_KEY = "basic-mail-token";

/* Fixed life of a stored token. Google still expires the token at about 60 minutes. */
var TOKEN_MS = 60 * 60 * 1000;

/* Google token client, created after the GIS script loads. */
var tokenClient = null;

/* Active folder key. */
var currentFolder = "inbox";

/* Open Gmail message id. */
var currentId = "";

/* Search box text. */
var query = "";

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

/* Decode Gmail base64url into text. */
function decodeB64(data) {
  if (!data) {
    return "";
  }
  var pad = data.replace(/-/g, "+").replace(/_/g, "/");
  while (pad.length % 4) {
    pad += "=";
  }
  try {
    return decodeURIComponent(escape(atob(pad)));
  } catch (err) {
    return atob(pad);
  }
}

/* Encode a raw RFC822 message for Gmail send. */
function encodeRaw(text) {
  return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
      found = decodeB64(part.body.data);
      return;
    }
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  if (!found && payload.body && payload.body.data && payload.mimeType === "text/plain") {
    found = decodeB64(payload.body.data);
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
      found = decodeB64(part.body.data);
      return;
    }
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  if (!found && payload.body && payload.body.data && payload.mimeType === "text/html") {
    found = decodeB64(payload.body.data);
  }
  return found;
}

/* Drop scripts and event handlers. Keep layout, links, and images. */
function sanitizeHtml(html) {
  var doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, form, link, meta").forEach(function (node) {
    node.remove();
  });
  doc.querySelectorAll("*").forEach(function (node) {
    Array.prototype.slice.call(node.attributes).forEach(function (attr) {
      var name = attr.name.toLowerCase();
      var value = attr.value || "";
      if (name.indexOf("on") === 0) {
        node.removeAttribute(attr.name);
      }
      if ((name === "href" || name === "src") && /^\s*javascript:/i.test(value)) {
        node.removeAttribute(attr.name);
      }
    });
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  return doc.body.innerHTML;
}

/* Paint HTML when the mail has it, otherwise plain text. */
function showBody(item) {
  var pane = document.getElementById("read-body");
  if (item.html) {
    pane.classList.remove("is-plain");
    pane.innerHTML = sanitizeHtml(item.html);
    return;
  }
  pane.classList.add("is-plain");
  pane.textContent = item.body || "(No text body)";
}

/* Gmail REST call with the current token. */
function gmail(path, options) {
  return fetch("https://gmail.googleapis.com/gmail/v1/users/me" + path, {
    method: (options && options.method) || "GET",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: options && options.body ? JSON.stringify(options.body) : undefined
  }).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (text) {
        throw new Error(text || ("Gmail HTTP " + res.status));
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
  if (!accessToken) {
    setStatus("Connect Gmail first.");
    return;
  }
  setStatus("Loading…");
  var q = FOLDER_QUERY[currentFolder] || "in:inbox";
  if (query) {
    q += " " + query;
  }
  gmail("/messages?maxResults=20&q=" + encodeURIComponent(q)).then(function (data) {
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
    setStatus(err.message || "Could not load mail.");
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
  setStatus("Opening…");
  gmail("/messages/" + id + "?format=full").then(function (msg) {
    var from = header(msg.payload.headers, "From");
    openItem = {
      id: msg.id,
      threadId: msg.threadId,
      from: from.replace(/<[^>]+>/, "").trim() || from,
      email: (from.match(/<([^>]+)>/) || [, ""])[1],
      subject: header(msg.payload.headers, "Subject") || "(No subject)",
      time: header(msg.payload.headers, "Date"),
      body: bodyText(msg.payload),
      html: bodyHtml(msg.payload)
    };
    currentId = id;
    document.getElementById("read-subject").textContent = openItem.subject;
    document.getElementById("read-from").textContent = openItem.from;
    document.getElementById("read-email").textContent = openItem.email;
    document.getElementById("read-time").textContent = openItem.time;
    showBody(openItem);
    document.getElementById("read-pane").hidden = false;
    document.getElementById("app").classList.add("is-reading");
    gmail("/messages/" + id + "/modify", { method: "POST", body: { removeLabelIds: ["UNREAD"] } }).catch(function () {});
    setStatus("");
    renderList();
  }).catch(function (err) {
    setStatus(err.message || "Could not open message.");
  });
}

/* Leave the reader on a phone. */
function closeRead() {
  currentId = "";
  openItem = null;
  document.getElementById("read-pane").hidden = true;
  document.getElementById("app").classList.remove("is-reading");
  renderList();
}

/* Compose sheet for new, reply, or forward. */
function openCompose(kind) {
  var title = document.getElementById("compose-title");
  var to = document.getElementById("to");
  var subject = document.getElementById("subject");
  var body = document.getElementById("body");
  title.textContent = "New message";
  to.value = "";
  subject.value = "";
  body.value = "";
  if (openItem && kind === "reply") {
    title.textContent = "Reply";
    to.value = openItem.email;
    subject.value = openItem.subject.indexOf("Re:") === 0 ? openItem.subject : "Re: " + openItem.subject;
    body.value = "\n\nOn " + openItem.time + ", " + openItem.from + " wrote:\n" + openItem.body;
  }
  if (openItem && kind === "forward") {
    title.textContent = "Forward";
    subject.value = openItem.subject.indexOf("Fwd:") === 0 ? openItem.subject : "Fwd: " + openItem.subject;
    body.value = "\n\n---------- Forwarded ----------\n" + openItem.body;
  }
  document.getElementById("compose").hidden = false;
}

/* Hide compose. */
function closeCompose() {
  document.getElementById("compose").hidden = true;
}

/* Send through Gmail and refresh Sent. */
function sendMail(event) {
  event.preventDefault();
  var to = document.getElementById("to").value;
  var subject = document.getElementById("subject").value;
  var body = document.getElementById("body").value;
  var raw = "To: " + to + "\r\nSubject: " + subject + "\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" + body;
  gmail("/messages/send", { method: "POST", body: { raw: encodeRaw(raw) } }).then(function () {
    closeCompose();
    setFolder("sent");
  }).catch(function (err) {
    setStatus(err.message || "Send failed.");
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

/* Save the access token for this tab. Hard stop is 60 minutes from Connect. */
function storeToken(token) {
  accessToken = token;
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: token, exp: Date.now() + TOKEN_MS }));
  } catch (err) {
    /* Private mode may block storage. The token still works until reload. */
  }
}

/* Restore a token after refresh if the 60 minutes are not up. */
function restoreToken() {
  try {
    var raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) {
      return false;
    }
    var saved = JSON.parse(raw);
    if (!saved.token || !saved.exp || saved.exp <= Date.now()) {
      sessionStorage.removeItem(TOKEN_KEY);
      return false;
    }
    accessToken = saved.token;
    return true;
  } catch (err) {
    return false;
  }
}

/* Show mail controls after a token exists. */
function markConnected() {
  document.getElementById("connect").hidden = true;
  document.getElementById("compose-open").hidden = false;
}

/* Start Google sign-in. Needs a client id and the GIS script. */
function connect() {
  var clientId = (window.BASIC_MAIL_CONFIG && BASIC_MAIL_CONFIG.clientId) || "";
  if (!clientId) {
    setStatus("Set clientId in basic-mail-config.js. Steps are in basic-mail.txt.");
    return;
  }
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    setStatus("Google sign-in script has not loaded. Check the network and reload.");
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: BASIC_MAIL_CONFIG.scopes,
    callback: function (resp) {
      if (resp.error) {
        setStatus(resp.error);
        return;
      }
      accessToken = resp.access_token;
      storeToken(resp.access_token);
      markConnected();
      loadList();
    }
  });
  tokenClient.requestAccessToken();
}

/* Wire controls. */
function bind() {
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
  document.getElementById("connect").addEventListener("click", connect);
  document.getElementById("compose-open").addEventListener("click", function () {
    openCompose("new");
  });
  document.getElementById("compose-close").addEventListener("click", closeCompose);
  document.getElementById("compose-form").addEventListener("submit", sendMail);
  document.getElementById("back").addEventListener("click", closeRead);
  document.getElementById("act-reply").addEventListener("click", function () {
    openCompose("reply");
  });
  document.getElementById("act-forward").addEventListener("click", function () {
    openCompose("forward");
  });
  document.getElementById("act-archive").addEventListener("click", archiveMail);
  document.getElementById("act-delete").addEventListener("click", deleteMail);
  document.getElementById("search").addEventListener("input", function (event) {
    query = event.target.value.trim();
    loadList();
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
  markConnected();
  loadList();
}
