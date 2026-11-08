#!/usr/bin/env python3
"""Agent AG37: regenerate the app-local copies of Hub Builder 1's provider runtime in app/api/hub/.
Each copy = provenance header + one wrapper line + the upstream file BYTE-FOR-BYTE + one closing line.
The wrapper rebinds only `window` and `localStorage` to Agent's own namespace (HR.apiHost, app/api/host.js),
so the code never reads or writes the Hub's window.top.HubKeys / HubProviders / HubAPI or sites-hub.credentials.
Run from the repo root or anywhere:  python3 apps/lab/agent/app/api/vendor.py   (tests/ag37 checks alignment)."""
import hashlib, os, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../../../..'))
FILES = ['hub/core/hub_credentials.js', 'hub/core/hub_keys.js', 'hub/core/hub_providers.js', 'hub/core/hub_embeddings.js',
         'hub/core/hub_api.js', 'apps/system/api-keys/api-keys.js', 'apps/system/api-keys/api-keys.css']
OPEN = '(function (window, localStorage) {   /* AG37 wrapper: Agent namespace, not the Hub */\n'
CLOSE = '\n})(HR.apiHost.window, HR.apiHost.storage);\n'
MARK = '/* ---- upstream below, unchanged ---- */\n'
def commit(rel):
    try: return subprocess.check_output(['git', 'log', '-1', '--format=%h %s', '--', rel], cwd=ROOT, text=True).strip()
    except Exception: return 'unknown'
for rel in FILES:
    src = open(os.path.join(ROOT, rel), encoding='utf-8').read()
    sha = hashlib.sha256(src.encode('utf-8')).hexdigest()
    head = ('/* Agent AG37 app-local copy of ' + rel + ' (Hub Builder 1; upstream commit ' + commit(rel).replace('*/', '') + ').\n'
            '   upstream-sha256: ' + sha + '\n'
            '   Do not edit by hand: python3 apps/lab/agent/app/api/vendor.py. The Hub file itself is unchanged. */\n')
    js = rel.endswith('.js')
    out = head + (OPEN if js else '') + MARK + src + (CLOSE if js else '')
    open(os.path.join(HERE, 'hub', os.path.basename(rel)), 'w', encoding='utf-8').write(out)
    print('wrote', os.path.basename(rel), sha[:12])
