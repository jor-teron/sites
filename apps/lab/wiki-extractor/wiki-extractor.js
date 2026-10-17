/*
File: wiki-extractor.js
Project: wiki-extractor
Description: Client-side JavaScript logic for the Wikipedia Main Body Text Extractor.
Purpose: Handles user input, fetches main body plain text and internal links from English Wikipedia via MediaWiki API,
performs breadth-first crawl up to chosen depth and page limit, builds tree or flat output,
displays results, and generates downloadable .txt file.
Author: Built for Jor Teron
Date: 2026-10-16
Notes: Pure browser JS. Uses fetch() with origin=* for CORS. Includes polite delays between requests.
Only English Wikipedia. Extracts only main body (explaintext). Skips non-article links.
*/

// Constant: Base URL for English Wikipedia MediaWiki API
const API_BASE = 'https://en.wikipedia.org/w/api.php';

// Constant: Delay in milliseconds between API requests to be polite to the server
const REQUEST_DELAY_MS = 300;

// Constant: Maximum links to request per page (API max is 500)
const LINKS_PER_REQUEST = 500;

// Variable: Stores the collected page data for download and display
let collectedPages = [];

// Variable: Tree structure root for children mode
let treeRoot = null;

// Variable: Abort flag to stop long-running extraction if needed
let abortExtraction = false;

// Function: Extracts the page title from a full Wikipedia URL or returns the raw input as title
function extractTitleFromInput(input) {
    // Trim whitespace
    const trimmed = input.trim();
    // If it looks like a URL, parse the title
    if (trimmed.startsWith('http')) {
        try {
            const url = new URL(trimmed);
            // Match /wiki/Title pattern
            const match = url.pathname.match(/\/wiki\/(.+)/);
            if (match) {
                // Decode and replace underscores with spaces for display, but API accepts both
                return decodeURIComponent(match[1]).replace(/_/g, ' ');
            }
        } catch (e) {
            // Invalid URL, fall through
        }
    }
    // Otherwise treat as plain title
    return trimmed;
}

// Function: Normalizes a title for API use (spaces to underscores, basic cleanup)
function normalizeTitle(title) {
    return title.trim().replace(/ /g, '_');
}

// Function: Sleep helper for rate limiting
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function: Strips trailing sections from plain text extract (always applied)
// Removes See also, References, Notes, Citations, External links, Further reading, Bibliography, and similar
function stripTrailingSections(text) {
    // List of section headings to cut at (case-insensitive, whole line)
    const sectionPatterns = [
        /^\s*See also\s*$/im,
        /^\s*References\s*$/im,
        /^\s*Notes\s*$/im,
        /^\s*Citations\s*$/im,
        /^\s*External links\s*$/im,
        /^\s*Further reading\s*$/im,
        /^\s*Bibliography\s*$/im,
        /^\s*Sources\s*$/im,
        /^\s*Notes and references\s*$/im
    ];

    // Find the earliest cut position
    let cutIndex = text.length;
    for (const pattern of sectionPatterns) {
        const match = text.match(pattern);
        if (match && match.index !== undefined && match.index < cutIndex) {
            cutIndex = match.index;
        }
    }

    // Return text up to the cut (trimmed)
    return text.substring(0, cutIndex).trim();
}

