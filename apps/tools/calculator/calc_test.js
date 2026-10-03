/*
 * Calculator — calc_test.js  (not loaded by the page)
 * Unit tests for the parser and formatter:  node calc_test.js
 */
'use strict';
globalThis.window = globalThis;
require('./calc_config.js');
require('./calc_parse.js');
require('./calc_format.js');
const { parse: P, format: F } = globalThis.CALC;

let pass = 0, failN = 0;
const ok = (name, cond, got) => { if (cond) pass++; else { failN++; console.log('FAIL', name, '→', got); } };
const ev = (s, angle) => { try { return P.evaluate(s, { angle: angle || 'deg' }); } catch (e) { return 'E:' + e.code; } };
const show = (s, angle) => { const v = ev(s, angle); return typeof v === 'number' ? F.format(v) : v; };
const eq = (s, want, angle) => { const got = show(s, angle); ok(s + (angle ? ' [' + angle + ']' : ''), got === want, got); };

// precedence / associativity
eq('2+3*4', '14'); eq('(2+3)*4', '20'); eq('10-4-3', '3'); eq('100/10/5', '2'); eq('2^3^2', '512');
eq('2*3^2', '18'); eq('-2^2', '-4'); eq('(-2)^2', '4'); eq('2^-1', '0.5'); eq('-3!', '-6'); eq('2^3!', '64');
eq('8/2(2+2)', '16'); eq('2π', '6.28318530718'); eq('2(3)', '6'); eq('(1+1)(2+2)', '8'); eq('3sin(30)', '1.5');
// floating point tidy
eq('0.1+0.2', '0.3'); eq('0.1*3', '0.3'); eq('1/3', '0.333333333333'); eq('2/3', '0.666666666667'); eq('1.1*1.1', '1.21');
eq('0.3-0.1', '0.2'); eq('1-0.9', '0.1');
// divide by zero & domain
eq('5/0', 'E:div0'); eq('0/0', 'E:div0'); eq('5/(2-2)', 'E:div0'); eq('√(-4)', 'E:domain'); eq('ln(0)', 'E:domain');
eq('log(-1)', 'E:domain'); eq('(-8)^(1/3)', 'E:domain');
// percent
eq('50%', '0.5'); eq('200+10%', '220'); eq('200-10%', '180'); eq('200*10%', '20'); eq('200/10%', '2,000');
eq('10%+5', '5.1'); eq('(100+100)+50%', '300');
// unary minus
eq('-5+2', '-3'); eq('5*-2', '-10'); eq('5--2', '7'); eq('-(2+3)', '-5'); eq('--4', '4'); eq('+4', '4'); eq('2-5', '-3');
// factorial
eq('5!', '120'); eq('0!', '1'); eq('170!', '7.25741561531e+306'); eq('171!', 'E:overflow'); eq('3.5!', 'E:fact'); eq('(-3)!', 'E:fact');
// trig deg / rad
eq('sin(30)', '0.5'); eq('cos(60)', '0.5'); eq('tan(45)', '1'); eq('sin(180)', '0'); eq('cos(90)', '0'); eq('tan(90)', 'E:undef');
eq('tan(-90)', 'E:undef'); eq('sin(-30)', '-0.5'); eq('sin(π/6)', '0.5', 'rad'); eq('cos(π)', '-1', 'rad'); eq('sin(π)', '0', 'rad');
eq('tan(π/2)', 'E:undef', 'rad'); eq('sin(30)', '-0.988031624093', 'rad');
// functions
eq('√(16)', '4'); eq('√(2)', '1.41421356237'); eq('ln(e)', '1'); eq('log(1000)', '3'); eq('e', '2.71828182846'); eq('√(9)+√(16)', '7');
eq('sin(cos(0)*90)', '1');
// unbalanced / syntax
eq('(2+3', '5'); eq('((2+3)*(4', '20'); eq('√(16', '4'); eq('sin(30', '0.5'); eq('2+3)', 'E:syntax'); eq(')(', 'E:syntax');
eq('()', 'E:syntax'); eq('5+', 'E:syntax'); eq('*5', 'E:syntax'); eq('', 'E:empty'); eq('5..2', 'E:syntax'); eq('sin', 'E:syntax');
eq('2++3', '5'); eq('(', 'E:syntax');
// overflow / big / small
eq('10^308*10', 'E:overflow'); eq('10^400', 'E:overflow'); eq('99999999*99999999', '9.9999998e+15'); eq('999999999999*999999999999', '9.99999999998e+23');
eq('123456789012', '123,456,789,012'); eq('1234567890123', '1,234,567,890,123'); eq('999999999999999', '999,999,999,999,999');
eq('10^15', '1e+15'); eq('1/10^12', '1e-12'); eq('0.000001234', '0.000001234'); eq('1/3*10^-6', '0.000000333333333333'); eq('1/3*10^-10', '3.33333333333e-11');
eq('1234567.891', '1,234,567.891'); eq('-1234.5', '-1,234.5'); eq('2^53+1', '9.00719925474e+15');
// formatter direct
ok('format -0', F.format(-0) === '0', F.format(-0));
ok('format 9.99999999999999e14 rounding', F.format(999999999999999.9) === '1e+15', F.format(999999999999999.9));
ok('groupNumber typing', F.groupNumber('12345.') === '12,345.' && F.groupNumber('1234567.0012') === '1,234,567.0012', F.groupNumber('12345.'));
// plain (continue from answer)
const pl = (x, want) => ok('plain ' + x, F.plain(x) === want, F.plain(x));
pl(0.1 + 0.2, '0.3'); pl(-3, '-3'); pl(1e21, '1000000000000000000000'); pl(1.5e-12, '0.0000000000015'); pl(123.456, '123.456'); pl(-2.5e-7, '-0.00000025');
ok('plain round-trips through evaluate', ev(F.plain(1 / 3) + '*3') === 0.999999999999999 || Math.abs(ev(F.plain(1 / 3) + '*3') - 1) < 1e-14, ev(F.plain(1 / 3) + '*3'));
// tokenizer
ok('tokenize sin(', JSON.stringify(P.tokenize('2sin(30)').map((t) => t.type)) === '["num","fn","lp","num","rp"]', P.tokenize('2sin(30)').map((t) => t.type));
ok('openCount', P.openCount(P.tokenize('((2+3)*(4')) === 2, P.openCount(P.tokenize('((2+3)*(4')));
ok('unary detection', P.isUnaryAt(P.tokenize('5*-2'), 2) && !P.isUnaryAt(P.tokenize('5-2'), 1), '');
ok('no eval in sources', !/\beval\s*\(|new Function/.test(require('fs').readFileSync(__dirname + '/calc_parse.js', 'utf8')), '');

// ----- editing rules (calc_state.js) with a fake localStorage -----
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
require('./calc_state.js');
const C = globalThis.CALC, St = C.state;
const KEYS = { '±': 'neg', '<': 'back', 'C': 'clear', '²': 'sq', 'π': 'pi', '√': 'sqrt' };
// type: space-separated keys; words like sin/cos/ans/angle are key names
const type = (seq) => { C.press('clear'); for (const k of seq.split(' ').filter(Boolean)) if (!C.press(KEYS[k] || k)) throw new Error('key ' + k); };
const shown = () => (St.error ? 'ERR:' + St.error : St.evaluated ? F.format(St.ans) : St.expr);
const scen = (seq, want) => { type(seq); ok('keys [' + seq + ']', shown() === want, shown()); };

scen('0 . 1 + 0 . 2 =', '0.3');
scen('2 + 3 * 4 =', '14');
scen('5 / 0 =', "ERR:Can't divide by 0");
scen('2 + 3 = =', '8');                 // repeated = repeats "+3"
scen('2 * 3 = = =', '54');
scen('2 + 3 = + 4 =', '9');             // operator continues from the answer
scen('2 + 3 = 7', '7');                 // digit starts fresh
scen('2 + 3 = 7 =', '7');
scen('- 5 + 2 =', '-3');                // negative start
scen('2 - 5 = * 3 =', '-9');
scen('1 . 2 . 3', '1.23');              // one decimal point per number
scen('. 5 + . 5 =', '1');
scen('0 0 7', '7');                     // no leading zeros
scen('5 + * 2', '5*2');                 // operator replaces operator
scen('5 * - 2 =', '-10');               // unary minus after ×
scen('5 * - + 2', '5+2');               // "×−" replaced by "+"
scen('1 + < 2 =', '12');                // backspace removes the operator for real
scen('1 2 < + 3 =', '4');
scen('1 2 = < + 5 =', '6');             // backspace after = edits "12" → "1"
scen('5 ±', '-5'); scen('5 ± ±', '5'); scen('5 + 3 ±', '5-3'); scen('5 * 3 ±', '5*-3');
scen('( 2 + 3 ) ±', '-(2+3)'); scen('sin 3 0 ) ±', '-sin(30)');
scen('2 + 3 = ±', '-5');
scen('5 0 %', '50%'); scen('2 0 0 + 1 0 % =', '220'); scen('5 % %', '5%');
scen('( 2 + 3', '(2+3'); scen('( 2 + 3 =', '5'); scen(')', ''); scen('( )', '(');
scen('sin 3 0 =', '0.5'); scen('angle sin 3 0 =', '-0.988031624093'); scen('angle', '');
scen('sin <', ''); scen('2 sin', '2sin(');
scen('3 ² =', '9'); scen('2 ^ 1 0 =', '1,024'); scen('5 ! =', '120'); scen('π', 'π'); scen('2 π =', '6.28318530718');
scen('√ 1 6 =', '4'); scen('2 π 3', '2π*3');
scen('9 = 1 + ans =', '10');
scen('5 +', '5+'); type('5 + ='); ok('5+= error', St.error === 'Incomplete expression', St.error);
type('5 + ='); C.press('6'); ok('typing clears error', !St.error && St.expr === '5+6', St.expr);
scen('1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8', '1234567890123456');   // 16 digits max per number
type('9 9 9 9 9 9 9 9 * 9 9 9 9 9 9 9 9 ='); ok('overflow digits shown as e', F.format(St.ans) === '9.9999998e+15', F.format(St.ans));
// live result
type('2 + 3 * 4'); ok('live 14', St.live() === 14, St.live());
type('2 +'); ok('live incomplete null', St.live() === null, St.live());
type('4 2'); ok('live plain number null', St.live() === null, St.live());
// history
C.history.clear();
type('1 + 1 ='); type('2 * 3 ='); type('2 * 3 =');
ok('history newest first, no dup', St.history.length === 2 && St.history[0].e === '2*3' && St.history[0].r === 6, JSON.stringify(St.history));
ok('history saved', JSON.parse(store.calc_history).length === 2, store.calc_history);
for (let i = 0; i < 25; i++) type('1 + ' + String(i).split('').join(' ') + ' =');
ok('history max 20', St.history.length === 20, St.history.length);
type('( 2 + 3 ='); ok('history stores closed brackets', St.history[0].e === '(2+3)', St.history[0].e);
type('7 *'); C.insertValue(St.history[1].r); ok('reuse history after operator', St.expr === '7*25', St.expr);
type('7'); C.insertValue(5); ok('reuse history replaces? (appends ×)', St.expr === '7*5', St.expr);
const hn = St.history.length; type('4 2 ='); ok('plain number not in history', St.history.length === hn, St.history.length);
C.press('clear'); C.press('angle'); ok('angle saved', store.calc_angle === 'rad', store.calc_angle); C.press('angle');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
