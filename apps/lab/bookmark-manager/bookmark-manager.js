/*
================================================================================
File: bookmark-manager.js
Project: bookmark-manager
Description: Main logic for the Bookmark Manager WebApp.
Purpose: Manage bookmarks in folders, import/export Chrome HTML,
         batch delete, search, and persist in localStorage.
Author: Grok
Date: 2026-10-18
================================================================================
*/

// ============================================================================
// Constants
// ============================================================================

// LocalStorage key
const LS_KEY = 'bookmarkManagerData';

// Default folders including Other
const DEFAULT_FOLDERS = [
    'General',
    'Work',
    'Personal',
    'Reading',
    'Tools',
    'Entertainment',
    'Shopping',
    'Learning',
    'Other'
];

// ============================================================================
// Global state
// ============================================================================

// Data structure: { folders: [{ name, bookmarks: [{ name, url, id }] }] }
let data = { folders: [] };

// ============================================================================
// DOM references
// ============================================================================

const nameInput = document.getElementById('name-input');
const urlInput = document.getElementById('url-input');
const folderSelect = document.getElementById('folder-select');
const addBtn = document.getElementById('add-btn');
const newFolderInput = document.getElementById('new-folder-input');
const addFolderBtn = document.getElementById('add-folder-btn');
const searchInput = document.getElementById('search-input');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-input');
const foldersEl = document.getElementById('folders');
const statusEl = document.getElementById('status');

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Sets status message.
 * @param {string} msg - Message text
 */
function setStatus(msg) {
    statusEl.textContent = msg;
}

/**
 * Generates a simple unique ID.
 * @returns {string} ID
 */
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Saves data to localStorage.
 */
function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
}

/**
 * Loads data from localStorage or initializes defaults.
 */
function load() {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
        try {
            data = JSON.parse(raw);
        } catch (e) {
            data = { folders: [] };
        }
    }
    if (!data.folders || data.folders.length === 0) {
        data.folders = DEFAULT_FOLDERS.map(name => ({ name, bookmarks: [] }));
    }
    save();
}

/**
 * Renders the folder select dropdown.
 */
function renderFolderSelect() {
    folderSelect.innerHTML = '';
    data.folders.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.name;
        opt.textContent = f.name;
        folderSelect.appendChild(opt);
    });
}

/**
 * Renders all folders and bookmarks.
 * @param {string} filter - Optional search filter
 */
function render(filter = '') {
    foldersEl.innerHTML = '';
    const q = filter.toLowerCase();

    data.folders.forEach(folder => {
        const visible = folder.bookmarks.filter(b =>
            !q || b.name.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
        );
        if (q && visible.length === 0) return;

        const div = document.createElement('div');
        div.className = 'folder';
        div.innerHTML = `
            <div class="folder-header">
                <span>${folder.name} (${visible.length})</span>
                <button class="del-folder" data-folder="${folder.name}">Delete Folder</button>
            </div>
        `;

        visible.forEach(bm => {
            const item = document.createElement('div');
            item.className = 'bookmark';
            item.innerHTML = `
                <input type="checkbox" class="bm-check" data-id="${bm.id}">
                <a href="${bm.url}" target="_blank">${bm.name}</a>
                <button class="del-bm" data-id="${bm.id}">Delete</button>
            `;
            div.appendChild(item);
        });

        foldersEl.appendChild(div);
    });

    // Attach delete handlers
    document.querySelectorAll('.del-bm').forEach(btn => {
        btn.addEventListener('click', () => deleteBookmark(btn.dataset.id));
    });
    document.querySelectorAll('.del-folder').forEach(btn => {
        btn.addEventListener('click', () => deleteFolder(btn.dataset.folder));
    });
}

/**
 * Adds a bookmark.
 */
