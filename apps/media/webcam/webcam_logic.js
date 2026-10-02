// webcam_logic.js — settings and text come from WEBCAM_CONFIG (webcam_config.js)

document.addEventListener('DOMContentLoaded', () => {
    const CFG = WEBCAM_CONFIG;
    const TXT = CFG.text;

    // Get references to HTML elements
    const webcamFeed = document.getElementById('webcamFeed');
    const photoCanvas = document.getElementById('photoCanvas');
    const captureButton = document.getElementById('captureButton');
    const downloadLink = document.getElementById('downloadLink');
    const messageDiv = document.getElementById('message');
    const ctx = photoCanvas.getContext('2d'); // Get 2D rendering context for the canvas

    let stream = null; // Variable to hold the webcam stream

    /**
     * Displays a message to the user.
     * @param {string} msg - The message to display.
     * @param {string} type - 'success', 'error', or 'info' for styling.
     */
    function displayMessage(msg, type = 'info') {
        messageDiv.textContent = msg;
        messageDiv.className = CFG.classes.messageBase; // Reset classes
        if (type === 'error') {
            messageDiv.classList.add(...CFG.classes.messageError);
        } else if (type === 'success') {
            messageDiv.classList.add(...CFG.classes.messageSuccess);
        } else {
            messageDiv.classList.add(...CFG.classes.messageInfo);
        }
    }

    /**
     * Initializes the webcam stream.
     */
    async function initWebcam() {
        displayMessage(TXT.requesting);
        try {
            // Request access to the user's media devices (webcam)
            stream = await navigator.mediaDevices.getUserMedia(CFG.mediaConstraints);

            // Attach the stream to the video element
            webcamFeed.srcObject = stream;

            // When the video metadata is loaded, play the video
            webcamFeed.onloadedmetadata = () => {
                webcamFeed.play();
                displayMessage(TXT.active);
                captureButton.disabled = false; // Enable capture button once stream is ready
            };
        } catch (err) {
            // Handle errors if webcam access is denied or not available
            console.error(TXT.consoleError, err);
            if (CFG.errorNames.denied.includes(err.name)) {
                displayMessage(TXT.denied, 'error');
            } else if (CFG.errorNames.notFound.includes(err.name)) {
                displayMessage(TXT.notFound, 'error');
            } else {
                displayMessage(`${TXT.errorPrefix}${err.message}`, 'error');
            }
            captureButton.disabled = true; // Keep capture button disabled on error
        }
    }

    /**
     * Captures the current frame from the video feed and draws it onto the canvas.
     */
    function capturePhoto() {
        if (!stream) {
            displayMessage(TXT.notActive, 'error');
            return;
        }

        // Set canvas dimensions to match video dimensions
        photoCanvas.width = webcamFeed.videoWidth;
        photoCanvas.height = webcamFeed.videoHeight;

        // Draw the current frame of the video onto the canvas
        ctx.drawImage(webcamFeed, 0, 0, photoCanvas.width, photoCanvas.height);

        // Convert the canvas content to a data URL (PNG image)
        const imageDataURL = photoCanvas.toDataURL(CFG.photo.mimeType);

        // Show the canvas and the download link
        photoCanvas.classList.remove(CFG.classes.hidden);
        downloadLink.classList.remove(CFG.classes.hidden);

        // Set the download link's href to the image data URL
        downloadLink.href = imageDataURL;
        downloadLink.textContent = TXT.downloadLabel; // Reset text in case it changed

        displayMessage(TXT.captured, 'success');
    }

    // File name offered by the download link
    downloadLink.download = CFG.photo.downloadName;

    // Add event listener to the capture button
    captureButton.addEventListener('click', capturePhoto);

    // Initial setup: disable capture button until webcam is ready
    captureButton.disabled = true;
    // Start the webcam initialization process when the page loads
    initWebcam();
});

