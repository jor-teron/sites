#!/usr/bin/env python3
"""
Hub build bump (hub/tools/hub_bump.py), H3. Python 3, no dependencies.

Moves the Hub build tag and shell cache name in all 7 places at once:
  1. hub.html                 every ?v=<tag> (script / link tags)
  2. sw.js                    importScripts('hub/update/hub_sw.js?v=<tag>')
  3. hub/update/hub_sw.js     const V = '<tag>'
  4. hub/update/hub_sw.js     const CACHE = 'hub-shell-vNN';  // comment
  5. hub/menu/hub_ctx.js      const V = '<tag>'
  6. hub/core/hub_loader.js   const V = '<tag>'
  7. hub/build.txt            lines 1-4: tag, cache name, release, 'YYYY-MM-DD IST'
hub/version.txt (the user-facing version) changes only with --version.

Usage (from the repo root or anywhere):
  python3 hub/tools/hub_bump.py --check                 all 7 places agree? (exit 1 if not)
  python3 hub/tools/hub_bump.py --release H3 --dry-run  show every change, write nothing
  python3 hub/tools/hub_bump.py --release H3            next tag + next hub-shell-vNN
  python3 hub/tools/hub_bump.py --release H3 --tag 20261024a --cache hub-shell-v90
  python3 hub/tools/hub_bump.py --release H4 --version v0.300   also hub/version.txt
  --note 'text'  comment after CACHE (default '<release>');
  --force  bump even if the places disagree now, or if --tag is not newer than the current tag.

Next tag: same IST date as the current tag (or the current tag's date is later) → next letter
(d → e, z → za); a new IST date → YYYYMMDDa. Next cache: hub-shell-v(NN+1).
"""
import argparse, datetime, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
TAG_RE = r'\d{8}[a-z]+'
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

# (label, path, regex with ONE group = the value; findall → every hit must agree)
PLACES = [
    ('hub.html ?v=', 'hub.html', r'\?v=(' + TAG_RE + r')\b'),
    ('sw.js importScripts', 'sw.js', r"hub_sw\.js\?v=(" + TAG_RE + r")'"),
    ('hub_sw.js V', 'hub/update/hub_sw.js', r"^const V = '(" + TAG_RE + r")';"),
    ('hub_sw.js CACHE', 'hub/update/hub_sw.js', r"^const CACHE = '(hub-shell-v\d+)';"),
    ('hub_ctx.js V', 'hub/menu/hub_ctx.js', r"^  const V = '(" + TAG_RE + r")';"),
    ('hub_loader.js V', 'hub/core/hub_loader.js', r"^  const V = '(" + TAG_RE + r")';"),
    ('build.txt', 'hub/build.txt', None),
]


