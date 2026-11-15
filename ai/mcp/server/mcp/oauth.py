"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/oauth.py
Purpose:      Minimal OAuth 2.1 Authorization Server + Protected Resource
              Metadata (RFC 8414 / RFC 9728) so Gemini and other MCP clients
              can discover and authenticate with Authorization Code + PKCE.
Place:        mcp/oauth.py — called from http_modules/request.py for well-known,
              /authorize, /token and /register paths.
Version:      5.6
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+ standard library only (hashlib, hmac, secrets, time,
              urllib, json, html).

Notes:
- In-memory stores (codes, tokens, clients). Lost on restart.
- Public clients only (token_endpoint_auth_methods_supported includes "none").
- PKCE S256 is mandatory.
- Consent re-uses the existing PIN / users.csv check when a PIN is supplied
  on the authorize form or as a query parameter for testing.
- Gemini redirect URIs are allow-listed by prefix.
"""
from __future__ import annotations

import hashlib
import hmac
import html
import json
import secrets
import time
import urllib.parse
from typing import Any, Dict, Optional, Tuple

# =============================================================================
# Constants
# =============================================================================

# Lifetime of an authorization code in seconds (short-lived, single-use).
CODE_TTL = 300

# Lifetime of an access token in seconds.
ACCESS_TOKEN_TTL = 3600

# Lifetime of a refresh token in seconds.
REFRESH_TOKEN_TTL = 86400 * 30

# Prefixes accepted as redirect_uri for Gemini Connected Apps.
GEMINI_REDIRECT_PREFIXES = (
    "https://oauth-redirect.googleusercontent.com/",
    "https://oauth-redirect-sandbox.googleusercontent.com/",
    "https://oauth-redirect-test.googleusercontent.com/",
)

# In-memory stores. Not process-safe across restarts; fine for the facade.
_clients: Dict[str, Dict[str, Any]] = {}
_codes: Dict[str, Dict[str, Any]] = {}
_tokens: Dict[str, Dict[str, Any]] = {}
_refresh: Dict[str, Dict[str, Any]] = {}

# =============================================================================
# Pre-registered static client for Gemini Connected Apps UI
# =============================================================================
# Gemini's form often requires a Client ID and Client Secret even when PKCE
# is used. These fixed values can be pasted into the console. They are public
# to this installation; change them before any wider exposure.
STATIC_CLIENT_ID = "ai-mcp-gemini"
STATIC_CLIENT_SECRET = "ai-mcp-gemini-secret-0000"

# Seed the static client so it is always known.
_clients[STATIC_CLIENT_ID] = {
    "client_id": STATIC_CLIENT_ID,
    "client_secret": STATIC_CLIENT_SECRET,
    "client_name": "Gemini Connected Apps",
    "redirect_uris": list(GEMINI_REDIRECT_PREFIXES),
    "created": 0,
}


def _now() -> float:
    """Return the current monotonic-ish wall time for expiry checks.

    Returns:
        float: time.time() value.
    """
    return time.time()


def _b64url(data: bytes) -> str:
    """Return base64url encoding without padding (PKCE style).

    Args:
        data (bytes): Raw bytes to encode.

    Returns:
        str: Unpadded base64url string.
    """
    import base64
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _pkce_ok(verifier: str, challenge: str, method: str) -> bool:
    """Validate a PKCE code_verifier against the stored challenge.

    Only S256 is accepted. Comparison is constant-time.

    Args:
        verifier (str): code_verifier from the token request.
        challenge (str): code_challenge stored with the authorization code.
        method (str): Must be "S256".

    Returns:
        bool: True when the verifier matches the challenge.
    """
    if method != "S256" or not verifier or not challenge:
        return False
    try:
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        computed = _b64url(digest)
        return hmac.compare_digest(computed, challenge)
    except Exception:
        return False


def issuer_from_request(handler) -> str:
    """Build the issuer URL from the incoming request or config.

    Prefers cfg.public_url if present, otherwise Host header + scheme guess.

    Args:
        handler: The MCPHandler instance.

    Returns:
        str: Issuer base URL without trailing slash.
    """
    cfg = getattr(handler.server, "cfg", None)
    public = getattr(cfg, "public_url", None) if cfg else None
    if public:
        # Strip known funnel path so issuer is the host root.
        for suffix in ("/sandbox", "/mcp"):
            if public.endswith(suffix):
                public = public[: -len(suffix)]
                break
        return public.rstrip("/")
    host = handler.headers.get("Host") or "localhost"
    scheme = "https" if "tailscale" in host or "ts.net" in host else "http"
    return f"{scheme}://{host}"


def protected_resource_metadata(issuer: str) -> Dict[str, Any]:
    """Return RFC 9728 Protected Resource Metadata.

    Args:
        issuer (str): Authorization server issuer URL.

    Returns:
        dict: Metadata document.
    """
    return {
        "resource": issuer + "/sandbox",
        "authorization_servers": [issuer],
        "scopes_supported": ["mcp"],
        "bearer_methods_supported": ["header"],
    }


def authorization_server_metadata(issuer: str) -> Dict[str, Any]:
    """Return RFC 8414 Authorization Server Metadata.

    Args:
        issuer (str): Issuer URL.

    Returns:
        dict: Metadata document required by Gemini.
    """
    return {
        "issuer": issuer,
        "authorization_endpoint": issuer + "/authorize",
        "token_endpoint": issuer + "/token",
        "registration_endpoint": issuer + "/register",
        "revocation_endpoint": issuer + "/revoke",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": ["mcp"],
    }


def handle_well_known(handler, path: str) -> Optional[Tuple[int, str, str]]:
    """Serve OAuth discovery documents.

    Args:
        handler: MCPHandler.
        path (str): Cleaned request path.

    Returns:
        tuple | None: (status, body, content_type) or None if not a well-known path.
    """
    issuer = issuer_from_request(handler)
    cleaned = path.rstrip("/") or "/"
    if cleaned == "/.well-known/oauth-protected-resource":
        body = json.dumps(protected_resource_metadata(issuer))
        return 200, body, "application/json"
    if cleaned == "/.well-known/oauth-authorization-server":
        body = json.dumps(authorization_server_metadata(issuer))
        return 200, body, "application/json"
    return None


def handle_register(handler, body: bytes) -> Tuple[int, str]:
    """Dynamic Client Registration (RFC 7591) — minimal.

    Args:
        handler: MCPHandler.
        body (bytes): Raw POST body.

    Returns:
        tuple: (status, json_body).
    """
    try:
        data = json.loads(body.decode("utf-8") or "{}")
    except Exception:
        data = {}
    client_id = secrets.token_urlsafe(16)
    client = {
        "client_id": client_id,
        "client_name": data.get("client_name") or "mcp-client",
        "redirect_uris": data.get("redirect_uris") or [],
        "created": _now(),
    }
    _clients[client_id] = client
    return 201, json.dumps({
        "client_id": client_id,
        "client_name": client["client_name"],
        "redirect_uris": client["redirect_uris"],
    })


def _redirect_allowed(uri: str) -> bool:
    """Return True if the redirect_uri is on the Gemini allow-list.

    Args:
        uri (str): redirect_uri from the client.

    Returns:
        bool: True when the URI starts with a known Gemini prefix.
    """
    if not uri:
        return False
    return any(uri.startswith(p) for p in GEMINI_REDIRECT_PREFIXES)


def handle_authorize(handler, query: Dict[str, str]) -> Tuple[int, str, str, Optional[list]]:
    """Handle GET /authorize — show consent form or issue code.

    For the first version the form posts back to the same URL with a pin=
    field. When the PIN matches the configured PIN the code is issued.

    Args:
        handler: MCPHandler.
        query (dict): Parsed query parameters.

    Returns:
        tuple: (status, body, content_type, extra_headers).
    """
    client_id = query.get("client_id") or ""
    redirect_uri = query.get("redirect_uri") or ""
    code_challenge = query.get("code_challenge") or ""
    method = query.get("code_challenge_method") or "S256"
    state = query.get("state") or ""
    response_type = query.get("response_type") or "code"
    pin = query.get("pin") or ""

    if response_type != "code" or method != "S256" or not code_challenge:
        return 400, json.dumps({"error": "invalid_request"}), "application/json", None

    if not _redirect_allowed(redirect_uri):
        return 400, json.dumps({"error": "invalid_redirect_uri"}), "application/json", None

    # If no PIN yet, show a minimal consent form.
    if not pin:
        form = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ai-mcp authorize</title></head>
<body>
<h1>ai-mcp authorization</h1>
<p>Client: {html.escape(client_id or "(none)")}</p>
<form method="get" action="/authorize">
  <input type="hidden" name="response_type" value="code">
  <input type="hidden" name="client_id" value="{html.escape(client_id)}">
  <input type="hidden" name="redirect_uri" value="{html.escape(redirect_uri)}">
  <input type="hidden" name="code_challenge" value="{html.escape(code_challenge)}">
  <input type="hidden" name="code_challenge_method" value="S256">
  <input type="hidden" name="state" value="{html.escape(state)}">
  <label>PIN: <input type="password" name="pin" autofocus></label>
  <button type="submit">Allow</button>
</form>
</body></html>"""
        return 200, form, "text/html; charset=utf-8", None

    # Validate PIN against configured PIN (single-PIN path).
    expected = getattr(handler.server.cfg, "pin", None)
    from .auth import pins_match
    if not pins_match(pin, expected):
        return 401, json.dumps({"error": "invalid_pin"}), "application/json", None

    code = secrets.token_urlsafe(32)
    _codes[code] = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code_challenge": code_challenge,
        "code_challenge_method": method,
        "expires": _now() + CODE_TTL,
        "user": "pin",
    }
    loc = redirect_uri + ("&" if "?" in redirect_uri else "?") + urllib.parse.urlencode({
        "code": code,
        "state": state,
    })
    return 302, "", "text/plain", [("Location", loc)]


