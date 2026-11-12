/* ============================================================
   FILE: modules/writer-dialog.js
   DF25: was modules/draftly-dialog.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Small modal dialogs (no window.prompt / confirm / alert).
     Writer.dialog.prompt({title, label, value, okLabel})  → Promise<string|null>
     Writer.dialog.confirm({title, message, okLabel, danger}) → Promise<boolean>
   Now shared with the other Office apps: this is an alias of OfficeDialog
   (apps/office/shared/office-dialog.js, styles in office-dialog.css).
   DEPENDS: ../shared/office-dialog.js (loaded first in writer.html)
   ============================================================ */

Writer.dialog = OfficeDialog;
