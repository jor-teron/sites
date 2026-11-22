#!/usr/bin/env python3
"""DC-1 Dictionary data builder (python3, stdlib only).

Converts the Open English WordNet (OEWN, CC BY 4.0) WN-LMF XML release into small
JSON shards that the Dictionary app loads on demand.

Usage (from the repo root):
  python3 apps/learn/dictionary/tools/build_data.py [english-wordnet-YYYY.xml.gz]
With no argument the 2025 OEWN release is downloaded from GitHub into /tmp first. OEWN is the only source.

DC-1b meaning order (OEWN only): within one part of speech a word's senses keep the order OEWN itself
lists them in (its own sense order for that lemma and part of speech). Parts of speech are ordered by how
many senses OEWN gives the word in each (run: verb 40+ before noun), ties in OEWN order (a, n, r, v).
Capitalised entries (Book = the Bible, Light = the Quaker belief) come after lower-case ones. The app
shows parts of speech in first-seen order and the first 3 senses of each (DC-1a layout).

DC-4 word families and phrases: each shard also has
  "r": {word: [[family words<=MAX_FAM], [phrases<=MAX_PHR]]}   (trailing empty list dropped)
Family = words linked to any sense of the word by WordNet derivation / pertainym / participle links
(both directions: happy -> happiness, happily) plus opposites that contain the word (unhappy).
Phrases = lower-case multi-word or hyphenated entries that have the word as one of their parts
(run -> run out, bank -> bank account). Both lists: most used first (how often the word appears in
OEWN's own definitions and examples), then more OEWN senses, then shorter, then a-z. Irregular forms (ran, went) come from the OEWN <Form> list and sit in "g": {word: [forms]}.

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
MAX_FAM, MAX_PHR = 12, 16
FAMILY_REL = ('derivation', 'pertainym', 'participle')
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
    links = []   # (sense id, target sense id) for FAMILY_REL (DC-4)
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
                    links.extend((sid, r.get('target')) for r in s.findall('SenseRelation') if r.get('relType') in FAMILY_REL)
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
    lower, irregular = set(), {}   # DC-4: words with a lower-case entry, word -> [forms]
    for eid, (word, pos, senses, pr, fl) in entries.items():
        k = norm(word)
        lst = words.setdefault(k, [])
        p = 'a' if pos == 's' else pos
        proper = 1 if word[:1].isupper() else 0
        if not proper:
            lower.add(k)
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
            lst.append((proper, p, len(lst), row))   # len(lst): OEWN order
        if pr and k not in ipa:
            ipa[k] = pr
        for f in fl:
            fk = norm(f)
            if fk != k:
                forms.setdefault(fk, k)
                if fk not in irregular.setdefault(k, []):
                    irregular[k].append(fk)
    def order(v):   # DC-1b: lower-case before capitalised; parts of speech by OEWN sense count; OEWN order within
        cased = 1 if all(x[0] for x in v) else 0
        n, first = {}, {}
        for proper, p, i, _ in v:
            first.setdefault(p, i)
            if proper <= cased:
                n[p] = n.get(p, 0) + 1
        rank = {p: r for r, p in enumerate(sorted(first, key=lambda p: (-n.get(p, 0), 'anrv'.find(p) % 9, first[p])))}
        return [row for _, _, _, row in sorted(v, key=lambda x: (x[0], rank[x[1]], x[2]))]
    words = {k: order(v) for k, v in words.items() if v}
    # DC-4 word family and phrases
    sense_word = {sid: norm(sense_lemma[sid]) for sid in sense_lemma}
    fam = {}
    for a, b in links:
        wa, wb = sense_word.get(a), sense_word.get(b)
        if wa and wb and wa != wb and wa in words and wb in words:
            fam.setdefault(wa, set()).add(wb)
            fam.setdefault(wb, set()).add(wa)
    for sid, ts in antonyms.items():
        wa = sense_word.get(sid)
        for t in ts:
            wb = sense_word.get(t)
            if wa and wb and wa != wb and wa in wb and wb in words:   # happy -> unhappy (not happy -> sad)
                fam.setdefault(wa, set()).add(wb)
    phr = {}
    for k in words:
        if k in lower and (' ' in k or '-' in k):
            for t in set(re.split(r'[ -]+', k)):
                if t and t != k and t in words:
                    phr.setdefault(t, []).append(k)
    # DC-1b: how often a word or phrase is used inside OEWN's own definitions and examples (hyphens read as spaces)
    keyof = lambda w: re.sub(r'[ -]+', ' ', w)
    want = {keyof(w) for w in set().union(*fam.values(), *phr.values())}
    used = {}
    for d, ex, _ in synsets.values():
        for text in [d] + ex:
            t = re.findall(r"[a-z0-9']+", text.lower().replace('-', ' '))
            for n in range(1, 5):
                for i in range(len(t) - n + 1):
                    g = ' '.join(t[i:i + n])
                    if g in want:
                        used[g] = used.get(g, 0) + 1
    rank = lambda w: (-used.get(keyof(w), 0), -len(words[w]), len(w.split()), len(w), w)
    rel = {}
    for k in words:
        f = sorted(fam.get(k, ()), key=rank)[:MAX_FAM]
        x = sorted(phr.get(k, ()), key=rank)[:MAX_PHR]
        if f or x:
            rel[k] = [f, x] if x else [f]
    irregular = {k: v for k, v in irregular.items() if k in words}
    print('family', sum(1 for v in rel.values() if v[0]), 'phrases', sum(1 for v in rel.values() if len(v) > 1), 'irregular', len(irregular))
    forms = {f: k for f, k in forms.items() if f not in words and k in words}

    # group into first-letter buckets, split the big ones
    def bucket(keyfn):
        b = {}
        for k, v in words.items():
            b.setdefault(keyfn(k), {'w': {}, 'p': {}, 'f': {}, 'r': {}, 'g': {}})['w'][k] = v
            if k in ipa:
                b[keyfn(k)]['p'][k] = ipa[k]
            if k in rel:
                b[keyfn(k)]['r'][k] = rel[k]
            if k in irregular:
                b[keyfn(k)]['g'][k] = irregular[k]
        for f, k in forms.items():
            b.setdefault(keyfn(f), {'w': {}, 'p': {}, 'f': {}, 'r': {}, 'g': {}})['f'][f] = k
        return b

    split = set()
    while True:   # split any shard over SPLIT_KB by one more letter, until none is (or it cannot split further)
        final = bucket(lambda k: shard_key(k, split))
        big = {key for key, sh in final.items() if key != '0' and not key.endswith('_') and len(dump({n: sh[n] for n in 'wpf'}).encode()) > SPLIT_KB * 1024}   # DC-4: r/g not counted, so shard names stay as in DC-1
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
