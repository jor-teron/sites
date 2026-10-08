/*
  Project: print
  File: print_camera.js
  Role: Hi-res in-page camera for the sender (print-send.html).
  Asks for the rear camera at 3840 × 2160 (ideal); if the browser rejects
  that with OverconstrainedError it steps down (1920 × 1080, then any rear
  camera, then any camera). The preview shows the whole frame uncropped
  (object-fit: contain) under an A4 portrait guide (CSS, 1 : 1.414).
  Snap prefers ImageCapture.takePhoto() (full sensor still) and falls back
  to drawing the video frame at its native videoWidth × videoHeight as a
  JPEG at 0.92. Returns { file, width, height } so the page can show e.g.
  '3024 × 4032 · ~366 DPI on A4' (shorter side px / 8.27 in).
  API: PrintCamera.open(video), PrintCamera.snap(), PrintCamera.close().
*/

/* JPEG quality for the canvas fallback. */
const SNAP_QUALITY = 0.92;

/* A4 short side in inches, for the DPI hint. */
const A4_SHORT_IN = 8.27;

const PrintCamera = (function () {
  /* Constraint steps, best first. */
  const STEPS = [
    { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    { facingMode: { ideal: 'environment' } },
    true
  ];

  let stream = null;
  let video = null;

  /* Stop the camera and clear the preview. Safe any time. */
  function close() {
    if (stream) {
      stream.getTracks().forEach(function (track) {
        try {
          track.stop();
        } catch (err) {
          /* Already stopped. */
        }
      });
    }
    stream = null;
    if (video) {
      video.srcObject = null;
    }
  }

  /*
    Open the rear camera into the video element.
    Steps down only on OverconstrainedError; other errors (blocked, missing) are thrown.
  */
  async function open(videoEl) {
    close();
    video = videoEl;
    let lastErr = null;
    for (let i = 0; i < STEPS.length; i += 1) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: STEPS[i], audio: false });
        break;
      } catch (err) {
        lastErr = err;
        if (!err || (err.name !== 'OverconstrainedError' && err.name !== 'ConstraintNotSatisfiedError')) {
          throw err;
        }
      }
    }
    if (!stream) {
      throw lastErr || new Error('No camera');
    }
    video.srcObject = stream;
    try {
      await video.play();
    } catch (err) {
      /* autoplay attribute covers it. */
    }
  }

  /* Pixel size of an image blob, or null when the browser cannot tell. */
  async function blobSize(blob) {
    if (typeof createImageBitmap !== 'function') {
      return null;
    }
    try {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      if (bitmap.close) {
        bitmap.close();
      }
      return size;
    } catch (err) {
      return null;
    }
  }

  /* Full sensor still through ImageCapture, or null when not available. */
  async function takePhoto() {
    const track = stream && stream.getVideoTracks()[0];
    if (!track || typeof window.ImageCapture !== 'function') {
      return null;
    }
    try {
      const blob = await new window.ImageCapture(track).takePhoto();
      if (!blob || !blob.size) {
        return null;
      }
      const size = await blobSize(blob);
      return {
        blob: blob,
        width: size ? size.width : 0,
        height: size ? size.height : 0
      };
    } catch (err) {
      return null;
    }
  }

  /* Current video frame at native size as a JPEG. */
  async function grabFrame() {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      throw new Error('Camera not ready');
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(video, 0, 0, width, height);
    const blob = await new Promise(function (resolve) {
      canvas.toBlob(resolve, CAMERA_MIME, SNAP_QUALITY);
    });
    if (!blob) {
      throw new Error('No frame');
    }
    return { blob: blob, width: width, height: height };
  }

  /* Take one photo. Resolves { file, width, height }. */
  async function snap() {
    if (!stream) {
      throw new Error('Camera is closed');
    }
    const shot = (await takePhoto()) || (await grabFrame());
    const type = shot.blob.type || CAMERA_MIME;
    const ext = type === 'image/png' ? '.png' : '.jpg';
    const name = 'photo-' + Date.now() + ext;
    let file = shot.blob;
    try {
      file = new File([shot.blob], name, { type: type });
    } catch (err) {
      /* Old browser without the File constructor. */
      file.name = name;
    }
    return { file: file, width: shot.width, height: shot.height };
  }

  return {
    open: open,
    snap: snap,
    close: close
  };
})();

/*
  Resolution hint for a snap: '3024 × 4032 · ~366 DPI on A4'.
*/
function describeShot(width, height) {
  if (!width || !height) {
    return 'Photo taken';
  }
  const dpi = Math.round(Math.min(width, height) / A4_SHORT_IN);
  return width + ' × ' + height + ' · ~' + dpi + ' DPI on A4';
}
