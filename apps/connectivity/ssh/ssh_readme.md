# SSH

SSH terminal in the browser. S1: password login, terminal with resize, copy/paste, reconnect.

- **Library:** Microsoft `dev-tunnels-ssh` 3.12.42 (MIT), bundled for the browser in
  `vendor/ssh-lib.min.js` (~330 KB, ~80 KB gzip). Uses Web Crypto: ECDH P-256/P-384 or DH group14/16,
  AES-256-GCM/CTR, RSA-SHA2 or ECDSA host keys. Works with stock OpenSSH servers.
  Not yet: curve25519 key exchange, Ed25519-only servers, chacha20-poly1305 (server must offer
  one of the above, which OpenSSH does by default).
- **Terminal:** xterm.js 6.0.0 + fit addon (MIT).
- **Relay:** websockify on your PC with a target allowlist, see `relay/README.md`.

## Use

- Fill in Relay, Host, Port, User, Password, then Connect (main button, bottom of the right rail).
- `ssh.html#host=user@host:22` prefills user, host and port and focuses the password
  (used by the Hub terminal `ssh` command).
- First connect to a host shows its key fingerprint (SHA256, like `ssh-keygen -lf`); Trust or Cancel.
  Accepted keys are remembered for this visit only (saved known_hosts: S2).
- Copy: select text (copies automatically), Ctrl+Shift+C or the Copy button.
  Paste: Ctrl+Shift+V, right-click, long-press on a phone, or the Paste button.
- Extra keys bar (Esc, Tab, Ctrl, arrows) for phones: keyboard button in the rail.
- On disconnect: Reconnect (same password, kept in memory only) or Edit.

Saved in localStorage `ssh-settings-v1`: theme, relay URL, text size, last user/host/port.
The password is never saved.

## Files

`ssh.html` shell, `ssh.css`, `ssh_ui.js` (settings, theme, menu, dialog, toast),
`ssh_conn.js` (SSH over the relay, host key, errors), `ssh_term.js` (xterm, copy/paste, keys),
`ssh_app.js` (form, hash, states, reconnect). `vendor/` (see `vendor/README.md`), `relay/`.

## Next

S2: saved hosts and known_hosts, key login (Ed25519 via Web Crypto), S3: SFTP / port forwards.
