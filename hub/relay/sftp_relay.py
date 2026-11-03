#!/usr/bin/env python3
"""
SFTP relay for the Hub Files app (hub/relay/sftp_relay.py), H119. Python 3.8+.
Needs:  pip install paramiko websockets        (paramiko = SSH/SFTP, websockets = the browser side)

A web page cannot open SSH, so Files (shared/fs/sftp_fs.js) talks JSON over a WebSocket to this
relay, and the relay does SFTP for it:

    browser (Files) --ws/wss JSON--> sftp_relay.py on your PC :8023 --ssh/sftp--> server :22

Unlike the SSH app relay (websockify, apps/connectivity/ssh/relay/), this relay DOES see the SFTP
password and the file data, so run it only on your own PC / Pi and only on your LAN or a VPN.

Run:   python3 hub/relay/sftp_relay.py                 (0.0.0.0:8023, prints the token)
       python3 hub/relay/sftp_relay.py --host 100.x.y.z --port 8023 --token mysecret
Options: --allowlist FILE (default: the SSH app's apps/connectivity/ssh/relay/allowlist.txt, same
format: host:port | host (= 22) | wildcard host), --cert/--key (wss://; default cert.pem + key.pem
next to this script or next to the SSH relay), --max-mb N (largest file read/write, default 100),
--origin URL (only this page origin may connect; repeatable), --no-token (LAN tests only).

Security
  * token: every connection must send it first. --token, env HUB_SFTP_TOKEN, else sftp_token.txt
    next to this script (made with a random value on the first run; it is in .gitignore).
  * allowlist: the SFTP target host:port must be listed (re-read on every connection).
  * host keys: trust on first use, saved in sftp_known_hosts next to this script; a changed key is
    refused ("hostkey") until you delete its line there.
  * paths: names may not contain '/' or be '.' / '..'; everything is under the account's folder.

Protocol (one WebSocket = one SSH login; requests are answered in order)
  1. client → {"op":"open","token":"…","host":"h","port":22,"user":"u","pass":"p","root":"opt/folder"}
     relay  → {"id":0,"ok":true,"root":"/home/u/opt/folder","max":<largest file in bytes>}   or {"id":0,"ok":false,"code":…,"error":…}
  2. client → {"id":n,"op":…,"path":["a","b"], …}        relay → {"id":n,"ok":true, …}
     list   → "entries":[{"name","isDir","size","mtime"(ms)}]     stat → "isDir","size","mtime"
     read   → JSON {"id","ok":true,"size"} then ONE binary frame with the bytes
     write  → client sends {"id","op":"write","path","size"} then ONE binary frame; relay → {"id","ok"}
     mkdir  → creates path            rename → "to":["c","d"] (fails if it exists: code "exists")
     delete → "recursive":true for a folder with contents             ping → {}
  Error codes: token, allow, reach, auth, hostkey, notfound, denied, exists, toobig, bad, failed.
"""
import argparse, asyncio, errno, fnmatch, hmac, json, logging, os, posixpath, re, secrets, socket, ssl, stat, sys

try:
    import paramiko
    import websockets
except ImportError as e:   # pragma: no cover
    sys.exit('Missing module %s. Install with:  pip install paramiko websockets' % e.name)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SSH_RELAY = os.path.join(ROOT, 'apps', 'connectivity', 'ssh', 'relay')
log = logging.getLogger('sftp_relay')


class Fail(Exception):
    def __init__(self, code, msg):
        super().__init__(msg)
        self.code = code


# ---------- allowlist (same format as apps/connectivity/ssh/relay/allowlist.txt) ----------
def allowed(path, host, port):
    try:
        with open(path, encoding='utf-8') as f:
            lines = f.read().splitlines()
    except OSError as e:
        log.error('cannot read allowlist %s: %s', path, e)
        return False
    host = host.lower()
    for line in lines:
        line = line.split('#', 1)[0].strip()
        m = re.match(r'^(\[[^\]]+\]|[^:]+)(?::(\d+|\*))?$', line) if line else None
        if not m:
            continue
        h, p = m.group(1).strip('[]').lower(), m.group(2) or '22'
        if fnmatch.fnmatchcase(host, h) and (p == '*' or p == str(port)):
            return True
    return False


# ---------- host keys: trust on first use ----------
class Tofu(paramiko.MissingHostKeyPolicy):
    def __init__(self, path):
        self.path = path

    def missing_host_key(self, client, hostname, key):
        log.warning('new host key for %s (%s), trusted and saved', hostname, key.get_name())
        hk = paramiko.HostKeys()
        try:
            hk.load(self.path)
        except (OSError, IOError):
            pass
        hk.add(hostname, key.get_name(), key)
        hk.save(self.path)


