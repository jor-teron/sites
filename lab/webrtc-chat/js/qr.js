/*
 * QR generate + camera scan.
 * Generate: 6-digit session code as QR text.
 * Scan: camera reads that 6-digit code.
 */

/* Html5Qrcode scanner instance, or null when idle. */
let qrScanner = null;

/**
 * Draw a QR code for text into the #qr-box element.
 */
function drawQr(text) {
  /* Target box. */
  const box = document.getElementById("qr-box");
  box.innerHTML = "";
  /* Fresh canvas target. */
  const canvas = document.createElement("canvas");
  box.appendChild(canvas);
  /* QRCode lib from CDN (global QRCode). */
  QRCode.toCanvas(
    canvas,
    text,
    { width: 220, margin: 1 },
    function onQrDrawn(err) {
      if (err) {
        box.textContent = "QR failed";
      }
    }
  );
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
