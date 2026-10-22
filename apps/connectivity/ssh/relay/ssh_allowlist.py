"""websockify token plugin for the SSH app: only allow targets listed in allowlist.txt.

The SSH page connects to  ws://relay:8022/?token=HOST:PORT  and this plugin returns (HOST, PORT)
only when that target matches a line of the allowlist; anything else is refused.

allowlist.txt: one entry per line, '#' starts a comment.
    192.168.1.20:22      exact host and port
    raspberrypi.local    host, port 22
    192.168.1.*:22       shell-style wildcard on the host
The file is re-read on every connection, so edits apply without restarting the relay.
"""
import fnmatch
import logging
import re

from websockify.token_plugins import BasePlugin

log = logging.getLogger(__name__)
TOKEN = re.compile(r'^(?:\[([0-9A-Fa-f:.]+)\]|([A-Za-z0-9._-]+)):(\d{1,5})$')


def _entries(path):
    out = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.split('#', 1)[0].strip()
            if not line:
                continue
            m = re.match(r'^(\[[^\]]+\]|[^:]+)(?::(\d+|\*))?$', line)
            if m:
                out.append((m.group(1).strip('[]').lower(), m.group(2) or '22'))
    return out


class Allowlist(BasePlugin):
    def lookup(self, token):
        m = TOKEN.match((token or '').strip())
        if not m:
            log.warning('refused malformed target %r', token)
            return None
        host = (m.group(1) or m.group(2)).lower()
        port = m.group(3)
        try:
            entries = _entries(self.source)
        except OSError as e:
            log.error('cannot read allowlist %s: %s', self.source, e)
            return None
        for h, p in entries:
            if fnmatch.fnmatchcase(host, h) and (p == '*' or p == port):
                return host, int(port)
        log.warning('refused %s:%s (not in allowlist)', host, port)
        return None
