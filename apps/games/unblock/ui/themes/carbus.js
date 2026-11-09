/**
 * Car & Bus board theme (UNB-4).
 * Parking-lot asphalt; 2-long = cars, 3-long = buses; player = red car.
 * Blocks get a small SVG top-down drawing (no image downloads).
 * @type {import('./classic.js').BoardTheme}
 */
export default {
    id: 'carbus',
    name: 'Car & Bus',
    blurb: 'Parking lot — cars, buses, red hero car.',

    /**
     * @param {HTMLElement} el
     * @param {{ length:number, orientation:string, isPlayer?:boolean, id:string }} block
     */
    decorateBlock(el, block) {
        el.querySelectorAll('.vehicle-art').forEach(n => n.remove());
        const kind = block.length >= 3 ? 'bus' : 'car';
        const color = block.isPlayer
            ? '#dc2626'
            : vehicleColor(block.id, block.length);
        const svg = buildVehicleSvg(kind, block.orientation, color, !!block.isPlayer);
        svg.classList.add('vehicle-art');
        el.appendChild(svg);
        el.classList.add('vehicle', kind);
        el.dataset.facing = block.orientation;
    }
};

/** Stable palette from block id so colours stay put across moves. */
function vehicleColor(id, length) {
    const palette = length >= 3
        ? ['#2563eb', '#059669', '#7c3aed', '#0891b2', '#ca8a04']
        : ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b', '#6366f1'];
    let h = 0;
    const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
}

/**
 * Top-down car/bus SVG.
 * Horizontal: long axis = X (nose to the right).
 * Vertical:   long axis = Y (nose downward).
 */
function buildVehicleSvg(kind, orientation, color, isPlayer) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    const isV = orientation === 'v';
    const long = kind === 'bus' ? 90 : 60;
    const short = 30;
    const W = isV ? short : long;
    const H = isV ? long : short;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');

    const winFill = isPlayer ? 'rgba(254,226,226,0.85)' : 'rgba(191,219,254,0.85)';

    if (!isV) {
        // Body along X
        rect(svg, NS, 2, 4, long - 4, 22, kind === 'bus' ? 4 : 7, color);
        rect(svg, NS, 6, 7, long - 12, 8, 3, 'rgba(255,255,255,0.22)');
        if (kind === 'car') {
            rect(svg, NS, 12, 9, 14, 10, 2, winFill);
            rect(svg, NS, 34, 9, 14, 10, 2, winFill);
        } else {
            for (let i = 0; i < 4; i++) rect(svg, NS, 12 + i * 18, 9, 12, 10, 1.5, winFill);
        }
        const wheelXs = kind === 'bus' ? [14, 44, 74] : [14, 46];
        for (const wx of wheelXs) {
            ellipse(svg, NS, wx, 2, 5, 2.2, '#1f2937');
            ellipse(svg, NS, wx, 28, 5, 2.2, '#1f2937');
        }
        circle(svg, NS, long - 5, 15, 2.2, '#fef08a');
    } else {
        // Body along Y (nose at bottom)
        rect(svg, NS, 4, 2, 22, long - 4, kind === 'bus' ? 4 : 7, color);
        rect(svg, NS, 7, 6, 8, long - 12, 3, 'rgba(255,255,255,0.22)');
        if (kind === 'car') {
            rect(svg, NS, 9, 12, 10, 14, 2, winFill);
            rect(svg, NS, 9, 34, 10, 14, 2, winFill);
        } else {
            for (let i = 0; i < 4; i++) rect(svg, NS, 9, 12 + i * 18, 10, 12, 1.5, winFill);
        }
        const wheelYs = kind === 'bus' ? [14, 44, 74] : [14, 46];
        for (const wy of wheelYs) {
            ellipse(svg, NS, 2, wy, 2.2, 5, '#1f2937');
            ellipse(svg, NS, 28, wy, 2.2, 5, '#1f2937');
        }
        circle(svg, NS, 15, long - 5, 2.2, '#fef08a');
    }
    return svg;
}

function rect(svg, NS, x, y, w, h, rx, fill) {
    const el = document.createElementNS(NS, 'rect');
    el.setAttribute('x', x); el.setAttribute('y', y);
    el.setAttribute('width', w); el.setAttribute('height', h);
    el.setAttribute('rx', rx); el.setAttribute('fill', fill);
    if (fill.startsWith('#')) {
        el.setAttribute('stroke', 'rgba(0,0,0,0.35)');
        el.setAttribute('stroke-width', '1.2');
    }
    svg.appendChild(el);
}
function ellipse(svg, NS, cx, cy, rx, ry, fill) {
    const el = document.createElementNS(NS, 'ellipse');
    el.setAttribute('cx', cx); el.setAttribute('cy', cy);
    el.setAttribute('rx', rx); el.setAttribute('ry', ry);
    el.setAttribute('fill', fill);
    svg.appendChild(el);
}
function circle(svg, NS, cx, cy, r, fill) {
    const el = document.createElementNS(NS, 'circle');
    el.setAttribute('cx', cx); el.setAttribute('cy', cy);
    el.setAttribute('r', r); el.setAttribute('fill', fill);
    svg.appendChild(el);
}
