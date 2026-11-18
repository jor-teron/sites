#!/usr/bin/env python3
"""DC-1 Dictionary data builder (python3, stdlib only).

Converts the Open English WordNet (OEWN, CC BY 4.0) WN-LMF XML release into small
JSON shards that the Dictionary app loads on demand.

Usage (from the repo root):
  python3 apps/learn/dictionary/tools/build_data.py [english-wordnet-YYYY.xml.gz]
With no argument the 2025 release is downloaded from GitHub into /tmp first.

Output in apps/learn/dictionary/data/ (all minified JSON):
  manifest.json   {v, words, forms, split:[prefixes split by one more letter], src}
  d_<key>.json    {"w": {word: [[pos, definition, [examples<=2], [synonyms<=6], [antonyms]], ...]},
                   "p": {word: ipa}, "f": {inflected form: word}}   trailing empty lists dropped
  i_<l>.json      sorted word list for one first letter (prefix autocomplete + suggestions)
  wod.json        [[word, pos, definition], ...] word-of-the-day picks (common single words)
Shard key: first letter a-z, '0' for anything else; a shard over SPLIT_KB is split by one more
letter (repeated while needed; a char that is not a-z -> '_'), e.g. d_sa.json, d_s_.json, d_coa.json.
The same rules live in core/dict.js (DictCore.shardKey) - keep them in step.
"""
import gzip, json, os, re, sys, urllib.request
import xml.etree.ElementTree as ET

URL = 'https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025.xml.gz'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'data')
SPLIT_KB = 600
MAX_EX, MAX_SYN, MAX_ANT = 2, 6, 4
WOD_N = 1000


def norm(s):
    s = s.replace('\u2019', "'").replace('_', ' ').lower()
    return re.sub(r'\s+', ' ', s).strip()


def letter(k):
    c = k[:1]
    return c if 'a' <= c <= 'z' else '0'


def shard_key(k, split):
    """First letter, then one more character for every prefix listed in split (same as DictCore.shardKey)."""
    p = letter(k)
    while p in split:
        c = k[len(p):len(p) + 1]
        p += c if 'a' <= c <= 'z' else '_'
    return p


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/' + URL.rsplit('/', 1)[1]
    if not os.path.exists(src):
        print('downloading', URL)
        urllib.request.urlretrieve(URL, src)
    entries = {}   # entry id -> (lemma, pos, [(sense id, synset id)], ipa, [forms])
    sense_lemma = {}   # sense id -> lemma
    antonyms = {}   # sense id -> [target sense ids]
    synsets = {}   # synset id -> (definition, [examples], [member entry ids])
    version = ''
    op = gzip.open if src.endswith('.gz') else open
    with op(src, 'rb') as fh:
        for ev, el in ET.iterparse(fh, events=('start', 'end')):
            tag = el.tag
            if ev == 'start':
                if tag == 'Lexicon':
                    version = el.get('version', '')
                continue
            if tag == 'LexicalEntry':
                lem = el.find('Lemma')
                word, pos = lem.get('writtenForm'), lem.get('partOfSpeech')
                pr = lem.find('Pronunciation')
                senses = []
                for s in el.findall('Sense'):
                    sid = s.get('id')
                    senses.append((sid, s.get('synset')))
                    sense_lemma[sid] = word
                    ants = [r.get('target') for r in s.findall('SenseRelation') if r.get('relType') == 'antonym']
                    if ants:
                        antonyms[sid] = ants
                forms = [f.get('writtenForm') for f in el.findall('Form')]
                entries[el.get('id')] = (word, pos, senses, pr.text if pr is not None else '', forms)
                el.clear()
            elif tag == 'Synset':
                d = el.find('Definition')
                ex = [e.text for e in el.findall('Example') if e.text]
                synsets[el.get('id')] = (d.text if d is not None and d.text else '', ex, (el.get('members') or '').split())
                el.clear()
    ent_lemma = {eid: e[0] for eid, e in entries.items()}

    words, ipa, forms = {}, {}, {}
    for eid, (word, pos, senses, pr, fl) in entries.items():
        k = norm(word)
        lst = words.setdefault(k, [])
        p = 'a' if pos == 's' else pos
        for sid, syn in senses:
            d, ex, mem = synsets.get(syn, ('', [], []))
            if not d:
                continue
            syns = []
            for m in mem:
                w = ent_lemma.get(m)
                if w and norm(w) != k and w not in syns:
                    syns.append(w)
            ants = []
            for t in antonyms.get(sid, []):
                w = sense_lemma.get(t)
                if w and w not in ants:
                    ants.append(w)
            row = [p, d, ex[:MAX_EX], syns[:MAX_SYN], ants[:MAX_ANT]]
            while row and row[-1] == []:
                row.pop()
            lst.append(row)
        if pr and k not in ipa:
            ipa[k] = pr
        for f in fl:
            fk = norm(f)
            if fk != k:
                forms.setdefault(fk, k)
    words = {k: v for k, v in words.items() if v}
    forms = {f: k for f, k in forms.items() if f not in words and k in words}

    # group into first-letter buckets, split the big ones
    def bucket(keyfn):
        b = {}
        for k, v in words.items():
            b.setdefault(keyfn(k), {'w': {}, 'p': {}, 'f': {}})['w'][k] = v
            if k in ipa:
                b[keyfn(k)]['p'][k] = ipa[k]
        for f, k in forms.items():
            b.setdefault(keyfn(f), {'w': {}, 'p': {}, 'f': {}})['f'][f] = k
        return b

    split = set()
    while True:   # split any shard over SPLIT_KB by one more letter, until none is (or it cannot split further)
        final = bucket(lambda k: shard_key(k, split))
        big = {key for key, sh in final.items() if key != '0' and not key.endswith('_') and len(dump(sh).encode()) > SPLIT_KB * 1024}
        if not big:
            break
        split |= big
    split = sorted(split)

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.json'):
            os.remove(os.path.join(OUT, f))
    sizes = []
    for key, sh in sorted(final.items()):
        sh = {n: dict(sorted(v.items())) for n, v in sh.items() if v}
        s = dump(sh)
        open(os.path.join(OUT, 'd_%s.json' % key), 'w', encoding='utf-8').write(s)
        sizes.append((len(s.encode()), key))
    idx = {}
    for k in words:
        idx.setdefault(letter(k), []).append(k)
    for l, lst in idx.items():
        open(os.path.join(OUT, 'i_%s.json' % l), 'w', encoding='utf-8').write(dump(sorted(lst)))

    # word of the day: plain lowercase single words, 6-11 letters, 2-5 senses, with an example
    cand = []
    for k, v in sorted(words.items()):
        if re.fullmatch(r'[a-z]{6,11}', k) and 2 <= len(v) <= 5 and any(len(r) > 2 and r[2] for r in v):
            cand.append([k, v[0][0], v[0][1]])
    step = max(1, len(cand) // WOD_N)
    wod = cand[::step][:WOD_N]
    open(os.path.join(OUT, 'wod.json'), 'w', encoding='utf-8').write(dump(wod))
    man = {'v': 'oewn-' + version, 'words': len(words), 'forms': len(forms), 'split': split,
           'src': 'Open English WordNet ' + version + ' (CC BY 4.0)'}
    open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8').write(dump(man))
    sizes.sort(reverse=True)
    print('words %d forms %d shards %d split %s wod %d' % (len(words), len(forms), len(sizes), ' '.join(split), len(wod)))
    print('largest shards:', ', '.join('%s %d KB' % (k, n // 1024) for n, k in sizes[:5]))


if __name__ == '__main__':
    main()
