/*
  Project: print
  File: print_bar.js
  Role: Transfer bar used in the page body on both sides (never the header).
  Markup: an element with .xfer-name, .xfer-pct, .xfer-fill, .xfer-sub inside.
  States: busy (bar filling), ok (green, full), fail (red; on the sender the
  bar is a button and a tap retries the same file).
  API: PrintBar.set(root, { name, pct, sub, state }), PrintBar.hide(root).
*/

const PrintBar = (function () {
  /* Find one part inside the bar. */
  function part(root, cls) {
    return root.querySelector('.' + cls);
  }

  /* Show the bar with new text, fill and state. */
  function set(root, opts) {
    if (!root) {
      return;
    }
    const pct = Math.max(0, Math.min(100, Math.round(opts.pct || 0)));
    root.hidden = false;
    root.classList.toggle('ok', opts.state === 'ok');
    root.classList.toggle('fail', opts.state === 'fail');
    part(root, 'xfer-name').textContent = opts.name || '';
    part(root, 'xfer-pct').textContent = opts.state === 'busy' ? pct + '%' : '';
    part(root, 'xfer-fill').style.width = (opts.state === 'busy' ? pct : 100) + '%';
    part(root, 'xfer-sub').textContent = opts.sub || '';
    /* Only a failed sender bar is tappable. */
    if (root.tagName === 'BUTTON') {
      root.disabled = opts.state !== 'fail';
    }
  }

  /* Hide the bar. */
  function hide(root) {
    if (root) {
      root.hidden = true;
    }
  }

  return {
    set: set,
    hide: hide
  };
})();
