/** HEX-1 shared vec3 / mat4 (column-major). */
export const DEG = Math.PI / 180;
export function vec3(x = 0, y = 0, z = 0) { return new Float32Array([x, y, z]); }
export function v3set(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
export function v3copy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; }
export function v3add(o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; }
export function v3sub(o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; }
export function v3scale(o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; }
export function v3dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function v3len(a) { return Math.hypot(a[0], a[1], a[2]); }
export function v3norm(o, a) {
  const l = v3len(a) || 1; o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o;
}
export function mat4() { return new Float32Array(16); }
export function m4identity(o = mat4()) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; }
export function m4perspective(o, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  o.fill(0); o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
  return o;
}
export function m4lookAt(o, eye, center, up) {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let zl = Math.hypot(zx, zy, zz) || 1; const z0 = zx / zl, z1 = zy / zl, z2 = zz / zl;
  let xx = up[1] * z2 - up[2] * z1, xy = up[2] * z0 - up[0] * z2, xz = up[0] * z1 - up[1] * z0;
  let xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
  const y0 = z1 * xz - z2 * xy, y1 = z2 * xx - z0 * xz, y2 = z0 * xy - z1 * xx;
  o[0] = xx; o[1] = y0; o[2] = z0; o[3] = 0;
  o[4] = xy; o[5] = y1; o[6] = z1; o[7] = 0;
  o[8] = xz; o[9] = y2; o[10] = z2; o[11] = 0;
  o[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  o[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  o[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]); o[15] = 1; return o;
}
