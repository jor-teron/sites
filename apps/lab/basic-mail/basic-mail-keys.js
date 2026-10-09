/*
  File: basic-mail-keys.js
  Project: basic-mail
  Purpose: Keyboard and hub D-pad control. The hub sends synthetic key events into
  this page, so Enter on a focused button is turned into a click here.
  Up / Down: move through the mail rows. Left / Right: previous / next folder.
  Enter: open the focused row or press the focused button. Escape: close compose or the reader.
*/

/* True when the key is for a text field, so the field keeps it. */
function bmTyping(target) {
  var tag = target && target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (target && target.isContentEditable);
}

/* Move focus to the row before or after the focused one. */
function bmMoveRow(step) {
  var buttons = Array.prototype.slice.call(document.querySelectorAll("#list .row"));
  if (!buttons.length) {
    return;
  }
  var at = buttons.indexOf(document.activeElement);
  if (at === -1) {
    at = buttons.findIndex(function (b) {
      return b.classList.contains("is-on");
    });
  }
  var next = at === -1 ? 0 : Math.max(0, Math.min(buttons.length - 1, at + step));
  buttons[next].focus();
  buttons[next].scrollIntoView({ block: "nearest" });
}

/* Previous or next folder in the rail. */
function bmMoveFolder(step) {
  var names = Array.prototype.map.call(document.querySelectorAll(".rail-btn"), function (b) {
    return b.dataset.folder;
  });
  var at = names.indexOf(currentFolder);
  var next = names[(at + step + names.length) % names.length];
  if (next && !document.getElementById("compose-open").hidden) {
    setFolder(next);
  }
}

/* One key handler for real keys and hub D-pad keys. */
function bmOnKey(event) {
  var key = event.key;
  var composeOpen = !document.getElementById("compose").hidden;
  if (key === "Escape") {
    if (composeOpen) {
      closeCompose();
    } else if (currentId) {
      closeRead();
    }
    return;
  }
  if (bmTyping(event.target) || composeOpen) {
    return;
  }
  if (key === "ArrowDown" || key === "ArrowUp") {
    event.preventDefault();
    bmMoveRow(key === "ArrowDown" ? 1 : -1);
  } else if (key === "ArrowLeft" || key === "ArrowRight") {
    event.preventDefault();
    bmMoveFolder(key === "ArrowRight" ? 1 : -1);
  } else if ((key === "Enter" || key === " ") && !event.isTrusted && event.target.tagName === "BUTTON") {
    /* A real key presses the button by itself. A hub key does not, so click here. */
    event.preventDefault();
    event.target.click();
  }
}

document.addEventListener("keydown", bmOnKey);
