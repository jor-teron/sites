/* ============================================================
   FILE: modules/draftly-dialog.js
   PROJECT: Draftly
   ROLE: Small modal dialogs (no window.prompt / confirm / alert).
     Draftly.dialog.prompt({title, label, value, okLabel})  → Promise<string|null>
     Draftly.dialog.confirm({title, message, okLabel, danger}) → Promise<boolean>
   Now shared with the other Office apps: this is an alias of OfficeDialog
   (apps/office/shared/office-dialog.js, styles in office-dialog.css).
   DEPENDS: ../shared/office-dialog.js (loaded first in draftly.html)
   ============================================================ */

Draftly.dialog = OfficeDialog;
