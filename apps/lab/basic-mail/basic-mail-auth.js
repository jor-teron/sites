/*
  File: basic-mail-auth.js
  Project: basic-mail
  Purpose: Google sign-in (GIS token client), token storage, expiry, and sign out.
  The access token lives in memory and in sessionStorage (this tab only) until Google's
  expiry (about 60 minutes). No refresh token, no client secret.
  On expiry or a 401 the token is wiped and Connect comes back.
*/

/* Access token from Google. Restored from this tab only, never a refresh token. */
var accessToken = "";

/* Time (ms) when the token stops being used. */
var tokenExp = 0;

/* Session key for the access token and its hard expiry. Dies with the tab. */
var TOKEN_KEY = "basic-mail-token";

/* Longest life of a stored token. Google expires it at about 60 minutes. */
var TOKEN_MS = 60 * 60 * 1000;

/* Google token client, created after the GIS script loads. */
var tokenClient = null;

/* Save the access token for this tab. Stop a minute before Google's own expiry. */
function storeToken(token, expiresIn) {
  var life = expiresIn ? Math.min(Number(expiresIn) * 1000, TOKEN_MS) : TOKEN_MS;
  accessToken = token;
  tokenExp = Date.now() + Math.max(life - 60 * 1000, 60 * 1000);
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: token, exp: tokenExp }));
  } catch (err) {
    /* Private mode may block storage. The token still works until reload. */
  }
}

/* Restore a token after refresh if it has not expired. */
function restoreToken() {
  try {
    var raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) {
      return false;
    }
    var saved = JSON.parse(raw);
    if (!saved.token || !saved.exp || saved.exp <= Date.now()) {
      sessionStorage.removeItem(TOKEN_KEY);
      return false;
    }
    accessToken = saved.token;
    tokenExp = saved.exp;
    return true;
  } catch (err) {
    return false;
  }
}

/* True when a usable token is held. */
function hasToken() {
  return !!accessToken && tokenExp > Date.now();
}

/* Forget the token everywhere in this tab. */
function clearToken() {
  accessToken = "";
  tokenExp = 0;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    /* Nothing stored. */
  }
}

/* Show or hide the controls that need a token. */
function markConnected(on) {
  document.getElementById("connect").hidden = !!on;
  document.getElementById("compose-open").hidden = !on;
  document.getElementById("sign-out").hidden = !on;
}

/* Token gone or rejected: wipe it, hide mail actions, ask for Connect. */
function expireSession() {
  clearToken();
  markConnected(false);
  setStatus("Session expired. Tap Connect.");
}

/* Start Google sign-in. Needs a client id and the GIS script. */
function connect() {
  var clientId = (window.BASIC_MAIL_CONFIG && BASIC_MAIL_CONFIG.clientId) || "";
  if (!clientId) {
    setStatus("Set clientId in basic-mail-config.js. Steps are in basic-mail.txt.");
    return;
  }
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    setStatus("Google sign-in script has not loaded. Check the network and reload.");
    return;
  }
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: BASIC_MAIL_CONFIG.scopes,
      callback: function (resp) {
        if (resp.error) {
          setStatus("Sign-in failed: " + (resp.error_description || resp.error));
          return;
        }
        storeToken(resp.access_token, resp.expires_in);
        markConnected(true);
        loadList();
      },
      error_callback: function (err) {
        setStatus("Sign-in closed: " + ((err && err.type) || "cancelled"));
      }
    });
  }
  tokenClient.requestAccessToken();
}

/* Sign out: revoke the token at Google, wipe it here, clear the screen. */
function signOut() {
  var token = accessToken;
  clearToken();
  markConnected(false);
  rows = [];
  closeCompose();
  closeRead();
  setStatus("Signed out.");
  if (token && window.google && google.accounts && google.accounts.oauth2) {
    try {
      google.accounts.oauth2.revoke(token, function () {});
    } catch (err) {
      /* Token is already gone from this tab; Google drops it within the hour. */
    }
  }
}
