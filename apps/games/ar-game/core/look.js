/*
 * AR Theme Game — look controller (ES module).
 * Turns the phone into a 360° viewer: DeviceOrientation (gyro) drives the
 * camera rotation; if there is no gyro (desktop) or permission is denied,
 * drag/swipe on the canvas looks around instead. Drag also adds a yaw
 * offset in gyro mode.
 */
import * as THREE from "three";

const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° about X
const qYaw = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const fwd = new THREE.Vector3();

export function createLookController(canvas, opts = {}) {
  const dragDegPerScreen = opts.dragDegPerScreen || 90;
  const state = {
    mode: "drag",          // "drag" until a real gyro reading arrives
    active: false,
    orient: null,          // latest {alpha, beta, gamma} in degrees
    yaw: 0,                // drag yaw (drag mode) / yaw offset (gyro mode)
    pitch: 0,              // drag pitch (drag mode only)
    dragging: false,
    lastX: 0,
    lastY: 0,
    permission: "unknown", // unknown | granted | denied | not-needed
  };

  function onOrientation(ev) {
    if (ev.alpha == null && ev.beta == null && ev.gamma == null) return; // desktop stub event
    state.orient = { alpha: ev.alpha || 0, beta: ev.beta || 0, gamma: ev.gamma || 0 };
    if (state.mode !== "gyro") {
      state.mode = "gyro";
      state.yaw = 0; // drag yaw becomes an offset from here on
      state.pitch = 0;
    }
  }

  function onDown(ev) {
    state.dragging = true;
    state.lastX = ev.clientX;
    state.lastY = ev.clientY;
  }
  function onMove(ev) {
    if (!state.dragging) return;
    const radPerPx = THREE.MathUtils.degToRad(dragDegPerScreen) / Math.max(1, window.innerHeight);
    const dx = ev.clientX - state.lastX;
    const dy = ev.clientY - state.lastY;
    state.lastX = ev.clientX;
    state.lastY = ev.clientY;
    // "Grab the world": drag right → view turns left
    state.yaw += dx * radPerPx;
    if (state.mode === "drag") {
      state.pitch = THREE.MathUtils.clamp(state.pitch + dy * radPerPx, -1.4, 1.4);
    }
  }
  function onUp() {
    state.dragging = false;
  }

  function screenAngle() {
    const so = window.screen && window.screen.orientation;
    const deg = so && typeof so.angle === "number" ? so.angle : (window.orientation || 0);
    return THREE.MathUtils.degToRad(deg);
  }

  return {
    state,

    /** Start listening (call from a user gesture so iOS can prompt). */
    enable() {
      if (state.active) return;
      state.active = true;
      canvas.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      // Always listen: browsers that deliver events without a prompt (Android)
      // just work; the first real reading switches to gyro mode.
      window.addEventListener("deviceorientation", onOrientation);
      const DOE = window.DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === "function") {
        // iOS 13+ (and newer Chromium): must be called inside a user gesture
        let p;
        try {
          p = DOE.requestPermission();
        } catch (err) {
          state.permission = "needs-gesture";
          return;
        }
        Promise.resolve(p).then((res) => {
          state.permission = res === "granted" ? "granted" : "denied";
        }).catch(() => {
          state.permission = "needs-gesture";
        });
      } else {
        state.permission = "not-needed";
      }
    },

    /** Retry the iOS permission prompt from a later tap. */
    retryPermission() {
      if (state.permission !== "needs-gesture") return;
      const DOE = window.DeviceOrientationEvent;
      Promise.resolve(DOE.requestPermission()).then((res) => {
        state.permission = res === "granted" ? "granted" : "denied";
      }).catch(() => { state.permission = "denied"; });
    },

    disable() {
      if (!state.active) return;
      state.active = false;
      state.dragging = false;
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("deviceorientation", onOrientation);
    },

    /** Write the current look rotation into a camera quaternion. */
    apply(camera) {
      if (state.mode === "gyro" && state.orient) {
        const o = state.orient;
        const d2r = THREE.MathUtils.DEG2RAD;
        euler.set(o.beta * d2r, o.alpha * d2r, -o.gamma * d2r, "YXZ");
        camera.quaternion.setFromEuler(euler);
        camera.quaternion.multiply(q1);
        camera.quaternion.multiply(q0.setFromAxisAngle(zee, -screenAngle()));
        qYaw.setFromAxisAngle(yAxis, state.yaw);
        camera.quaternion.premultiply(qYaw);
      } else {
        euler.set(state.pitch, state.yaw, 0, "YXZ");
        camera.quaternion.setFromEuler(euler);
      }
      camera.updateMatrixWorld(true);
    },
  };
}

/** Camera look direction as yaw/pitch (yaw 0 = -Z, positive = turn left). */
export function cameraYawPitch(camera) {
  fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  return { yaw: Math.atan2(-fwd.x, -fwd.z), pitch: Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) };
}

/** Unit direction for yaw/pitch (same convention as cameraYawPitch). */
export function dirFromYawPitch(yaw, pitch, out = new THREE.Vector3()) {
  const c = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c);
}

export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