def handle_token(handler, body: bytes) -> Tuple[int, str]:
    """Handle POST /token — authorization_code or refresh_token.

    Args:
        handler: MCPHandler.
        body (bytes): Raw form or JSON body.

    Returns:
        tuple: (status, json_body).
    """
    ctype = (handler.headers.get("Content-Type") or "").lower()
    if "application/json" in ctype:
        try:
            data = json.loads(body.decode("utf-8") or "{}")
        except Exception:
            data = {}
    else:
        data = dict(urllib.parse.parse_qsl(body.decode("utf-8", errors="replace")))

    grant = data.get("grant_type") or ""
    # Optional client authentication. Public clients may omit the secret.
    client_id = data.get("client_id") or ""
    client_secret = data.get("client_secret") or ""
    if client_id and client_id in _clients:
        expected_secret = _clients[client_id].get("client_secret")
        if expected_secret and client_secret and not hmac.compare_digest(
            client_secret, expected_secret
        ):
            return 401, json.dumps({"error": "invalid_client"})

    if grant == "authorization_code":
        code = data.get("code") or ""
        verifier = data.get("code_verifier") or ""
        rec = _codes.pop(code, None)
        if not rec or rec["expires"] < _now():
            return 400, json.dumps({"error": "invalid_grant"})
        if not _pkce_ok(verifier, rec["code_challenge"], rec["code_challenge_method"]):
            return 400, json.dumps({"error": "invalid_grant"})
        access = secrets.token_urlsafe(32)
        refresh = secrets.token_urlsafe(32)
        _tokens[access] = {"expires": _now() + ACCESS_TOKEN_TTL, "user": rec["user"]}
        _refresh[refresh] = {"expires": _now() + REFRESH_TOKEN_TTL, "user": rec["user"]}
        return 200, json.dumps({
            "access_token": access,
            "token_type": "Bearer",
            "expires_in": ACCESS_TOKEN_TTL,
            "refresh_token": refresh,
            "scope": "mcp",
        })

    if grant == "refresh_token":
        rt = data.get("refresh_token") or ""
        rec = _refresh.get(rt)
        if not rec or rec["expires"] < _now():
            return 400, json.dumps({"error": "invalid_grant"})
        access = secrets.token_urlsafe(32)
        _tokens[access] = {"expires": _now() + ACCESS_TOKEN_TTL, "user": rec["user"]}
        # Do not rotate refresh token (Gemini persistent linking).
        return 200, json.dumps({
            "access_token": access,
            "token_type": "Bearer",
            "expires_in": ACCESS_TOKEN_TTL,
            "refresh_token": rt,
            "scope": "mcp",
        })

    return 400, json.dumps({"error": "unsupported_grant_type"})


def valid_access_token(token: str) -> bool:
    """Return True if the Bearer token is a known, unexpired access token.

    Args:
        token (str): The token string from the Authorization header.

    Returns:
        bool: True when the token is valid.
    """
    rec = _tokens.get(token)
    if not rec:
        return False
    if rec["expires"] < _now():
        _tokens.pop(token, None)
        return False
    return True


def resource_metadata_header(issuer: str) -> str:
    """Build the WWW-Authenticate value that advertises resource metadata.

    Args:
        issuer (str): Issuer base URL.

    Returns:
        str: Header value for WWW-Authenticate.
    """
    meta = issuer + "/.well-known/oauth-protected-resource"
    return f'Bearer realm="ai-mcp", resource_metadata="{meta}"'
