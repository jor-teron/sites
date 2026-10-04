// cursor.js

document.addEventListener('DOMContentLoaded', () => {
    // Create a Canvas for cursor
    const canvas = document.createElement('canvas');
    canvas.width = 64; // Standard cursor size
    canvas.height = 64; // Standard cursor size
    const ctx = canvas.getContext('2d');

    // Clear the canvas to ensure transparency
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- Draw the custom arrow cursor ---
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(35, 37);
    ctx.lineTo(16, 37);
    ctx.lineTo(0, 50);
    ctx.closePath();

    // Set fill color for the arrow
    ctx.fillStyle = 'black'; // Fill color for the arrow
    ctx.fill(); // Fills the path

    // Set stroke color and width for the arrow
    ctx.strokeStyle = 'white'; // Outline color for the arrow
    ctx.lineWidth = 3; // Changed to 3 as requested
    ctx.stroke(); // Draws the outline of the path

    // --- Draw 'PWD' text ---
    // Making text bolder:
    // We already have 'bold' in the font string, but
    // to make it *even bolder* or if the default 'bold' isn't strong enough,
    // you can increase the font size slightly or use a font that renders bolder.
    // However, the 'bold' keyword is usually sufficient.
    ctx.font = 'bold 18px Arial'; // Already specified 'bold', which is the standard way.
                                // If you want it even thicker, you might try 'bolder' or a higher font-weight number like '700' or '900' if the font supports it.
                                // For most cases, 'bold' is enough.
    ctx.fillStyle = 'teal'; // Fill color for the text
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Teron', canvas.width - 4, canvas.height - 4);

    // Convert canvas to image URL (Data URL)
    const cursorURL = canvas.toDataURL('image/png');

    // Apply it as cursor to the whole body
    document.body.style.cursor = `url(${cursorURL}) 2 2, auto`;
});
