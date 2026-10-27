// LandCraft input. Desktop: click for pointer-lock mouse look (drag also looks), WASD/arrows, Space.
// Touch: left half is a virtual joystick, right half drags to look, plus a jump button.
// LC3: opts.sens() is the look-sensitivity multiplier from the Games settings (1 = default).
export function setupControls(canvas, player, opts) {
  const sens = opts && opts.sens ? opts.sens : function () { return 1; };
  const keys = {}, stick = { id: null, x: 0, y: 0, dx: 0, dy: 0 }, look = { id: null, x: 0, y: 0 };
  const base = document.getElementById('stick'), knob = document.getElementById('knob'), jumpBtn = document.getElementById('jump');
  const R = 50;
  let touchJump = false, lockFailed = false;
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

  function turn(dx, dy, k) {
    k *= sens();
    player.yaw -= dx * k;
    player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - dy * k));
  }
  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; });
  canvas.addEventListener('click', function () {
    if (document.body.classList.contains('touch') || !canvas.requestPointerLock) return;
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(function () { lockFailed = true; }); // refused (e.g. headless): drag-to-look and click-to-edit still work
  });
  document.addEventListener('mousemove', function (e) {
    if (document.pointerLockElement === canvas) turn(e.movementX, e.movementY, 0.0025);
  });

  function placeKnob() { knob.style.transform = 'translate(' + stick.dx + 'px,' + stick.dy + 'px)'; }
  canvas.addEventListener('pointerdown', function (e) {
    if (document.pointerLockElement !== canvas) canvas.setPointerCapture(e.pointerId); // capture throws while locked
    if (e.pointerType === 'touch' && e.clientX < window.innerWidth / 2 && stick.id === null) {
      stick.id = e.pointerId; stick.x = e.clientX; stick.y = e.clientY;
      base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px'; base.classList.add('active');
    } else if (look.id === null) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerId === stick.id) {
      let dx = e.clientX - stick.x, dy = e.clientY - stick.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      stick.dx = dx; stick.dy = dy; placeKnob();
    } else if (e.pointerId === look.id && document.pointerLockElement !== canvas) {
      turn(e.clientX - look.x, e.clientY - look.y, e.pointerType === 'touch' ? 0.006 : 0.004);
      look.x = e.clientX; look.y = e.clientY;
    }
  });
  function release(e) {
    if (e.pointerId === stick.id) {
      stick.id = null; stick.dx = stick.dy = 0; placeKnob();
      base.classList.remove('active'); base.style.left = base.style.top = '';
    }
    if (e.pointerId === look.id) look.id = null;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  jumpBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); touchJump = true; });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) {
    jumpBtn.addEventListener(n, function () { touchJump = false; });
  });

  function k(a, b) { return keys[a] || keys[b] ? 1 : 0; }
  return {
    lockFailed: function () { return lockFailed; },
    touch: function () { return document.body.classList.contains('touch'); },
    read: function () {
      return {
        fwd: k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown') - stick.dy / R,
        strafe: k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft') + stick.dx / R,
        jump: !!keys.Space || touchJump
      };
    }
  };
}
