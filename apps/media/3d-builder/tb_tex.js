/* 3D Builder — tb_tex.js: text and image textures (browser canvas). TD2 */

import * as THREE from 'three';
import { TEX_MAX_DIM } from './tb_io.js';

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = [];
  const paragraphs = String(text || '').split('\n');
  paragraphs.forEach(function (para) {
    const words = para.split(' ');
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    lines.push(line);
  });
  const top = y - (lines.length - 1) * lineHeight / 2;
  lines.forEach(function (ln, i) {
    ctx.fillText(ln, x, top + i * lineHeight);
  });
}

export function makeTextTexture(spec) {
  spec = spec || {};
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = spec.bgColor || '#1e293b';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = spec.textColor || '#ffffff';
  const fontSize = spec.fontSize || 48;
  ctx.font = 'bold ' + fontSize + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  wrapText(ctx, spec.text || '', size / 2, size / 2, size - 24, fontSize * 1.2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.flipY = true;
  return tex;
}

export function resizeImageToDataURL(src, maxDim) {
  const max = maxDim || TEX_MAX_DIM;
  return new Promise(function (resolve, reject) {
    function fromURL(url) {
      const img = new Image();
      img.onload = function () {
        let w = img.width, h = img.height;
        if (!w || !h) { reject(new Error('That image has no size.')); return; }
        if (w > max || h > max) {
          const s = max / Math.max(w, h);
          w = Math.max(1, Math.round(w * s));
          h = Math.max(1, Math.round(h * s));
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        let dataURL = canvas.toDataURL('image/jpeg', 0.72);
        if (dataURL.length > 180000) dataURL = canvas.toDataURL('image/jpeg', 0.55);
        resolve({ dataURL: dataURL, w: w, h: h });
      };
      img.onerror = function () { reject(new Error('Could not read that image.')); };
      img.src = url;
    }
    if (typeof Blob !== 'undefined' && src instanceof Blob) {
      const r = new FileReader();
      r.onload = function () { fromURL(String(r.result)); };
      r.onerror = function () { reject(new Error('Could not read that file.')); };
      r.readAsDataURL(src);
    } else {
      fromURL(String(src));
    }
  });
}

export function textureFromDataURL(dataURL) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      tex.flipY = true;
      resolve(tex);
    };
    img.onerror = function () { reject(new Error('Could not load texture.')); };
    img.src = dataURL;
  });
}
