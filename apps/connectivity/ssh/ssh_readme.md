# SSH

SSH terminal in the browser. S1: password login, terminal with resize, copy/paste, reconnect.
S3: saved hosts, saved known_hosts, keepalive, auto-reconnect.

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
  Trusted keys are saved (see Known hosts); the next connect with the same key asks nothing.
- Copy: select text (copies automatically), Ctrl+Shift+C or the Copy button.
  Paste: Ctrl+Shift+V, right-click, long-press on a phone, or the Paste button.
- Extra keys bar (Esc, Tab, Ctrl, arrows) for phones: keyboard button in the rail.
- On disconnect: Reconnect or Edit. After a drop or a remote exit Reconnect reuses the password
  (memory only). After Disconnect or Edit the password is cleared and Reconnect asks for it again.
- Connecting can be stopped with Cancel on the busy screen.

## S3

- **Saved hosts** (top of the form): name, user, host, port. Never a password.
  Tap a host to fill the form and focus the password; ✎ to edit or delete; "Save host" saves the
  current form (updates the entry with the same user/host/port). Last user/host/port is still kept
  as a last-used prefill and is not turned into a saved host unless you press Save host.
- **Known hosts:** trusted SHA256 fingerprints per host:port with key type, first and last seen.
  Same key: connect without asking. Different key (or key type): red "Host key changed!" warning,
  Cancel (default, Esc) or Replace key. Menu > Known hosts lists them, with Forget and Forget all.
- **Keepalive:** `keepalive@openssh.com` request every 30 s (library keepalive). Two missed answers
  in a row (about 60-90 s) = link dead, shown as "Connection lost: the server stopped answering".
- **Auto-reconnect:** after an unexpected drop only, waits 1, 2, 5, 10, 30 s (5 tries), reusing the
  password in memory; terminal keeps its scrollback with a `--- reconnected ---` marker.
  Cancel button stops it. No auto-reconnect after Disconnect, a remote exit (`exit`), or a login,
  host key or relay error.

## Storage (localStorage)

- `ssh-settings-v1`: theme, relay URL (global, not per host), text size, last user/host/port,
  `keepAliveSec` (optional, default 30, no UI; for tests).
- `ssh-hosts-v1`: saved hosts.
- `ssh-known-hosts-v1`: trusted host keys, keyed `host:port` (`[ipv6]:port`).
- The password is never saved.

## Files

`ssh.html` shell, `ssh.css`, `ssh_ui.js` (settings, theme, menu, dialog, toast),
`ssh_store.js` (saved hosts and known_hosts storage), `ssh_conn.js` (SSH over the relay, host key,
keepalive, errors), `ssh_term.js` (xterm, copy/paste, keys), `ssh_hosts.js` (saved hosts list,
host editor, known hosts panel), `ssh_app.js` (form, hash, states, reconnect, auto-reconnect). `vendor/` (see `vendor/README.md`), `relay/`.

## Change log

- **S1** (2026-10-22): password login, xterm terminal, copy/paste, extra keys, Reconnect.
- **S3** (2026-10-22): saved hosts, saved known_hosts with changed-key warning, keepalive,
  auto-reconnect with backoff and Cancel, Cancel while connecting, password cleared on Disconnect.
  - S3-F1 (S1-B4): a remote exit said "...disposed"; now "The remote shell ended." (with exit
    code or signal), and a dead session is reported as a lost connection.
  - S3-F2 (S1-B5): the 30 s login timeout is paused while the host key prompt is open.

## Next

S2: relay security. Later: key login (Ed25519 via Web Crypto), SFTP / port forwards.
