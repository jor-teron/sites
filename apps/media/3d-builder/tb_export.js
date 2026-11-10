/* 3D Builder — tb_export.js: GLB/OBJ/STL export, GLB import, downloads. TD3 */

import { GLTFExporter } from './vendor/three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from './vendor/three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from './vendor/three/examples/jsm/exporters/STLExporter.js';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

export function downloadDataURL(dataURL, filename) {
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename || 'view.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function arrayBufferToDataURL(buf, mime) {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return 'data:' + (mime || 'application/octet-stream') + ';base64,' + btoa(binary);
}

export function dataURLToArrayBuffer(dataURL) {
  const parts = String(dataURL || '').split(',');
  const bin = atob(parts[1] || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

export function exportGLB(object) {
  return new Promise(function (resolve, reject) {
    const exporter = new GLTFExporter();
    exporter.parse(object, function (result) {
      if (result instanceof ArrayBuffer) {
        resolve(new Blob([result], { type: 'model/gltf-binary' }));
      } else {
        resolve(new Blob([JSON.stringify(result)], { type: 'model/gltf+json' }));
      }
    }, function (err) {
      reject(err || new Error('GLB export failed.'));
    }, { binary: true, onlyVisible: true, embedImages: true });
  });
}

export function exportOBJ(object) {
  const text = new OBJExporter().parse(object);
  return new Blob([text], { type: 'text/plain' });
}

export function exportSTL(object) {
  const result = new STLExporter().parse(object, { binary: true });
  const buf = (result && result.buffer) ? result.buffer : result;
  return new Blob([buf], { type: 'model/stl' });
}

export function parseGLTF(data, path) {
  return new Promise(function (resolve, reject) {
    const loader = new GLTFLoader();
    loader.parse(data, path || '', function (gltf) {
      resolve(gltf);
    }, function (err) {
      reject(err || new Error('Could not read that glTF file.'));
    });
  });
}

export function decodeModelPayload(dataURL) {
  const s = String(dataURL || '');
  const parts = s.split(',');
  const meta = parts[0] || '';
  const payload = parts[1] || '';
  if (/gltf\+json|application\/json|text\/plain/i.test(meta)) {
    try {
      const bin = atob(payload);
      try { return decodeURIComponent(escape(bin)); } catch (e) { return bin; }
    } catch (e) { return ''; }
  }
  return dataURLToArrayBuffer(s);
}
