const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const tools = document.querySelectorAll('.tool');
const colors = document.querySelectorAll('.color');
const brushWidth = document.querySelector('.brush-width');
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');
const clearBtn = document.getElementById('clear');
const saveBtn = document.getElementById('save');
let currentTool = 'brush';
let currentColor = 'black';
let currentWidth = 5;
let isDrawing = false;
let startX, startY;
let history = [canvas.toDataURL()];
let historyIndex = 0;

ctx.lineCap = 'round';
ctx.lineJoin = 'round';
ctx.lineWidth = currentWidth;

function setTool(tool) {
  tools.forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
  currentTool = tool;
  ctx.lineWidth = tool === 'eraser' ? currentWidth * 2 : currentWidth;
  ctx.strokeStyle = tool === 'eraser' ? '#fff' : currentColor;
  ctx.fillStyle = currentColor;
}

function setColor(color) {
  colors.forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-color="${color}"]`).classList.add('active');
  currentColor = color;
  ctx.strokeStyle = currentTool === 'eraser' ? '#fff' : color;
  ctx.fillStyle = color;
}

function setBrushWidth(width) {
  currentWidth = parseInt(width);
  ctx.lineWidth = currentTool === 'eraser' ? currentWidth * 2 : currentWidth;
}

function saveState() {
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }
  history.push(canvas.toDataURL());
  if (history.length > 10) history.shift();
  historyIndex = history.length - 1;
  undoBtn.disabled = historyIndex === 0;
  redoBtn.disabled = true;
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    const img = new Image();
    img.src = history[historyIndex];
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    undoBtn.disabled = historyIndex === 0;
    redoBtn.disabled = false;
  }
}

function redo() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    const img = new Image();
    img.src = history[historyIndex];
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    redoBtn.disabled = historyIndex === history.length - 1;
    undoBtn.disabled = false;
  }
}

function floodFill(x, y, fillColor) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const targetColor = getPixelColor(data, x, y);
  if (colorsEqual(targetColor, hexToRgb(fillColor))) return;

  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cx >= canvas.width || cy < 0 || cy >= canvas.height) continue;
    const currentColor = getPixelColor(data, cx, cy);
    if (!colorsEqual(currentColor, targetColor)) continue;

    setPixelColor(data, cx, cy, hexToRgb(fillColor));
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  ctx.putImageData(imageData, 0, 0);
}

function getPixelColor(data, x, y) {
  const index = (y * canvas.width + x) * 4;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function setPixelColor(data, x, y, color) {
  const index = (y * canvas.width + x) * 4;
  data[index] = color[0];
  data[index + 1] = color[1];
  data[index + 2] = color[2];
  data[index + 3] = color[3];
}

function colorsEqual(c1, c2) {
  return c1[0] === c2[0] && c1[1] === c2[1] && c1[2] === c2[2] && c1[3] === c2[3];
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, 255];
}

function drawShape(x1, y1, x2, y2) {
  ctx.beginPath();
  if (currentTool === 'circle') {
    const radius = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    ctx.arc(x1, y1, radius, 0, Math.PI * 2);
  } else if (currentTool === 'triangle') {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x1 - (x2 - x1), y2);
    ctx.closePath();
  } else if (currentTool === 'rectangle') {
    ctx.rect(x1, y1, x2 - x1, y2 - y1);
  } else if (currentTool === 'square') {
    const size = Math.min(Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.rect(x1, y1, size, size);
  }
  ctx.stroke();
  ctx.fill();
}

canvas.addEventListener('mousedown', (e) => {
  isDrawing = true;
  startX = e.offsetX;
  startY = e.offsetY;
  if (currentTool === 'brush' || currentTool === 'eraser') {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
  } else if (currentTool === 'fill') {
    floodFill(startX, startY, currentColor);
    saveState();
    isDrawing = false;
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  const x = e.offsetX;
  const y = e.offsetY;
  if (currentTool === 'brush' || currentTool === 'eraser') {
    ctx.lineTo(x, y);
    ctx.stroke();
  } else {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    const img = new Image();
    img.src = history[historyIndex];
    img.onload = () => {
      tempCtx.drawImage(img, 0, 0);
      tempCtx.strokeStyle = ctx.strokeStyle;
      tempCtx.fillStyle = ctx.fillStyle;
      tempCtx.lineWidth = ctx.lineWidth;
      tempCtx.beginPath();
      if (currentTool === 'circle') {
        const radius = Math.sqrt((x - startX) ** 2 + (y - startY) ** 2);
        tempCtx.arc(startX, startY, radius, 0, Math.PI * 2);
      } else if (currentTool === 'triangle') {
        tempCtx.moveTo(startX, startY);
        tempCtx.lineTo(x, y);
        tempCtx.lineTo(startX - (x - startX), y);
        tempCtx.closePath();
      } else if (currentTool === 'rectangle') {
        tempCtx.rect(startX, startY, x - startX, y - startY);
      } else if (currentTool === 'square') {
        const size = Math.min(Math.abs(x - startX), Math.abs(y - startY));
        tempCtx.rect(startX, startY, size, size);
      }
      tempCtx.stroke();
      tempCtx.fill();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tempCanvas, 0, 0);
    };
  }
});

canvas.addEventListener('mouseup', () => {
  if (isDrawing && currentTool !== 'fill') {
    if (currentTool !== 'brush' && currentTool !== 'eraser') {
      drawShape(startX, startY, event.offsetX, event.offsetY);
    }
    isDrawing = false;
    saveState();
  }
});

canvas.addEventListener('dragstart', (e) => {
  const dataURL = canvas.toDataURL();
  e.dataTransfer.setData('text/plain', dataURL);
});

document.addEventListener('paste', (e) => {
  const items = e.clipboardData.items;
  for (let item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        saveState();
      };
    }
  }
});

tools.forEach(tool => {
  tool.addEventListener('click', () => setTool(tool.dataset.tool));
});

colors.forEach(color => {
  color.addEventListener('click', () => setColor(color.dataset.color));
});

brushWidth.addEventListener('change', (e) => setBrushWidth(e.target.value));

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
clearBtn.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  saveState();
});
saveBtn.addEventListener('click', () => {
  const dataURL = canvas.toDataURL();
  localStorage.setItem('paint-image', dataURL);
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = 'drawing.png';
  a.click();
});

setTool('brush');
setColor('black');
setBrushWidth(5);
