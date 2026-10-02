/**
 * =============================================================================
 * Project : pooh-chat
 * File    : modules/pooh-chat-dom.js
 * Purpose : Cached element refs used by the other modules.
 * Author  : pooh-chat refactor
 * Notes   : No logic. Import this instead of calling getElementById again.
 * =============================================================================
 */

/**
 * Home / host view root.
 */
export const homeView = document.getElementById("home-view");

/**
 * Join / scanner view root.
 */
export const joinView = document.getElementById("join-view");

/**
 * Chat view root.
 */
export const chatView = document.getElementById("chat-view");

/**
 * Large pin digits on the host card.
 */
export const displayPin = document.getElementById("display-pin");

/**
 * Element QRCode.js draws into.
 */
export const qrcodeDiv = document.getElementById("qrcode");

/**
 * Host status line under the QR.
 */
export const statusHost = document.getElementById("status-host");

/**
 * Join status line under the pin field.
 */
export const statusJoin = document.getElementById("status-join");

/**
 * Button that leaves host view and opens the scanner.
 */
export const btnSwitchJoin = document.getElementById("btn-switch-join");

/**
 * Button that returns from join view to the host QR.
 */
export const btnBackHome = document.getElementById("btn-back-home");

/**
 * Button that dials the typed pin.
 */
export const btnConnectPin = document.getElementById("btn-connect-pin");

/**
 * Manual 4-digit pin field.
 */
export const inputPin = document.getElementById("input-pin");

/**
 * Chat send form.
 */
export const chatForm = document.getElementById("chat-form");

/**
 * Chat text field.
 */
export const chatInput = document.getElementById("chat-input");

/**
 * Scrollable message list.
 */
export const messagesContainer = document.getElementById("messages-container");

/**
 * Leave-chat button.
 */
export const btnDisconnect = document.getElementById("btn-disconnect");

/**
 * Start or stop the camera scanner.
 */
export const btnToggleCamera = document.getElementById("btn-toggle-camera");

/**
 * Light / dark toggle in the header.
 */
export const btnTheme = document.getElementById("btn-theme");
