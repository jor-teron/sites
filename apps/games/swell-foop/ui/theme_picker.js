/*
 * Swell Foop — theme picker UI. A "Theme" button opens a sheet of cards, each previewing the 5 block
 * variants of a theme (drawn live by the theme's own code). The choice is saved by setTheme() in core/logic.js
 * (localStorage key from the config, default swellfoop.theme).
 */
const SFPicker = (() => {
    let panel, list, btn, label;
    const PREV = 34;                 // preview block size (px)
    const GAP = 6;
    let built = false;

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text) e.textContent = text;
        return e;
    }

    function drawPreview(cv, t) {
        const dpr = window.devicePixelRatio || 1;
        const n = 5;
        const w = n * PREV + (n + 1) * GAP, h = PREV + GAP * 2;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        cv.style.width = w + 'px'; cv.style.height = h + 'px';
        cv.style.background = t.bg;
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const sc = PREV / 46; // blocks are authored at 46 units
        c.save();
        c.scale(sc, sc);
        if (t.board) t.board(c, w / sc, h / sc);
        c.restore();
        for (let i = 0; i < n; i++) {
            c.save();
            c.translate(GAP + i * (PREV + GAP), GAP);
            c.scale(sc, sc);
            SF_THEMES.paint(c, t, i, 0, 0, 46, 400 + i * 700, { seed: i + 1, mood: t.moods ? 'happy' : '' });
            c.restore();
        }
    }

    function build() {
        if (built) return;
        built = true;
        list.textContent = '';
        SF_THEMES.list().forEach((t) => {
            const card = el('button', 'sf-theme-card');
            card.type = 'button';
            card.dataset.theme = t.id;
            const cv = el('canvas', 'sf-theme-prev');
            card.appendChild(cv);
            card.appendChild(el('span', 'sf-theme-name', t.name));
            card.addEventListener('click', () => { setTheme(t.id); close(); });
            list.appendChild(card);
            drawPreview(cv, t);
        });
    }

    function sync() {
        if (!btn) return;
        label.textContent = SF_THEMES.get(theme.id).name;
        if (list) list.querySelectorAll('.sf-theme-card').forEach((c) => c.classList.toggle('active', c.dataset.theme === theme.id));
    }
    function open() { build(); panel.classList.remove('hidden'); sync(); }
    function close() { panel.classList.add('hidden'); }

    function init() {
        panel = document.getElementById('themePanel');
        list = document.getElementById('themeList');
        btn = document.getElementById('themeBtn');
        label = document.getElementById('themeLabel');
        if (!panel || !btn) return;
        btn.addEventListener('click', open);
        document.getElementById('themeClose').addEventListener('click', close);
        panel.addEventListener('click', (e) => { if (e.target === panel) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        sync();
    }
    return { init, sync, open, close };
})();
