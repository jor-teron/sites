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
Only English Wikipedia (en.wikipedia.org, en.m.wikipedia.org, or a page title). Follows redirects.
Extracts only main body (explaintext). Skips non-article links. The tree lists fetched pages only.
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

// Function: Decodes a URL path segment without throwing on a stray or truncated %
function safeDecodeURIComponent(value) {
    try {
        return decodeURIComponent(value);
    } catch (e) {
        // Encode bare "%" so one bad escape does not reject the whole title
        const repaired = value.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
        try {
            return decodeURIComponent(repaired);
        } catch (e2) {
            return value;
        }
    }
}

// Function: Turns a /wiki/Title path or ?title= value into an API title
function titleFromRawSegment(raw) {
    if (!raw) {
        return '';
    }
    return raw.replace(/_/g, ' ').trim();
}

// Function: Extracts a page title from a plain title or an English Wikipedia URL.
// Returns { title, error }. Non-English and other hosts set error and an empty title.
function extractTitleFromInput(input) {
    const trimmed = input.trim();
    if (!trimmed) {
        return { title: '', error: 'Please enter a starting Wikipedia page link or title.' };
    }

    // Plain titles are not URLs; the API is already English Wikipedia
    if (!/^https?:\/\//i.test(trimmed)) {
        return { title: trimmed, error: null };
    }

    let url;
    try {
        url = new URL(trimmed);
    } catch (e) {
        return {
            title: '',
            error: 'That link is not a valid URL. Enter an en.wikipedia.org or en.m.wikipedia.org link, or a page title.'
        };
    }

    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (host !== 'en.wikipedia.org' && host !== 'en.m.wikipedia.org') {
        return {
            title: '',
            error: 'Only English Wikipedia links are supported. Use en.wikipedia.org or en.m.wikipedia.org, or enter a page title.'
        };
    }

    let rawTitle = '';
    const pathMatch = url.pathname.match(/\/wiki\/(.+)/);
    if (pathMatch) {
        rawTitle = safeDecodeURIComponent(pathMatch[1]);
    } else {
        // /w/index.php?title=Article and similar links
        try {
            rawTitle = url.searchParams.get('title') || '';
        } catch (e) {
            rawTitle = '';
        }
    }

    const title = titleFromRawSegment(rawTitle);
    if (!title) {
        return {
            title: '',
            error: 'Could not find a page title in that Wikipedia link. Use a /wiki/Title or ?title=Title link.'
        };
    }
    return { title: title, error: null };
}

// Function: Normalizes a title for API use (spaces to underscores, basic cleanup)
function normalizeTitle(title) {
    return title.trim().replace(/ /g, '_');
}

// Function: Parses an integer and clamps it. Blank or non-numeric values use fallback.
function clampInteger(value, fallback, min, max) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    if (parsed < min) {
        return min;
    }
    if (parsed > max) {
        return max;
    }
    return parsed;
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

// Function: Collects redirect source and target titles from a query response
function collectRedirectTitles(data) {
    const titles = [];
    const redirects = data && data.query && data.query.redirects;
    if (!Array.isArray(redirects)) {
        return titles;
    }
    for (const redirect of redirects) {
        if (!redirect) {
            continue;
        }
        if (redirect.from) {
            titles.push(redirect.from);
        }
        if (redirect.to) {
            titles.push(redirect.to);
        }
    }
    return titles;
}

// Function: Fetches main body extract and links for a single page title
async function fetchPageData(title) {
    // Build query parameters. redirects=1 resolves titles such as "AI".
    const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        origin: '*',
        redirects: '1',
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

    // MediaWiki reports parameter and query failures as HTTP 200 plus data.error
    if (!data || typeof data !== 'object') {
        throw new Error('Wikipedia API returned an unexpected response.');
    }
    if (data.error) {
        throw new Error(data.error.info || 'Wikipedia API error');
    }
    if (!data.query || !data.query.pages) {
        throw new Error('Wikipedia API returned no page data.');
    }

    // Extract the page object
    const pages = data.query.pages;
    const pageIds = Object.keys(pages);
    if (pageIds.length === 0) {
        throw new Error('Wikipedia API returned no page data.');
    }
    const pageId = pageIds[0];
    const page = pages[pageId];
    if (!page) {
        throw new Error('Wikipedia API returned no page data.');
    }

    const redirectTitles = collectRedirectTitles(data);

    // Handle missing or invalid pages
    if (page.missing || pageId === '-1') {
        return { title: page.title || title, text: '', links: [], error: 'Page not found', redirectTitles: redirectTitles };
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
        error: null,
        redirectTitles: redirectTitles
    };
}