// Function: Fetches main body extract and links for a single page title
async function fetchPageData(title) {
    // Build query parameters
    const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        origin: '*',
        titles: title,
        prop: 'extracts|links',
        explaintext: '1',
        exsectionformat: 'plain',
        plnamespace: '0',
        pllimit: LINKS_PER_REQUEST.toString()
    });

    // Perform the fetch
    const response = await fetch(`${API_BASE}?${params.toString()}`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${title}`);
    }
    const data = await response.json();

    // Extract the page object
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];

    // Handle missing or invalid pages
    if (page.missing || pageId === '-1') {
        return { title: title, text: '', links: [], error: 'Page not found' };
    }

    // Get plain text extract (main body) and strip trailing sections
    const rawText = page.extract || '';
    const text = stripTrailingSections(rawText);

    // Collect internal article links (namespace 0)
    const links = [];
    if (page.links) {
        for (const link of page.links) {
            if (link.ns === 0 && link.title) {
                links.push(link.title);
            }
        }
    }

    // Note: For simplicity, we do not follow continue for more than 500 links.
    // Most pages have fewer relevant main-body links.

    return {
        title: page.title || title,
        text: text,
        links: links,
        error: null
    };
}

// Function: Performs BFS crawl starting from the given title, up to maxDepth and maxPages
async function crawlWikipedia(startTitle, maxDepth, maxPages, onProgress) {
    // Reset abort flag
    abortExtraction = false;

    // Visited set to avoid cycles and duplicates
    const visited = new Set();

    // Queue for BFS: each item is { title, depth, parentNode }
    const queue = [];

    // Results array for flat list
    const results = [];

    // Create root node for tree
    const root = {
        title: startTitle,
        text: '',
        depth: 0,
        children: [],
        error: null
    };
    treeRoot = root;

    // Enqueue starting page
    queue.push({ title: startTitle, depth: 0, parentNode: root });
    visited.add(normalizeTitle(startTitle));

    // Process queue
    while (queue.length > 0 && results.length < maxPages && !abortExtraction) {
        const current = queue.shift();
        const { title, depth, parentNode } = current;

        // Update progress
        if (onProgress) {
            onProgress(`Fetching: ${title} (depth ${depth}, collected ${results.length}/${maxPages})`);
        }

        // Fetch data
        let pageData;
        try {
            pageData = await fetchPageData(title);
        } catch (err) {
            pageData = { title: title, text: '', links: [], error: err.message };
        }

        // Store text and error on the node
        parentNode.title = pageData.title;
        parentNode.text = pageData.text;
        parentNode.error = pageData.error;
        parentNode.depth = depth;

        // Add to flat results if we have content or at least the title
        results.push({
            title: pageData.title,
            text: pageData.text,
            depth: depth,
            error: pageData.error
        });

        // If we can go deeper and have links, enqueue children
        if (depth < maxDepth && pageData.links && pageData.links.length > 0) {
            for (const linkTitle of pageData.links) {
                const norm = normalizeTitle(linkTitle);
                if (!visited.has(norm) && results.length + queue.length < maxPages * 2) {
                    // Soft limit on queue size to prevent explosion before hard limit
                    visited.add(norm);
                    // Create child node
                    const childNode = {
                        title: linkTitle,
                        text: '',
                        depth: depth + 1,
                        children: [],
                        error: null
                    };
                    parentNode.children.push(childNode);
                    queue.push({ title: linkTitle, depth: depth + 1, parentNode: childNode });
                }
            }
        }

        // Polite delay
        await sleep(REQUEST_DELAY_MS);
    }

    // Store globally for download
    collectedPages = results;
    return results;
}

// Function: Formats the tree for display (children mode)
function formatTree(node, indent = 0) {
    // Build line for this node
    const prefix = '  '.repeat(indent) + (indent > 0 ? '└─ ' : '');
    let line = prefix + node.title;
    if (node.error) {
        line += ` [Error: ${node.error}]`;
    }
    line += '\n';

    // Add truncated body preview if available
    if (node.text && node.text.length > 0) {
        const preview = node.text.substring(0, 200).replace(/\n/g, ' ') + (node.text.length > 200 ? '...' : '');
        line += '  '.repeat(indent + 1) + preview + '\n';
    }

    // Recurse children
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            line += formatTree(child, indent + 1);
        }
    }
    return line;
}

// Function: Formats flat list for display
function formatFlat(pages) {
    let output = '';
    for (const page of pages) {
        output += `=== ${page.title} (depth ${page.depth}) ===\n`;
        if (page.error) {
            output += `[Error: ${page.error}]\n`;
        } else {
            output += (page.text || '(no body text)') + '\n';
        }
        output += '\n';
    }
    return output;
}

// Function: Generates full text content for .txt download
function generateTxtContent(pages, mode) {
    let content = `Wikipedia Main Body Extractor\n`;
    content += `Start: ${pages[0] ? pages[0].title : 'unknown'}\n`;
    content += `Total pages: ${pages.length}\n`;
    content += `Mode: ${mode}\n`;
    content += `Generated: ${new Date().toISOString()}\n`;
    content += '='.repeat(60) + '\n\n';

    if (mode === 'children' && treeRoot) {
        content += formatTree(treeRoot);
    } else {
        content += formatFlat(pages);
    }
    return content;
}

// Function: Triggers download of the .txt file
function downloadTxt(content, filename) {
    // Create blob
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    // Create temporary link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    // Cleanup
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Function: Updates the status and progress UI elements
function updateStatus(message) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

// Function: Updates the progress text
function updateProgress(message) {
    const progressEl = document.getElementById('progress');
    if (progressEl) {
        progressEl.textContent = message;
    }
}

// Function: Main extraction handler triggered by the Extract button
async function startExtraction() {
    // Get UI elements
    const startUrlEl = document.getElementById('startUrl');
    const depthEl = document.getElementById('depth');
    const pageLimitEl = document.getElementById('pageLimit');
    const outputModeEl = document.getElementById('outputMode');
    const extractBtn = document.getElementById('extractBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const outputEl = document.getElementById('output');

    // Read values
    const startInput = startUrlEl.value.trim();
    const maxDepth = parseInt(depthEl.value, 10) || 2;
    const maxPages = parseInt(pageLimitEl.value, 10) || 250;
    const mode = outputModeEl.value;

    // Validate input
    if (!startInput) {
        updateStatus('Please enter a starting Wikipedia page link or title.');
        return;
    }

    // Extract title
    const startTitle = extractTitleFromInput(startInput);
    if (!startTitle) {
        updateStatus('Could not determine page title from input.');
        return;
    }

    // Disable button during run
    extractBtn.disabled = true;
    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) {
        stopBtn.disabled = false;
    }
    downloadBtn.disabled = true;
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.disabled = true;
    }
    outputEl.textContent = '';
    updateStatus(`Starting extraction from: ${startTitle} | Depth: ${maxDepth} | Limit: ${maxPages}`);

    try {
        // Run the crawl
        const pages = await crawlWikipedia(startTitle, maxDepth, maxPages, updateProgress);

        // Format output based on mode
        let displayText = '';
        if (mode === 'children' && treeRoot) {
            displayText = formatTree(treeRoot);
        } else {
            displayText = formatFlat(pages);
        }

        // Show results
        outputEl.textContent = displayText;
        updateStatus(`Done. Collected ${pages.length} page(s).`);
        updateProgress('');
        downloadBtn.disabled = false;
        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) {
            copyBtn.disabled = false;
        }

        // Store mode for download
        downloadBtn.dataset.mode = mode;
    } catch (err) {
        updateStatus(`Error: ${err.message}`);
        outputEl.textContent = 'Extraction failed. See status for details.';
    } finally {
        extractBtn.disabled = false;
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) {
            stopBtn.disabled = true;
        }
    }
}

// Function: Copy output text to clipboard
async function handleCopy() {
    const outputEl = document.getElementById('output');
    const copyBtn = document.getElementById('copyBtn');
    if (!outputEl || !outputEl.textContent) {
        updateStatus('Nothing to copy.');
        return;
    }
    try {
        await navigator.clipboard.writeText(outputEl.textContent);
        updateStatus('Output copied to clipboard.');
        if (copyBtn) {
            const original = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = original; }, 1500);
        }
    } catch (err) {
        updateStatus('Copy failed. Select the text manually.');
    }
}
function handleStop() {
    abortExtraction = true;
    updateStatus('Stopping... will finish current request then halt.');
    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) {
        stopBtn.disabled = true;
    }
}

// Function: Download button handler
function handleDownload() {
    const downloadBtn = document.getElementById('downloadBtn');
    const mode = downloadBtn.dataset.mode || 'flat';
    if (collectedPages.length === 0) {
        updateStatus('No data to download.');
        return;
    }
    const content = generateTxtContent(collectedPages, mode);
    const startTitle = collectedPages[0] ? collectedPages[0].title.replace(/[^a-zA-Z0-9]/g, '_') : 'wiki';
    const filename = `wiki-extract-${startTitle}-${mode}.txt`;
    downloadTxt(content, filename);
    updateStatus(`Downloaded: ${filename}`);
}

// Event listeners setup after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Extract button click
    const extractBtn = document.getElementById('extractBtn');
    if (extractBtn) {
        extractBtn.addEventListener('click', startExtraction);
    }

    // Download button click
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', handleDownload);
    }

    // Stop button click
    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) {
        stopBtn.addEventListener('click', handleStop);
    }

    // Copy button click
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', handleCopy);
    }
});
