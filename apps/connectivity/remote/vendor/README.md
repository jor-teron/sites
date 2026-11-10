<!-- Remote — vendor/README.md: third-party libraries used by the RM6 SSH terminal. -->
# Remote vendor files

Remote keeps its own copies of these libraries and loads them only from this folder. It does not import or link to the SSH or VNC apps at runtime.

| File | What | Version | Source | License |
|---|---|---|---|---|
| `xterm.min.js`, `xterm.css` | xterm.js terminal (`@xterm/xterm`) | 6.0.0 | prebuilt files copied into this folder (upstream npm `@xterm/xterm`) | MIT (`LICENSE-xterm.txt`) |
| `xterm-addon-fit.min.js` | fit addon (`@xterm/addon-fit`) | 0.11.0 | same, upstream npm `@xterm/addon-fit` | MIT (`LICENSE-xterm.txt`) |
| `ssh-lib.min.js` | `@microsoft/dev-tunnels-ssh` bundled for the browser, exposes `window.SSHLib` | 3.12.42 | a prebuilt browser bundle already in this repository, copied here | MIT (`LICENSE-dev-tunnels-ssh.txt`, deps in `THIRD_PARTY_NOTICES.txt`) |

`ssh-lib.min.js` uses Web Crypto in the browser (ECDH P-256/P-384, DH group14/16, AES-256-GCM/CTR, HMAC-SHA2 ETM, RSA-SHA2 / ECDSA host keys). Ed25519 host keys and curve25519 key exchange are not supported yet.

The Node-only branches of the SSH library (`crypto`, `net`, `os`, `path`, `stream`, `node-rsa`) are stubbed out of this bundle and are never taken in a browser. The bundle also adds the `pty-req` (`PtyReq`) and `window-change` (`WinCh`) channel requests the upstream library does not ship.