def ssh_open(a, cfg):
    host = str(a.get('host') or '').strip()
    try:
        port = int(a.get('port') or 22)
    except (TypeError, ValueError):
        raise Fail('bad', 'bad port')
    if not host or not re.match(r'^[A-Za-z0-9._:\[\]-]+$', host) or not 0 < port < 65536:
        raise Fail('bad', 'bad host')
    if not allowed(cfg.allowlist, host.strip('[]'), port):
        log.warning('refused %s:%s (not in allowlist)', host, port)
        raise Fail('allow', '%s:%s is not in the relay allowlist (%s)' % (host, port, cfg.allowlist))
    c = paramiko.SSHClient()
    try:
        c.load_host_keys(cfg.known)
    except (OSError, IOError):
        pass
    c.set_missing_host_key_policy(Tofu(cfg.known))
    try:
        c.connect(host.strip('[]'), port=port, username=str(a.get('user') or ''), password=str(a.get('pass') or ''),
                  timeout=15, banner_timeout=15, auth_timeout=20, allow_agent=False, look_for_keys=False)
    except paramiko.BadHostKeyException:
        raise Fail('hostkey', 'the server host key changed; if that is expected remove its line from %s' % cfg.known)
    except paramiko.AuthenticationException:
        raise Fail('auth', 'wrong user or password')
    except (socket.error, socket.timeout, paramiko.SSHException, OSError) as e:
        raise Fail('reach', 'can\u2019t reach %s:%s (%s)' % (host, port, e))
    try:
        try:
            s = c.open_sftp()
        except Exception as e:
            raise Fail('failed', 'the server has no SFTP (%s)' % e)
        want = str(a.get('root') or '').replace('\\', '/')
        parts = [p for p in want.split('/') if p not in ('', '.')]
        if '..' in parts:
            raise Fail('bad', 'bad folder')
        root = '/' + '/'.join(parts) if want.startswith('/') else posixpath.join(s.normalize('.'), *parts)
        try:
            isdir = stat.S_ISDIR(s.stat(root).st_mode)
        except IOError:
            raise Fail('notfound', 'folder %s not found' % root)
        if not isdir:
            raise Fail('notfound', '%s is not a folder' % root)
    except Fail:
        c.close()
        raise
    return c, s, root


def full(root, parts):
    if not isinstance(parts, list):
        raise Fail('bad', 'path must be a list of names')
    for p in parts:
        if not isinstance(p, str) or not p or p in ('.', '..') or '/' in p or '\0' in p:
            raise Fail('bad', 'bad name %r' % (p,))
    return posixpath.join(root, *parts) if parts else root


def io_fail(e, what):
    n = getattr(e, 'errno', None)
    if n == errno.ENOENT or isinstance(e, FileNotFoundError):
        return Fail('notfound', '%s not found' % what)
    if n in (errno.EACCES, errno.EPERM) or isinstance(e, PermissionError):
        return Fail('denied', 'permission denied: %s' % what)
    return Fail('failed', '%s: %s' % (what, e))


def rm_tree(s, p):
    for a in s.listdir_attr(p):
        q = posixpath.join(p, a.filename)
        if stat.S_ISDIR(a.st_mode or 0):
            rm_tree(s, q)
        else:
            s.remove(q)
    s.rmdir(p)


def entry(a):
    return {'name': a.filename, 'isDir': stat.S_ISDIR(a.st_mode or 0), 'size': a.st_size or 0, 'mtime': int((a.st_mtime or 0) * 1000)}


def do_op(s, root, m, data, cfg):
    """Blocking SFTP work (runs in a thread). → (reply dict, bytes | None)"""
    op = m.get('op')
    if op == 'ping':
        return {}, None
    p = full(root, m.get('path') or [])
    what = '/'.join(m.get('path') or []) or 'the folder'
    try:
        if op == 'list':
            return {'entries': [entry(a) for a in s.listdir_attr(p) if a.filename not in ('.', '..')]}, None
        if op == 'stat':
            a = s.stat(p)
            return {'isDir': stat.S_ISDIR(a.st_mode or 0), 'size': a.st_size or 0, 'mtime': int((a.st_mtime or 0) * 1000)}, None
        if op == 'read':
            a = s.stat(p)
            if stat.S_ISDIR(a.st_mode or 0):
                raise Fail('bad', '%s is a folder' % what)
            if (a.st_size or 0) > cfg.max_bytes:
                raise Fail('toobig', '%s is larger than the relay limit (%d MB)' % (what, cfg.max_mb))
            with s.open(p, 'rb') as f:
                f.prefetch(a.st_size)
                b = f.read()
            return {'size': len(b)}, b
        if op == 'write':
            with s.open(p, 'wb') as f:
                f.set_pipelined(True)
                f.write(data or b'')
            return {}, None
        if op == 'mkdir':
            s.mkdir(p)
            return {}, None
        if op == 'rename':
            to = full(root, m.get('to') or [])
            try:
                s.stat(to)
                raise Fail('exists', '%s already exists' % '/'.join(m.get('to')))
            except IOError:
                pass
            s.rename(p, to)
            return {}, None
        if op == 'delete':
            a = s.stat(p)
            if stat.S_ISDIR(a.st_mode or 0):
                rm_tree(s, p) if m.get('recursive') else s.rmdir(p)
            else:
                s.remove(p)
            return {}, None
    except Fail:
        raise
    except (IOError, OSError) as e:
        raise io_fail(e, what)
    raise Fail('bad', 'unknown op %r' % (op,))


