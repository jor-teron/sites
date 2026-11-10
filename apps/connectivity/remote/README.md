<!-- Remote — README.md: how to use the RM1 connections list. -->
# Remote (RM1)

One saved-connections list for SSH, VNC, SFTP and FTP. This release is the list only: add, edit, delete, duplicate, search, groups, and export or import JSON. No passwords are stored.

Tapping a row is honest about what is not ready yet:

- SSH and VNC: `viewer coming in a later RM release`
- SFTP: `coming in RM2`
- FTP: `coming in RM4`

Remote is standalone. It does not open the old SSH or VNC apps, and it does not import their saved hosts. Later releases will add Remote's own viewers and a file browser, with their own `vendor/` copies.

The protocol picker defaults to SFTP. Changing the protocol fills in port 22, 5900, 22 or 21 unless you already edited the port.

The optional relay field accepts `ws://` and `wss://`. A bare host becomes `wss://` on https pages and `ws://` on http pages. An https page warns if you enter `ws://`.

Connections are stored in this browser only, under localStorage key `remote-conns-v1`.
