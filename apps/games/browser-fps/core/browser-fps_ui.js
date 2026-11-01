/**
 * Browser FPS — input and menus: pointer lock / pause, the Exit button, mute, map and mode selectors,
 * keyboard and mouse, window resize, and the on-screen touch controls (createTouchControls).
 * installUi(S) registers clearInput, unlockPointer, leaveFullscreen, exitToMenu, syncExitUi, setMap, setMode,
 * syncModeUi, startTouchPlay on the shared context (see browser-fps_world.js).
 */
import { createTouch } from './browser-fps_touch.js';

export function installUi(S) {
  const { CFG, KEYS, MAP, MAPS, MODE_CFG, audio, renderer, camera, vm, player, enemies, keys } = S;
  const { overlay, hud, retryBtn, exitBtn } = S;
  const MAG_SIZE = CFG.weapon.magSize;
  const SP = CFG.spawn;
  const isDead = () => S.isDead();

  function clearInput() {
    for (const k of Object.keys(keys)) delete keys[k];
    S.shooting = false;
    S.aimHeld = false;
  }

  /** Always free the mouse — do not rely on the browser's default Esc alone. */
  function unlockPointer() {
    clearInput();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    S.pointerLocked = false; S.touchPlaying = false;
    overlay.classList.toggle('hidden', isDead());
    hud.classList.remove('visible');
  }

  // ─── Exit button (top-left): leave pointer lock + fullscreen and show the menu; on the menu it only leaves fullscreen ──
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  /** Leave fullscreen in this page, or in the Hub page around it (same origin) if that is what is fullscreen. */
  function leaveFullscreen() {
    const quit = (d) => { try { const f = d.exitFullscreen || d.webkitExitFullscreen; const r = f && f.call(d); if (r && r.catch) r.catch(() => {}); } catch (_) { /* ignore */ } };
    if (fsElement()) quit(document);
    try { const pd = window.parent !== window ? window.parent.document : null; if (pd && (pd.fullscreenElement || pd.webkitFullscreenElement)) quit(pd); } catch (_) { /* cross-origin parent */ }
  }
  function exitToMenu() {
    if (S.touch) S.touch.releaseAll();
    unlockPointer();
    leaveFullscreen();
    syncExitUi();
  }
  let exitUi = '';
  function syncExitUi() {
    if (!exitBtn) return;
    const playing = S.active() && !isDead();
    const st = playing ? (S.pointerLocked ? 'lock' : 'play') : (fsElement() ? 'fs' : 'none');
    if (st === exitUi) return;
    exitUi = st;
    exitBtn.classList.toggle('hidden', st === 'none');
    exitBtn.textContent = st === 'lock' ? '✕ Esc' : st === 'play' ? '✕ Exit' : '⤢ Exit fullscreen';
    exitBtn.title = st === 'fs' ? 'Leave fullscreen' : 'Back to the menu (Esc / P / `) and leave fullscreen';
  }
  if (exitBtn) {
    for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'mousedown']) exitBtn.addEventListener(ev, (e) => e.stopPropagation());
    exitBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); exitToMenu(); });
  }
  document.addEventListener('fullscreenchange', syncExitUi);
  document.addEventListener('webkitfullscreenchange', syncExitUi);

  function syncPointerLockUi() {
    S.pointerLocked = document.pointerLockElement === renderer.domElement;
    if (S.pointerLocked) S.touchPlaying = false;
    overlay.classList.toggle('hidden', S.active() || isDead());
    hud.classList.toggle('visible', S.active());
    if (!S.active()) clearInput();
  }

  // ─── Input ────────────────────────────────────────────────────────────────
  // Mute: M key, or the speaker buttons on the start/pause and death screens (no in-game buttons)
  const muteBtns = document.querySelectorAll('.mute-btn');
  function syncMuteUi(m) { muteBtns.forEach((b) => { b.textContent = m ? '🔇' : '🔊'; b.title = m ? 'Sound off (M)' : 'Sound on (M)'; }); }
  audio.onMute = syncMuteUi; syncMuteUi(audio.muted);
  muteBtns.forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); audio.unlock(); audio.toggleMute(); }));
  // AudioContext is created / resumed on the first user gesture
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => audio.unlock(), { capture: true });
  // Map selector on the start screen (reloads the page to build the other map; choice saved in localStorage)
  function setMap(m) {
    if (!MAPS.includes(m)) return;
    localStorage.setItem(CFG.maps.storageKey, m);
    const u = new URL(location.href); u.searchParams.delete('map'); u.searchParams.delete('mode'); u.searchParams.delete('from');
    if (m !== MAP || u.href !== location.href) location.href = u.href;
  }
  document.querySelectorAll('.map-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.map === MAP);
    b.addEventListener('click', (e) => { e.stopPropagation(); setMap(b.dataset.map); });
  });
  // Mode selector (start screen) + M key in play
  const modeNote = document.getElementById('mode-note'), modeNotice = document.getElementById('mode-notice');
  let noticeT = 0;
  function syncModeUi() {
    document.body.classList.toggle('explore', !S.isFight());
    document.querySelectorAll('.mode-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === S.MODE);
      b.disabled = !MODE_CFG.allowed.includes(b.dataset.mode);
    });
    modeNote.textContent = MODE_CFG.allowed.length < 2 ? `${CFG.mapNames[MAP]} is Fight only` : '';
    const u = new URL(location.href);
    if (u.searchParams.get('mode') !== S.MODE) { u.searchParams.set('mode', S.MODE); history.replaceState(null, '', u.href); }
  }
  function setMode(m, notice = true) {
    if (!MODE_CFG.allowed.includes(m)) return false;
    if (m === S.MODE) { syncModeUi(); return true; }
    S.MODE = m;
    localStorage.setItem(CFG.modes.storageKey, m);
    if (S.isFight()) { S.resetEnemies(); S.spawnTimer = SP.interval; }
    else {
      for (const en of enemies) { en.alive = false; en.dying = false; en.rising = 0; en.group.visible = false; en.collider.disabled = true; }
      S.pickups.reset(); S.nadePickups.reset(); S.cancelGrenade();
    }
    syncModeUi();
    if (notice) { modeNotice.textContent = S.isFight() ? 'FIGHT MODE' : 'EXPLORE MODE'; modeNotice.classList.remove('hidden'); clearTimeout(noticeT); noticeT = setTimeout(() => modeNotice.classList.add('hidden'), 1600); }
    return true;
  }
  document.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setMode(b.dataset.mode, false); }));
  let lastOverlayPtr = 'mouse';
  overlay.addEventListener('pointerdown', (e) => { lastOverlayPtr = e.pointerType; });
  overlay.addEventListener('click', () => {
    audio.unlock();
    if (S.touch && S.touch.enabled && lastOverlayPtr !== 'mouse') return;   // touch start handled in browser-fps_touch.js
    renderer.domElement.requestPointerLock();
  });
  retryBtn.addEventListener('pointerdown', (e) => { lastOverlayPtr = e.pointerType; });
  retryBtn.addEventListener('click', () => {
    S.restartGame();
    if (S.touch && S.touch.enabled && lastOverlayPtr !== 'mouse') { startTouchPlay(); return; }
    renderer.domElement.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', syncPointerLockUi);
  document.addEventListener('pointerlockerror', () => {
    unlockPointer();
  });

  // Remote/desktop viewers often swallow Esc before the page sees it — unlock on blur too.
  window.addEventListener('blur', unlockPointer);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) unlockPointer();
  });

  document.addEventListener('mousemove', (e) => {
    if (!S.pointerLocked) return;
    S.lookBy(e.movementX, e.movementY);
  });

  document.addEventListener('keydown', (e) => {
    // Multiple unlock keys: Esc can be stolen by a host/viewer; P and ` still reach the page.
    if (KEYS.unlock.includes(e.code)) {
      e.preventDefault();
      e.stopPropagation();
      const wasActive = S.active();
      unlockPointer();
      if (!wasActive && !e.repeat) leaveFullscreen();   // already on the menu: a second Esc / P / ` also leaves fullscreen
      return;
    }
    if (KEYS.mute.includes(e.code) && !e.repeat) { audio.toggleMute(); return; }
    if (KEYS.fpsCounter.includes(e.code) && !e.repeat) { e.preventDefault(); S.toggleFpsCounter(); return; }
    if (KEYS.mode.includes(e.code) && !e.repeat && !isDead()) {
      if (MODE_CFG.allowed.length > 1) setMode(S.isFight() ? 'explore' : 'fight');
      else { modeNotice.textContent = `${CFG.mapNames[MAP]}: Fight only`; modeNotice.classList.remove('hidden'); clearTimeout(noticeT); noticeT = setTimeout(() => modeNotice.classList.add('hidden'), 1600); }
      return;
    }
    if (!S.active()) return;
    keys[e.code] = true;
    if (e.code === CFG.doors.key && !e.repeat && S.nearDoor && !isDead()) S.useDoor(S.nearDoor);
    if (KEYS.reload.includes(e.code) && !player.reloading && !S.nadeAim.holding && player.ammo < MAG_SIZE) S.startReload();
    if (KEYS.grenade.includes(e.code) && !e.repeat && !isDead() && S.isFight()) S.holdGrenade();
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; if (KEYS.grenade.includes(e.code)) S.releaseGrenade(); });

  document.addEventListener('mousedown', (e) => {
    if (!S.pointerLocked) return;
    if (e.button === 0) S.shooting = true;
    if (e.button === 2) { if (S.nadeAim.holding) S.cancelGrenade(); else S.aimHeld = true; }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) S.shooting = false;
    if (e.button === 2) S.aimHeld = false;
  });
  // Right mouse button is aim: never open the context menu over the game
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    vm.setAspect(window.innerWidth / window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // On-screen touch controls (keyboard + mouse always keep working)
  function startTouchPlay() {
    if (isDead()) return;
    S.touchPlaying = true;
    overlay.classList.add('hidden'); hud.classList.add('visible');
  }

  Object.assign(S, { clearInput, unlockPointer, leaveFullscreen, exitToMenu, syncExitUi, syncPointerLockUi, setMap, syncModeUi, setMode, startTouchPlay });
}

