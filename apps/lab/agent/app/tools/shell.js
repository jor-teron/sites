/* Agent — app/tools/shell.js: run_shell via the local bash helper (HR5). Offered only while HR.helper.ready().
   Every run shows an Approve / Deny card with the command (HR.approve, kind 'shell'); Deny -> 'User denied'.
   AG3: Auto-approve shell commands skips the card; the approver sets info.auto so the log line is marked 'auto'.
   Result text: exit code, stdout, stderr (helper caps each stream at 64 KB; the loop caps tool output at 20k chars). */
HR.tools.register({ name: 'run_shell', available: function () { return HR.helper.ready(); },
  description: 'Run a bash command on the user\'s computer through the local Agent helper. The user approves every command. ' +
    'Prefer short, non-interactive commands; there is no stdin.',
  parameters: { type: 'object', properties: {
    command: { type: 'string', description: 'The bash command line to run' },
    cwd: { type: 'string', description: 'Optional working folder (absolute, ~/…, or relative to the helper root)' },
    timeout: { type: 'number', description: 'Optional timeout in seconds (default 30, max 600)' } }, required: ['command'] },
  run: async function (a, ctx) {
    var cmd = String(a.command || '').trim(), t = Math.max(1, Math.min(600, parseInt(a.timeout, 10) || 30)), cwd = a.cwd ? String(a.cwd) : '';
    if (!cmd) throw new Error('Empty command');
    var info = { kind: 'shell', command: cmd, cwd: cwd, timeout: t }, ok = ctx.approve ? await ctx.approve(info) : false;
    if (!ok) return 'User denied';
    var r = await HR.helper.run({ command: cmd, cwd: cwd, timeout: t, signal: ctx.signal });
    var head = 'exit ' + r.code + (r.timed_out ? ' (timed out after ' + t + ' s)' : '') + ' · ' + r.ms + ' ms' + (r.truncated ? ' · output truncated by helper' : '');
    HR.logs.shell(cmd, cwd, r, info.auto);
    return head + '\n--- stdout ---\n' + (r.stdout || '(empty)') + (r.stderr ? '\n--- stderr ---\n' + r.stderr : '');
  } });
