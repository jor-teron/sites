/* Notely — nl_handoff.js: "Open with Notely" from the Files app (apps/system/files).
 * Files puts { name, text, t } in sessionStorage 'notely-handoff' (same tab, same site) and opens
 * Notely. On start-up, and when the key changes while Notely is already open, Notely takes it
 * once (only if under 2 minutes old), asks before replacing notes that are not empty, and
 * loads it like Open (NL.files.load). Nothing else reads or writes this key. */
NL.handoff = (function () {
  const KEY = 'notely-handoff', MAX_AGE = 120000;
  function take() {
    let raw = null;
    try { raw = sessionStorage.getItem(KEY); if (raw) sessionStorage.removeItem(KEY); } catch (_) { return; }
    if (!raw) return;
    let d;
    try { d = JSON.parse(raw); } catch (_) { return; }
    if (!d || typeof d.text !== 'string' || !(Date.now() - (+d.t || 0) < MAX_AGE)) return;
    const name = String(d.name || 'file.txt').slice(0, 200);
    if (NL.editor.value.trim() && NL.editor.value !== d.text &&
      !window.confirm('Open "' + name + '" in Notely?\nIt replaces your current notes (Ctrl+Z may bring them back).')) return;
    NL.files.load(new File([d.text], name, { type: 'text/plain' }));
  }
  function init() {
    take();
    window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) take(); });
  }
  return { init };
})();
