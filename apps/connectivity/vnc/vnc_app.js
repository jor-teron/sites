/* vnc_app.js — VNC1 wiring: hosts list on the home screen, viewer screen, #host=<name> deep link. */
import { initHosts, load } from './vnc_hosts.js';
import { initView, connect } from './vnc_view.js';

const goHome = () => { document.getElementById('view').hidden = true; document.getElementById('home').hidden = false; };
initView(goHome);
initHosts(connect);
const m = /host=([^&]+)/.exec(location.hash);
if (m) { const h = load().find((x) => x.name === decodeURIComponent(m[1])); if (h) connect(h); }
