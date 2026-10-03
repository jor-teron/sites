/*
 * Tic-tac-toe — game logic. Rules / modes / text come from TICTACTOE_CONFIG.
 * Board size: largest square that fits #boardWrap (ResizeObserver); marks scale with
 * the cell. Modes: vs CPU Easy (default) / vs CPU Hard (minimax) / 2 Players.
 * Score per mode in localStorage (safe when storage is blocked). Keyboard / gamepad
 * focus. Sites hub bridge (same protocol as Snake / 2048).
 */
(function () {
    'use strict';
    const CFG = TICTACTOE_CONFIG;
    const T = CFG.text;
    const P1 = CFG.players.first;
    const P2 = CFG.players.second;
    const HUMAN = P1, CPU = P2;
    const winPatterns = CFG.winPatterns;

    const boardEl = document.getElementById('board');
    const wrapEl = document.getElementById('boardWrap');
    const statusEl = document.getElementById('status');
    const resetBtn = document.getElementById('resetBtn');
    const modeBtn = document.getElementById('modeBtn');
    const clearBtn = document.getElementById('clearBtn');
    const cells = Array.from(document.querySelectorAll('.cell'));
    const el = (id) => document.getElementById(id);

    document.querySelector('.title').textContent = T.title;
    resetBtn.textContent = T.newGame;
    clearBtn.textContent = T.resetScore;

    // ---------- viewport height fallback (no dvh support) ----------
    const hasDvh = !!(window.CSS && CSS.supports && CSS.supports('height', '100dvh'));
    function setAppH() {
        if (!hasDvh) document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
    }
    if (!hasDvh) document.documentElement.classList.add('no-dvh');
    setAppH();

    // ---------- storage (try/catch: blocked storage still plays) ----------
    function load(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }
    function save(key, val) {
        try { localStorage.setItem(key, val); } catch (_) { /* ignore */ }
    }

    // ---------- state ----------
    const modeIds = CFG.modes.map((m) => m.id);
    let modeIdx = modeIds.indexOf(load(CFG.storage.mode));
    if (modeIdx < 0) modeIdx = Math.max(0, modeIds.indexOf(CFG.defaultMode));
    let scores = {};
    try { scores = JSON.parse(load(CFG.storage.score) || '{}') || {}; } catch (_) { scores = {}; }

    let gameState = [];
    let currentPlayer = P1;
    let starter = P1;
    let gameActive = true;
    let result = null;        // null | 'X' | 'O' | 'draw'
    let gameId = 0;           // bumps on reset: cancels a pending CPU move
    let cpuPending = false;
    let focusIdx = 4;

    const mode = () => CFG.modes[modeIdx];
    const isCpu = () => !!mode().cpu;
    function modeScore() {
        const id = mode().id;
        const s = scores[id];
        if (!s || typeof s !== 'object') scores[id] = { x: 0, o: 0, d: 0 };
        return scores[id];
    }

    // ---------- sizing ----------
    function layout() {
        setAppH();
        const w = wrapEl.clientWidth, h = wrapEl.clientHeight;
        const side = Math.max(60, Math.floor(Math.min(w, h)));
        const gap = Math.max(4, Math.round(side * 0.018));
        boardEl.style.width = side + 'px';
        boardEl.style.height = side + 'px';
        boardEl.style.gap = gap + 'px';
        const cell = (side - 2 * gap) / 3;
        boardEl.style.fontSize = Math.floor(cell * CFG.markScale) + 'px';
    }
    if (window.ResizeObserver) new ResizeObserver(layout).observe(wrapEl);
    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', () => setTimeout(layout, 100));

    // ---------- rules ----------
    function winLine(state, player) {
        return winPatterns.find((p) => p.every((i) => state[i] === player)) || null;
    }
    const full = (state) => state.every((c) => c !== '');
    const empties = (state) => state.reduce((a, c, i) => (c === '' ? a.concat(i) : a), []);

    // ---------- CPU ----------
    function findWinningMove(state, player) {
        for (const i of empties(state)) {
            state[i] = player;
            const ok = !!winLine(state, player);
            state[i] = '';
            if (ok) return i;
        }
        return -1;
    }
    function minimax(state, player, depth) {
        const other = player === CPU ? HUMAN : CPU;
        if (winLine(state, CPU)) return { score: 10 - depth };
        if (winLine(state, HUMAN)) return { score: depth - 10 };
        const free = empties(state);
        if (!free.length) return { score: 0 };
        let best = null;
        for (const i of free) {
            state[i] = player;
            const s = minimax(state, other, depth + 1).score;
            state[i] = '';
            if (!best || (player === CPU ? s > best.score : s < best.score)) best = { score: s, idx: i };
        }
        return best;
    }
    function cpuChoose(state, level) {
        const free = empties(state);
        if (!free.length) return -1;
        if (level === 'hard') {
            if (free.length === 9) return [0, 2, 4, 6, 8][Math.floor(Math.random() * 5)];
            return minimax(state.slice(), CPU, 0).idx;
        }
        const win = findWinningMove(state, CPU);
        if (win >= 0 && Math.random() < CFG.cpu.easyWinChance) return win;
        const block = findWinningMove(state, HUMAN);
        if (block >= 0 && Math.random() < CFG.cpu.easyBlockChance) return block;
        return free[Math.floor(Math.random() * free.length)];
    }
    function scheduleCpu() {
        if (!gameActive || !isCpu() || currentPlayer !== CPU) return;
        cpuPending = true;
        document.body.classList.add('cpu-turn');
        const id = gameId;
        setTimeout(() => {
            if (id !== gameId || !gameActive) return;
            cpuPending = false;
            document.body.classList.remove('cpu-turn');
            const i = cpuChoose(gameState, mode().cpu);
            if (i >= 0) place(i);
        }, Math.max(0, CFG.cpu.delayMs));
    }

    // ---------- play ----------
    function place(index) {
        if (!gameActive || gameState[index] !== '') return false;
        gameState[index] = currentPlayer;
        const cell = cells[index];
        cell.textContent = currentPlayer;
        cell.classList.add('filled', currentPlayer.toLowerCase());

        const line = winLine(gameState, currentPlayer);
        if (line) {
            line.forEach((i) => cells[i].classList.add('winner'));
            finish(currentPlayer);
        } else if (full(gameState)) {
            finish('draw');
        } else {
            currentPlayer = currentPlayer === P1 ? P2 : P1;
            render();
            scheduleCpu();
        }
        return true;
    }
    function finish(res) {
        gameActive = false;
        result = res;
        const s = modeScore();
        if (res === P1) s.x++;
        else if (res === P2) s.o++;
        else s.d++;
        save(CFG.storage.score, JSON.stringify(scores));
        if (res !== 'draw') hubRumble(isCpu() && res === CPU ? CFG.rumble.lossMs : CFG.rumble.winMs);
        render();
    }
    function humanPlace(index) {
        if (!gameActive || cpuPending) return;
        if (isCpu() && currentPlayer !== HUMAN) return;
        place(index);
    }
    function resetGame() {
        gameId++;
        cpuPending = false;
        document.body.classList.remove('cpu-turn');
        gameState = new Array(CFG.cellCount).fill('');
        if (CFG.alternateStart && result !== null) starter = starter === P1 ? P2 : P1;
        currentPlayer = starter;
        gameActive = true;
        result = null;
        cells.forEach((c) => {
            c.textContent = '';
            c.classList.remove('filled', 'x', 'o', 'winner');
        });
        render();
        scheduleCpu();
    }
    function setMode(idx) {
        modeIdx = (idx + CFG.modes.length) % CFG.modes.length;
        save(CFG.storage.mode, mode().id);
        result = null;          // a mode switch does not flip the starter
        starter = P1;
        resetGame();
        hubSendApp();
    }
    function clearScore() {
        scores[mode().id] = { x: 0, o: 0, d: 0 };
        save(CFG.storage.score, JSON.stringify(scores));
        render();
    }

    // ---------- render ----------
    function statusText() {
        const fmt = (t, p) => t.replace('{player}', p);
        if (result === 'draw') return T.draw;
        if (result) return isCpu() ? (result === HUMAN ? T.youWin : T.cpuWins) : fmt(T.win, result);
        if (isCpu()) return currentPlayer === HUMAN ? T.yourTurn : T.cpuTurn;
        return fmt(T.turn, currentPlayer);
    }
    function labels() {
        return isCpu() ? [T.labelYou, T.labelCpu, T.labelDraws] : [T.labelX, T.labelO, T.labelDraws];
    }
    function render() {
        statusEl.textContent = statusText();
        statusEl.className = 'status ' + (result ? 'winner' : currentPlayer === P1 ? 'x-turn' : 'o-turn');
        const s = modeScore(), lb = labels();
        el('lblX').textContent = lb[0]; el('lblO').textContent = lb[1]; el('lblD').textContent = lb[2];
        el('scX').textContent = s.x; el('scO').textContent = s.o; el('scD').textContent = s.d;
        modeBtn.textContent = T.modePrefix + mode().label;
        cells.forEach((c, i) => c.classList.toggle('focus', i === focusIdx));
        hubSendStats();
    }

    // ---------- input: pointer ----------
    cells.forEach((cell, i) => {
        cell.addEventListener('click', () => {
            document.body.classList.remove('kbd');
            focusIdx = i;
            humanPlace(i);
            render();
        });
    });
    const btnAct = (b, fn) => b.addEventListener('click', () => { fn(); b.blur(); });
    btnAct(resetBtn, resetGame);
    btnAct(modeBtn, () => setMode(modeIdx + 1));
    btnAct(clearBtn, clearScore);
    document.addEventListener('contextmenu', (e) => { if (e.target.closest('.board')) e.preventDefault(); });

    // ---------- input: keyboard / gamepad ----------
    const MOVES = {
        ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
        ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
    };
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        const k = e.key, code = e.code;
        let mv = MOVES[code];
        if (!mv) {
            const lk = String(k).toLowerCase();
            mv = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[lk];
        }
        if (mv) {
            e.preventDefault();
            const wasHidden = !document.body.classList.contains('kbd');
            document.body.classList.add('kbd');
            if (!wasHidden) {
                const x = (focusIdx % 3 + mv[0] + 3) % 3, y = (Math.floor(focusIdx / 3) + mv[1] + 3) % 3;
                focusIdx = y * 3 + x;
            }
            render();
            return;
        }
        if (k === 'Enter' || k === ' ' || code === 'Space') {
            e.preventDefault();
            if (e.repeat) return;
            document.body.classList.add('kbd');
            if (!gameActive) resetGame();
            else humanPlace(focusIdx);
            render();
            return;
        }
        if (k === 'n' || k === 'N' || k === 'Escape') {
            e.preventDefault();
            if (!e.repeat) resetGame();
            return;
        }
        if (k === 'm' || k === 'M') {
            e.preventDefault();
            if (!e.repeat) setMode(modeIdx + 1);
        }
    });

    // ---------- HUB BRIDGE ----------
    /*
     * Optional; same protocol as Snake / 2048 / hub-gamebar.js (v:1). Only in a frame:
     *   game → hub  {type:'hub-ready'}                     on load
     *   hub → game  {type:'hub-hello'}                     → body.in-hub, reply hub-app
     *   game → hub  {type:'hub-app', app, stats, buttons}  Turn / X / O / Draws; New Game / Mode
     *   game → hub  {type:'hub-stat', id, value}           on change
     *   hub → game  {type:'hub-action', id:'new'|'mode'}
     *   game → hub  {type:'hub-rumble', ms | pattern}      win / loss
     * Accepted only from window.parent with a same-origin / file:// origin.
     */
    const HUB_V = 1;
    const IN_FRAME = (() => { try { return window.parent && window.parent !== window; } catch (_) { return true; } })();
    let hubLinked = false;
    const hubLastSent = {};
    function hubPost(msg) {
        if (!IN_FRAME) return;
        try { window.parent.postMessage(Object.assign({ v: HUB_V }, msg), '*'); } catch (_) { /* ignore */ }
    }
    function hubOriginOk(origin) {
        return origin === location.origin || origin === 'null' || location.origin === 'null' ||
            String(origin).indexOf('file:') === 0;
    }
    function hubStats() {
        const s = modeScore(), lb = labels();
        return [
            { id: 'turn', label: T.statTurn, value: statusText() },
            { id: 'x', label: lb[0], value: s.x },
            { id: 'o', label: lb[1], value: s.o },
            { id: 'd', label: lb[2], value: s.d },
        ];
    }
    function hubSendStats() {
        if (!hubLinked) return;
        hubStats().forEach((st) => {
            if (hubLastSent[st.id] === st.value) return;
            hubLastSent[st.id] = st.value;
            hubPost({ type: 'hub-stat', id: st.id, value: st.value });
        });
    }
    function hubSendApp() {
        if (!hubLinked) return;
        const stats = hubStats();
        stats.forEach((st) => { hubLastSent[st.id] = st.value; });
        hubPost({
            type: 'hub-app',
            app: { name: CFG.app.name, version: CFG.app.version },
            stats: stats,
            buttons: [{ id: 'new', label: T.hubNewGame }, { id: 'mode', label: T.modePrefix + mode().label }],
        });
    }
    function hubRumble(v) {
        if (!hubLinked || !v) return;
        if (Array.isArray(v)) hubPost({ type: 'hub-rumble', pattern: v.slice(0, 20) });
        else if (Number(v) > 0) hubPost({ type: 'hub-rumble', ms: Number(v) });
    }
    function onHubMessage(e) {
        if (e.source !== window.parent || !hubOriginOk(e.origin)) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.v !== HUB_V) return;
        if (d.type === 'hub-hello') {
            if (!hubLinked) {
                hubLinked = true;
                document.body.classList.add('in-hub');
                requestAnimationFrame(layout);
            }
            hubSendApp();
        } else if (d.type === 'hub-action' && hubLinked) {
            if (d.id === 'new') resetGame();
            else if (d.id === 'mode') setMode(modeIdx + 1);
        }
    }
    if (IN_FRAME) window.addEventListener('message', onHubMessage);

    // ---------- debug / tests ----------
    window.__ttt = {
        get state() { return gameState.slice(); },
        get turn() { return currentPlayer; },
        get active() { return gameActive; },
        get result() { return result; },
        get mode() { return mode().id; },
        get focus() { return focusIdx; },
        get cpuPending() { return cpuPending; },
        get score() { return Object.assign({}, modeScore()); },
        get inHub() { return hubLinked; },
    };

    // ---------- boot ----------
    resetGame();
    layout();
    requestAnimationFrame(layout);
    hubPost({ type: 'hub-ready' });
})();
