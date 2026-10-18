/*
================================================================================
File: media-explorer.js
Project: media-explorer
Description: Main logic for the Media Explorer WebApp.
Purpose: Open folders via File System Access API, show media as tiles,
         navigate sub-folders, play video/audio/images, support M3U/IPTV,
         and stop returns to explorer view. Dark theme by default.
Author: Grok
Date: 2026-10-18
================================================================================
*/

// ============================================================================
// Constants
// ============================================================================

// Supported media extensions
const VIDEO_EXT = ['.mp4', '.webm', '.mkv', '.mov', '.avi'];
const AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

// ============================================================================
// Global state
// ============================================================================

// Current directory handle
let currentDirHandle = null;

// Navigation history for Up button
let dirHistory = [];

// Current media items in view
let currentItems = [];

// Current playing index (for next/prev)
let currentIndex = -1;

// ============================================================================
// DOM references
// ============================================================================

const openFolderBtn = document.getElementById('open-folder-btn');
const urlInput = document.getElementById('url-input');
const loadUrlBtn = document.getElementById('load-url-btn');
const upBtn = document.getElementById('up-btn');
const pathEl = document.getElementById('path');
const tilesEl = document.getElementById('tiles');
const playerOverlay = document.getElementById('player-overlay');
const playerContent = document.getElementById('player-content');
const stopBtn = document.getElementById('stop-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const channelListEl = document.getElementById('channel-list');

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Updates the path display.
 * @param {string} text - Path text
 */
function setPath(text) {
    pathEl.textContent = text;
}

/**
 * Gets file extension in lowercase.
 * @param {string} name - File name
 * @returns {string} Extension including dot
 */
function getExt(name) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i).toLowerCase() : '';
}

/**
 * Determines media type from extension.
 * @param {string} ext - File extension
 * @returns {string} 'video' | 'audio' | 'image' | 'folder' | 'other'
 */
function getType(ext) {
    if (VIDEO_EXT.includes(ext)) return 'video';
    if (AUDIO_EXT.includes(ext)) return 'audio';
    if (IMAGE_EXT.includes(ext)) return 'image';
    return 'other';
}

/**
 * Renders tiles for the current directory.
 */
async function renderTiles() {
    tilesEl.innerHTML = '';
    currentItems = [];

    if (!currentDirHandle) return;

    for await (const [name, handle] of currentDirHandle.entries()) {
        const isDir = handle.kind === 'directory';
        const ext = isDir ? '' : getExt(name);
        const type = isDir ? 'folder' : getType(ext);

        if (type === 'other' && !isDir) continue; // skip unknown files

        const item = { name, handle, type, isDir };
        currentItems.push(item);

        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.innerHTML = `
            <div class="icon">${isDir ? '📁' : type === 'video' ? '🎬' : type === 'audio' ? '🎵' : '🖼️'}</div>
            <div>${name}</div>
        `;
        tile.addEventListener('click', () => onTileClick(item));
        tilesEl.appendChild(tile);
    }

    upBtn.disabled = dirHistory.length === 0;
}

/**
 * Handles tile click: enter folder or play media.
 * @param {Object} item - Item object
 */
async function onTileClick(item) {
    if (item.isDir) {
        dirHistory.push(currentDirHandle);
        currentDirHandle = item.handle;
        setPath(item.name);
        await renderTiles();
    } else {
        currentIndex = currentItems.indexOf(item);
        await playItem(item);
    }
}

/**
 * Plays or views a media item.
 * @param {Object} item - Media item
 */
async function playItem(item) {
    playerContent.innerHTML = '';
    playerOverlay.classList.add('active');

    const file = await item.handle.getFile();
    const url = URL.createObjectURL(file);

    if (item.type === 'video') {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.autoplay = true;
        playerContent.appendChild(video);
    } else if (item.type === 'audio') {
        const audio = document.createElement('audio');
        audio.src = url;
        audio.controls = true;
        audio.autoplay = true;
        playerContent.appendChild(audio);
    } else if (item.type === 'image') {
        const img = document.createElement('img');
        img.src = url;
        playerContent.appendChild(img);
    }
}

/**
 * Stops playback and returns to explorer.
 */
function stopPlayback() {
    playerOverlay.classList.remove('active');
    playerContent.innerHTML = '';
    // Revoke object URLs if needed (simplified)
}

/**
 * Goes up one folder.
 */
async function goUp() {
    if (dirHistory.length === 0) return;
    currentDirHandle = dirHistory.pop();
    setPath('..');
    await renderTiles();
}

/**
 * Loads a remote URL (video, audio, image, or M3U).
 * @param {string} url - Remote URL
 */
async function loadRemote(url) {
    if (url.toLowerCase().includes('.m3u')) {
        // Simple M3U handling
        try {
            const res = await fetch(url);
            const text = await res.text();
            const lines = text.split(/\r?\n/).filter(l => l && !l.startsWith('#'));
            channelListEl.innerHTML = '';
            channelListEl.classList.add('active');
            lines.forEach((streamUrl, i) => {
                const div = document.createElement('div');
                div.className = 'channel-item';
                div.textContent = `Channel ${i + 1}`;
                div.addEventListener('click', () => playRemote(streamUrl, 'video'));
                channelListEl.appendChild(div);
            });
            setPath('IPTV List loaded');
        } catch (e) {
            alert('Failed to load M3U');
        }
    } else {
        // Guess type
        const ext = getExt(url);
        const type = getType(ext) || 'video';
        playRemote(url, type);
    }
}

/**
 * Plays a remote URL.
 * @param {string} url - Media URL
 * @param {string} type - 'video' | 'audio' | 'image'
 */
function playRemote(url, type) {
    playerContent.innerHTML = '';
    playerOverlay.classList.add('active');

    if (type === 'video') {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.autoplay = true;
        playerContent.appendChild(video);
    } else if (type === 'audio') {
        const audio = document.createElement('audio');
        audio.src = url;
        audio.controls = true;
        audio.autoplay = true;
        playerContent.appendChild(audio);
    } else {
        const img = document.createElement('img');
        img.src = url;
        playerContent.appendChild(img);
    }
}

// ============================================================================
// Event listeners
// ============================================================================

openFolderBtn.addEventListener('click', async () => {
    try {
        currentDirHandle = await window.showDirectoryPicker();
        dirHistory = [];
        setPath(currentDirHandle.name);
        await renderTiles();
    } catch (e) {
        console.log('Folder selection cancelled');
    }
});

upBtn.addEventListener('click', goUp);

loadUrlBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (url) loadRemote(url);
});

stopBtn.addEventListener('click', stopPlayback);

prevBtn.addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex--;
        playItem(currentItems[currentIndex]);
    }
});

nextBtn.addEventListener('click', () => {
    if (currentIndex < currentItems.length - 1) {
        currentIndex++;
        playItem(currentItems[currentIndex]);
    }
});

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initializes the app.
 */
function init() {
    setPath('Click "Open Folder" to begin (Chrome/Edge recommended)');
}

init();