async def session(ws, cfg):
    peer = getattr(ws, 'remote_address', None)
    c = s = None
    try:
        try:
            first = json.loads(await asyncio.wait_for(ws.recv(), 20))
        except Exception:
            return
        if not isinstance(first, dict) or first.get('op') != 'open':
            await ws.send(json.dumps({'id': 0, 'ok': False, 'code': 'bad', 'error': 'first message must be open'}))
            return
        if cfg.token and not hmac.compare_digest(str(first.get('token') or '').encode(), cfg.token.encode()):
            log.warning('%s: wrong token', peer)
            await asyncio.sleep(1)
            await ws.send(json.dumps({'id': 0, 'ok': False, 'code': 'token', 'error': 'wrong relay token'}))
            return
        try:
            c, s, root = await asyncio.to_thread(ssh_open, first, cfg)
        except Fail as e:
            await ws.send(json.dumps({'id': 0, 'ok': False, 'code': e.code, 'error': str(e)}))
            return
        log.info('%s: open %s@%s:%s %s', peer, first.get('user'), first.get('host'), first.get('port') or 22, root)
        await ws.send(json.dumps({'id': 0, 'ok': True, 'root': root, 'max': cfg.max_bytes}))
        while True:
            raw = await ws.recv()
            if isinstance(raw, bytes):
                continue   # stray binary frame
            try:
                m = json.loads(raw)
            except ValueError:
                continue
            rid = m.get('id')
            data = None
            if m.get('op') == 'write':
                data = await ws.recv()
                if isinstance(data, str):
                    data = data.encode()
            try:
                if data is not None and len(data) > cfg.max_bytes:
                    raise Fail('toobig', 'file is larger than the relay limit (%d MB)' % cfg.max_mb)
                rep, out = await asyncio.to_thread(do_op, s, root, m, data, cfg)
                rep.update({'id': rid, 'ok': True})
                await ws.send(json.dumps(rep))
                if out is not None:
                    await ws.send(out)
            except Fail as e:
                await ws.send(json.dumps({'id': rid, 'ok': False, 'code': e.code, 'error': str(e)}))
            except Exception as e:   # keep the session alive
                log.exception('op failed')
                await ws.send(json.dumps({'id': rid, 'ok': False, 'code': 'failed', 'error': str(e)}))
    except websockets.ConnectionClosed:
        pass
    finally:
        if s:
            s.close()
        if c:
            c.close()


def load_token(a):
    if a.no_token:
        return ''
    if a.token:
        return a.token
    if os.environ.get('HUB_SFTP_TOKEN'):
        return os.environ['HUB_SFTP_TOKEN']
    f = os.path.join(HERE, 'sftp_token.txt')
    try:
        with open(f, encoding='utf-8') as fh:
            t = fh.read().strip()
            if t:
                return t
    except OSError:
        pass
    t = secrets.token_urlsafe(18)
    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(t + '\n')
    try:
        os.chmod(f, 0o600)
    except OSError:
        pass
    return t


async def main():
    ap = argparse.ArgumentParser(description='SFTP relay for the Hub Files app (H119)')
    ap.add_argument('--host', default='0.0.0.0')
    ap.add_argument('--port', type=int, default=8023)
    ap.add_argument('--token')
    ap.add_argument('--no-token', action='store_true')
    ap.add_argument('--allowlist', default=os.path.join(SSH_RELAY, 'allowlist.txt'))
    ap.add_argument('--known', default=os.path.join(HERE, 'sftp_known_hosts'))
    ap.add_argument('--cert')
    ap.add_argument('--key')
    ap.add_argument('--max-mb', type=int, default=100)
    ap.add_argument('--origin', action='append')
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    logging.getLogger('paramiko').setLevel(logging.WARNING)
    logging.getLogger('websockets').setLevel(logging.WARNING)
    a.max_bytes = a.max_mb * 1024 * 1024
    a.token = load_token(a)
    if not a.cert:
        for d in (HERE, SSH_RELAY):
            if os.path.isfile(os.path.join(d, 'cert.pem')) and os.path.isfile(os.path.join(d, 'key.pem')):
                a.cert, a.key = os.path.join(d, 'cert.pem'), os.path.join(d, 'key.pem')
                break
    tls = None
    if a.cert:
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(a.cert, a.key or None)
    kw = {'max_size': a.max_bytes + 65536, 'ping_interval': 30, 'ssl': tls}
    if a.origin:
        kw['origins'] = a.origin
    async with websockets.serve(lambda ws: session(ws, a), a.host, a.port, **kw):
        scheme = 'wss' if tls else 'ws'
        print('SFTP relay on %s://%s:%d  (%s)' % (scheme, a.host, a.port, 'TLS on' if tls else 'no cert.pem/key.pem: plain ws://, LAN/VPN only'), flush=True)
        print('Allowlist: %s' % a.allowlist, flush=True)
        print('Token: %s' % (a.token or '(none, --no-token)'), flush=True)
        await asyncio.Future()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
