# Password Manager (PW1)

An offline vault for logins, cards, notes and Wi-Fi networks. Everything you
store is encrypted on this device. Nothing is sent to a server.

## Crypto

- The whole vault (a JSON object of settings + entries) is encrypted as one
  blob with **AES-GCM-256**.
- The key is derived from the master password with **PBKDF2-SHA-256**,
  **310,000** iterations (the count is stored in the vault header so it can
  change later) and a random **16-byte salt**.
- Each save uses a new random **12-byte IV**.
- The header stored in IndexedDB (database `pwmanager`) is:

      { v: 1, kdf: "PBKDF2-SHA256", iter, salt, iv, ct }

  `salt`, `iv` and `ct` are Base64. An optional **hint** is stored next to the
  header in **plain text** — never put the password in it.
- The master password is checked by a successful GCM decrypt. There is no
  separate password hash.
- The AES key is **non-extractable**. The decrypted vault is held only in
  memory. After Lock, idle auto-lock, or a hidden-tab lock, the in-memory
  vault and key reference are wiped and the UI is cleared.
- Every change writes a new encrypted blob back to IndexedDB.

## There is no recovery

If the master password is forgotten, the vault cannot be unlocked. There is
no reset, no email and no back door. PW2 is planned to add an encrypted
backup file you can keep somewhere safe.

## What PW1 does

- First run: set a master password (at least 8 characters, with a strength
  meter and a confirm field).
- Unlock screen, with a growing delay after 5 wrong tries.
- Entries: Login, Card, Note, Wi-Fi. Search, favourites, add / edit / delete
  (with a confirm) and duplicate.
- A generator on password fields (length 8–64, character sets, avoid
  look-alikes, a simple entropy estimate).
- Copy, then try to clear the clipboard after 30 seconds (adjustable).
- Auto-lock after 1 / 5 / 15 / 30 minutes idle (default 5). Optional lock
  when the tab stays hidden. Lock now, or Ctrl+L.
- Theme: Auto / Light / Dark. Auto follows the Hub
  (`sites-hub.theme` / `sites-hub.themeAuto`).

## Limits

- The vault lives in this browser profile only. It does not sync (PW3).
- There is no import, export or backup file yet (PW2).
- Opening a login's website needs an `http:` or `https:` address.
- Clearing the clipboard can fail if the browser denies clipboard
  permission. If the value can be read and it is still the copied secret, it
  is cleared; if it cannot be read, the app writes an empty string.
- Unlocking can take a second or two on a 4 GB Celeron, because of the
  310,000 PBKDF2 iterations. That is deliberate.
- This is not a replacement for a system keychain or a full desktop
  password manager. Treat it as a private vault for this site, on this
  device.
