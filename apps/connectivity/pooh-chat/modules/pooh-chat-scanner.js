/**
 * =============================================================================
 * Project : pooh-chat
 * File    : modules/pooh-chat-scanner.js
 * Purpose : Camera QR scan of a friend's 4-digit room pin.
 * Author  : pooh-chat refactor
 * Notes   : Html5Qrcode is a page global. Does not import views (no cycle).
 * =============================================================================
 */

import { POOH_CHAT_CONFIG as CFG } from "../pooh-chat-config.js";
import { statusJoin } from "./pooh-chat-dom.js";

/**
 * html5-qrcode instance while the join view is open.
 */
let html5QrCode = null;

/**
 * True while the camera scanner has started successfully.
 */
let isCameraRunning = false;

/**
 * Apply a status class string and text on the join status line.
 * @param {string} text Message.
 * @param {string} className Full class string from config.
 */
function setJoinStatus(text, className) {
    statusJoin.textContent = text;
    statusJoin.className = className;
}

/**
 * Start the camera scanner. Ignores a second start.
 * Tries the rear camera, then the front camera, then the first device.
 * A pin-length decode stops the camera and calls onPin.
 * @param {function(string): void} onPin Called with the scanned pin.
 */
export function startScanner(onPin) {
    if (isCameraRunning) {
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setJoinStatus(CFG.strings.cameraDenied, CFG.classes.statusJoinError);
        return;
    }

    setJoinStatus(CFG.strings.cameraAsking, CFG.classes.statusJoinWait);

    /**
     * Browser permission prompt. Must run before the scanner paints a dark frame.
     */
    navigator.mediaDevices.getUserMedia({ video: { facingMode: CFG.scanner.facingMode } })
        .then(function onGranted(stream) {
            stream.getTracks().forEach(function stopProbe(track) {
                track.stop();
            });
            openScanner(onPin);
        })
        .catch(function onProbeFail() {
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(function onGrantedAny(stream) {
                    stream.getTracks().forEach(function stopProbe(track) {
                        track.stop();
                    });
                    openScanner(onPin);
                })
                .catch(function onDenied(err) {
                    console.warn("Camera permission failed", err);
                    const detail = (err && err.message) ? err.message : CFG.strings.cameraDenied;
                    setJoinStatus(detail, CFG.classes.statusJoinError);
                });
        });
}

/**
 * Start html5-qrcode after permission is already granted.
 * @param {function(string): void} onPin Called with the scanned pin.
 */
function openScanner(onPin) {
    if (typeof Html5Qrcode === "undefined") {
        setJoinStatus(CFG.strings.cameraMissingLib, CFG.classes.statusJoinError);
        return;
    }

    const config = {
        fps: CFG.scanner.fps,
        qrbox: { width: CFG.scanner.qrboxWidth, height: CFG.scanner.qrboxHeight }
    };

    /**
     * Decode callback. Only a pin-length string is accepted.
     * @param {string} decodedText Raw QR text.
     */
    function onScan(decodedText) {
        const cleanPin = String(decodedText).trim();
        if (cleanPin.length === CFG.pinLength) {
            stopScanner();
            onPin(cleanPin);
        }
    }

    /**
     * Ignore frames with no code.
     */
    function onScanFrameError() {
        /* keep scanning */
    }

    /**
     * Mark the scanner running after a successful start.
     */
    function onCameraStarted() {
        isCameraRunning = true;
        statusJoin.textContent = "";
    }

    /**
     * Try the next camera constraint. A fresh scanner is built each attempt
     * because a failed start leaves the previous instance unusable.
     * @param {Array} attempts Camera configs or device id strings.
     * @param {number} index Current attempt.
     */
    function tryStart(attempts, index) {
        if (index >= attempts.length) {
            setJoinStatus(CFG.strings.cameraDenied, CFG.classes.statusJoinError);
            return;
        }
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start(attempts[index], config, onScan, onScanFrameError)
            .then(onCameraStarted)
            .catch(function onCameraFailed(err) {
                console.warn("Camera start failed", err);
                const detail = (err && err.message) ? err.message : String(err);
                setJoinStatus(detail, CFG.classes.statusJoinError);
                tryStart(attempts, index + 1);
            });
    }

    Html5Qrcode.getCameras().then(function onCameras(cameras) {
        const attempts = [
            { facingMode: CFG.scanner.facingMode },
            { facingMode: "user" }
        ];
        if (cameras && cameras.length) {
            attempts.push(cameras[0].id);
        }
        tryStart(attempts, 0);
    }).catch(function onListFailed(err) {
        console.warn("Camera list failed", err);
        tryStart([
            { facingMode: CFG.scanner.facingMode },
            { facingMode: "user" }
        ], 0);
    });
}

/**
 * Stop the camera if it is running. Safe to call when idle.
 */
export function stopScanner() {
    if (html5QrCode && isCameraRunning) {
        html5QrCode.stop().then(function onStopped() {
            isCameraRunning = false;
        }).catch(function onStopFail(err) {
            console.error(err);
        });
    }
}

/**
 * Whether the camera loop is active. Used by the toggle button.
 * @returns {boolean}
 */
export function scannerIsRunning() {
    return isCameraRunning;
}
