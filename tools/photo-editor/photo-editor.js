document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const imageUploader = document.getElementById('imageUploader');
    const dropZone = document.getElementById('dropZone');
    const fileOverlay = document.getElementById('file-overlay');
    const photoCanvas = document.getElementById('photoCanvas');
    const ctx = photoCanvas.getContext('2d');
    const currentPhotoNameSpan = document.getElementById('currentPhotoName');

    const brightnessSlider = document.getElementById('brightnessSlider');
    const contrastSlider = document.getElementById('contrastSlider');
    const rotateRightBtn = document.getElementById('rotateRightBtn');
    const orientationSelect = document.getElementById('orientationSelect'); // Orientation select
    const paperSizeSelect = document.getElementById('paperSizeSelect'); // Paper Size select (NEW)

    const startCropBtn = document.getElementById('startCropBtn');
    const applyCropBtn = document.getElementById('applyCropBtn');
    const cancelCropBtn = document.getElementById('cancelCropBtn');

    const newBtn = document.getElementById('newBtn'); // NEW Button
    const printBtn = document.getElementById('printBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const resetBtn = document.getElementById('resetBtn');

    // --- Global State ---
    let originalImage = new Image(); // Stores the original, untouched image data
    let originalImageSrc = null;     // Stores the very first data URL for true reset
    let currentFileName = "No Photo Loaded";

    // Transformation State Object
    const transformations = {
        brightness: 100,
        contrast: 100,
        rotation: 0, // 0, 90, 180, 270 degrees relative to the original image orientation
    };

    // Cropping State
    let isCropping = false;
    let cropStart = { x: 0, y: 0 }; // Canvas coordinates
    let cropEnd = { x: 0, y: 0 };   // Canvas coordinates
    let cropRect = { x: 0, y: 0, width: 0, height: 0 }; // Final calculated crop rectangle in canvas pixels

    // --- Paper Size Dimensions (in pixels at 96 DPI for web display) ---
    const PAPER_SIZES = {
        'A4': {
            portrait: { width: 794, height: 1123 }, // 210mm x 297mm
            landscape: { width: 1123, height: 794 }
        },
        'legal': {
            portrait: { width: 816, height: 1344 }, // 8.5 x 14 inches
            landscape: { width: 1344, height: 816 }
        }
        // Add more paper sizes here if needed
    };

    // --- Helper Functions ---

    /**
     * Sets up the canvas's internal drawing dimensions (width, height)
     * based on the selected paper size and orientation.
     */
    const setupCanvasInternalDimensions = () => {
        const selectedPaperSizeKey = paperSizeSelect.value;
        const selectedOrientation = orientationSelect.value;

        const dimensions = PAPER_SIZES[selectedPaperSizeKey][selectedOrientation];

        if (dimensions) {
            photoCanvas.width = dimensions.width;
            photoCanvas.height = dimensions.height;

            // Update CSS class on parent for visual container aspect ratio if needed (from CSS)
            if (selectedOrientation === 'landscape') {
                photoCanvas.parentElement.classList.add('landscape');
            } else {
                photoCanvas.parentElement.classList.remove('landscape');
            }

            // Dynamically update the CSS aspect-ratio variable for #canvas-container
            // This is important for the CSS to correctly size the container visually.
            const currentAspectRatio = dimensions.width / dimensions.height;
            document.documentElement.style.setProperty('--current-canvas-aspect-ratio', currentAspectRatio);

        } else {
            console.error('Invalid paper size or orientation selected:', selectedPaperSizeKey, selectedOrientation);
            // Fallback to A4 portrait or clear canvas
            photoCanvas.width = PAPER_SIZES['A4'].portrait.width;
            photoCanvas.height = PAPER_SIZES['A4'].portrait.height;
            photoCanvas.parentElement.classList.remove('landscape');
            document.documentElement.style.setProperty('--current-canvas-aspect-ratio', PAPER_SIZES['A4'].portrait.width / PAPER_SIZES['A4'].portrait.height);
        }
    };

    /**
     * Draws the image onto the canvas, applying all current transformations.
     * This is the core rendering function.
     */
    const redrawCanvas = () => {
        if (!originalImage || !originalImage.src) {
            // No image loaded: show overlay, clear canvas dimensions
            ctx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
            // DO NOT set photoCanvas.width/height = 0 here, as it can collapse the parent container
            // The overlay is absolute position and should cover the container regardless of canvas inner size
            fileOverlay.classList.remove('hidden');
            photoCanvas.style.display = 'none'; // Hide canvas when no image
            return;
        }

        // Image is loaded: hide overlay, show canvas
        fileOverlay.classList.add('hidden');
        photoCanvas.style.display = 'block';

        // Step 1: Set up the canvas's internal pixel dimensions (A4/Legal portrait/landscape)
        setupCanvasInternalDimensions();

        // Clear the main canvas
        ctx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);

        // Get original image dimensions
        const originalImgWidth = originalImage.naturalWidth;
        const originalImgHeight = originalImage.naturalHeight;

        // Determine effective image dimensions *after* applying its internal rotation
        // This is crucial for correctly scaling it to fit the A4 canvas while maintaining aspect ratio
        const absRotation = Math.abs(transformations.rotation % 360);
        let rotatedImageEffectiveWidth, rotatedImageEffectiveHeight;

        if (absRotation === 90 || absRotation === 270) {
            // Image is rotated 90 or 270 degrees, so its effective width/height are swapped
            rotatedImageEffectiveWidth = originalImgHeight;
            rotatedImageEffectiveHeight = originalImgWidth;
        } else {
            // Image is rotated 0 or 180 degrees, so effective width/height are original
            rotatedImageEffectiveWidth = originalImgWidth;
            rotatedImageEffectiveHeight = originalImgHeight;
        }

        // Calculate scale factor to fit the *rotated image's effective dimensions* into the A4/Legal canvas
        const scaleFactor = Math.min(
            photoCanvas.width / rotatedImageEffectiveWidth,
            photoCanvas.height / rotatedImageEffectiveHeight
        );

        const scaledDisplayWidth = rotatedImageEffectiveWidth * scaleFactor;
        const scaledDisplayHeight = rotatedImageEffectiveHeight * scaleFactor;

        // Calculate offsets to center the scaled image within the A4/Legal canvas
        const offsetX = (photoCanvas.width - scaledDisplayWidth) / 2;
        const offsetY = (photoCanvas.height - scaledDisplayHeight) / 2;

        // Create a temporary canvas for applying pixel filters (brightness/contrast) and the image rotation
        const tempProcessingCanvas = document.createElement('canvas');
        const tempProcessingCtx = tempProcessingCanvas.getContext('2d');

        // Set temp canvas dimensions to match the effective rotated image size
        tempProcessingCanvas.width = rotatedImageEffectiveWidth;
        tempProcessingCanvas.height = rotatedImageEffectiveHeight;

        // Apply image rotation to the temp canvas
        tempProcessingCtx.save();
        tempProcessingCtx.translate(tempProcessingCanvas.width / 2, tempProcessingCanvas.height / 2);
        tempProcessingCtx.rotate(transformations.rotation * Math.PI / 180);
        // Draw the original image onto the temp canvas, effectively applying the rotation
        // Draw using original (un-rotated) dimensions relative to the translated center
        tempProcessingCtx.drawImage(originalImage, -originalImgWidth / 2, -originalImgHeight / 2, originalImgWidth, originalImgHeight);
        tempProcessingCtx.restore();

        // Get image data from the temp canvas for brightness/contrast
        const imageData = tempProcessingCtx.getImageData(0, 0, tempProcessingCanvas.width, tempProcessingCanvas.height);
        const data = imageData.data;

        // Apply Brightness and Contrast pixel manipulations
        const brightnessFactor = transformations.brightness / 100;
        const contrastFactor = transformations.contrast / 100; // 1.0 is no change

        for (let i = 0; i < data.length; i += 4) {
            // Apply contrast first
            data[i] = ((data[i] - 128) * contrastFactor) + 128;
            data[i + 1] = ((data[i + 1] - 128) * contrastFactor) + 128;
            data[i + 2] = ((data[i + 2] - 128) * contrastFactor) + 128;

            // Then apply brightness
            data[i] *= brightnessFactor;
            data[i + 1] *= brightnessFactor;
            data[i + 2] *= brightnessFactor;

            // Clamp values to 0-255 range
            data[i] = Math.min(255, Math.max(0, data[i]));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1]));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2]));
        }

        // Put the processed image data back onto the temp canvas
        tempProcessingCtx.putImageData(imageData, 0, 0);

        // Draw the fully processed image from the temp canvas onto the main photoCanvas, scaled and centered
        ctx.drawImage(tempProcessingCanvas, offsetX, offsetY, scaledDisplayWidth, scaledDisplayHeight);

        // If in cropping mode, draw the crop rectangle OVER the image
        if (isCropping) {
            drawCropRectangle();
        }
    };


    // --- Image Loading Functions ---
    const loadImage = (file) => {
        if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
                originalImage = new Image();
                originalImage.onload = () => {
                    originalImageSrc = e.target.result; // Store for true reset
                    resetTransformations(false); // Reset transformations, but don't redraw yet

                    currentFileName = file.name;
                    currentPhotoNameSpan.textContent = currentFileName;

                    // Visibility handled by redrawCanvas based on originalImage.src
                    redrawCanvas(); // Draw the newly loaded image
                };
                originalImage.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    };

    // --- Manipulation Functions ---

    const applyBrightness = (value) => {
        transformations.brightness = value;
        redrawCanvas();
    };

    const applyContrast = (value) => {
        transformations.contrast = value;
        redrawCanvas();
    };

    const rotateImage = (angle) => {
        transformations.rotation = (transformations.rotation + angle) % 360;
        if (transformations.rotation < 0) { // Ensure rotation is always positive
            transformations.rotation += 360;
        }
        redrawCanvas();
    };

    // --- Cropping Functions ---
    const activateCropMode = () => {
        if (!originalImage || !originalImage.src) return;
        isCropping = true;
        photoCanvas.classList.add('cropping-mode');
        applyCropBtn.disabled = true; // Disable until a selection is made
        cancelCropBtn.disabled = false;
        startCropBtn.disabled = true;

        cropRect = { x: 0, y: 0, width: 0, height: 0 }; // Reset crop selection
        redrawCanvas(); // Redraw to show the empty crop overlay

        // Add event listeners for drawing crop rectangle
        photoCanvas.addEventListener('mousedown', startDrawingCrop);
        photoCanvas.addEventListener('mousemove', drawCropSelection);
        photoCanvas.addEventListener('mouseup', endDrawingCrop);
        photoCanvas.addEventListener('mouseleave', endDrawingCrop); // End crop if mouse leaves canvas
    };

    /**
     * Converts mouse event coordinates to canvas pixel coordinates,
     * accounting for CSS scaling of the canvas element.
     */
    const getCanvasCoordinates = (event) => {
        const rect = photoCanvas.getBoundingClientRect(); // Get size and position of canvas on screen
        const scaleX = photoCanvas.width / rect.width;   // Calculate horizontal scaling factor
        const scaleY = photoCanvas.height / rect.height; // Calculate vertical scaling factor

        let x = (event.clientX - rect.left) * scaleX;
        let y = (event.clientY - rect.top) * scaleY;

        // Clamp coordinates to canvas boundaries
        x = Math.max(0, Math.min(x, photoCanvas.width));
        y = Math.max(0, Math.min(y, photoCanvas.height));

        return { x, y };
    };

    const startDrawingCrop = (e) => {
        if (!isCropping) return;
        // Only start drawing if left mouse button is pressed
        if (e.button !== 0) return;

        const coords = getCanvasCoordinates(e);
        cropStart.x = coords.x;
        cropStart.y = coords.y;
        cropEnd.x = coords.x; // Initialize end point to start point
        cropEnd.y = coords.y;
        applyCropBtn.disabled = true; // Disable apply button until a valid rectangle is drawn
        redrawCanvas(); // Redraw to clear any old selection and show the fresh starting point
    };

    const drawCropSelection = (e) => {
        // Only draw if in cropping mode AND left mouse button is held down (e.buttons === 1)
        if (!isCropping || e.buttons !== 1) return;

        const coords = getCanvasCoordinates(e);
        cropEnd.x = coords.x;
        cropEnd.y = coords.y;

        // Calculate crop rectangle properties (always positive width/height)
        const x1 = Math.min(cropStart.x, cropEnd.x);
        const y1 = Math.min(cropStart.y, cropEnd.y);
        const width = Math.abs(cropStart.x - cropEnd.x);
        const height = Math.abs(cropStart.y - cropEnd.y);

        // Update cropRect (used for drawing and applying)
        cropRect = { x: x1, y: y1, width: width, height: height };

        redrawCanvas(); // Redraw to update the visual selection rectangle
        // Enable apply button only if a non-empty rectangle is drawn
        applyCropBtn.disabled = !(cropRect.width > 0 && cropRect.height > 0);
    };

    const endDrawingCrop = () => {
        if (!isCropping) return;
        // Enable apply button only if a non-empty rectangle has been drawn
        applyCropBtn.disabled = !(cropRect.width > 0 && cropRect.height > 0);
    };

