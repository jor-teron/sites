/*
 * QR generate + camera scan.
 * Generate: 6-digit session code as QR text.
 * Scan: camera reads that 6-digit code.
 */

/* Html5Qrcode scanner instance, or null when idle. */
let qrScanner = null;

/**
 * Draw a QR code for text into the #qr-box element.
 * Tries the QRCode library, then an image API fallback.
 */
function drawQr(text) {
  /* Target box. */
  const box = document.getElementById("qr-box");
  box.innerHTML = "";
  /* Prefer local canvas if the CDN lib loaded. */
  if (typeof QRCode !== "undefined" && QRCode && QRCode.toCanvas) {
    const canvas = document.createElement("canvas");
    box.appendChild(canvas);
    QRCode.toCanvas(
      canvas,
      String(text),
      { width: 220, margin: 1 },
      function onQrDrawn(err) {
        if (err) {
          drawQrImageFallback(box, text);
        }
      }
    );
    return;
  }
  drawQrImageFallback(box, text);
}

/**
 * Fallback: render QR as an <img> from a public QR API.
 */
function drawQrImageFallback(box, text) {
  /* Clear and insert image. */
  box.innerHTML = "";
  const img = document.createElement("img");
  img.alt = "QR " + text;
  img.width = 220;
  img.height = 220;
  img.src =
    "https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=" +
    encodeURIComponent(String(text));
  box.appendChild(img);
}

/**
 * Start camera and resolve with scanned 6-digit code.
 */
function startScan() {
  return new Promise(function scanPromise(resolve, reject) {
    /* Reader element id. */
    const readerId = "reader";
    /* Stop any previous scanner first. */
    stopScan();
    qrScanner = new Html5Qrcode(readerId);
    qrScanner
      .start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 220, height: 220 } },
        function onSuccess(decoded) {
          /* Keep digits only. */
          const code = String(decoded).replace(/\D/g, "").slice(0, 6);
          if (code.length === 6) {
            stopScan();
            resolve(code);
          }
        }
      )
      .catch(function onStartFail(err) {
        reject(err);
      });
  });
}

/**
 * Stop camera if running.
 */
function stopScan() {
  if (!qrScanner) {
    return;
  }
  /* Local copy then clear. */
  const s = qrScanner;
  qrScanner = null;
  s.stop()
    .then(function afterStop() {
      return s.clear();
    })
    .catch(function ignoreStop() {
      /* Camera already gone. */
    });
}
