/*
 * Webcam — configuration.
 * Camera request, image format, theme storage, CSS classes the code sets and all
 * messages live here. webcam_logic.js reads everything from WEBCAM_CONFIG.
 */
const WEBCAM_CONFIG = {
  // Passed to navigator.mediaDevices.getUserMedia() (facingMode added when flipping)
  mediaConstraints: { video: { facingMode: 'user' }, audio: false },

  photo: {
    mimeType: 'image/png',
    downloadName: 'webcam_photo.png',
  },

  theme: {
    storageKey: 'sites-webcam-theme', // 'dark' | 'light'
    default: 'dark',
  },

  classes: {
    hidden: 'hidden',
    messageBase: 'msg',
    messageError: ['err'],
    messageSuccess: ['ok'],
    messageInfo: ['info'],
  },

  errorNames: {
    denied: ['NotAllowedError', 'PermissionDeniedError'],
    notFound: ['NotFoundError', 'DevicesNotFoundError'],
  },

  text: {
    requesting: 'Starting camera…',
    active: '',                         // quiet once the feed is live
    denied: 'Camera blocked — allow it for this site.',
    notFound: 'No camera found.',
    errorPrefix: 'Error: ',
    notActive: 'Camera not ready.',
    captured: 'Captured — tap Save.',
    downloadLabel: 'Save',
    consoleError: 'Error accessing webcam:',
  },
};
