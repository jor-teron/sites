/*
 * ONNX Runner — tokenizers for the Generate tab (main thread).
 * OnnxText.load(files) picks one from the dropped files, in this order:
 *   1. tokenizer.json (+ tokenizer_config.json)  → Transformers.js 3.7.0 (BPE / WordPiece / Unigram)
 *   2. vocab.json + merges.txt (GPT-2 style)      → turned into a byte-level BPE tokenizer.json, same path
 *   3. any other vocab JSON: {"token": id} or ["tok0", "tok1", ...] → char-level (all tokens 1 char),
 *      word-level (split on spaces) or longest-match
 * config.json / generation_config.json (optional) give context length, EOS / BOS ids and KV-cache sizes.
 * Returns {kind, label, size, encode(text)→ids, decode(ids)→text, bosId, eosIds, ctx, kv, notes}.
 */
const OnnxText = (() => {
  const readJson = async (f) => { try { return JSON.parse(await f.text()); } catch (e) { throw new Error(f.name + ' is not valid JSON: ' + e.message); } };
  const first = (...v) => v.find((x) => x !== undefined && x !== null);
  const ids = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]).filter((x) => Number.isInteger(x));
  let tjs = null;
  const transformers = async () => (tjs = tjs || await import(ONNX_CONFIG.transformersUrl));

  async function hfTokenizer(json, cfg) {
    const T = await transformers();
    const map = T.AutoTokenizer.TOKENIZER_CLASS_MAPPING || {};
    const name = String(cfg.tokenizer_class || '').replace(/Fast$/, '');
    const Cls = map[name] || T.PreTrainedTokenizer;
    const tok = new Cls(json, cfg);
    const vocab = tok.model && tok.model.vocab;
    const size = Array.isArray(vocab) ? vocab.length : vocab instanceof Map ? vocab.size : Object.keys(json.model.vocab || {}).length + (json.added_tokens || []).length;
    const idOf = (t) => (t ? tok.model.tokens_to_ids.get(typeof t === 'string' ? t : t.content) : undefined);
    return {
      size, type: (json.model && json.model.type) || '?',
      encode: (s) => tok.encode(s),
      decode: (a) => tok.decode(a, { skip_special_tokens: true }),
      bosId: idOf(cfg.bos_token), eosIds: ids(idOf(cfg.eos_token)),
    };
  }

  function simpleVocab(v, fname) {
    let list;
    if (Array.isArray(v)) list = v.map(String);
    else if (v && Array.isArray(v.chars)) list = v.chars.map(String);
    else {
      const m = v && typeof v.stoi === 'object' ? v.stoi : v;
      if (!m || typeof m !== 'object' || !Object.values(m).every(Number.isInteger)) throw new Error(fname + ': expected {"token": id} or a list of tokens');
      list = [];
      for (const [t, i] of Object.entries(m)) list[i] = t;
    }
    const stoi = new Map(); list.forEach((t, i) => { if (t !== undefined && !stoi.has(t)) stoi.set(t, i); });
    const toks = [...stoi.keys()];
    const isChar = toks.every((t) => [...t].length === 1);
    const isWord = !isChar && !toks.some((t) => /\s/.test(t)) && toks.filter((t) => [...t].length > 1).length > toks.length / 2;
    const maxLen = Math.max(1, ...toks.map((t) => t.length));
    let unknown = 0;
    const encode = (s) => {
      unknown = 0; const out = [];
      if (isChar) { for (const ch of s) stoi.has(ch) ? out.push(stoi.get(ch)) : unknown++; }
      else if (isWord) { for (const w of s.split(/\s+/).filter(Boolean)) stoi.has(w) ? out.push(stoi.get(w)) : unknown++; }
      else {
        for (let i = 0; i < s.length;) {
          let L = Math.min(maxLen, s.length);
          while (L > 0 && !stoi.has(s.substr(i, L))) L--;
          if (L) { out.push(stoi.get(s.substr(i, L))); i += L; } else { unknown++; i++; }
        }
      }
      return out;
    };
    const special = (t) => /^<\/?[a-z|_]+>$|^\[[A-Z]+\]$/i.test(t);
    const find = (...names) => names.map((n) => stoi.get(n)).find((x) => x !== undefined);
    return {
      kind: isChar ? 'char' : isWord ? 'word' : 'longest-match', size: list.length,
      encode, unknown: () => unknown,
      decode: (a) => a.map((i) => list[i]).filter((t) => t !== undefined && !(special(t) && t.length > 1)).join(isWord ? ' ' : ''),
      bosId: find('<s>', '<bos>', '<|startoftext|>', '[BOS]'), eosIds: ids(find('</s>', '<eos>', '<|endoftext|>', '[EOS]')),
    };
  }

  /* GPT-2 files → a tokenizer.json Transformers.js understands. */
  function gpt2Json(vocab, mergesText) {
    const merges = mergesText.split(/\r?\n/).filter((l) => l && !l.startsWith('#version'));
    const added = ['<|endoftext|>'].filter((t) => t in vocab).map((t) => ({ id: vocab[t], content: t, special: true, single_word: false, lstrip: false, rstrip: false, normalized: false }));
    return {
      version: '1.0', added_tokens: added, normalizer: null, post_processor: null,
      pre_tokenizer: { type: 'ByteLevel', add_prefix_space: false, trim_offsets: true, use_regex: true },
      decoder: { type: 'ByteLevel', add_prefix_space: true, trim_offsets: true, use_regex: true },
      model: { type: 'BPE', dropout: null, unk_token: null, continuing_subword_prefix: '', end_of_word_suffix: '', fuse_unk: false, byte_fallback: false, vocab, merges },
    };
  }

  async function load(files) {
    const by = {}; for (const f of files) by[f.name.split('/').pop().toLowerCase()] = f;
    const notes = [];
    const cfg = by['config.json'] ? await readJson(by['config.json']) : {};
    const gen = by['generation_config.json'] ? await readJson(by['generation_config.json']) : {};
    const tcfg = by['tokenizer_config.json'] ? await readJson(by['tokenizer_config.json']) : {};
    const smap = by['special_tokens_map.json'] ? await readJson(by['special_tokens_map.json']) : {};
    let t = null, kind, label;
    if (by['tokenizer.json']) {
      const j = await readJson(by['tokenizer.json']);
      if (!j.model) throw new Error('tokenizer.json has no "model" section; is it a Hugging Face tokenizer file?');
      t = await hfTokenizer(j, { ...smap, ...tcfg });
      kind = 'hf'; label = 'Hugging Face tokenizer.json (' + t.type + ', Transformers.js 3.7.0)';
    } else if (by['vocab.json'] && by['merges.txt']) {
      const v = await readJson(by['vocab.json']);
      t = await hfTokenizer(gpt2Json(v, await by['merges.txt'].text()), { ...smap, ...tcfg, eos_token: first(tcfg.eos_token, smap.eos_token, '<|endoftext|>' in v ? '<|endoftext|>' : null) });
      kind = 'gpt2'; label = 'GPT-2 style vocab.json + merges.txt (byte-level BPE)';
    } else {
      const skip = new Set(['config.json', 'generation_config.json', 'tokenizer_config.json', 'special_tokens_map.json']);
      const vf = Object.values(by).find((f) => /\.json$/i.test(f.name) && !skip.has(f.name.toLowerCase()) && /vocab|char|token|stoi|itos/i.test(f.name))
        || Object.values(by).find((f) => /\.json$/i.test(f.name) && !skip.has(f.name.toLowerCase()));
      if (vf) {
        t = simpleVocab(await readJson(vf), vf.name);
        kind = t.kind; label = t.kind + '-level vocab (' + vf.name + ')';
        if (by['merges.txt'] === undefined && vf.name.toLowerCase() === 'vocab.json' && !t.size) notes.push('vocab.json without merges.txt');
      }
    }
    if (!t) return null;
    const ctx = first(cfg.max_position_embeddings, cfg.n_positions, cfg.n_ctx, cfg.max_seq_len, cfg.block_size, cfg.context_length,
      tcfg.model_max_length < 1e7 ? tcfg.model_max_length : undefined);
    const eosIds = [...new Set([...ids(gen.eos_token_id), ...ids(cfg.eos_token_id), ...t.eosIds])];
    const bosId = first(gen.bos_token_id, cfg.bos_token_id, t.bosId);
    const heads = first(cfg.num_key_value_heads, cfg.num_attention_heads, cfg.n_head);
    const hid = first(cfg.hidden_size, cfg.n_embd, cfg.d_model);
    const kv = heads ? { heads, headDim: first(cfg.head_dim, hid && cfg.num_attention_heads ? hid / cfg.num_attention_heads : hid && cfg.n_head ? hid / cfg.n_head : undefined) } : null;
    return { ...t, kind, label, ctx, eosIds, bosId, kv, notes, hasConfig: !!by['config.json'] };
  }

  const isTokenizerFile = (name) => /\.(json|txt)$/i.test(name);
  return { load, isTokenizerFile };
})();
