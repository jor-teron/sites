/*
 * Webcam Photo Capture — configuration.
 * Camera request, image format, CSS classes the code sets and all messages
 * live here. webcam_logic.js reads everything from WEBCAM_CONFIG.
 * Static page text (title, heading, button labels) is in webcam.html.
 */
const WEBCAM_CONFIG = {
  // Passed to navigator.mediaDevices.getUserMedia()
  mediaConstraints: { video: true },

  // Captured photo
  photo: {
    mimeType: "image/png",             // format for canvas.toDataURL()
    downloadName: "webcam_photo.png",  // file name offered by the Download link
  },

  // Classes the code sets (Tailwind utilities + webcam.css)
  classes: {
    hidden: "hidden",                             // hides canvas / download link until a photo exists
    messageBase: "mt-4 text-sm",                  // message line, reset before each message
    messageError: ["text-red-600", "font-semibold"],
    messageSuccess: ["text-green-600", "font-semibold"],
    messageInfo: ["text-gray-600"],
  },

  // getUserMedia error names mapped to friendlier messages
  errorNames: {
    denied: ["NotAllowedError", "PermissionDeniedError"],
    notFound: ["NotFoundError", "DevicesNotFoundError"],
  },

  // Text the code puts on screen
  text: {
    requesting: "Requesting webcam access...",
    active: 'Webcam feed active. Click "Capture Photo" to take a picture.',
    denied: "Webcam access denied. Please allow camera access in your browser settings.",
    notFound: "No webcam found. Please ensure a webcam is connected and working.",
    errorPrefix: "Error: ",                       // before any other error message
    notActive: "Webcam not active. Please allow camera access first.",
    captured: 'Photo captured! Click "Download Photo" to save it.',
    downloadLabel: "Download Photo",              // download link text (reset after each capture)
    consoleError: "Error accessing webcam:",      // console.error prefix
  },
};
