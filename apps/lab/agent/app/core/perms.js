/* Agent — app/core/perms.js: Settings → Permissions (AG3). HR.perms.allowed(toolName) hides tools from the model and refuses
   them in HR.tools.run: allowWrite 'off' -> no write_file (read-only folder), allowShell 'off' -> no run_shell even with the
   helper connected, allowWeb 'off' -> no web_search / web_fetch (AG6), memory 'off' -> no memory_read / memory_append (and HR.prompt leaves memory out).
   HR.perms.auto(kind) -> true when Auto-approve file writes ('write', autoWrite) / shell commands ('shell', autoShell) is on. */
HR.perms = (function () {
  function on(k) { return HR.set.get(k) !== 'off'; }
  function allowed(name) {
    if (name === 'write_file') return on('allowWrite');
    if (name === 'run_shell') return on('allowShell');
    if (name === 'web_search' || name === 'web_fetch') return HR.set.get('allowWeb') !== 'off';   /* AG6 */
    if (name === 'memory_read' || name === 'memory_append') return on('memory');
    return true;
  }
  function auto(kind) { return HR.set.get(kind === 'shell' ? 'autoShell' : 'autoWrite') === 'on'; }
  return { allowed: allowed, auto: auto, memory: function () { return on('memory'); } };
})();
