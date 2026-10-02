/**
 * =============================================================================
 * Project : pooh-chat
 * File    : modules/pooh-chat-qr.js
 * Purpose : Draw the host room QR from config colors and size.
 * Author  : pooh-chat refactor
 * Notes   : QRCode is a page global from qrcode.min.js.
 * =============================================================================
 */

import { POOH_CHAT_CONFIG as CFG } from "../pooh-chat-config.js";
import { qrcodeDiv } from "./pooh-chat-dom.js";

/**
 * Paint the host QR for the current pin. Clears any previous canvas.
 * @param {string} pin Room code encoded in the QR.
 */
export function renderQr(pin) {
    qrcodeDiv.innerHTML = "";
    const level = (typeof QRCode !== "undefined" && QRCode.CorrectLevel)
        ? QRCode.CorrectLevel[CFG.qr.correctLevel]
        : undefined;
    new QRCode(qrcodeDiv, {
        text: pin,
        width: CFG.qr.width,
        height: CFG.qr.height,
        colorDark: CFG.qr.colorDark,
        colorLight: CFG.qr.colorLight,
        correctLevel: level
    });
}
