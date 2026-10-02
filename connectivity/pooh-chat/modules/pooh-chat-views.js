/**
 * =============================================================================
 * Project : pooh-chat
 * File    : modules/pooh-chat-views.js
 * Purpose : Show one of home, join, or chat. Stops the camera when leaving join.
 * Author  : pooh-chat refactor
 * Notes   : Does not start the peer. Boot decides when to call ensureHost.
 * =============================================================================
 */

import { POOH_CHAT_CONFIG as CFG } from "../pooh-chat-config.js";
import { homeView, joinView, chatView } from "./pooh-chat-dom.js";
import { stopScanner, startScanner } from "./pooh-chat-scanner.js";

/**
 * Show the host card and release the camera.
 */
export function showHomeView() {
    stopScanner();
    homeView.classList.remove(CFG.classes.hidden);
    joinView.classList.add(CFG.classes.hidden);
    chatView.classList.add(CFG.classes.hidden);
}

/**
 * Show the join card and start the camera after the view is visible.
 * @param {function(string): void} onPin Called when a pin-length code is scanned.
 */
export function showJoinView(onPin) {
    homeView.classList.add(CFG.classes.hidden);
    joinView.classList.remove(CFG.classes.hidden);
    chatView.classList.add(CFG.classes.hidden);
    setTimeout(function startAfterPaint() {
        startScanner(onPin);
    }, CFG.scannerStartDelayMs);
}

/**
 * Show the chat card and release the camera.
 */
export function showChatView() {
    stopScanner();
    homeView.classList.add(CFG.classes.hidden);
    joinView.classList.add(CFG.classes.hidden);
    chatView.classList.remove(CFG.classes.hidden);
}
