/*
================================================================================
File: m3u-cleaner-parse.js
Project: m3u-cleaner
Description: M3U parsing and export for the Channel Cleaner.
Purpose: Keeps every original line of a channel (#EXTINF with all attributes
         such as tvg-logo/tvg-id, plus #EXTVLCOPT/#KODIPROP/other option lines)
         so the exported playlist is the source minus removed channels.
Author: Grok
Date: 2026-10-19 (R1)
================================================================================
*/

/**
 * Returns the channel name: text after the first comma outside quotes (the
 * #EXTINF separator), so commas inside group-title="..." and in names both work.
 * @param {string} line - Full #EXTINF line
 * @returns {string}
 */
export function extinfName(line) {
    let inQuote = false;
    let sep = -1;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') inQuote = !inQuote;
        else if (c === ',' && !inQuote) { sep = i; break; }
    }
    const name = sep >= 0 ? line.slice(sep + 1).trim() : '';
    return name || 'Unknown';
}

/**
 * Parses raw M3U text.
 * @param {string} text - Raw M3U content
 * @returns {{header: string, channels: Array<{name, group, url, lines: string[]}>}}
 *          lines = every original line of the entry except the URL, in order.
 */
export function parseM3U(text) {
    const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    let header = '';
    const channels = [];
    let pending = [];      // option lines seen before the next #EXTINF
    let current = null;    // entry being built (has its #EXTINF)

    for (const raw of rows) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('#EXTM3U')) {
            if (!header) header = line; // keep source header attributes verbatim
            continue;
        }
        if (line.startsWith('#EXTINF')) {
            const groupMatch = line.match(/group-title="([^"]*)"/i);
            current = {
                name: extinfName(line),
                group: groupMatch ? groupMatch[1] : '',
                url: '',
                lines: [...pending, line]
            };
            pending = [];
        } else if (line.startsWith('#')) {
            // #EXTVLCOPT, #KODIPROP, #EXTGRP, ... belong to the entry
            (current ? current.lines : pending).push(line);
        } else if (current) {
            current.url = line;
            channels.push(current);
            current = null;
        }
    }
    return { header: header || '#EXTM3U', channels };
}

/**
 * Builds M3U text from a header and channel entries (lines written verbatim).
 * @param {string} header - #EXTM3U line
 * @param {Array} channels - Entries from parseM3U
 * @returns {string}
 */
export function exportM3U(header, channels) {
    const out = [header || '#EXTM3U'];
    for (const ch of channels) {
        out.push(...ch.lines, ch.url);
    }
    return out.join('\n') + '\n';
}
