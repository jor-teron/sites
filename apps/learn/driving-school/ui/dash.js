/* DS-2a dashboard: steering wheel, analogue dials, gear lever, lamps and pedal travel.
   Plain HTML/SVG over the 3D canvas (cheap on weak phones). Maths is in core/cockpit.js. */
(function () {
  'use strict';
  const D = window.DS, NS = 'http://www.w3.org/2000/svg', $ = id => document.getElementById(id);
  function el(name, attrs, parent) { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function polar(deg, r) { const a = deg * Math.PI / 180; return [Math.sin(a) * r, -Math.cos(a) * r]; }
  function dial(svg, max, step, labelEvery, scale, redFrom, unit, textId, smallId) {
    svg.replaceChildren();
    el('circle', { r: 57, class: 'dial-face' }, svg);
    if (redFrom) { const [x0, y0] = polar(D.needleAngle(redFrom, max), 50), [x1, y1] = polar(D.needleAngle(max, max), 50); el('path', { d: `M${x0} ${y0}A50 50 0 0 1 ${x1} ${y1}`, class: 'dial-red' }, svg); }
    for (let v = 0; v <= max; v += step) {
      const a = D.needleAngle(v, max), major = v % labelEvery === 0, [x0, y0] = polar(a, major ? 42 : 46), [x1, y1] = polar(a, 52);
      el('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: major ? 'tick major' : 'tick' }, svg);
      if (major) { const [tx, ty] = polar(a, 33), t = el('text', { x: tx, y: ty + 4, class: 'dial-num' }, svg); t.textContent = v / scale; }
    }
    const big = el('text', { x: 0, y: 26, class: 'dial-big', id: textId }, svg); big.textContent = '0';
    const small = el('text', { x: 0, y: 40, class: 'dial-unit' }, svg); small.textContent = unit; if (smallId) small.id = smallId;
    const needle = el('g', { class: 'needle' }, svg);
    el('path', { d: 'M-2.5 6 L0 -48 L2.5 6 Z' }, needle); el('circle', { r: 5, class: 'hubcap' }, svg);
    return needle;
  }
  function wheelSvg(svg) {
    svg.replaceChildren();
    el('circle', { r: 86, class: 'rim' }, svg);
    el('path', { d: 'M-12 -84 A86 86 0 0 1 12 -84', class: 'rim-mark' }, svg);  // top marker shows rotation
    for (const d of ['M-20 8 L-80 18', 'M20 8 L80 18', 'M-12 22 L-8 80 M12 22 L8 80']) el('path', { d, class: 'spoke' }, svg);
    el('circle', { r: 26, class: 'hub-plate' }, svg);
  }
  let parts = null, gateKey = '';
  function build(opts) {
    parts = { speed: dial($('speedo'), D.SPEEDO_MAX, 10, 20, 1, 0, 'km/h', 'speed'),
      rpm: dial($('tacho'), D.TACHO_MAX, 500, 1000, 1000, 5500, 'rpm ×1000', 'gear', 'rpm'), opts };
    wheelSvg($('wheel').querySelector('svg'));
    steering(opts.onSteer);
  }
  function gate(c, onGear) {
    const key = c.auto ? 'auto' : 'manual'; if (key === gateKey) return; gateKey = key;
    const g = $('gate'); g.replaceChildren(); g.classList.toggle('auto', c.auto);
    for (const slot of D.gateSlots(c.auto)) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = slot.label; b.dataset.gear = slot.gear;
      b.style.gridColumn = slot.col + 1; b.style.gridRow = slot.row + 1;
      b.setAttribute('aria-label', slot.gear === -1 ? 'Reverse gear' : slot.gear === 0 ? 'Neutral' : c.auto ? 'Drive' : 'Gear ' + slot.gear);
      b.onclick = () => onGear(slot.gear); g.appendChild(b);
    }
  }
  // Drag the wheel round like a real one; near the hub, sideways drag also steers.
  function steering(onSteer) {
    const wheel = $('wheel'); let drag = null;
    // The wheel is CSS-rotated, so use its unrotated size for the radius.
    function centre() { const r = wheel.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: wheel.offsetWidth / 2 }; }
    wheel.addEventListener('pointerdown', e => {
      e.preventDefault(); const c = centre(); wheel.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, steer: 0, lastDeg: D.pointerAngle(c.x, c.y, e.clientX, e.clientY), x: e.clientX }; wheel.classList.add('held');
    });
    wheel.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return; const c = centre();
      if (D.nearHub(c.x, c.y, e.clientX, e.clientY, c.r)) { drag.steer = D.clamp(drag.steer + (e.clientX - drag.x) / c.r, -1, 1); drag.lastDeg = D.pointerAngle(c.x, c.y, e.clientX, e.clientY); }
      else Object.assign(drag, D.dragSteer(drag, D.pointerAngle(c.x, c.y, e.clientX, e.clientY)));
      drag.x = e.clientX; onSteer(drag.steer);
    });
    const end = () => { drag = null; wheel.classList.remove('held'); onSteer(0); };
    wheel.addEventListener('pointerup', end); wheel.addEventListener('pointercancel', end); wheel.addEventListener('lostpointercapture', () => { if (drag) end(); });
    wheel.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onSteer(e.key === 'ArrowLeft' ? -1 : 1); } });
    wheel.addEventListener('keyup', () => onSteer(0));
  }
  function update(c, input, onGear) {
    if (!parts) return;
    gate(c, onGear);
    $('wheel').style.transform = 'rotate(' + D.wheelAngle(c.steer).toFixed(1) + 'deg)';
    $('wheel').setAttribute('aria-valuenow', Math.round(c.steer * 100));
    parts.speed.setAttribute('transform', 'rotate(' + D.needleAngle(Math.abs(c.v) * 3.6, D.SPEEDO_MAX).toFixed(1) + ')');
    parts.rpm.setAttribute('transform', 'rotate(' + D.needleAngle(c.rpm, D.TACHO_MAX).toFixed(1) + ')');
    $('speed').textContent = D.speedKmh(c); $('gear').textContent = D.gearLabel(c);
    $('rpm').textContent = c.engine ? (Math.round(c.rpm / 100) / 10).toFixed(1) + ' ×1000 rpm' : 'engine off';
    const slot = D.gateSlotFor(c);
    for (const b of $('gate').children) b.setAttribute('aria-pressed', slot && +b.dataset.gear === slot.gear);
    const blink = Math.floor(c.elapsed * 2) % 2 === 0;
    $('left').classList.toggle('lit', c.indicator === 'left' && blink); $('right').classList.toggle('lit', c.indicator === 'right' && blink);
    $('left').setAttribute('aria-pressed', c.indicator === 'left'); $('right').setAttribute('aria-pressed', c.indicator === 'right');
    $('park').setAttribute('aria-pressed', c.handbrake); $('park').classList.toggle('on', c.handbrake);
    $('lamps').textContent = [c.handbrake ? 'Handbrake on' : '', c.stalled ? 'Stalled' : !c.engine ? 'Engine off' : ''].filter(Boolean).join(' · ') || 'Ready';
    $('engine').classList.toggle('running', c.engine); $('engine').textContent = c.engine ? 'Engine on' : 'Start engine';
    const pedal = (name, v) => { const b = document.querySelector('[data-hold="' + name + '"]'); if (b) b.style.setProperty('--press', Math.round(D.clamp(v, 0, 1) * 100) + '%'); };
    pedal('clutch', c.auto ? 0 : c.clutch); pedal('brake', input.brake); pedal('throttle', input.throttle);
  }
  D.dash = { build, update };
})();