/** Create the on-screen touch controls (browser-fps_touch.js) wired to the shared context; sets S.touch. */
export function createTouchControls(S) {
  const { CFG, MODE_CFG, player, keys, doors, touchMove } = S;
  const MAG_SIZE = CFG.weapon.magSize;
  S.touch = createTouch({
    overlay: S.overlay,
    start: S.startTouchPlay,
    pause: () => S.unlockPointer(),
    playing: () => S.active() && !S.isDead(),
    look: (dx, dy) => S.lookBy(dx * 1.6, dy * 1.6),
    setMove: (x, y, sp) => { touchMove.x = x; touchMove.y = y; touchMove.sprint = sp; },
    setFire: (b) => { S.shooting = b && !S.nadeAim.holding; },
    toggleAim: () => { S.aimHeld = !S.aimHeld; },
    aiming: () => S.aimHeld,
    jump: () => { keys.Space = true; setTimeout(() => { keys.Space = false; }, 150); },
    reload: () => { if (!player.reloading && !S.nadeAim.holding && player.ammo < MAG_SIZE) S.startReload(); },
    nadeHold: () => S.isFight() && S.holdGrenade(),
    nadeRelease: () => S.releaseGrenade(),
    nadeCancel: () => S.cancelGrenade(),
    nearDoor: () => (doors.going ? null : S.nearDoor),
    useDoor: (d) => S.useDoor(d),
    canToggleMode: () => MODE_CFG.allowed.length > 1,
    toggleMode: () => S.setMode(S.isFight() ? 'explore' : 'fight'),
    fight: () => S.isFight(),
  });
  return S.touch;
}
