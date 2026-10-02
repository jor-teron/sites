/**
 * =============================================================================
 * Project : pooh-chat
 * File    : pooh-chat-config.js
 * Purpose : All magic values, UI strings, theme tokens, and Peer/QR settings.
 *           Logic files must read from POOH_CHAT_CONFIG instead of hardcoding.
 * Author  : pooh-chat refactor
 * Notes   : Imported by modules. Not a classic script tag.
 * =============================================================================
 */

/**
 * Application configuration object.
 * Peer prefix, pin rules, scanner, QR, theme class names, and copy.
 */
export const POOH_CHAT_CONFIG = {
    /**
     * PeerJS room id prefix. Full host id is prefix + 4-digit pin.
     */
    peerIdPrefix: "pooh_chat_",

    /**
     * Length of the room code shown on the host screen and typed by the joiner.
     */
    pinLength: 4,

    /**
     * Inclusive lower bound for a generated pin (1000 for 4 digits).
     */
    pinMin: 1000,

    /**
     * Exclusive span added to pinMin (9000 yields 1000–9999).
     */
    pinSpan: 9000,

    /**
     * Delay in ms before starting the camera after the join view is shown.
     */
    scannerStartDelayMs: 300,

    /**
     * Delay in ms before returning home after the remote peer closes.
     */
    disconnectResetDelayMs: 2000,

    /**
     * localStorage key for the saved theme name ("light" or "dark").
     */
    themeStorageKey: "pooh-chat-theme",

    /**
     * Default theme when nothing is stored.
     */
    defaultTheme: "light",

    /**
     * QR code drawing options passed to QRCode.js.
     */
    qr: {
        width: 240,
        height: 240,
        colorDark: "#78350f",
        colorLight: "#ffffff",
        /**
         * CorrectLevel name on QRCode.CorrectLevel. Resolved at runtime.
         */
        correctLevel: "H"
    },

    /**
     * html5-qrcode scanner options.
     */
    scanner: {
        fps: 10,
        qrboxWidth: 160,
        qrboxHeight: 160,
        facingMode: "environment"
    },

    /**
     * CSS class strings applied by the view switcher.
     */
    classes: {
        hidden: "hidden",
        statusReady: "text-xs font-semibold text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200 dark:text-green-200 dark:bg-green-900/40 dark:border-green-700",
        statusWait: "text-xs font-semibold text-amber-600 bg-amber-50 px-3 py-1 rounded-full dark:text-amber-200 dark:bg-stone-800",
        statusError: "text-xs font-semibold text-red-700 bg-red-50 px-3 py-1 rounded-full border border-red-200 dark:text-red-200 dark:bg-red-900/40 dark:border-red-700",
        statusJoinError: "text-xs font-semibold text-red-600 dark:text-red-300",
        statusJoinWait: "text-xs font-semibold text-amber-600 dark:text-amber-300"
    },

    /**
     * User-facing copy. Kept here so wording is not scattered in logic.
     */
    strings: {
        pinPlaceholder: "----",
        qrGenerating: "Generating QR...",
        connectingForest: "Connecting to signaling forest... 🌳",
        connectingNetwork: "Connecting to network...",
        readyWaiting: "Ready! Waiting for friend to scan... 🍯",
        pinCollisionRetry: "Room code taken. Trying another...",
        connectionErrorPrefix: "Connection error: ",
        invalidPin: "Please enter a valid 4-digit code.",
        connectingRoomPrefix: "Connecting to room ",
        connectingRoomSuffix: "...",
        couldNotConnect: "Could not connect to room. Check code.",
        peerNetworkError: "Peer network error.",
        cameraDenied: "Camera did not start. Allow camera, use HTTPS, or type the PIN.",
        cameraAsking: "Asking for camera...",
        cameraStopped: "Camera stopped.",
        cameraMissingLib: "Scanner library did not load. Check network, then retry.",
        connectedOpening: "Connected! Opening chat...",
        connectedSuccess: "Connected successfully! Opening chat...",
        secureEstablished: "Secure connection established with friend!",
        connectedToRoomPrefix: "Connected to room ",
        connectedToRoomSuffix: "!",
        friendLeft: "Friend left the chat.",
        friendDisconnected: "Friend disconnected.",
        chatWelcome: "You are connected. Say hello. 🐻",
        themeLightLabel: "Dark",
        themeDarkLabel: "Light"
    }
};
