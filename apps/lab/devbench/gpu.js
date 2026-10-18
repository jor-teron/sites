/*
  File: gpu.js
  Project: devbench
  Role: WebGL fill-rate test. Draws many blended full-canvas triangles per batch for a fixed time.
  Exposes window.DevbenchGpu.run(canvas, onProgress).
  Uses WebGL1 plus a vertex buffer so it runs without WebGL2.
  Not vsync-bound: each batch ends with a 1-pixel gl.readPixels so the GPU must really finish,
  only the batch time is counted (idle time waiting for the next frame is skipped), and the
  batch size grows until one batch takes ~DEVBENCH_GPU_BATCH_MS. Blending stops tile GPUs
  (Mali/Adreno/PowerVR) from skipping hidden layers.
*/

/* Total wall time of the fill-rate loop, in milliseconds. 10 seconds. */
const DEVBENCH_GPU_MS = 10000;

/* Target GPU time for one batch of draws, in milliseconds. */
const DEVBENCH_GPU_BATCH_MS = 20;

/* Safety cap for draws in one batch. */
const DEVBENCH_GPU_MAX_BATCH = 4096;

/* Vertex shader: clip-space position from the triangle buffer. */
const DEVBENCH_GPU_VERT = `
  attribute vec2 aPos;
  void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;

/* Fragment shader: cheap half-transparent color so the test is fill-bound, not shader-bound. */
const DEVBENCH_GPU_FRAG = `
  precision mediump float;
  uniform float u;
  void main() {
    gl_FragColor = vec4(u, 0.2, 0.6, 0.5);
  }
`;

/* Clip-space triangle that covers the whole canvas. */
const DEVBENCH_GPU_TRIS = new Float32Array([
  -1, -1,
  3, -1,
  -1, 3
]);

/*
  Compile one shader. Throws if the driver rejects it.
*/
function devbenchCompile(gl, type, source) {
  var shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "shader compile failed");
  }
  return shader;
}

/* Build program, buffer and blend state. Returns the uniform location. */
function devbenchGpuSetup(gl) {
  var program = gl.createProgram();
  gl.attachShader(program, devbenchCompile(gl, gl.VERTEX_SHADER, DEVBENCH_GPU_VERT));
  gl.attachShader(program, devbenchCompile(gl, gl.FRAGMENT_SHADER, DEVBENCH_GPU_FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "program link failed");
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, DEVBENCH_GPU_TRIS, gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  return gl.getUniformLocation(program, "u");
}

/*
  Draw `count` full-canvas layers, then read one pixel back so the GPU must finish.
  Returns the time the batch took in milliseconds.
*/
function devbenchGpuBatch(gl, uLoc, count, px) {
  var t0 = performance.now();
  for (var i = 0; i < count; i++) {
    gl.uniform1f(uLoc, (i % 100) / 100);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return performance.now() - t0;
}

/*
  Run the GPU fill-rate test on the given canvas.
  onProgress receives 0..1. Resolves with draws, megapixels, busy seconds, mpixPerSec,
  the final batch size and how many full-canvas fills fit in one 60 Hz frame.
*/
function devbenchRunGpu(canvas, onProgress) {
  return new Promise(function (resolve, reject) {
    var gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: false, depth: false });
    if (!gl) {
      reject(new Error("WebGL not available"));
      return;
    }
    var uLoc;
    try { uLoc = devbenchGpuSetup(gl); } catch (err) { reject(err); return; }
    gl.viewport(0, 0, canvas.width, canvas.height);
    var px = new Uint8Array(4);
    var pixels = canvas.width * canvas.height;
    var batch = 8;
    devbenchGpuBatch(gl, uLoc, batch, px); /* warm-up: shader compile, first upload */
    var draws = 0;
    var busyMs = 0;
    var start = performance.now();

    function frame() {
      var ms = devbenchGpuBatch(gl, uLoc, batch, px);
      draws += batch;
      busyMs += ms;
      /* Grow the batch until one batch takes about the target time. */
      if (ms < DEVBENCH_GPU_BATCH_MS && batch < DEVBENCH_GPU_MAX_BATCH) {
        batch = Math.min(DEVBENCH_GPU_MAX_BATCH, batch * 2);
      }
      var elapsed = performance.now() - start;
      if (typeof onProgress === "function") {
        onProgress(Math.min(1, elapsed / DEVBENCH_GPU_MS));
      }
      if (elapsed < DEVBENCH_GPU_MS) {
        requestAnimationFrame(frame);
        return;
      }
      var seconds = Math.max(0.001, busyMs / 1000);
      var mpix = (draws * pixels) / 1000000;
      var mpixPerSec = mpix / seconds;
      gl.getExtension("WEBGL_lose_context") && gl.getExtension("WEBGL_lose_context").loseContext();
      resolve({
        draws: draws,
        megapixels: mpix,
        seconds: seconds,
        mpixPerSec: mpixPerSec,
        batch: batch,
        fillsPer60HzFrame: (mpixPerSec * 1000000 / 60) / pixels
      });
    }
    requestAnimationFrame(frame);
  });
}

/* Public GPU API used by devbench.js. */
window.DevbenchGpu = {
  run: devbenchRunGpu
};