// Function: Performs BFS crawl starting from the given title, up to maxDepth and maxPages
async function crawlWikipedia(startTitle, maxDepth, maxPages, onProgress) {
    // Reset abort flag
    abortExtraction = false;

    // Visited set to avoid queueing the same title twice
    const visited = new Set();

    // Canonical titles already stored. Redirect targets are added here so they are not fetched again.
    const fetched = new Set();

    // Queue for BFS: each item is { title, depth, parentNode }
    // parentNode is the already-fetched parent. Children are not attached until they are fetched.
    const queue = [];

    // Results array for flat list
    const results = [];

    treeRoot = null;

    // Enqueue starting page
    queue.push({ title: startTitle, depth: 0, parentNode: null });
    visited.add(normalizeTitle(startTitle));

    // Remember a resolved article and its redirect aliases so neither is requested again
    function markFetched(title) {
        if (!title) {
            return;
        }
        const norm = normalizeTitle(title);
        visited.add(norm);
        fetched.add(norm);
    }

    // Process queue
    while (queue.length > 0 && results.length < maxPages && !abortExtraction) {
        const current = queue.shift();
        const { title, depth, parentNode } = current;

        // A redirect from an earlier page already stored this article
        if (fetched.has(normalizeTitle(title))) {
            continue;
        }

        // Update progress
        if (onProgress) {
            onProgress(`Fetching: ${title} (depth ${depth}, collected ${results.length}/${maxPages})`);
        }

        // Fetch data
        let pageData;
        try {
            pageData = await fetchPageData(title);
        } catch (err) {
            pageData = { title: title, text: '', links: [], error: err.message, redirectTitles: [] };
        }

        const canonicalTitle = pageData.title || title;
        if (fetched.has(normalizeTitle(canonicalTitle))) {
            // This request followed a redirect onto an article we already have
            markFetched(canonicalTitle);
            for (const alias of pageData.redirectTitles || []) {
                markFetched(alias);
            }
            await sleep(REQUEST_DELAY_MS);
            continue;
        }

        markFetched(canonicalTitle);
        for (const alias of pageData.redirectTitles || []) {
            markFetched(alias);
        }

        // Only fetched pages are added to the tree. Queued links past the page limit are left out.
        const pageNode = {
            title: canonicalTitle,
            text: pageData.text,
            depth: depth,
            children: [],
            error: pageData.error
        };
        if (depth === 0) {
            treeRoot = pageNode;
        } else if (parentNode) {
            parentNode.children.push(pageNode);
        }

        // Add to flat results if we have content or at least the title
        results.push({
            title: canonicalTitle,
            text: pageData.text,
            depth: depth,
            error: pageData.error
        });

        // If we can go deeper and have links, enqueue children (do not attach them yet)
        if (depth < maxDepth && pageData.links && pageData.links.length > 0) {
            for (const linkTitle of pageData.links) {
                const norm = normalizeTitle(linkTitle);
                if (!visited.has(norm) && results.length + queue.length < maxPages * 2) {
                    // Soft limit on queue size to prevent explosion before hard limit
                    visited.add(norm);
                    queue.push({ title: linkTitle, depth: depth + 1, parentNode: pageNode });
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

    // Read values. Depth defaults to 1 (range 1-5); page limit defaults to 50 (range 1-500).
    const startInput = startUrlEl.value.trim();
    const maxDepth = clampInteger(depthEl.value, 1, 1, 5);
    const maxPages = clampInteger(pageLimitEl.value, 50, 1, 500);
    const mode = outputModeEl.value;
    depthEl.value = String(maxDepth);
    pageLimitEl.value = String(maxPages);

    // Validate input
    if (!startInput) {
        updateStatus('Please enter a starting Wikipedia page link or title.');
        return;
    }

    // Extract title. Unsupported hosts and unreadable links stop here.
    const parsedInput = extractTitleFromInput(startInput);
    if (parsedInput.error) {
        updateStatus(parsedInput.error);
        return;
    }
    const startTitle = parsedInput.title;

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