def rd(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8', newline='') as f:
        return f.read()


def wr(rel, text):
    with open(os.path.join(ROOT, rel), 'w', encoding='utf-8', newline='') as f:
        f.write(text)


def build_lines():
    return rd('hub/build.txt').split('\n')


def scan():
    """→ (tag, cache, problems[], found{label: values})"""
    bl = build_lines()
    tag, cache = bl[0].strip(), (bl[1].strip() if len(bl) > 1 else '')
    probs, found = [], {}
    if not re.fullmatch(TAG_RE, tag):
        probs.append('build.txt line 1 is not a build tag: %r' % tag)
    if not re.fullmatch(r'hub-shell-v\d+', cache):
        probs.append('build.txt line 2 is not a cache name: %r' % cache)
    for label, rel, rx in PLACES:
        if rx is None:
            found[label] = [tag, cache]
            continue
        vals = re.findall(rx, rd(rel), flags=re.M)
        found[label] = vals
        want = cache if 'CACHE' in label else tag
        if not vals:
            probs.append('%s (%s): not found' % (label, rel))
        else:
            bad = sorted(set(v for v in vals if v != want))
            if bad:
                probs.append('%s (%s): %s, build.txt says %s' % (label, rel, ', '.join(bad), want))
    return tag, cache, probs, found


def next_tag(cur, today):
    d, s = cur[:8], cur[8:]
    if d < today:
        return today + 'a'
    s = s[:-1] + chr(ord(s[-1]) + 1) if s[-1] != 'z' else s + 'a'
    return d + s


def main():
    ap = argparse.ArgumentParser(description='Bump the Hub build in all 7 places (see the file header).')
    ap.add_argument('--release', help="release name for build.txt line 3, e.g. H3")
    ap.add_argument('--tag', help='new build tag (default: computed), e.g. 20261024a')
    ap.add_argument('--cache', help='new shell cache name (default: hub-shell-v<NN+1>)')
    ap.add_argument('--note', help='comment after the CACHE line (default: the release)')
    ap.add_argument('--version', help='also write hub/version.txt (e.g. v0.300 + today IST)')
    ap.add_argument('--dry-run', action='store_true', help='show every change, write nothing')
    ap.add_argument('--check', action='store_true', help='only verify all 7 places agree')
    ap.add_argument('--force', action='store_true', help='bump even when the places disagree now')
    a = ap.parse_args()

    tag, cache, probs, found = scan()
    if a.check or not a.release:
        if not a.check and not a.release:
            ap.error('give --release NAME (or --check)')
        for label, vals in found.items():
            print('  %-20s %s' % (label, ', '.join(sorted(set(vals))) + (' (x%d)' % len(vals) if len(vals) > 1 and label != 'build.txt' else '')))
        if probs:
            print('MISMATCH:\n  ' + '\n  '.join(probs))
            return 1
        print('OK: all 7 places at %s / %s' % (tag, cache))
        return 0

    if probs and not a.force:
        print('Refusing to bump, the places disagree now (use --force to bump anyway):\n  ' + '\n  '.join(probs))
        return 1
    now = datetime.datetime.now(IST)
    today = now.strftime('%Y%m%d')
    new_tag = a.tag or next_tag(tag, today)
    if not re.fullmatch(TAG_RE, new_tag):
        print('Bad --tag %r (want YYYYMMDD + letters)' % new_tag)
        return 1
    if new_tag <= tag and not a.force:
        print('Refusing: --tag %s is not newer than the current %s (use --force)' % (new_tag, tag))
        return 1
    m = re.fullmatch(r'hub-shell-v(\d+)', cache)
    new_cache = a.cache or ('hub-shell-v%d' % (int(m.group(1)) + 1) if m else '')
    if not re.fullmatch(r'hub-shell-v\d+', new_cache or ''):
        print('Bad or missing --cache %r (want hub-shell-vNN)' % new_cache)
        return 1
    if not re.fullmatch(r'[\w.+-]+', a.release):
        print('Bad --release %r' % a.release)
        return 1
    tag_date = '%s-%s-%s%s' % (new_tag[:4], new_tag[4:6], new_tag[6:8], new_tag[8:])
    note = a.note or a.release

    changes = []  # human-readable lines

    plan = {}  # rel -> (original text, new text)

    def add(rel, rx, repl, label):
        orig, cur = plan.get(rel, (rd(rel), None))
        new, n = re.subn(rx, repl, orig if cur is None else cur, flags=re.M)
        plan[rel] = (orig, new)
        changes.append('%-20s %s: %d change%s' % (label, rel, n, '' if n == 1 else 's'))

    T = TAG_RE
    add('hub.html', r'\?v=' + T + r'\b', '?v=' + new_tag, 'hub.html ?v=')
    add('sw.js', r"(hub_sw\.js\?v=)" + T + "'", r'\g<1>' + new_tag + "'", 'sw.js importScripts')
    add('hub/update/hub_sw.js', r"^const V = '" + T + "';", "const V = '%s';" % new_tag, 'hub_sw.js V')
    add('hub/update/hub_sw.js', r"^const CACHE = 'hub-shell-v\d+';.*$",
        "const CACHE = '%s';  // %s: %s" % (new_cache, tag_date, note.replace('\\', '\\\\')), 'hub_sw.js CACHE')
    add('hub/menu/hub_ctx.js', r"^  const V = '" + T + "';", "  const V = '%s';" % new_tag, 'hub_ctx.js V')
    add('hub/core/hub_loader.js', r"^  const V = '" + T + "';", "  const V = '%s';" % new_tag, 'hub_loader.js V')
    bl = build_lines()
    while len(bl) < 4:
        bl.append('')
    old_head = bl[:4]
    bl[:4] = [new_tag, new_cache, a.release, now.strftime('%Y-%m-%d') + ' IST']
    plan['hub/build.txt'] = (rd('hub/build.txt'), '\n'.join(bl))
    changes.append('%-20s hub/build.txt: %s -> %s' % ('build.txt', ' | '.join(old_head), ' | '.join(bl[:4])))
    if a.version:
        if not re.fullmatch(r'v?\d[\w.-]*', a.version):
            print('Bad --version %r' % a.version)
            return 1
        vt = rd('hub/version.txt').split('\n')
        while len(vt) < 2:
            vt.append('')
        old_v = vt[:2]
        vt[:2] = [a.version if a.version.startswith('v') else 'v' + a.version, now.strftime('%Y-%m-%d')]
        plan['hub/version.txt'] = (rd('hub/version.txt'), '\n'.join(vt))
        changes.append('%-20s hub/version.txt: %s -> %s' % ('version.txt', ' | '.join(old_v), ' | '.join(vt[:2])))

    print('%s: %s / %s -> %s / %s (release %s)' % ('Dry run' if a.dry_run else 'Bump', tag, cache, new_tag, new_cache, a.release))
    for c in changes:
        print('  ' + c)
    if a.dry_run:
        import difflib
        for rel, (old, new) in plan.items():
            for line in difflib.unified_diff(old.split('\n'), new.split('\n'), rel, rel, n=0, lineterm=''):
                if not line.startswith('@@'):
                    print('    ' + line)
        return 0
    for rel, (old, new) in plan.items():
        if old != new:
            wr(rel, new)
    tag2, cache2, probs2, _ = scan()
    if probs2 or tag2 != new_tag or cache2 != new_cache:
        print('After the bump the places disagree:\n  ' + '\n  '.join(probs2))
        return 1
    print('Done: all 7 places at %s / %s. Add the hub_readme.md change-log entry.' % (new_tag, new_cache))
    return 0


if __name__ == '__main__':
    sys.exit(main())
