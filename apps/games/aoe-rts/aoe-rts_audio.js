/** AOE RTS R9 - procedural Web Audio sounds (no files). Starts on first tap; mute saved in localStorage. */
const Sfx = (() => {
    let ctx = null, master = null, muted = localStorage.getItem('aoe-rts-muted') === '1';
    const last = {};
    function init() {
        if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
    }
    let noiseBuf = null;
    function noise() {
        if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s;
    }
    function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    function tone(type, f0, f1, dur, vol, delay) {
        const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        env(g, t, 0.005, vol, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    function burst(freq, q, dur, vol, type, delay) {
        const t = ctx.currentTime + (delay || 0), s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
        env(g, t, 0.003, vol, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
    }
    const sounds = {
        chop()   { burst(900, 1.2, 0.09, 0.6); tone('triangle', 180, 90, 0.08, 0.3); },
        mine()   { const f = 1800 + Math.random() * 600; tone('square', f, f * 0.98, 0.12, 0.08); tone('sine', f * 1.5, null, 0.18, 0.12); burst(3000, 2, 0.04, 0.3); },
        gather() { burst(2500, 0.8, 0.07, 0.25, 'highpass'); tone('sine', 700 + Math.random() * 200, 500, 0.06, 0.08); },
        drop()   { burst(400, 0.9, 0.12, 0.5, 'lowpass'); tone('sine', 520, null, 0.1, 0.12, 0.05); tone('sine', 780, null, 0.12, 0.1, 0.11); },
        train()  { [523, 659, 784].forEach((f, i) => tone('triangle', f, null, 0.22, 0.18, i * 0.1)); },
        hammer() { burst(1400, 3, 0.05, 0.5); tone('square', 320, 200, 0.05, 0.1); },
        built()  { [392, 523].forEach((f, i) => tone('triangle', f, null, 0.25, 0.18, i * 0.12)); },
        hunt()   { burst(1800, 0.7, 0.16, 0.35, 'highpass'); tone('triangle', 260, 120, 0.12, 0.22, 0.12); burst(300, 1, 0.1, 0.4, 'lowpass', 0.14); },   // whoosh + thud
        tap()    { tone('sine', 880, 660, 0.05, 0.12); },
        error()  { tone('square', 200, 150, 0.15, 0.08); }
    };
    return {
        init,
        play(name, minGap) {
            if (!ctx || muted || ctx.state !== 'running') return;
            const now = ctx.currentTime;
            if (minGap && last[name] && now - last[name] < minGap) return;
            last[name] = now; sounds[name] && sounds[name]();
        },
        isMuted: () => muted,
        toggle() { muted = !muted; localStorage.setItem('aoe-rts-muted', muted ? '1' : '0'); if (master) master.gain.value = muted ? 0 : 0.5; return muted; }
    };
})();
