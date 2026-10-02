/**
 * =============================================================================
 * Project : pooh-chat
 * File    : modules/pooh-chat-peer.js
 * Purpose : Host pin room, joiner dial, data-channel wiring, reset.
 * Author  : pooh-chat refactor
 * Notes   : Peer and conn stay in this module. PeerJS is a page global.
 * =============================================================================
 */

import { POOH_CHAT_CONFIG as CFG } from "../pooh-chat-config.js";
import { displayPin, statusHost, statusJoin } from "./pooh-chat-dom.js";
import { renderQr } from "./pooh-chat-qr.js";
import { showChatView, showHomeView } from "./pooh-chat-views.js";
import { appendMessage, appendSystemMessage, resetMessages } from "./pooh-chat-chat.js";

/**
 * Active PeerJS instance. Host uses a pinned id. Joiner uses a random id.
 */
let peer = null;

/**
 * Active PeerJS data connection to the other browser.
 */
let conn = null;

/**
 * Current host room pin. Empty until initHost runs.
 */
let myPin = "";

/**
 * Apply a status class string and text on a status element.
 * @param {HTMLElement} el Status node.
 * @param {string} text Message.
 * @param {string} className Full class string from config.
 */
function setStatus(el, text, className) {
    el.textContent = text;
    el.className = className;
}

/**
 * Build a numeric room pin from config bounds.
 * @returns {string} Pin of CFG.pinLength digits.
 */
function generatePin() {
    const n = Math.floor(CFG.pinMin + Math.random() * CFG.pinSpan);
    return String(n);
}

/**
 * Live connection for the chat send helper.
 * @returns {object|null}
 */
export function getConn() {
    return conn;
}

/**
 * Wire the data channel after a peer connects to this host.
 */
function setupConnection() {
    statusJoin.textContent = CFG.strings.connectedSuccess;
    statusHost.textContent = CFG.strings.connectedOpening;

    conn.on("open", function onConnOpen() {
        showChatView();
        appendSystemMessage(CFG.strings.secureEstablished);
    });

    conn.on("data", function onConnData(data) {
        appendMessage(String(data), "friend");
    });

    conn.on("close", function onConnClose() {
        appendSystemMessage(CFG.strings.friendLeft);
        setTimeout(resetApp, CFG.disconnectResetDelayMs);
    });
}

/**
 * Start as host: new pin, QR, Peer id prefix + pin.
 * Retries on unavailable-id by calling itself.
 */
export function initHost() {
    myPin = generatePin();
    displayPin.textContent = myPin;
    renderQr(myPin);
    setStatus(statusHost, CFG.strings.connectingNetwork, CFG.classes.statusWait);

    if (peer) {
        try { peer.destroy(); } catch (e) { /* already gone */ }
    }

    const peerId = CFG.peerIdPrefix + myPin;
    peer = new Peer(peerId);

    peer.on("open", function onHostOpen() {
        setStatus(statusHost, CFG.strings.readyWaiting, CFG.classes.statusReady);
    });

    peer.on("connection", function onIncoming(connection) {
        conn = connection;
        setupConnection();
    });

    peer.on("error", function onHostError(err) {
        console.error(err);
        if (err.type === "unavailable-id") {
            setStatus(statusHost, CFG.strings.pinCollisionRetry, CFG.classes.statusWait);
            initHost();
        } else {
            setStatus(statusHost, CFG.strings.connectionErrorPrefix + err.type, CFG.classes.statusError);
        }
    });
}

/**
 * Restart hosting only if the peer was destroyed or never opened.
 */
export function ensureHost() {
    if (!peer || peer.disconnected || peer.destroyed) {
        initHost();
    }
}

/**
 * Dial a friend's room pin as a joiner with a random Peer id.
 * @param {string} pin Four-digit code from QR or the input.
 */
export function connectToPin(pin) {
    if (!pin || pin.length !== CFG.pinLength) {
        setStatus(statusJoin, CFG.strings.invalidPin, CFG.classes.statusJoinError);
        return;
    }

    setStatus(
        statusJoin,
        CFG.strings.connectingRoomPrefix + pin + CFG.strings.connectingRoomSuffix,
        CFG.classes.statusJoinWait
    );

    if (peer) {
        try { peer.destroy(); } catch (e) { /* already gone */ }
    }

    peer = new Peer();

    peer.on("open", function onJoinerOpen() {
        const targetId = CFG.peerIdPrefix + pin;
        conn = peer.connect(targetId);

        conn.on("open", function onJoinOpen() {
            showChatView();
            appendSystemMessage(CFG.strings.connectedToRoomPrefix + pin + CFG.strings.connectedToRoomSuffix);
        });

        conn.on("data", function onJoinData(data) {
            appendMessage(String(data), "friend");
        });

        conn.on("close", function onJoinClose() {
            appendSystemMessage(CFG.strings.friendDisconnected);
            setTimeout(resetApp, CFG.disconnectResetDelayMs);
        });

        conn.on("error", function onJoinConnError(err) {
            console.error(err);
            setStatus(statusJoin, CFG.strings.couldNotConnect, CFG.classes.statusJoinError);
        });
    });

    peer.on("error", function onJoinerPeerError(err) {
        console.error(err);
        setStatus(statusJoin, CFG.strings.peerNetworkError, CFG.classes.statusJoinError);
    });
}

/**
 * Close the data channel and peer, clear chat, then mint a fresh host QR.
 */
export function resetApp() {
    if (conn) {
        try { conn.close(); } catch (e) { /* already closed */ }
    }
    if (peer) {
        try { peer.destroy(); } catch (e) { /* already destroyed */ }
    }
    conn = null;
    peer = null;
    resetMessages();
    showHomeView();
    initHost();
}
