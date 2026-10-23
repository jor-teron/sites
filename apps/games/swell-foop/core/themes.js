/*
 * Swell Foop — theme registry (core). Themes live in assets/themes/*.js and register here.
 *
 * Theme contract (every block is drawn in a box (0,0)-(s,s); glow may spill up to SF_PAD units outside):
 *   { id, name, bg,                       // bg = CSS background for the board canvas
 *     moods?: ['happy', ...],             // optional: block art changes with o.mood (cached per mood)
 *     draw(ctx, i, s, o)                  // static art for colour index i (0..4); o = { mood, seed }
 *     fx?(ctx, i, s, t, o)                // optional animated overlay (sparkle, pulse, blink); t = ms
 *     board?(ctx, w, h) }                 // optional board decoration drawn before the blocks
 * Static art is cached once per (theme, colour, mood, cell size) in an offscreen sprite, so a frame is
 * only drawImage calls plus the optional fx.  Colour index i has a distinct SHAPE in every theme.
 */
const SF_PAD = 6;       // spill room around a block in the sprite cache (game units)
const SF_THEMES = (() => {
    const list = [];
    const byId = {};
    const cache = new Map();
    return {
        DEFAULT_ID: 'classic',
        register(t) { if (!byId[t.id]) list.push(t); byId[t.id] = t; },
        list() { return list.slice(); },
        has(id) { return Object.prototype.hasOwnProperty.call(byId, id); },
        get(id) { return byId[id] || byId[this.DEFAULT_ID] || list[0]; },
        /** Draws block i of theme t at x,y (box size s) straight onto ctx (previews, specials, no cache). */
        paint(ctx, t, i, x, y, s, time, o) {
            o = o || {};
            ctx.save();
            ctx.translate(x, y);
            t.draw(ctx, i, s, o);
            if (t.fx) t.fx(ctx, i, s, time || 0, o);
            ctx.restore();
        },
        /** Draws the cached sprite of block i (k = device pixels per game unit), then its animated overlay. */
        block(ctx, t, i, x, y, s, k, time, o) {
            o = o || {};
            const mood = t.moods ? (o.mood || t.moods[0]) : '';
            const key = t.id + '|' + i + '|' + mood + '|' + s + '|' + k; // sprite per theme, colour, mood and cell size
            if (cache.size > 400) cache.clear();    // stale sizes after many resizes
            let sp = cache.get(key);
            if (!sp) {
                const px = Math.ceil((s + 2 * SF_PAD) * k);
                const cv = document.createElement('canvas');
                cv.width = px; cv.height = px;
                const c = cv.getContext('2d');
                c.setTransform(k, 0, 0, k, SF_PAD * k, SF_PAD * k);
                t.draw(c, i, s, { mood, seed: 0 });
                sp = cv;
                cache.set(key, sp);
            }
            ctx.drawImage(sp, x - SF_PAD, y - SF_PAD, s + 2 * SF_PAD, s + 2 * SF_PAD);
            if (t.fx) {
                ctx.save();
                ctx.translate(x, y);
                t.fx(ctx, i, s, time || 0, o);
                ctx.restore();
            }
        },
        clearCache() { cache.clear(); },
    };
})();
