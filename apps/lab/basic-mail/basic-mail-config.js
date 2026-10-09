/*
  File: basic-mail-config.js
  Project: basic-mail
  Purpose: Defaults for the personal Gmail client.
  theme: "dark" or "light". First paint if the browser has no saved choice.
  clientId: OAuth client id from Google Cloud. Empty until you paste yours.
  Do not put a Gmail password or client secret in this file.
*/

/* Default appearance and Google OAuth client. */
var BASIC_MAIL_CONFIG = {
  /* First theme. "dark" or "light". */
  theme: "dark",
  /* Word in the top bar. */
  appName: "Mail",
  /* Web application client id. Ends with .apps.googleusercontent.com */
  clientId: "783291801077-33g5j2khvo9b42cs8g9jdlna792jppcf.apps.googleusercontent.com",
  /* Personal mail read, change, and send. Not for a public app. */
  scopes: "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send"
};
