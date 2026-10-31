/* Code School CS4 — SQL mode: runs SQLite in the page with sql.js (vendor/, loaded only when SQL mode opens:
   WebAssembly over http, the pure-JS asm.js build on file:// or if WebAssembly fails). A sample school database
   (classes, students, marks) is made on first open. Run goes through every statement: each SELECT shows a scrollable
   table with its row count, other statements say what they did, and the first error stops the run with a plain-words
   message and its line. The Tables list (tap a table to see its rows) refreshes after every run. The database is kept
   in localStorage as base64 (learn.code-school.db, up to about 1.5 MB) and can be downloaded as a .db file.
   CS.sqlMode({host, full: () => editor text, say}) -> {ensure, run(src, base), resetDb, downloadDb(name)} */
window.CS = window.CS || {};
(() => {
  const DBKEY = 'learn.code-school.db', CAP = 2000000, SHOW = 500
  CS.SQL_STARTER = [
    '-- SQL asks questions about data kept in tables.', '-- Press Run (Ctrl+Enter). Each SELECT shows a table of results.', '',
    'SELECT * FROM students;', '', '-- Who scored more than 80?', 'SELECT s.name, m.subject, m.score', 'FROM marks m',
    'JOIN students s ON s.id = m.student_id', 'WHERE m.score > 80', 'ORDER BY m.score DESC;', '', '-- Average score in each class',
    'SELECT c.name AS class, ROUND(AVG(m.score), 1) AS average', 'FROM marks m', 'JOIN students s ON s.id = m.student_id',
    'JOIN classes c ON c.id = s.class_id', 'GROUP BY c.name;', ''].join('\n');
  CS.SQL_BLANK = '-- Write your SQL here. Press Run (Ctrl+Enter).\n\n';
  const SAMPLE = `CREATE TABLE classes (id INTEGER PRIMARY KEY, name TEXT NOT NULL, teacher TEXT, room TEXT);
INSERT INTO classes VALUES (1,'Class 6','Mrs Das','R1'),(2,'Class 7','Mr Bora','R2'),(3,'Class 8','Ms Sangma','R3');
CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER, class_id INTEGER REFERENCES classes(id), city TEXT);
INSERT INTO students VALUES (1,'Asha',11,1,'Guwahati'),(2,'Bikram',12,1,'Diphu'),(3,'Chanu',11,1,'Imphal'),(4,'Dawa',12,2,'Gangtok'),
 (5,'Esther',13,2,'Shillong'),(6,'Farhan',12,2,'Guwahati'),(7,'Gita',13,2,'Agartala'),(8,'Hemanta',14,3,'Diphu'),(9,'Imli',13,3,'Kohima'),(10,'Jiten',14,3,'Silchar');
CREATE TABLE marks (id INTEGER PRIMARY KEY, student_id INTEGER REFERENCES students(id), subject TEXT, score INTEGER);
INSERT INTO marks (student_id, subject, score) VALUES (1,'Maths',78),(1,'English',85),(2,'Maths',92),(2,'English',64),(3,'Maths',55),
 (3,'English',88),(4,'Maths',81),(4,'English',73),(5,'Maths',67),(5,'English',95),(6,'Maths',89),(6,'English',58),(7,'Maths',74),
 (7,'English',82),(8,'Maths',96),(8,'English',70),(9,'Maths',62),(9,'English',91),(10,'Maths',85),(10,'English',77);`;
  const PLAIN = [
    [/no such table: (\S+)/, m => 'There is no table called \u201C' + m[1] + '\u201D. Check the spelling, or look at the Tables list.'],
    [/no such column: (\S+)/, m => 'There is no column called \u201C' + m[1] + '\u201D. Check the spelling (the Tables list shows every column).'],
    [/near "(.*)": syntax error/s, m => 'SQL did not understand the code near \u201C' + m[1] + '\u201D. Look for a missing comma, bracket or quote, or a misspelt word.'],
    [/incomplete input/, () => 'The statement is not finished. Maybe a ) or a closing quote \' is missing.'],
    [/UNIQUE constraint failed: (\S+)/, m => m[1] + ' must be different in every row, and that value is already used.'],
    [/NOT NULL constraint failed: (\S+)/, m => m[1] + ' needs a value (it cannot be empty).'],
    [/table (\S+) already exists/, m => 'A table called ' + m[1] + ' already exists. Pick another name, or remove the old one first with DROP TABLE ' + m[1] + ';'],
    [/(\d+) values for (\d+) columns/, m => 'You gave ' + m[1] + ' values but there are ' + m[2] + ' columns. Give one value for each column.'],
    [/no such function: (\S+)/, m => 'SQL has no function called ' + m[1] + '.'],
    [/datatype mismatch/, () => 'That value is the wrong kind (for example text where a number is needed).']];
  const plain = msg => { for (const [re, f] of PLAIN) { const m = msg.match(re); if (m) return f(m); } return 'SQL could not do this: ' + msg; };
  const DONE = { CREATE: 'Done: created.', DROP: 'Done: removed.', ALTER: 'Done: table changed.', INSERT: n => n + (n === 1 ? ' row' : ' rows') + ' added.',
    UPDATE: n => n + (n === 1 ? ' row' : ' rows') + ' changed.', DELETE: n => n + (n === 1 ? ' row' : ' rows') + ' deleted.' };
  const LEAD = /^(?:\s+|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))*/;                                    // spaces and comments before a statement
  const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const loadScript = src => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Could not load ' + src)); document.head.append(s); });
  let engineP = null;
  const engine = () => engineP = engineP || (async () => {
    if (location.protocol !== 'file:' && window.WebAssembly) {
      try { await loadScript('vendor/sql-wasm.js'); return await initSqlJs({ locateFile: f => 'vendor/' + f }); } catch (e) { /* fall back to asm.js */ }
    }
    await loadScript('vendor/sql-asm.js'); return await initSqlJs();
  })().catch(e => { engineP = null; throw e; });

  CS.sqlMode = function ({ host, full, say }) {
    const h = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; kids.flat().forEach(k => k != null && e.append(k.nodeType ? k : String(k))); return e; };
    const list = h('ul', 'sq-list'), sum = h('summary', null, 'Tables'), side = h('details', 'sq-tables', sum, list);
    const res = h('div', 'sq-res', h('p', 'sq-note', 'Loading the SQL engine\u2026'));
    side.open = !matchMedia('(max-width: 720px) and (orientation: portrait)').matches; host.append(side, res);   // phones: tap to open
    let SQL = null, db = null, readyP = null;
    function fresh() { db && db.close(); db = new SQL.Database(); db.exec(SAMPLE); }
    function persist() {
      let b; try { b = toB64(db.export()); } catch (e) { return; }
      if (b.length > CAP) {
        try { localStorage.removeItem(DBKEY); } catch (e) { /* ignore */ }
        const t = 'Database is ' + Math.round(b.length * 0.75 / 1024) + ' KB: too big to keep on this device (about 1.5 MB). It works until you close the page. Download .db to keep it.';
        res.append(h('p', 'sq-err', t)); return say(t, 6000);
      }
      try { localStorage.setItem(DBKEY, b); } catch (e) { say('This device has no room to keep the database. Download .db to keep it.', 6000); }
    }
    const ensure = () => readyP = readyP || engine().then(S => {
      SQL = S; let saved = null; try { saved = localStorage.getItem(DBKEY); } catch (e) { /* none */ }
      if (saved) { try { db = new SQL.Database(fromB64(saved)); db.exec('SELECT 1 FROM sqlite_master LIMIT 1'); } catch (e) { db = null; } }
      if (!db) { fresh(); persist(); }
      tables(); res.replaceChildren(h('p', 'sq-note', 'Ready. Press \u25B6 Run to run your SQL. Tap a table on the list to see its rows.'));
    }, e => { readyP = null; res.replaceChildren(h('p', 'sq-err', 'The SQL engine could not load (' + e.message + '). Check the connection and try again.')); throw e; });
    const q = s => '"' + s.replace(/"/g, '""') + '"';
    function tables() {
      const r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"), names = r.length ? r[0].values.map(v => v[0]) : [];
      sum.textContent = 'Tables (' + names.length + ')';
      list.replaceChildren(...names.map(n => {
        const cols = (db.exec('PRAGMA table_info(' + q(n) + ')')[0] || { values: [] }).values, count = db.exec('SELECT COUNT(*) FROM ' + q(n))[0].values[0][0];
        const b = h('button', 'sq-tn', h('b', null, n), h('small', null, count + (count === 1 ? ' row' : ' rows')));
        b.type = 'button'; b.title = 'Show the rows of ' + n; b.onclick = () => show([{ n: 0, text: 'SELECT * FROM ' + n + ' LIMIT 200', ...table('SELECT * FROM ' + q(n) + ' LIMIT 200') }], null);
        return h('li', null, b, h('div', 'sq-cols', cols.map(c => h('span', c[5] ? 'pk' : null, (c[5] ? '\u{1F511}' : '') + c[1], h('i', null, ' ' + (c[2] || '').toLowerCase())))));
      }));
      if (!names.length) list.append(h('li', 'sq-note', 'No tables. Make one with CREATE TABLE, or Reset DB.'));
    }
    function table(sql) { const st = db.prepare(sql), cols = st.getColumnNames(), rows = []; let total = 0; while (st.step()) if (total++ < SHOW) rows.push(st.get()); st.free(); return { cols, rows, total }; }
    const cell = v => v === null ? h('td', 'null', 'NULL') : v instanceof Uint8Array ? h('td', 'null', '[' + v.length + ' bytes]') : h('td', typeof v === 'number' ? 'num' : null, String(v));
    function show(blocks, stop, ms) {
      const out = blocks.map(b => {
        const head = (b.line ? 'Line ' + b.line + ' \u00B7 ' : '') + b.text.replace(/\s+/g, ' ').slice(0, 60) + (b.text.length > 60 ? '\u2026' : '');
        if (!b.cols.length) { const d = DONE[b.kind]; return h('div', 'sq-blk', h('div', 'sq-h', h('span', null, head), h('b', 'sq-ok', '\u2713 ' + (typeof d === 'function' ? d(b.mod) : d || 'Done.')))); }
        return h('div', 'sq-blk', h('div', 'sq-h', h('span', null, head), h('b', null, b.total + (b.total === 1 ? ' row' : ' rows') + (b.total > SHOW ? ' (showing the first ' + SHOW + ')' : ''))),
          h('div', 'sq-tw', h('table', null, h('thead', null, h('tr', null, b.cols.map(c => h('th', null, c)))), h('tbody', null, b.rows.map(r => h('tr', null, r.map(cell)))))));
      });
      if (stop) out.push(h('div', 'sq-err', h('b', null, '\u26A0 Line ' + stop.line + ': '), plain(stop.msg), h('small', null, 'SQLite says: ' + stop.msg + (blocks.length ? ' \u2014 the statements above it did run.' : ''))));
      if (!blocks.length && !stop) out.push(h('p', 'sq-note', 'Nothing to run. Type a statement such as SELECT * FROM students;'));
      if (ms != null) out.push(h('p', 'sq-note', 'Finished in ' + ms + ' ms.'));
      res.replaceChildren(...out); res.scrollTop = 0;
    }
    async function run(src, base) {
      await ensure();
      const all = full(), lineAt = at => all.slice(0, base + at).split('\n').length, t0 = performance.now(), blocks = [];
      let stop = null, changed = false; const it = db.iterateStatements(src);
      try {
        for (;;) {
          const rem = it.getRemainingSQL(), at = src.length - rem.length + rem.match(LEAD)[0].length;
          let r; try { r = it.next(); } catch (e) { stop = { msg: e.message, line: lineAt(at) }; break; }
          if (r.done) break;
          const st = r.value, text = st.getSQL().replace(LEAD, ''), kind = ((text.match(/^\s*([A-Za-z]+)/) || [])[1] || '').toUpperCase();
          try {
            const cols = st.getColumnNames(), rows = []; let total = 0;
            while (st.step()) if (total++ < SHOW) rows.push(st.get());
            if (!/^(SELECT|WITH|EXPLAIN|VALUES)$/.test(kind)) changed = true;
            blocks.push({ line: lineAt(at), text, kind, cols, rows, total, mod: db.getRowsModified() });
          } catch (e) { stop = { msg: e.message, line: lineAt(at) }; changed = true; break; }
        }
      } finally { try { it.return(); } catch (e) { /* already done */ } }
      show(blocks, stop, Math.round(performance.now() - t0));
      if (changed) { persist(); tables(); }
    }
    async function resetDb() { await ensure(); fresh(); persist(); tables(); show([], null); res.replaceChildren(h('p', 'sq-note', 'The sample school database is back: classes, students and marks.')); }
    async function downloadDb(name) {
      await ensure(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([db.export()], { type: 'application/x-sqlite3' }));
      a.download = name + '.db'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); say('Downloaded ' + name + '.db');
    }
    return { ensure, run, resetDb, downloadDb };
  };
})();
