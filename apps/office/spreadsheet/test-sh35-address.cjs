#!/usr/bin/env node
/* SH35: ADDRESS, #NAME? for a function this app does not have, the
   "Not supported yet" note on open, and SUBSTITUTE cases from a real .xlsm.
   Real spreadsheet modules in a vm (no DOM); the import test uses the vendored
   SheetJS to build and open an .xlsx in memory.
   Run: node --test apps/office/spreadsheet/test-sh35-address.cjs */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const XLSX = require(path.join(dir, 'vendor/sheetjs/xlsx.full.min.js'));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

function load(extra) {
  const files = ['spreadsheet_config.js', 'spreadsheet_formula.js', 'spreadsheet_functions.js',
    'spreadsheet_refs.js', 'spreadsheet_state.js'].concat(extra || []);
  const rec = { status: [], notes: [] };
  const ctx = {
    console, Date, Math, Number, String, Boolean, Array, Object, Proxy, JSON, Promise, Map, Uint8Array, ArrayBuffer,
    parseInt, isNaN, isFinite, RegExp, Error, TypeError, NaN, Infinity, undefined, setTimeout, clearTimeout,
    document: {
      addEventListener() {}, getElementById() { return null; }, querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return { style: {}, classList: { add() {}, toggle() {} }, appendChild() {}, querySelector() { return null; } }; }
    },
    SHEET_INIT: [],
    undoRecord() {}, afterChange() {}, highlightSel() {}, applyWidths() {}, renderSheetTabs() {},
    OfficeNotify: { show(m) { rec.notes.push(m); } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(files.map(read).join('\n;\n'), ctx, { filename: 'spreadsheet-sh35.js' });
  /* state.js defines setStatus for the DOM; record it instead */
  ctx.setStatus = (m) => { rec.status.push(m); };
  ctx.XLSX = XLSX;
  return { ctx, rec };
}

function book(ctx, names) {
  ctx.emptyWorkbook();
  ctx.workbook.sheets[0].name = names[0];
  for (let i = 1; i < names.length; i++) ctx.workbook.sheets.push(ctx.makeSheet(names[i]));
  ctx.workbook.active = 0;
  ctx.bindActiveSheet();
}
function set(ctx, si, a1, f) {
  const a = ctx.parseAddr(a1);
  ctx.workbook.sheets[si].cells[a.r][a.c].formula = String(f);
}
function val(ctx, si, a1) {
  const a = ctx.parseAddr(a1);
  return ctx.workbook.sheets[si].cells[a.r][a.c].value;
}
/* Evaluate formulas in column Z of sheet 0 and return their values. */
function evalAll(ctx, formulas) {
  formulas.forEach((f, i) => set(ctx, 0, 'Z' + (i + 1), f));
  ctx.recalcAll();
  return formulas.map((f, i) => val(ctx, 0, 'Z' + (i + 1)));
}

const L = load();
const C = L.ctx;
function fresh() {
  book(C, ['Sheet1', 'Data', 'My Sheet', "Bob's"]);
  set(C, 0, 'A1', '5'); set(C, 0, 'A2', '7'); set(C, 0, 'B2', '11'); set(C, 0, 'C3', '13');
  set(C, 1, 'B3', '42'); set(C, 2, 'C4', '99'); set(C, 3, 'A1', '8');
}
function ev(formulas) { fresh(); return evalAll(C, formulas); }

/* ---------- ADDRESS ---------- */
test('ADDRESS abs_num 1-4 in A1 style (default 1)', () => {
  assert.deepEqual(ev(['=ADDRESS(2,3)', '=ADDRESS(2,3,1)', '=ADDRESS(2,3,2)', '=ADDRESS(2,3,3)', '=ADDRESS(2,3,4)', '=ADDRESS(2,3,1,TRUE)']),
    ['$C$2', '$C$2', 'C$2', '$C2', 'C2', '$C$2']);
});

test('ADDRESS column letters past Z (AA, ZZ, AAA, XFD)', () => {
  assert.deepEqual(ev(['=ADDRESS(1,26,4)', '=ADDRESS(1,27,4)', '=ADDRESS(1,702,4)', '=ADDRESS(1,703,4)', '=ADDRESS(1048576,16384)']),
    ['Z1', 'AA1', 'ZZ1', 'AAA1', '$XFD$1048576']);
});

test('ADDRESS R1C1 style per abs_num', () => {
  assert.deepEqual(ev(['=ADDRESS(2,3,1,FALSE)', '=ADDRESS(2,3,2,FALSE)', '=ADDRESS(2,3,3,FALSE)', '=ADDRESS(2,3,4,FALSE)', '=ADDRESS(2,3,1,0)', '=ADDRESS(2,3,,FALSE)']),
    ['R2C3', 'R2C[3]', 'R[2]C3', 'R[2]C[3]', 'R2C3', 'R2C3']);
});

test('ADDRESS sheet_text: plain, quoted, doubled quotes, look-alike names', () => {
  assert.deepEqual(ev([
    '=ADDRESS(1,1,1,TRUE,"Data")', '=ADDRESS(1,1,1,TRUE,"My Sheet")', '=ADDRESS(1,1,4,TRUE,"Bob\'s")',
    '=ADDRESS(1,1,1,TRUE,"A1")', '=ADDRESS(1,1,1,TRUE,"2024")', '=ADDRESS(1,1,1,TRUE,"R1C1")',
    '=ADDRESS(1,1,1,TRUE,"Q-1")', '=ADDRESS(1,1,1,FALSE,"My Sheet")', '=ADDRESS(1,1,1,TRUE,"")'
  ]), ['Data!$A$1', "'My Sheet'!$A$1", "'Bob''s'!A1", "'A1'!$A$1", "'2024'!$A$1", "'R1C1'!$A$1",
    "'Q-1'!$A$1", "'My Sheet'!R1C1", '$A$1']);
});

test('ADDRESS errors: out of range, bad abs_num, text, bad a1, error passes through', () => {
  assert.deepEqual(ev([
    '=ADDRESS(0,1)', '=ADDRESS(1,0)', '=ADDRESS(-1,1)', '=ADDRESS(1048577,1)', '=ADDRESS(1,16385)',
    '=ADDRESS(1,1,0)', '=ADDRESS(1,1,5)', '=ADDRESS("x",1)', '=ADDRESS(1,"y")', '=ADDRESS(1,1,1,"maybe")',
    '=ADDRESS(1)', '=ADDRESS(1/0,1)', '=IFERROR(ADDRESS(0,1),"bad")'
  ]), ['#VALUE!', '#VALUE!', '#VALUE!', '#VALUE!', '#VALUE!', '#VALUE!', '#VALUE!', '#VALUE!', '#VALUE!', '#VALUE!',
    '#VALUE!', '#DIV/0!', 'bad']);
});

test('ADDRESS truncates decimals and reads numeric text and cells', () => {
  assert.deepEqual(ev(['=ADDRESS(2.9,3.99)', '=ADDRESS("4","2",4)', '=ADDRESS(A1,A2,4)', '=ADDRESS(1,1,4.7)', '=ADDRESS(0.5,1)']),
    ['$C$2', 'B4', 'G5', 'A1', '#VALUE!']);
});

test('INDIRECT(ADDRESS(...)) same sheet, $ signs, other sheets, quoted names', () => {
  assert.deepEqual(ev([
    '=INDIRECT(ADDRESS(2,1))', '=INDIRECT(ADDRESS(2,2,2))', '=INDIRECT(ADDRESS(3,3,4))',
    '=INDIRECT(ADDRESS(3,2,1,TRUE,"Data"))', '=INDIRECT(ADDRESS(4,3,1,TRUE,"My Sheet"))',
    '=INDIRECT(ADDRESS(1,1,4,TRUE,"Bob\'s"))', '=INDIRECT(ADDRESS(1,1,1,TRUE,"Nope"))',
    '=INDIRECT(ADDRESS(5000,1))', '=SUM(INDIRECT(ADDRESS(1,1)&":"&ADDRESS(2,1)))',
    '=INDIRECT(ADDRESS(ROW(A2),COLUMN(B1)))'
  ]), [7, 11, 13, 42, 99, 8, '#REF!', '#REF!', 12, 11]);
});

test('INDIRECT(ADDRESS) picks up a later change to the target', () => {
  fresh();
  set(C, 0, 'Z1', '=INDIRECT(ADDRESS(3,2,1,TRUE,"Data"))');
  C.recalcAll();
  assert.equal(val(C, 0, 'Z1'), 42);
  set(C, 1, 'B3', '43');
  C.recalcAll();
  assert.equal(val(C, 0, 'Z1'), 43);
});

test('ADDRESS is in the function list under Lookup', () => {
  const item = C.fxFindName('ADDRESS');
  assert.ok(item);
  assert.equal(item.cat, 'Lookup');
  assert.match(item.sig, /^ADDRESS\(row, column, \[abs_num\], \[a1\], \[sheet_text\]\)$/);
  assert.ok(C.fxSuggest('ADDR', 8).some((x) => x.name === 'ADDRESS'));
  assert.ok(/ADDRESS\(row, col/.test(read('FUNCTIONS.txt')));
});

/* ---------- SUBSTITUTE (reported failing in the real file) ---------- */
test('SUBSTITUTE(ADDRESS(1,n,4),"1","") gives the column letters', () => {
  assert.deepEqual(ev([1, 2, 26, 27, 52, 702, 703, 16384].map((n) => '=SUBSTITUTE(ADDRESS(1,' + n + ',4),"1","")')),
    ['A', 'B', 'Z', 'AA', 'AZ', 'ZZ', 'AAA', 'XFD']);
  assert.deepEqual(ev(['=SUBSTITUTE(ADDRESS(1,COLUMN(),4),"1","")', '=SUBSTITUTE(ADDRESS(1,COLUMN(AB1),4),1,"")']),
    ['Z', 'AB']);
});

test('SUBSTITUTE: numbers, empty new text, instance, case of the name, empty cell', () => {
  assert.deepEqual(ev([
    '=SUBSTITUTE(123,"2","x")', '=SUBSTITUTE(A1,5,6)&""', '=SUBSTITUTE("a-b-c","-","")', '=SUBSTITUTE("a-b-c","-","+",2)',
    '=SUBSTITUTE("a-b-c","-","+",3)', '=SUBSTITUTE("aaa","a","b",0)', '=substitute("abc","b","x")', '=Substitute("abc","B","x")',
    '=SUBSTITUTE(Y99,"x","")&"!"', '=SUBSTITUTE("a,b)",",","")', '=LEN(SUBSTITUTE("a b c"," ",""))', '=SUBSTITUTE("abc","","x")'
  ]), ['1x3', '6', 'abc', 'a-b+c', 'a-b-c', '#VALUE!', 'axc', 'abc', '!', 'ab)', 3, 'abc']);
});

test('SUBSTITUTE inside INDIRECT, and around a sheet-qualified ADDRESS', () => {
  assert.deepEqual(ev([
    '=INDIRECT(SUBSTITUTE("A#","#",2))', '=INDIRECT(SUBSTITUTE(ADDRESS(2,2),"$",""))',
    '=INDIRECT(SUBSTITUTE(ADDRESS(1,3,4),"1","")&"3")', '=SUBSTITUTE(ADDRESS(3,2,1,TRUE,"My Sheet"),"$","")',
    '=INDIRECT(SUBSTITUTE(ADDRESS(4,3,1,TRUE,"My Sheet"),"$",""))'
  ]), [7, 11, 13, "'My Sheet'!B3", 99]);
});

/* ---------- joining strings (the SUBSTITUTE failures) ---------- */
test('a formula or argument that starts and ends with "..." but joins strings is joined', () => {
  assert.deepEqual(ev([
    '="a"&"b"', '="a" & "b"', '=""&"b"', '="a"&""', '="x"', '=""', '="a,b"&"c(d"',
    '=INDIRECT("A"&"2")', '=LEN("ab"&"c")', '=SUBSTITUTE("a"&"-b","-","")',
    '=UPPER(SUBSTITUTE("x-y","-","")&"z")', '=INDIRECT(SUBSTITUTE(ADDRESS(1,2,4),"1","")&"2")',
    '=INDIRECT(SUBSTITUTE(ADDRESS(1,1,4),"1","")&"1:"&SUBSTITUTE(ADDRESS(1,1,4),"1","")&"2")'
  ]), ['ab', 'ab', 'b', 'a', 'x', '', 'a,bc(d', 7, 3, 'ab', 'XYZ', 11, '5']);
  assert.deepEqual(ev(['=SUM(INDIRECT(SUBSTITUTE(ADDRESS(1,1,4),"1","")&"1:"&SUBSTITUTE(ADDRESS(1,1,4),"1","")&"2"))']), [12]);
});

/* ---------- #NAME? ---------- */
test('a function this app does not have is #NAME?, a known one with bad input is not', () => {
  assert.deepEqual(ev(['=FOO(1)', '=offset(A1,1,0)', '=IFERROR(FOO(1),"x")', '=Z1', '=STDEV.S(A1:A2)', '=ISERROR(Z1)']),
    ['#NAME?', '#NAME?', 'x', '#NAME?', '#NAME?', '#NAME?']);
  /* a known function with bad input keeps its own error (#ERR here, as before SH35) */
  assert.deepEqual(ev(['=SQRT("x")']), ['#ERR']);
  assert.ok(C.isErrorValue('#NAME?'));
  assert.ok(vm.runInContext('SPREADSHEET_CONFIG.errorValues', C).indexOf('#NAME?') !== -1);
  assert.equal(C.evalFunc('NOPE', []), '#NAME?');
  /* every listed function is dispatched (none falls through to #NAME?) */
  for (const item of C.FX_CATALOG) assert.notEqual(C.evalFunc(item.name, ['1', '1', '1']), '#NAME?', item.name);
});

/* ---------- unsupported-functions scan ---------- */
test('fxFormulaNames: names, prefixes stripped, strings and sheet names skipped', () => {
  const names = (f) => Array.from(C.fxFormulaNames(f));
  assert.deepEqual(names('=SUM(A1,offset(B1,1,0))'), ['SUM', 'OFFSET']);
  assert.deepEqual(names('=_xlfn.CONCAT(A1,B1)&_xlfn._xlws.SORT(A1:A3)'), ['CONCAT', 'SORT']);
  assert.deepEqual(names('=COM.MICROSOFT.IFS(TRUE,1)'), ['IFS']);
  assert.deepEqual(names('="FAKE(1)"&LEN("x")'), ['LEN']);
  assert.deepEqual(names("='Odd (1)'!A1+ROUND(1,0)"), ['ROUND']);
  assert.deepEqual(names('=STDEV.S(A1:A3)'), ['STDEV.S']);
  assert.deepEqual(names('plain text (not a formula)'), []);
  assert.deepEqual(names('=A1+$B$2'), []);
});

test('fxScanUnknown / fxUnknownNote over every sheet: names, counts, known ignored', () => {
  book(C, ['One', 'Two']);
  set(C, 0, 'A1', '=OFFSET(A2,1,0)');
  set(C, 0, 'A2', '=SUM(OFFSET(A3,1,0),XYZ(1))');
  set(C, 0, 'A3', '=SUBSTITUTE(ADDRESS(1,1,4),"1","")');
  set(C, 0, 'A4', '=_xlfn.CONCAT("a","b")');
  set(C, 1, 'B9', '=offset(A1,0,0)');
  set(C, 1, 'C1', 'OFFSET(not a formula)');
  set(C, 1, 'C2', '="OFFSET(1)"');
  const res = C.fxScanUnknown(C.workbook.sheets);
  assert.deepEqual(Array.from(res.names), ['OFFSET', 'XYZ']);
  assert.equal(res.cells, 3);
  assert.equal(C.fxUnknownNote(C.workbook.sheets), 'Not supported yet: OFFSET, XYZ (3 cells)');
  book(C, ['Only']);
  set(C, 0, 'A1', '=SUM(1,2)');
  assert.equal(C.fxUnknownNote(C.workbook.sheets), '');
  set(C, 0, 'A2', '=AAA(1)+BBB(1)+CCC(1)+DDD(1)+EEE(1)+FFF(1)+GGG(1)+HHH(1)');
  assert.equal(C.fxUnknownNote(C.workbook.sheets), 'Not supported yet: AAA, BBB, CCC, DDD, EEE, FFF +2 more (1 cell)');
});

test('opening an .xlsx: the open toast ends with the note; formulas are kept as read', async () => {
  const { ctx, rec } = load(['spreadsheet_storage.js', 'spreadsheet_format.js', 'spreadsheet_style.js', 'spreadsheet_files.js', 'spreadsheet_xlsx.js']);
  ctx.xlsxLoad = () => Promise.resolve(XLSX);
  const ws = {
    A1: { t: 'n', v: 1 }, B1: { t: 's', v: 'A', f: 'SUBSTITUTE(ADDRESS(1,A1,4),"1","")' },
    C1: { t: 'n', v: 0, f: 'OFFSET(A1,0,0)' }, D1: { t: 'n', v: 0, f: 'XYZ(1)+OFFSET(A1,1,0)' }, '!ref': 'A1:D1'
  };
  const ws2 = { A1: { t: 'n', v: 0, f: 'Sheet1!A1+1' }, '!ref': 'A1' };
  const buf = XLSX.write({ SheetNames: ['Sheet1', 'Other'], Sheets: { Sheet1: ws, Other: ws2 } }, { bookType: 'xlsx', type: 'buffer' });
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  ctx.importXlsxFile({ name: 'real.xlsm', arrayBuffer: () => Promise.resolve(ab) }, {});
  for (let i = 0; i < 200 && !rec.status.some((m) => /^Loaded/.test(m)); i++) await new Promise((r) => setTimeout(r, 5));
  const msg = rec.status.filter((m) => /^Loaded/.test(m)).pop();
  assert.equal(msg, 'Loaded 2 sheets. Not supported yet: OFFSET, XYZ (2 cells)');
  assert.ok(rec.notes.indexOf(msg) !== -1);
  vm.runInContext('recalcAll()', ctx);
  const s0 = ctx.workbook.sheets[0].cells[0];
  assert.equal(s0[1].formula, '=SUBSTITUTE(ADDRESS(1,A1,4),"1","")');
  assert.equal(s0[1].value, 'A');
  assert.equal(s0[2].value, '#NAME?');
});

test('opening a workbook with only known functions adds no note', async () => {
  const { ctx, rec } = load(['spreadsheet_storage.js', 'spreadsheet_format.js', 'spreadsheet_style.js', 'spreadsheet_files.js', 'spreadsheet_xlsx.js']);
  ctx.xlsxLoad = () => Promise.resolve(XLSX);
  const buf = XLSX.write({ SheetNames: ['S'], Sheets: { S: { A1: { t: 'n', v: 2, f: 'SUM(1,1)' }, '!ref': 'A1' } } }, { bookType: 'xlsx', type: 'buffer' });
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  ctx.importXlsxFile({ name: 'ok.xlsx', arrayBuffer: () => Promise.resolve(ab) }, {});
  for (let i = 0; i < 200 && !rec.status.some((m) => /^Loaded/.test(m)); i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(rec.status.filter((m) => /^Loaded/.test(m)).pop(), 'Loaded 1 sheet');
});

test('.hos open shows the note too (applyDoc)', () => {
  const src = read('spreadsheet_hos.js');
  const body = src.slice(src.indexOf('function applyDoc(doc)'), src.indexOf('Hos.applyToWorkbook = applyDoc'));
  assert.ok(/fxUnknownNote\(sheets\)/.test(body));
  assert.ok(/OfficeNotify\.show\(note\)/.test(body));
  assert.ok(!/alert\(|confirm\(|OfficeDialog/.test(body));
});

/* ---------- wiring ---------- */
test('wiring: title, VERSION, ?v= tokens, readme', () => {
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH35</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH35) <title>Spreadsheet SH33</title> -->') !== -1);
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  /* (before SH36) every file below was checked for ?v=SH35; SH36 bumps settings. */
  for (const f of ['spreadsheet_config.js', 'spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_xlsx.js', 'spreadsheet_hos.js']) {
    /* (before SH39) assert.ok(live.indexOf(f + '?v=SH35') !== -1, f); */
    /* (before SH40a) assert.ok(live.indexOf(f + '?v=SH35') !== -1 || live.indexOf(f + '?v=SH39') !== -1, f); */
    /* (before SH42) assert.ok(live.indexOf(f + '?v=SH35') !== -1 || live.indexOf(f + '?v=SH39') !== -1 || live.indexOf(f + '?v=SH40a') !== -1, f);   // SH39: config, hos; SH40a: xlsx */
    /* (before SH44) assert.ok(live.indexOf(f + '?v=SH35') !== -1 || live.indexOf(f + '?v=SH39') !== -1 || live.indexOf(f + '?v=SH40a') !== -1 || live.indexOf(f + '?v=SH42') !== -1, f);   // SH39: config, hos; SH40a: xlsx */
    assert.ok(live.indexOf(f + '?v=SH35') !== -1 || live.indexOf(f + '?v=SH39') !== -1 || live.indexOf(f + '?v=SH40a') !== -1 || live.indexOf(f + '?v=SH42') !== -1 || live.indexOf(f + '?v=SH44') !== -1, f);   // SH39: config, hos; SH40a: xlsx
  }
  /* (before SH37) assert.ok(live.indexOf('spreadsheet_settings.js?v=SH35') !== -1 || live.indexOf('spreadsheet_settings.js?v=SH36') !== -1, 'spreadsheet_settings.js'); */
  /* (before SH40) assert.ok(/spreadsheet_settings\.js\?v=SH3[5-9]/.test(live), 'spreadsheet_settings.js'); */
  /* (before SH41) assert.ok(/spreadsheet_settings\.js\?v=SH(3[5-9]|40)/.test(live), 'spreadsheet_settings.js'); */
  /* (before SH42) assert.ok(/spreadsheet_settings\.js\?v=SH(3[5-9]|40|41)/.test(live), 'spreadsheet_settings.js'); */
  /* (before SH44) assert.ok(/spreadsheet_settings\.js\?v=SH(3[5-9]|4[0-2])/.test(live), 'spreadsheet_settings.js'); */
  assert.ok(/spreadsheet_settings\.js\?v=SH(3[5-9]|4[0-4])/.test(live), 'spreadsheet_settings.js');
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH35";') !== -1);
  const readme = read('spreadsheet_readme.md');
  assert.ok(readme.indexOf('## SH35') !== -1);
  const sec = readme.slice(readme.indexOf('## SH35'));
  assert.ok(/ADDRESS/.test(sec) && /#NAME\?/.test(sec) && /Not supported yet/.test(sec) && /_xlws/.test(sec));
});
