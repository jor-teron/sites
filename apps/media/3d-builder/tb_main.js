/* 3D Builder — tb_main.js: boot. TD2 */
import { RELEASE } from './tb_io.js';
import { boot as bootTheme } from './tb_theme.js';
import { boot as bootDlg } from './tb_dlg.js';
import { boot as bootUi } from './tb_ui.js';

export { RELEASE };

bootTheme();
bootDlg();
bootUi();
