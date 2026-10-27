/* Agent — app/core/prompt.js: system prompt + memory (HR4). HR.prompt.system() is read on every send / model call.
   With a folder: agent/prompts/system.md (created with DEFAULT on first use; edit it to change behaviour) plus the newest
   ~800 chars of agent/memory.md. Without a folder: no system prompt (as in HR1–HR3). */
HR.prompt = (function () {
  var SYS = 'agent/prompts/system.md', MEM = 'agent/memory.md', CAP = 800, making = null;
  var DEFAULT = '# Agent system prompt\n\n' +
    'You are Agent, a helpful assistant running in the user\'s browser on a local model.\n' +
    '- Be concise and direct. Use Markdown code blocks for code.\n' +
    '- Use tools when they help: get_time for the current date and time; list_dir, read_file, search and write_file for the ' +
    'user\'s folder (paths are relative to the folder root; every write asks the user first).\n' +
    '- Memory: call memory_read to recall notes and memory_append to save short, durable facts (preferences, ongoing work). ' +
    'Do not save secrets.\n' +
    '- Never invent file contents; read files before editing them, and write whole files.\n\n' +
    '_Edit this file (agent/prompts/system.md) to change how Agent behaves. Lines are read on every message._\n';
  async function readOr(path) { try { return (await HR.fs.read(path)).text; } catch (e) { return null; } }
  async function base() {
    var t = await readOr(SYS);
    if (t == null) {
      making = making || HR.fs.write(SYS, DEFAULT).then(function () { HR.chat && HR.chat.note && HR.chat.note('Created ' + SYS + ' — edit it to change the system prompt.'); }, function () {});
      await making; t = DEFAULT;
    }
    return t.trim();
  }
  function trimMem(m) {
    m = String(m || '').replace(/^# Memory\s*/, '').trim();
    if (!m) return '';
    if (m.length > CAP) { m = m.slice(-CAP); var nl = m.indexOf('\n'); if (nl >= 0 && nl < 200) m = m.slice(nl + 1); m = '(older notes trimmed — call memory_read for all)\n' + m; }
    return m;
  }
  async function system() {
    if (!HR.fs.ready()) return '';
    try { var s = await base(), mem = trimMem(await readOr(MEM)); } catch (e) { return ''; }
    return s + (mem ? '\n\n## Memory notes (agent/memory.md)\n' + mem : '');
  }
  return { system: system, MEM: MEM, SYS: SYS };
})();
