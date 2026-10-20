/*
  File: tris.js
  Project: devbench
  Role: Light 3D triangle test in raw WebGL (no Three.js): a 60k-triangle mesh drawn in
  batches, each batch ends with a 1-pixel readPixels so the GPU must finish; ~2 s.
  Used for the Browser FPS / AR verdicts. Exposes window.DevbenchTris.run(stage, onProgress)
  -> { trisPerSec, trisPerFrame30 }.
*/

var DEVBENCH_TRIS_COUNT = 60000;
var DEVBENCH_TRIS_MS = 2000;

var DEVBENCH_TRIS_VERT = [
  "attribute vec3 p;",
  "uniform float t;",
  "varying vec3 col;",
  "void main() {",
  "  float c = cos(t), s = sin(t);",
  "  vec3 q = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);",
  "  col = 0.5 + 0.5 * normalize(p + 0.001);",
  "  gl_Position = vec4(q.xy, q.z * 0.5 + 0.5, 1.0);",
  "}"].join("\n");
var DEVBENCH_TRIS_FRAG = "precision mediump float; varying vec3 col; void main() { gl_FragColor = vec4(col, 1.0); }";

/* Small random triangles inside a sphere of radius ~0.9. */
function devbenchTrisMesh(count) {
  var v = new Float32Array(count * 9);
  for (var i = 0; i < count; i++) {
    var cx = Math.random() * 1.6 - 0.8, cy = Math.random() * 1.6 - 0.8, cz = Math.random() * 1.6 - 0.8;
    for (var k = 0; k < 3; k++) {
      v[i * 9 + k * 3] = cx + (Math.random() - 0.5) * 0.04;
      v[i * 9 + k * 3 + 1] = cy + (Math.random() - 0.5) * 0.04;
      v[i * 9 + k * 3 + 2] = cz + (Math.random() - 0.5) * 0.04;
    }
  }
  return v;
}

function devbenchTrisShader(gl, type, src) {
  var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { throw new Error(gl.getShaderInfoLog(s) || "shader failed"); }
  return s;
}

function devbenchTrisRun(stage, onProgress) {
  return new Promise(function (resolve, reject) {
    var cv = document.createElement("canvas"); cv.width = 480; cv.height = 270; stage.replaceChildren(cv);
    var gl = cv.getContext("webgl", { antialias: false });
    if (!gl) { stage.replaceChildren(); reject(new Error("WebGL not available")); return; }
    var prog = gl.createProgram();
    try {
      gl.attachShader(prog, devbenchTrisShader(gl, gl.VERTEX_SHADER, DEVBENCH_TRIS_VERT));
      gl.attachShader(prog, devbenchTrisShader(gl, gl.FRAGMENT_SHADER, DEVBENCH_TRIS_FRAG));
    } catch (err) { stage.replaceChildren(); reject(err); return; }
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, devbenchTrisMesh(DEVBENCH_TRIS_COUNT), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    var uT = gl.getUniformLocation(prog, "t");
    gl.enable(gl.DEPTH_TEST); gl.clearColor(0.06, 0.04, 0.14, 1);
    var px = new Uint8Array(4), batch = 1, tris = 0, busy = 0, start = performance.now();
    var drawBatch = function (n, time) {
      var t0 = performance.now();
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      for (var i = 0; i < n; i++) { gl.uniform1f(uT, time + i * 0.01); gl.drawArrays(gl.TRIANGLES, 0, DEVBENCH_TRIS_COUNT * 3); }
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return performance.now() - t0;
    };
    drawBatch(1, 0); /* warm-up */
    function frame() {
      var ms = drawBatch(batch, (performance.now() - start) / 800);
      tris += batch * DEVBENCH_TRIS_COUNT; busy += ms;
      if (ms < 20 && batch < 256) { batch *= 2; }
      var el = performance.now() - start;
      onProgress(Math.min(1, el / DEVBENCH_TRIS_MS));
      if (el < DEVBENCH_TRIS_MS) { requestAnimationFrame(frame); return; }
      var perSec = tris / Math.max(0.001, busy / 1000);
      var lose = gl.getExtension("WEBGL_lose_context"); if (lose) { lose.loseContext(); }
      stage.replaceChildren();
      resolve({ trisPerSec: perSec, trisPerFrame30: perSec / 30 });
    }
    requestAnimationFrame(frame);
  });
}

window.DevbenchTris = { run: devbenchTrisRun };