function addBookmark() {
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const folderName = folderSelect.value;
    if (!name || !url) {
        setStatus('Name and URL required.');
        return;
    }
    const folder = data.folders.find(f => f.name === folderName);
    if (folder) {
        folder.bookmarks.push({ id: uid(), name, url });
        save();
        render(searchInput.value);
        nameInput.value = '';
        urlInput.value = '';
        setStatus('Bookmark added.');
    }
}

/**
 * Adds a new folder.
 */
function addFolder() {
    const name = newFolderInput.value.trim();
    if (!name) return;
    if (data.folders.some(f => f.name === name)) {
        setStatus('Folder already exists.');
        return;
    }
    data.folders.push({ name, bookmarks: [] });
    save();
    renderFolderSelect();
    render(searchInput.value);
    newFolderInput.value = '';
    setStatus('Folder added.');
}

/**
 * Deletes a bookmark by ID.
 * @param {string} id - Bookmark ID
 */
function deleteBookmark(id) {
    data.folders.forEach(f => {
        f.bookmarks = f.bookmarks.filter(b => b.id !== id);
    });
    save();
    render(searchInput.value);
    setStatus('Bookmark deleted.');
}

/**
 * Deletes a folder.
 * @param {string} name - Folder name
 */
function deleteFolder(name) {
    if (!confirm(`Delete folder "${name}" and all its bookmarks?`)) return;
    data.folders = data.folders.filter(f => f.name !== name);
    save();
    renderFolderSelect();
    render(searchInput.value);
    setStatus('Folder deleted.');
}

/**
 * Deletes all selected bookmarks.
 */
function deleteSelected() {
    const ids = Array.from(document.querySelectorAll('.bm-check:checked')).map(cb => cb.dataset.id);
    if (ids.length === 0) return;
    data.folders.forEach(f => {
        f.bookmarks = f.bookmarks.filter(b => !ids.includes(b.id));
    });
    save();
    render(searchInput.value);
    setStatus(`Deleted ${ids.length} bookmarks.`);
}

/**
 * Exports data as Chrome-compatible HTML.
 */
function exportHTML() {
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;
    data.folders.forEach(folder => {
        html += `    <DT><H3>${folder.name}</H3>\n    <DL><p>\n`;
        folder.bookmarks.forEach(bm => {
            html += `        <DT><A HREF="${bm.url}">${bm.name}</A>\n`;
        });
        html += `    </DL><p>\n`;
    });
    html += `</DL><p>`;

    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bookmarks.html';
    a.click();
    setStatus('Exported HTML.');
}

/**
 * Imports Chrome HTML bookmarks (basic parser).
 * @param {string} text - HTML content
 */
function importHTML(text) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const folders = doc.querySelectorAll('h3');
    folders.forEach(h3 => {
        const folderName = h3.textContent.trim();
        let folder = data.folders.find(f => f.name === folderName);
        if (!folder) {
            folder = { name: folderName, bookmarks: [] };
            data.folders.push(folder);
        }
        const dl = h3.nextElementSibling;
        if (dl && dl.tagName === 'DL') {
            dl.querySelectorAll('a').forEach(a => {
                const name = a.textContent.trim();
                const url = a.href;
                if (name && url && !folder.bookmarks.some(b => b.url === url)) {
                    folder.bookmarks.push({ id: uid(), name, url });
                }
            });
        }
    });
    save();
    renderFolderSelect();
    render();
    setStatus('Import complete.');
}

// ============================================================================
// Event listeners
// ============================================================================

addBtn.addEventListener('click', addBookmark);
addFolderBtn.addEventListener('click', addFolder);
deleteSelectedBtn.addEventListener('click', deleteSelected);
exportBtn.addEventListener('click', exportHTML);

importBtn.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
    if (importInput.files.length > 0) {
        const text = await importInput.files[0].text();
        importHTML(text);
    }
});

searchInput.addEventListener('input', () => render(searchInput.value));

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initializes the app.
 */
function init() {
    load();
    renderFolderSelect();
    render();
    setStatus('Ready.');
}

init();
