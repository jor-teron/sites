/**
 * =============================================================================
 * Project : pooh-chat
 * File    : modules/pooh-chat-chat.js
 * Purpose : Message list bubbles and the send handler.
 * Author  : pooh-chat refactor
 * Notes   : Text is set with textContent. Send uses the live connection getter.
 * =============================================================================
 */

import { POOH_CHAT_CONFIG as CFG } from "../pooh-chat-config.js";
import { messagesContainer, chatInput } from "./pooh-chat-dom.js";

/**
 * Append one chat bubble.
 * @param {string} text Message body.
 * @param {string} sender "me" or "friend".
 */
export function appendMessage(text, sender) {
    const div = document.createElement("div");
    div.className = "flex " + (sender === "me" ? "justify-end" : "justify-start") + " my-1";
    const bubble = document.createElement("div");
    bubble.className = "max-w-[75%] px-4 py-2 rounded-2xl text-sm " + (
        sender === "me"
            ? "bg-amber-500 text-white rounded-br-none"
            : "bubble-friend bg-white border border-amber-200 text-amber-900 rounded-bl-none shadow-sm"
    );
    bubble.textContent = text;
    div.appendChild(bubble);
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Append a centered system pill.
 * @param {string} text System line.
 */
export function appendSystemMessage(text) {
    const div = document.createElement("div");
    div.className = "text-center my-2";
    const span = document.createElement("span");
    span.className = "bubble-system bg-amber-200/60 text-amber-800 text-xs px-3 py-1 rounded-full font-semibold";
    span.textContent = text;
    div.appendChild(span);
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Clear the list and put the welcome line back.
 */
export function resetMessages() {
    messagesContainer.innerHTML = "";
    appendSystemMessage(CFG.strings.chatWelcome);
}

/**
 * Send the input value on the active data channel and echo it locally.
 * @param {function(): object|null} getConn Returns the live PeerJS connection.
 */
export function sendChat(getConn) {
    const text = chatInput.value.trim();
    const conn = getConn();
    if (!text || !conn) {
        return;
    }
    conn.send(text);
    appendMessage(text, "me");
    chatInput.value = "";
}
