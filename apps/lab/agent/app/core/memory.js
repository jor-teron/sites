/* Agent — app/core/memory.js: memory layout under agent/memory/ (AG4; layout after linux-ai-agent config.py). HR.mem.
   user.md (facts about the user) · assistant.md (the agent's own notes) · sessions/<chatId>.md (what this chat is working on)
   · date/YYYY_MM.md (monthly diary: every append also lands here) · topics/<name>.md (name: letters, digits, - and _).
   Notes are lines "- YYYY-MM-DD HH:MM note" (≤500 chars). block(chatId) feeds the prompt: user + assistant + this chat's
   session only (never other chats' sessions), newest ~800 chars each, ~2000 total. Old agent/memory.md is copied once to
   memory/user.md (only when user.md is missing; old file kept; flag agent.memMigrated.<folder>). Folder needed. */
HR.mem = (function () {
  var DIR = 'agent/memory/', OLD = 'agent/memory.md', CAP = 800, TOTAL = 2000, TARGETS = ['user', 'assistant', 'session', 'topic', 'date'];
  var TITLE = { user: 'About the user', assistant: 'Assistant notes', session: 'Session', topic: 'Topic', date: 'Diary' }, mig = {};
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function now() { var d = new Date(); return { ym: d.getFullYear() + '_' + pad(d.getMonth() + 1), stamp: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) }; }
  function safe(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 60); }
  function chatId() { return HR.chats && HR.chats.id ? HR.chats.id() : ''; }
  function path(target, name) {
    if (target === 'user' || target === 'assistant') return DIR + target + '.md';
    if (target === 'session') { var id = safe(name || chatId()); if (!id) throw new Error('No open chat'); return DIR + 'sessions/' + id + '.md'; }
    if (target === 'topic') { var t = safe(name); if (!t) throw new Error('topic needs a name (letters, digits, - or _)'); return DIR + 'topics/' + t + '.md'; }
    if (target === 'date') return DIR + 'date/' + (/^\d{4}_\d{2}$/.test(name || '') ? name : now().ym) + '.md';
    throw new Error('target must be one of: ' + TARGETS.join(', '));
  }
  async function readOr(p) { try { return (await HR.fs.read(p)).text; } catch (e) { return null; } }
  async function migrate() {
    var k = 'agent.memMigrated.' + HR.fs.name();
    if (mig[k] || localStorage.getItem(k)) return; mig[k] = 1;
    try {
      var old = await readOr(OLD);
      if (old != null && !(await HR.fs.stat(DIR + 'user.md')).exists) await HR.fs.write(DIR + 'user.md', old.replace(/^# Memory\s*/, '# About the user\n\n'));
      localStorage.setItem(k, 'ag4');
    } catch (e) { mig[k] = 0; }
  }
  async function read(target, name) { await migrate(); return readOr(path(target, name)); }
  async function append(target, note, name) {
    await migrate();
    var n = String(note || '').replace(/\s+/g, ' ').trim().slice(0, 500); if (!n) throw new Error('Empty note');
    var p = path(target, name), t = now(), st = await HR.fs.stat(p), line = '- ' + t.stamp + ' ' + n + '\n';
    await HR.fs.append(p, (st.exists ? '' : '# ' + TITLE[target] + (target === 'topic' || target === 'session' ? ': ' + safe(name || chatId()) : '') + '\n\n') + line);
    if (target !== 'date') {
      var dp = path('date'), ds = await HR.fs.stat(dp);
      await HR.fs.append(dp, (ds.exists ? '' : '# Diary ' + t.ym + '\n\n') + '- ' + t.stamp + ' [' + target + (target === 'topic' ? ':' + safe(name) : '') + '] ' + n + '\n').catch(function () {});
    }
    return p;
  }
  async function topics() { try { return (await HR.fs.list(DIR + 'topics')).filter(function (e) { return e.kind === 'file'; }).map(function (e) { return e.name.replace(/\.md$/, ''); }); } catch (e) { return []; } }
  function trim(m, cap) {
    m = String(m || '').replace(/^# .*\n+/, '').trim(); if (!m) return '';
    if (m.length > cap) { m = m.slice(-cap); var nl = m.indexOf('\n'); if (nl >= 0 && nl < 200) m = m.slice(nl + 1); m = '(older lines trimmed — memory_read has all)\n' + m; }
    return m;
  }
  /* Prompt block: user, assistant, this chat's session; ~800 each, ~2000 total */
  async function block(id) {
    if (!HR.fs.ready()) return '';
    await migrate();
    var parts = [['user', 'About the user (memory/user.md)'], ['assistant', 'Your notes (memory/assistant.md)'], ['session', 'This chat (memory/sessions)']], out = [], left = TOTAL;
    for (var i = 0; i < parts.length && left > 100; i++) {
      var t; try { t = trim(await readOr(path(parts[i][0], parts[i][0] === 'session' ? id : '')), Math.min(CAP, left)); } catch (e) { t = ''; }
      if (t) { out.push('### ' + parts[i][1] + '\n' + t); left -= t.length; }
    }
    return out.join('\n\n');
  }
  function dropSession(id) { return HR.fs.ready() ? HR.fs.remove(path('session', id)).catch(function () {}) : Promise.resolve(); }
  return { path: path, read: read, append: append, topics: topics, block: block, dropSession: dropSession, TARGETS: TARGETS, DIR: DIR };
})();
