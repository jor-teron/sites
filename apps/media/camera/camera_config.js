/*
 * Camera — configuration. camera_logic.js reads CAMERA_CONFIG.
 * Resolutions, timers, formats, storage key, text.
 */
const CAMERA_CONFIG = {
  APP: { name: 'Camera', version: '1.0' },

  // Resolution choices (ideal size asked from the camera; it may give less)
  resolutions: {
    '480p':  { label: '480p', width: 640, height: 480 },
    '720p':  { label: '720p',  width: 1280, height: 720 },
    '1080p': { label: '1080p', width: 1920, height: 1080 },
    'max':   { label: 'Max',   width: 4096, height: 2160 },
  },
  resolutionOrder: ['480p', '720p', '1080p', 'max'],

  // Self-timer choices in seconds (0 = off)
  timers: [0, 3, 10],

  // Photo formats: MIME type, file extension, JPEG quality
  photoFormats: {
    jpg: { label: 'JPG', mime: 'image/jpeg', ext: 'jpg', quality: 0.92 },
    png: { label: 'PNG', mime: 'image/png', ext: 'png' },
  },

  // Video: first supported type wins (MP4 where the browser can record it, else WebM)
  videoTypes: [
    { mime: 'video/mp4;codecs=avc1,mp4a', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ],
  recorderSliceMs: 1000,

  // Defaults (also used when nothing is saved yet)
  defaults: {
    mode: 'photo',        // 'photo' | 'video'
    format: 'jpg',
    resolution: '1080p',
    timer: 0,
    grid: false,
    mirror: null,         // null = automatic (mirrored for the front camera)
    deviceId: '',
    facing: 'user',       // 'user' (front) | 'environment' (back)
  },

  storageKey: 'camera-settings-v1',
  filePrefix: { photo: 'photo', video: 'video' },
  toastMs: 1800,

  text: {
    starting: 'Starting camera…',
    denied: 'Camera access was blocked. Allow the camera for this site in the browser settings, then tap Retry.',
    noCamera: 'No camera found. Connect a camera, then tap Retry.',
    busy: 'The camera is in use by another app. Close it, then tap Retry.',
    unsupported: 'This browser cannot use the camera here. Open the page over https or localhost.',
    failed: 'Could not start the camera.',
    saved: 'Saved ',
    noRecorder: 'Video recording is not supported in this browser.',
    noAudio: 'Recording without sound (no microphone access).',
  },
};
