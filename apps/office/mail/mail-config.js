/*
  File: mail-config.js
  Project: mail
  Purpose: Defaults for the personal Gmail client.
  theme: "dark" or "light". First paint if the browser has no saved choice.
  clientId: OAuth web client id — read from shared/google/google_config.js (webClientId), the one
    place it lives (the Hub's "Phone as a key" Google Drive sign-in uses the same client).
  Do not put a Gmail password or client secret in this file.
*/

/* Default appearance and Google OAuth client. */
var BASIC_MAIL_CONFIG = {
  /* First theme. "dark" or "light". */
  theme: "dark",
  /* Word in the top bar. */
  appName: "Mail",
  /* Web application client id (.apps.googleusercontent.com), from shared/google/google_config.js. */
  clientId: (window.GOOGLE_CONFIG && window.GOOGLE_CONFIG.webClientId) || "",
  /* Personal mail read, change, and send. Not for a public app. */
  scopes: "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send"
};
