// webcam.js

document.addEventListener('DOMContentLoaded', () => {
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
        messageDiv.className = 'mt-4 text-sm'; // Reset classes
        if (type === 'error') {
            messageDiv.classList.add('text-red-600', 'font-semibold');
        } else if (type === 'success') {
            messageDiv.classList.add('text-green-600', 'font-semibold');
        } else {
            messageDiv.classList.add('text-gray-600');
        }
    }

    /**
     * Initializes the webcam stream.
     */
    async function initWebcam() {
        displayMessage('Requesting webcam access...');
        try {
            // Request access to the user's media devices (webcam)
            stream = await navigator.mediaDevices.getUserMedia({ video: true });

            // Attach the stream to the video element
            webcamFeed.srcObject = stream;

            // When the video metadata is loaded, play the video
            webcamFeed.onloadedmetadata = () => {
                webcamFeed.play();
                displayMessage('Webcam feed active. Click "Capture Photo" to take a picture.');
                captureButton.disabled = false; // Enable capture button once stream is ready
            };
        } catch (err) {
            // Handle errors if webcam access is denied or not available
            console.error('Error accessing webcam:', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                displayMessage('Webcam access denied. Please allow camera access in your browser settings.', 'error');
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                displayMessage('No webcam found. Please ensure a webcam is connected and working.', 'error');
            } else {
                displayMessage(`Error: ${err.message}`, 'error');
            }
            captureButton.disabled = true; // Keep capture button disabled on error
        }
    }

    /**
     * Captures the current frame from the video feed and draws it onto the canvas.
     */
    function capturePhoto() {
        if (!stream) {
            displayMessage('Webcam not active. Please allow camera access first.', 'error');
            return;
        }

        // Set canvas dimensions to match video dimensions
        photoCanvas.width = webcamFeed.videoWidth;
        photoCanvas.height = webcamFeed.videoHeight;

        // Draw the current frame of the video onto the canvas
        ctx.drawImage(webcamFeed, 0, 0, photoCanvas.width, photoCanvas.height);

        // Convert the canvas content to a data URL (PNG image)
        const imageDataURL = photoCanvas.toDataURL('image/png');

        // Show the canvas and the download link
        photoCanvas.classList.remove('hidden');
        downloadLink.classList.remove('hidden');

        // Set the download link's href to the image data URL
        downloadLink.href = imageDataURL;
        downloadLink.textContent = 'Download Photo'; // Reset text in case it changed

        displayMessage('Photo captured! Click "Download Photo" to save it.', 'success');
    }

    // Add event listener to the capture button
    captureButton.addEventListener('click', capturePhoto);

    // Initial setup: disable capture button until webcam is ready
    captureButton.disabled = true;
    // Start the webcam initialization process when the page loads
    initWebcam();
});

