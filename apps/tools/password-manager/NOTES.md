# Password Manager (PW2)

An offline vault for logins, cards, notes and Wi-Fi networks. Everything you
store is encrypted on this device. Nothing is sent to a server.

## Crypto

- The whole vault (a JSON object of settings + entries + tombstones) is
  encrypted as one blob with **AES-GCM-256**.
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

## Vault format

- Vault JSON **version 2** (PW2). A v1 vault is migrated on first unlock and
  saved again. Migration adds `tags`, `fields`, `passwordChanged` and
  `tombstones`.
- Custom fields are `{id, name, value, hidden}`. Tags are a list of short
  labels. A delete writes a tombstone `{id, updated, deleted:true}` so a later
  merge does not bring the entry back (the last 200 tombstones are kept).

## There is no recovery

If the master password is forgotten, the vault cannot be unlocked. There is
no reset, no email and no back door. Keep an encrypted backup file somewhere
safe. The backup is still encrypted with the master password: the file alone
is not enough.

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

## What PW2 adds

- **Encrypted backup:** Settings → Export writes a `.pwvault` JSON file that
  wraps the same ciphertext. Import asks for the password the file was
  exported with (it can differ from the password on this device), then Merge
  or Replace. Merge is newest-wins per entry id. Replace needs a second
  confirm and only replaces entries (the master password on this device is
  unchanged).
- **CSV import:** Chrome, Firefox and Bitwarden exports. After import, delete
  the plaintext CSV — the app warns you. Bitwarden notes, cards, folders
  (as tags), favourites and TOTP strings are kept for PW3.
- **Health check:** flags weak or empty passwords (under ~40 bits), reused
  passwords, and passwords last changed more than a year ago.
- **Change master password:** re-encrypts the vault with a new salt and key.
  The previous header is stored as `prev` until the new header has been
  written and checked. If this is interrupted, either password still unlocks
  the vault: the new password finishes the change, the old one rolls it back.
- **Custom fields** (text or hidden) and **tags**, with a tag filter on the
  list and search across titles, usernames, websites, notes and tags.

## Limits

- The vault lives in this browser profile only. It does not sync yet (PW3).
- Health "old" uses `passwordChanged`. For entries migrated from PW1 that is
  the last time the whole entry was saved, which may be later than the last
  real password change.
- Clearing the clipboard can fail if the browser denies clipboard
  permission.
- Unlocking, creating a vault, or changing the master password can take a
  second or two on a 4 GB Celeron, because of the 310,000 PBKDF2 iterations.
  That is deliberate.
- CSV import does not read every vendor-specific column (for example 1Password
  or KeePass files). Only Chrome, Firefox and Bitwarden layouts are detected.
- Opening a login's website needs an `http:` or `https:` address.
- This is not a replacement for a system keychain or a full desktop
  password manager. Treat it as a private vault for this site, on this
  device.