const drawCropRectangle = () => {
    // 1. Draw the dark overlay on the entire canvas (this is for the area *outside* your selection)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.0)'; // Keep this for the "foggy" outer area
    ctx.fillRect(0, 0, photoCanvas.width, photoCanvas.height);

    // 2. THIS IS THE LINE TO CHANGE FOR THE COLOR *INSIDE* THE CROP SELECTION
    // You want to fill it with a color, not clear it.
    ctx.fillStyle = 'rgba(0, 123, 255, 0.0)'; // Example: Semi-transparent blue. Adjust color and opacity as needed.
    ctx.fillRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);

    // 3. Draw the selection border (white for contrast)
    ctx.strokeStyle = 'rgba(255, 255, 255, 1)'; // White border
    ctx.lineWidth = 1;         // 1 pixel thick border
    ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
};

    const applyCrop = () => {
        if (!originalImage || !originalImage.src || !isCropping || !(cropRect.width > 0 && cropRect.height > 0)) {
            alert('No valid crop selection made.');
            return;
        }

        // Create a temporary canvas for the final cropped image
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        tempCanvas.width = cropRect.width;
        tempCanvas.height = cropRect.height;

        // Draw the selected portion from the *current state* of the photoCanvas onto the temporary canvas.
        // This captures the image with all current transformations (rotation, brightness, contrast)
        // already applied.
        tempCtx.drawImage(
            photoCanvas, // Source is the current visible canvas (which holds the fully processed image)
            cropRect.x,
            cropRect.y,
            cropRect.width,
            cropRect.height,
            0, 0,
            cropRect.width,
            cropRect.height
        );

        // Set the originalImage to the new cropped image data
        originalImage.src = tempCanvas.toDataURL('image/png');
        originalImage.onload = () => {
            // After cropping, reset pixel transformations (brightness, contrast)
            // as they are now "baked in" to the new originalImage.
            // We retain rotation because a cropped image might still need to be rotated.
            transformations.brightness = 100;
            transformations.contrast = 100;

            brightnessSlider.value = 100;
            contrastSlider.value = 100;

            deactivateCropMode(); // Cleans up cropping UI and listeners
            redrawCanvas(); // Redraws with the new base (cropped) image, fitting it to A4/Legal again
        };
    };

    const deactivateCropMode = () => {
        isCropping = false;
        photoCanvas.classList.remove('cropping-mode');
        cropRect = { x: 0, y: 0, width: 0, height: 0 }; // Clear crop selection
        applyCropBtn.disabled = true;
        cancelCropBtn.disabled = true;
        startCropBtn.disabled = false;

        // Remove event listeners
        photoCanvas.removeEventListener('mousedown', startDrawingCrop);
        photoCanvas.removeEventListener('mousemove', drawCropSelection);
        photoCanvas.removeEventListener('mouseup', endDrawingCrop);
        photoCanvas.removeEventListener('mouseleave', endDrawingCrop);
        redrawCanvas(); // Redraw to remove crop rectangle visual
    };

    const cancelCrop = () => {
        deactivateCropMode();
    };

    // --- Action Functions ---

    const downloadImage = () => {
        if (!originalImage || !originalImage.src) {
            alert('No image to download!');
            return;
        }
        // Use photoCanvas.toDataURL() as it holds the final rendered image
        const dataURL = photoCanvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = `edited_${currentFileName.split('.')[0] || 'image'}.png`; // Ensure .png extension
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const printImage = () => {
        if (!originalImage || !originalImage.src) {
            alert('No image to print!');
            return;
        }
        const printWindow = window.open('', '_blank');
        printWindow.document.write('<html><head><title>Print Image</title></head><body>');
        // Print the canvas content directly
        printWindow.document.write('<img src="' + photoCanvas.toDataURL('image/png') + '" style="max-width:100%; max-height:100vh;">');
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.onload = function() {
            printWindow.print();
        };
    };

    const resetTransformations = (redraw = true) => {
        transformations.brightness = 100;
        transformations.contrast = 100;
        transformations.rotation = 0;
        orientationSelect.value = 'portrait'; // Reset orientation
        paperSizeSelect.value = 'A4';         // Reset paper size to A4

        brightnessSlider.value = 100;
        contrastSlider.value = 100;

        deactivateCropMode(); // Ensure cropping mode is off

        if (originalImageSrc) {
            // If an image was loaded, restore its original state
            const tempImage = new Image();
            tempImage.onload = () => {
                originalImage = tempImage; // Restore the true original image
                if (redraw) redrawCanvas();
            };
            tempImage.src = originalImageSrc;
        } else {
            // No image ever loaded or fully reset to a state where no image exists
            photoCanvas.style.display = 'none'; // Hide canvas
            currentPhotoNameSpan.textContent = "No Photo Loaded";
            fileOverlay.classList.remove('hidden'); // Show drag and drop overlay
            if (redraw) redrawCanvas(); // Ensures initial state is drawn
        }
    };


    // --- Event Listeners ---

    imageUploader.addEventListener('change', (event) => {
        const file = event.target.files[0];
        loadImage(file);
    });

    dropZone.addEventListener('click', () => {
        imageUploader.click();
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('highlight');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('highlight');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('highlight');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            loadImage(file);
        } else {
            alert('Please drop an image file!');
        }
    });

    brightnessSlider.addEventListener('input', (e) => applyBrightness(parseInt(e.target.value)));
    contrastSlider.addEventListener('input', (e) => applyContrast(parseInt(e.target.value)));

    rotateRightBtn.addEventListener('click', () => rotateImage(90));
    orientationSelect.addEventListener('change', redrawCanvas); // Listen for orientation change
    paperSizeSelect.addEventListener('change', redrawCanvas);   // Listen for paper size change

    startCropBtn.addEventListener('click', activateCropMode);
    applyCropBtn.addEventListener('click', applyCrop);
    cancelCropBtn.addEventListener('click', cancelCrop);

    newBtn.addEventListener('click', () => { // "New" button click opens a fresh tab
        window.open('./photo-editor.html', '_blank');
    });
    printBtn.addEventListener('click', printImage);
    downloadBtn.addEventListener('click', downloadImage);
    resetBtn.addEventListener('click', resetTransformations);

    // Initial setup: Ensure file overlay is visible and canvas is hidden
    // The redrawCanvas function now handles the initial visibility correctly
    resetTransformations(false); // Call with false to set initial state without re-drawing an image that isn't there yet
    // Then call redrawCanvas once to set up the initial display (shows overlay)
    redrawCanvas();
});
