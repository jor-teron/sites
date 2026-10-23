/*
 * Project: sketchbook
 * File: sk_draw.js
 * Role: Pointer drawing (mouse, touch, pen) with basic palm rejection.
 */
// Get pointer position relative to canvas
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  let clientX, clientY;
  if (e.touches && e.touches[0]) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

// Start drawing
function startDraw(e) {
  // Basic palm rejection: ignore very large touch radius if available
  if (e.pointerType === 'touch' && e.width && e.width > 50) return;
  e.preventDefault();
  isDrawing = true;
  const pos = getPos(e);
  currentStroke = {
    color: PEN_COLORS[penName] || '#222',
    width: e.pointerType === 'pen' ? 1.8 : 2.2,
    points: [pos]
  };
}

// Continue drawing
function draw(e) {
  if (!isDrawing || !currentStroke) return;
  e.preventDefault();
  const pos = getPos(e);
  currentStroke.points.push(pos);
  // Live draw last segment
  const pts = currentStroke.points;
  if (pts.length >= 2) {
    ctx.beginPath();
    ctx.strokeStyle = currentStroke.color;
    ctx.lineWidth = currentStroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  }
}

// End drawing
function endDraw(e) {
  if (!isDrawing || !currentStroke) return;
  e.preventDefault();
  isDrawing = false;
  if (currentStroke.points.length > 1) {
    pages[currentPage].push(currentStroke);
    saveToStorage();
  }
  currentStroke = null;
}
