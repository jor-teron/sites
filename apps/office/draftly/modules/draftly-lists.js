/* ============================================================
   FILE: modules/draftly-lists.js
   PROJECT: draftly
   ROLE: Bullet and numbered lists. Suffix is display only.
   DEPENDS: Draftly.config, Draftly.editor
   ISOLATION: A missing select skips the command.
   ============================================================ */

/* Shared namespace. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

/* List commands. */
Draftly.lists = {};

/* Apply the toolbar list kind to the current block. */
Draftly.lists.apply = function apply() {
  var kindNode = document.getElementById('listKindSelect');
  var suffixNode = document.getElementById('listSuffixSelect');
  if (!kindNode) return;
  var kind = kindNode.value || Draftly.config.defaultListKind;
  var suffix = suffixNode ? suffixNode.value : Draftly.config.defaultListSuffix;
  Draftly.editor.focusEditor();
  if (kind === 'bullet') {
    document.execCommand('insertUnorderedList', false, null);
    return;
  }
  document.execCommand('insertOrderedList', false, null);
  var sel = window.getSelection();
  if (!sel || !sel.anchorNode) return;
  var el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  var ol = el && el.closest ? el.closest('ol') : null;
  if (!ol) return;
  ol.setAttribute('data-style', kind);
  ol.setAttribute('data-suffix', suffix);
};

/* Enable the suffix control only for numbered lists. */
Draftly.lists.syncSuffix = function syncSuffix() {
  var kindNode = document.getElementById('listKindSelect');
  var suffixNode = document.getElementById('listSuffixSelect');
  if (!kindNode || !suffixNode) return;
  suffixNode.disabled = kindNode.value === 'bullet';
};
