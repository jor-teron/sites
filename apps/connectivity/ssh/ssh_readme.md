# SSH

SSH terminal in the browser. S1: password login, terminal with resize, copy/paste, reconnect.
S3: saved hosts, saved known_hosts, keepalive, auto-reconnect.
S4: public-key login (ECDSA, RSA), key generate and export, keys saved encrypted on the device.

- **Library:** Microsoft `dev-tunnels-ssh` 3.12.42 (MIT), bundled for the browser in
  `vendor/ssh-lib.min.js` (~330 KB, ~80 KB gzip). Uses Web Crypto: ECDH P-256/P-384 or DH group14/16,
  AES-256-GCM/CTR, RSA-SHA2 or ECDSA host keys. Works with stock OpenSSH servers.
  Not yet: curve25519 key exchange, Ed25519 host or user keys, chacha20-poly1305 (server must offer
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

## S4: key login

- **Menu > SSH keys:** list of keys with Public key, Export, Lock, Remember…, Forget.
  Import (paste or file picker) or Generate.
- **Import:** private keys in OpenSSH format (`BEGIN OPENSSH PRIVATE KEY`) or PEM
  (`BEGIN PRIVATE KEY` PKCS#8, `BEGIN ENCRYPTED PRIVATE KEY`, `BEGIN RSA PRIVATE KEY`, `BEGIN EC PRIVATE KEY`).
  Types: ECDSA P-256, P-384, RSA. Keys with a passphrase:
  - OpenSSH: bcrypt-pbkdf + aes128/256-ctr, -cbc or aes-gcm@openssh.com (the `ssh-keygen` default is aes256-ctr);
  - PKCS#8: PBES2 (PBKDF2 + AES-CBC).
  Wrong passphrase: "Wrong passphrase for this key."
- **Generate:** ECDSA P-256 in the browser. It shows the public line
  `ecdsa-sha2-nistp256 AAAA… comment` with Copy, for `~/.ssh/authorized_keys` on the server.
  Export downloads the private key in OpenSSH format, optionally with a passphrase
  (bcrypt-pbkdf + aes256-ctr, readable by `ssh` / `ssh-keygen`).
- **Storage:** by default a key lives in memory only, for this visit (gone on reload).
  "Remember key on this device" saves it in IndexedDB encrypted with a device passphrase
  (PBKDF2-SHA256 600 000 rounds + AES-256-GCM, Web Crypto). Plaintext is never stored.
  After a reload a remembered key is locked; the first connect that needs it asks the passphrase
  ("Unlock key"). An unlocked key stays in memory until Lock, Forget or reload (Disconnect does not lock it).
  Forget deletes it from the device.
- **Login:** the form and each saved host have "Login with": Password or a key. With a key the
  key is tried first. If the server refuses it, the typed password is used, or a password prompt
  appears (Cancel = "Login cancelled."). If the key is missing on this device or still locked
  (on auto-reconnect), the password is used instead.
  Auto-reconnect works with key login, with no prompt.
- **Ed25519** (S4-F1): an Ed25519 key on import, or an Ed25519-only server, gets a clear message
  ("Ed25519 … not supported yet … use an ECDSA or RSA key") instead of a raw library error.
- **Not supported:** Ed25519 (user and host keys), ECDSA P-521, DSA, security keys (`sk-…`/FIDO),
  certificates, keyboard-interactive / 2FA, legacy encrypted PEM (`Proc-Type: 4,ENCRYPTED`;
  convert with `ssh-keygen -p -f key`), aes192 keys in Chrome (no AES-192 in Web Crypto), PuTTY `.ppk`
  and ssh.com keys, files with more than one key. RSA signs with rsa-sha2-512 only (no SHA-1 `ssh-rsa`).

## Storage (localStorage)

- `ssh-settings-v1`: theme, relay URL (global, not per host), text size, last user/host/port,
  `keepAliveSec` (optional, default 30, no UI; for tests).
- `ssh-hosts-v1`: saved hosts; optional `key` = SHA256 fingerprint of the key to log in with (S4).
- `ssh-known-hosts-v1`: trusted host keys, keyed `host:port` (`[ipv6]:port`).
- IndexedDB `ssh-keys-v1`, store `keys` (S4): remembered keys only, `{id, name, alg, fp, pub, created, box}`;
  `box` = salt, iv, PBKDF2 rounds and the AES-GCM ciphertext of the private key. No plaintext key.
- The password and the device passphrase are never saved.

## Files

`ssh.html` shell, `ssh.css`, `ssh_ui.js` (settings, theme, menu, dialog, toast),
`ssh_store.js` (saved hosts and known_hosts storage), `ssh_conn.js` (SSH over the relay, host key,
keepalive, key/password auth, errors), `ssh_keys.js` (key parse, generate, OpenSSH export, seal; no DOM),
`ssh_keyring.js` (keys in memory and IndexedDB, lock/unlock, library key), `ssh_keyui.js` (SSH keys panel,
import/generate, public key and export, unlock prompt), `ssh_term.js` (xterm, copy/paste, keys), `ssh_hosts.js` (saved hosts list,
host editor, known hosts panel), `ssh_app.js` (form, hash, states, reconnect, auto-reconnect). `vendor/` (see `vendor/README.md`), `relay/`.

## Change log

- **S1** (2026-10-22): password login, xterm terminal, copy/paste, extra keys, Reconnect.
- **S3** (2026-10-22): saved hosts, saved known_hosts with changed-key warning, keepalive,
  auto-reconnect with backoff and Cancel, Cancel while connecting, password cleared on Disconnect.
  - S3-F1 (S1-B4): a remote exit said "...disposed"; now "The remote shell ended." (with exit
    code or signal), and a dead session is reported as a lost connection.
  - S3-F2 (S1-B5): the 30 s login timeout is paused while the host key prompt is open.
- **S4** (2026-10-22, About 1.4): public-key login (ECDSA P-256/384, RSA), import by paste or file
  with passphrase support, Generate ECDSA P-256 with public line and OpenSSH export, optional
  encrypted key storage on the device, Login with per saved host, key first then password fallback.
  - S4-F1 (S1-B7): Ed25519 host or user key: clear "not supported, use ECDSA or RSA" message.
  - S4-F2: keepalive starts only after login (it was sent before authentication, and some servers
    drop that, e.g. while a password or host key prompt was open).
  - S4-F3: RSA key login failed on servers: the library put `rsa-sha2-512` as the key type inside the
    public key; the app now sends it as `ssh-rsa` (RFC 8332). Worked around in `ssh_keyring.js`, no vendor change.

## Next

S2: relay security. Later: Ed25519 (host and user keys, needs a library update), SFTP / port forwards.
