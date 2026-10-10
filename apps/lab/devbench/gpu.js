/*
  File: gpu.js
  Project: devbench
  Role: WebGL fill-rate test. Draws a full-canvas triangle for a fixed time.
  Exposes window.DevbenchGpu.run(canvas, onProgress).
  Uses WebGL1 plus a vertex buffer so it runs without WebGL2.
*/

/* How long the fill-rate loop runs, in milliseconds. 10 seconds. */
const DEVBENCH_GPU_MS = 10000;

/* Vertex shader: clip-space position from the triangle buffer. */
const DEVBENCH_GPU_VERT = `
  attribute vec2 aPos;
  void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;

/* Fragment shader: cheap color so the test is fill-bound, not shader-bound. */
const DEVBENCH_GPU_FRAG = `
  precision mediump float;
  uniform float u;
  void main() {
    gl_FragColor = vec4(u, 0.2, 0.6, 1.0);
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

/*
  Run the GPU fill-rate test on the given canvas.
  onProgress receives 0..1. Resolves with draws, megapixels, and mpixPerSec.
*/
function devbenchRunGpu(canvas, onProgress) {
  return new Promise(function (resolve, reject) {
    var gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: false });
    if (!gl) {
      reject(new Error("WebGL not available"));
      return;
    }
    var program = gl.createProgram();
    gl.attachShader(program, devbenchCompile(gl, gl.VERTEX_SHADER, DEVBENCH_GPU_VERT));
    gl.attachShader(program, devbenchCompile(gl, gl.FRAGMENT_SHADER, DEVBENCH_GPU_FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      reject(new Error(gl.getProgramInfoLog(program) || "program link failed"));
      return;
    }
    gl.useProgram(program);
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, DEVBENCH_GPU_TRIS, gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uLoc = gl.getUniformLocation(program, "u");
    var pixels = canvas.width * canvas.height;
    var draws = 0;
    var start = performance.now();

    function frame() {
      var elapsed = performance.now() - start;
      gl.uniform1f(uLoc, (draws % 100) / 100);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      draws += 1;
      if (typeof onProgress === "function") {
        onProgress(Math.min(1, elapsed / DEVBENCH_GPU_MS));
      }
      if (elapsed < DEVBENCH_GPU_MS) {
        requestAnimationFrame(frame);
      } else {
        gl.finish();
        var seconds = (performance.now() - start) / 1000;
        var mpix = (draws * pixels) / 1000000;
        resolve({
          draws: draws,
          megapixels: mpix,
          seconds: seconds,
          mpixPerSec: mpix / seconds
        });
      }
    }
    requestAnimationFrame(frame);
  });
}

/* Public GPU API used by devbench.js. */
window.DevbenchGpu = {
  run: devbenchRunGpu
};
