/*
================================================================================
File: local-ai-chat-image.js
Project: local-ai-chat
Description: In-chat image generation for Local AI Chat.
Purpose: Builds a Pollinations.ai image (flux, square, chosen resolution) and
         shows it as an assistant bubble with a Download PNG button underneath.
         Replaces the old separate #icon-section (R1).
Author: Grok
Date: 2026-10-19 (R1: new file)
================================================================================
*/

/**
 * Generates an image and appends it to the chat as an assistant bubble.
 * @param {string} prompt - Image prompt
 * @param {number} size - Width/height in px (32–512)
 * @param {(el: HTMLElement) => void} addBubble - Inserts a bubble into the chat
 * @param {(msg: string) => void} setStatus - Shows/hides the inline status note
 */
export function generateImageBubble(prompt, size, addBubble, setStatus) {
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${size}&height=${size}&nologo=true&safe=true&model=flux`;

    // Bubble shell
    const bubble = document.createElement('div');
    bubble.className = 'message assistant image-msg';
    const img = document.createElement('img');
    img.className = 'gen-img';
    img.alt = prompt;
    img.width = size;
    img.height = size;
    bubble.appendChild(img);
    addBubble(bubble);

    setStatus(`Making ${size}×${size} image...`);

    img.onload = () => {
        // Download button appears only once the image is ready
        const dl = document.createElement('button');
        dl.className = 'chip';
        dl.textContent = 'Download PNG';
        dl.addEventListener('click', () => downloadImage(img.src, size, setStatus));
        bubble.appendChild(dl);
        setStatus(`Image ready (${size}×${size}).`);
    };
    img.onerror = () => {
        bubble.textContent = 'Image failed. Try another prompt or resolution.';
        setStatus('');
    };
    img.src = url + '&t=' + Date.now(); // cache-bust
}

/**
 * Downloads an image as PNG. Fetches as a blob so the cross-origin
 * download attribute works; falls back to opening the image.
 * @param {string} src - Image URL
 * @param {number} size - Size for the file name
 * @param {(msg: string) => void} setStatus - Status note setter
 */
async function downloadImage(src, size, setStatus) {
    const a = document.createElement('a');
    a.download = `icon-${size}x${size}.png`;
    try {
        const blob = await (await fetch(src)).blob();
        a.href = URL.createObjectURL(blob);
    } catch {
        a.href = src;
        a.target = '_blank';
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus('Download started.');
}
