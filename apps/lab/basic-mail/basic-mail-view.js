/*
  File: basic-mail-view.js
  Project: basic-mail
  Purpose: Paint a message body in the reader.
  HTML mail goes into a sandboxed iframe (srcdoc, no scripts, no same-origin) built by
  basic-mail-sanitize.js. Plain text stays plain text (textContent).
  Remote images start hidden. "Show images" re-renders this one message with them.
  Nothing is remembered per sender.
*/

/* Sandbox flags for the mail frame. Links may open a normal new tab. Nothing else. */
var BM_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

/* Paint HTML when the mail has it, otherwise plain text. */
function showBody(item, showImages) {
  var pane = document.getElementById("read-body");
  var bar = document.getElementById("img-bar");
  pane.innerHTML = "";
  bar.hidden = true;
  if (!item.html) {
    pane.classList.add("is-plain");
    pane.classList.remove("is-html");
    pane.textContent = item.body || "(No text body)";
    return;
  }
  pane.classList.remove("is-plain");
  pane.classList.add("is-html");
  var clean = bmSanitize(item.html, !!showImages);
  var frame = document.createElement("iframe");
  frame.className = "mail-frame";
  frame.title = "Message";
  frame.setAttribute("sandbox", BM_SANDBOX);
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.srcdoc = clean.html;
  pane.appendChild(frame);
  bar.hidden = showImages || !clean.blocked;
}

/* Re-render the open message with remote images allowed. This open only. */
function showImagesNow() {
  if (openItem) {
    showBody(openItem, true);
  }
}
