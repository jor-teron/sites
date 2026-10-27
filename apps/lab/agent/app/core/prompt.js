/* Agent — app/core/prompt.js: system prompt (HR4; AG4 memory layout + live settings). HR.prompt.system() runs on every model call.
   With a folder: agent/prompts/system.md (created with DEFAULT on first use; edit it to change behaviour), then a
   "Current settings" section built from Settings on every call (tools on/off, write/shell allowed and whether they
   auto-approve, memory on/off — so the prompt never claims "every write asks first" when auto-approve is on), then
   HR.mem.block(chat id) (user.md + assistant.md + this chat's session, ~800 chars each, ~2000 total; left out when Memory is off).
   Without a folder: only the settings section when a tool (e.g. run_shell) is available, else no system prompt. */
HR.prompt = (function () {
  var SYS = 'agent/prompts/system.md', making = null;
  var DEFAULT = '# Agent system prompt\n\n' +
    'You are Agent, a helpful assistant running in the user\'s browser on a local model.\n' +
    '- Be concise and direct. Use Markdown code blocks for code.\n' +
    '- Use tools when they help. Which tools you have, and whether actions ask the user first, is listed under ' +
    '"Current settings" below — follow that, it changes with the user\'s settings.\n' +
    '- File paths are relative to the user\'s folder root. Never invent file contents; read files before editing them, and write whole files.\n' +
    '- Do not save secrets to memory.\n\n' +
    '_Edit this file (agent/prompts/system.md) to change how Agent behaves. It is read on every message._\n';
  async function base() {
    var t; try { t = (await HR.fs.read(SYS)).text; } catch (e) { t = null; }
    if (t == null) {
      making = making || HR.fs.write(SYS, DEFAULT).then(function () { HR.chat && HR.chat.note && HR.chat.note('Created ' + SYS + ' — edit it to change the system prompt.'); }, function () {});
      await making; t = DEFAULT;
    }
    return t.trim();
  }
  /* Live settings, so the prompt matches Settings → Permissions / Memory */
  function settings() {
    if (HR.set.get('tools') === 'off') return '';
    var have = {}; HR.tools.list().forEach(function (t) { have[t.name] = 1; });
    if (!Object.keys(have).length) return '';
    var L = ['## Current settings (these override anything above)'];
    if (HR.fs.ready()) L.push(have.write_file ? '- Files: list_dir, read_file, search and write_file. ' + (HR.perms.auto('write') ? 'Writes are auto-approved: they happen at once, so be careful.' : 'Every write asks the user first.')
      : '- Files: read-only (list_dir, read_file, search). Writing is turned off — do not offer to write files.');
    else L.push('- No folder is connected: no file tools.');
    if (have.run_shell) L.push('- Shell: run_shell is available. ' + (HR.perms.auto('shell') ? 'Commands are auto-approved and run at once — only run safe commands.' : 'Every command asks the user first.'));
    if (have.web_search) L.push('- Web: web_search (title, url, snippet) and web_fetch (page text, ~8k chars) are available; each call uses Tavily credits, so search only when the answer needs current or outside information and cite the URLs you used.');   /* AG6 */
    if (have.memory_read) L.push('- Memory is on: memory_read / memory_append with target user (facts about the user), assistant (your notes), ' +
      'session (what this chat is working on), topic (+ name). Save short durable facts; user and assistant notes are shared by all chats, session notes belong to this chat only.');
    else L.push('- Memory is off: you have no memory tools and no saved notes.');
    return L.join('\n');
  }
  async function system() {
    var st = settings();
    if (!HR.fs.ready()) return st;
    var s = '', mem = '';
    try { s = await base(); } catch (e) { s = ''; }
    try { mem = HR.perms.memory() ? await HR.mem.block(HR.chats && HR.chats.id()) : ''; } catch (e) { mem = ''; }
    return [s, st, mem ? '## Memory (newest notes; memory_read has all)\n' + mem : ''].filter(Boolean).join('\n\n');
  }
  return { system: system, settings: settings, SYS: SYS };
})();
