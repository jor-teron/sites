/* ============================================================
   FILE: modules/draftly-lists.js
   PROJECT: Draftly
   ROLE: Bullet and numbered lists. Suffix is display only.
   DEPENDS: Draftly.config, Draftly.editor
   ISOLATION: A missing select skips the command.
   ============================================================ */

/* Shared namespace. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

/* List commands. */
Draftly.lists = {};

/* The list at the cursor, or null. */
Draftly.lists.current = function current() {
  var sel = window.getSelection();
  if (!sel || !sel.anchorNode) return null;
  var el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  var list = el && el.closest ? el.closest('ul, ol') : null;
  return list && Draftly.editor.isInEditor(list) ? list : null;
};

/* Apply the toolbar list kind. Same kind again or None removes the list. */
Draftly.lists.apply = function apply() {
  var kindNode = document.getElementById('listKindSelect');
  var suffixNode = document.getElementById('listSuffixSelect');
  if (!kindNode) return;
  var kind = kindNode.value;
  var suffix = suffixNode ? suffixNode.value : Draftly.config.defaultListSuffix;
  /* Reset so picking the same kind again fires 'change'. */
  kindNode.value = '';
  if (!kind) return;
  Draftly.editor.focusEditor();
  var list = Draftly.lists.current();
  var tag = list ? list.tagName : '';
  if (kind === 'none') {
    if (tag === 'UL') document.execCommand('insertUnorderedList', false, null);
    if (tag === 'OL') document.execCommand('insertOrderedList', false, null);
  } else if (kind === 'bullet') {
    document.execCommand('insertUnorderedList', false, null);
  } else if (tag === 'OL' && (list.getAttribute('data-style') || '1') === kind) {
    document.execCommand('insertOrderedList', false, null);
  } else {
    if (tag !== 'OL') document.execCommand('insertOrderedList', false, null);
    var ol = Draftly.lists.current();
    if (ol && ol.tagName === 'OL') {
      ol.setAttribute('data-style', kind);
      ol.setAttribute('data-suffix', suffix);
    }
  }
  Draftly.lists.syncSuffix();
  var host = Draftly.editor.activeEditor;
  if (host) host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatList' }));
};

/* Set the suffix on the numbered list at the cursor. */
Draftly.lists.applySuffix = function applySuffix() {
  var suffixNode = document.getElementById('listSuffixSelect');
  var list = Draftly.lists.current();
  if (!suffixNode || !list || list.tagName !== 'OL') return;
  list.setAttribute('data-suffix', suffixNode.value);
  var host = Draftly.editor.activeEditor;
  if (host) host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatList' }));
};

/* Enable the suffix control only inside a numbered list. */
Draftly.lists.syncSuffix = function syncSuffix() {
  var suffixNode = document.getElementById('listSuffixSelect');
  if (!suffixNode) return;
  var list = Draftly.lists.current();
  suffixNode.disabled = !list || list.tagName !== 'OL';
  if (!suffixNode.disabled) suffixNode.value = list.getAttribute('data-suffix') || Draftly.config.defaultListSuffix;
};
