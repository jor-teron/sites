/**
 * =============================================================================
 * Project : pooh-chat
 * File    : pooh-chat.js
 * Purpose : Boot only. Imports modules, binds clicks, starts the host room.
 * Author  : pooh-chat refactor
 * Notes   : Loaded as type=module from pooh-chat.html. Must be served over HTTP.
 * =============================================================================
 */

import { POOH_CHAT_CONFIG as CFG } from "./pooh-chat-config.js";
import {
    btnSwitchJoin,
    btnBackHome,
    btnConnectPin,
    inputPin,
    btnToggleCamera,
    chatForm,
    btnDisconnect,
    btnTheme,
    statusJoin
} from "./modules/pooh-chat-dom.js";
import { applyTheme, loadTheme, toggleTheme } from "./modules/pooh-chat-theme.js";
import { showHomeView, showJoinView } from "./modules/pooh-chat-views.js";
import { startScanner, stopScanner, scannerIsRunning } from "./modules/pooh-chat-scanner.js";
import { initHost, ensureHost, connectToPin, resetApp, getConn } from "./modules/pooh-chat-peer.js";
import { sendChat } from "./modules/pooh-chat-chat.js";

/**
 * Fill the pin field when a scan succeeds, then dial.
 * @param {string} pin Scanned room code.
 */
function onScannedPin(pin) {
    inputPin.value = pin;
    connectToPin(pin);
}

/**
 * Bind buttons, form, and theme. Called once on load.
 */
function bindEvents() {
    btnSwitchJoin.addEventListener("click", function onSwitchJoin() {
        showJoinView(onScannedPin);
    });

    btnBackHome.addEventListener("click", function onBackHome() {
        showHomeView();
        ensureHost();
    });

    btnConnectPin.addEventListener("click", function onConnectClick() {
        connectToPin(inputPin.value.trim());
    });

    inputPin.addEventListener("keypress", function onPinKey(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            connectToPin(inputPin.value.trim());
        }
    });

    btnToggleCamera.addEventListener("click", function onToggleCamera() {
        if (scannerIsRunning()) {
            stopScanner();
            statusJoin.textContent = CFG.strings.cameraStopped;
        } else {
            startScanner(onScannedPin);
        }
    });

    chatForm.addEventListener("submit", function onSend(e) {
        e.preventDefault();
        sendChat(getConn);
    });

    btnDisconnect.addEventListener("click", function onLeave() {
        resetApp();
    });

    btnTheme.addEventListener("click", function onTheme() {
        toggleTheme();
    });
}

/**
 * Boot: theme, pin field length, host peer.
 */
function boot() {
    inputPin.maxLength = CFG.pinLength;
    applyTheme(loadTheme());
    bindEvents();
    initHost();
}

window.addEventListener("load", boot);
