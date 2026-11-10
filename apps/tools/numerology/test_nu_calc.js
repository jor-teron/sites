/* Node tests for Numerology NU1 (nu_calc.js).
   Run: node test_nu_calc.js
   No DOM, no jsdom, no browser. */
'use strict';

var Nu = require('./nu_calc.js');
var fails = [];

function eq(name, a, b) {
  var sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) fails.push(name + ' got ' + sa + ' expected ' + sb);
  else console.log('ok', name);
}

function ok(name, cond, detail) {
  if (cond) console.log('ok', name);
  else fails.push(name + (detail ? (' ' + detail) : ''));
}

// ---- reduce and masters ----
eq('reduce 10', Nu.reduce(10), 1);
eq('reduce 19', Nu.reduce(19), 1);
eq('reduce 11 keeps master', Nu.reduce(11), 11);
eq('reduce 22 keeps master', Nu.reduce(22), 22);
eq('reduce 33 keeps master', Nu.reduce(33), 33);
eq('reduce 44', Nu.reduce(44), 8);
eq('reduce 38', Nu.reduce(38), 11);
eq('reduce 29', Nu.reduce(29), 11);
eq('reduce 2009 year digits', Nu.reduce(2009), 11);
eq('reduce 1966 year digits', Nu.reduce(1966), 22);
eq('reduce 1990 year digits', Nu.reduce(1990), 1);
ok('isMaster 11', Nu.isMaster(11));
ok('isMaster not 12', !Nu.isMaster(12));

// ---- letter maps ----
var i, letter, sumP = 0, valsC = {};
for (i = 0; i < 26; i++) {
  letter = String.fromCharCode(65 + i);
  ok('pyth ' + letter, Nu.PYTH[letter] >= 1 && Nu.PYTH[letter] <= 9, String(Nu.PYTH[letter]));
  ok('chal ' + letter, Nu.CHAL[letter] >= 1 && Nu.CHAL[letter] <= 8, String(Nu.CHAL[letter]));
  ok('chal no 9 for ' + letter, Nu.CHAL[letter] !== 9);
  sumP += Nu.PYTH[letter];
}
eq('pyth A-I is 1-9', [Nu.PYTH.A, Nu.PYTH.I, Nu.PYTH.J, Nu.PYTH.R, Nu.PYTH.S, Nu.PYTH.Z], [1, 9, 1, 9, 1, 8]);
eq('chal Cheiro row 1', [Nu.CHAL.A, Nu.CHAL.I, Nu.CHAL.J, Nu.CHAL.Q, Nu.CHAL.Y], [1, 1, 1, 1, 1]);
eq('chal Cheiro 8', [Nu.CHAL.F, Nu.CHAL.P], [8, 8]);
eq('chal O Z are 7', [Nu.CHAL.O, Nu.CHAL.Z], [7, 7]);

// ---- dates ----
ok('parse 1990-07-15', !!Nu.parseISO('1990-07-15'));
ok('reject 2024-02-30', Nu.parseISO('2024-02-30') === null);
ok('reject 2023-02-29', Nu.parseISO('2023-02-29') === null);
ok('leap 2024-02-29', !!Nu.parseISO('2024-02-29'));
ok('reject junk', Nu.parseISO('15/07/1990') === null);

eq('life path 1990-07-15', Nu.lifePath('1990-07-15').reduced, 5);
eq('life path parts 1990-07-15', [Nu.lifePath('1990-07-15').month, Nu.lifePath('1990-07-15').day, Nu.lifePath('1990-07-15').year], [7, 6, 1]);
eq('life path Einstein 1879-03-14', Nu.lifePath('1879-03-14').reduced, 6);
eq('life path 11: 1966-05-29', Nu.lifePath('1966-05-29').reduced, 11);
eq('life path 22: 1989-02-11', Nu.lifePath('1989-02-11').reduced, 22);
eq('life path 33: 2009-11-11', Nu.lifePath('2009-11-11').reduced, 33);
eq('birthday 15', Nu.birthday('1990-07-15'), 6);
eq('birthday 11 kept', Nu.birthday('1989-02-11'), 11);
eq('birthday 22 kept', Nu.birthday('1983-02-22'), 22);
eq('birthday 29 -> 11', Nu.birthday('1966-05-29'), 11);
eq('birthday 1', Nu.birthday('2000-01-01'), 1);
ok('life path bad date', Nu.lifePath('nope') === null);

// ---- Pythagorean names ----
eq('JOHN expression', Nu.nameParts('John', 'pythagorean', 'all').reduced, 2);
eq('JOHN soul O=6', Nu.nameParts('John', 'pythagorean', 'vowels').reduced, 6);
eq('JOHN personality 14->5', Nu.nameParts('John', 'pythagorean', 'consonants').reduced, 5);
eq('ANN destiny 11', Nu.nameParts('Ann', 'pythagorean', 'all').reduced, 11);
eq('ANN soul 1', Nu.nameParts('Ann', 'pythagorean', 'vowels').reduced, 1);

// Y-rule
ok('MARY Y is vowel', Nu.isVowelAt('MARY', 3));
ok('Y at start of YNN is vowel', Nu.isVowelAt('YNN', 0));
ok('KAY Y is consonant (next to A)', !Nu.isVowelAt('KAY', 2));
ok('LYNN Y is vowel', Nu.isVowelAt('LYNN', 1));
ok('YELLOW Y is consonant (next to E)', !Nu.isVowelAt('YELLOW', 0));
eq('MARY expression', Nu.nameParts('Mary', 'pythagorean', 'all').reduced, 3);
eq('MARY soul A+Y=8', Nu.nameParts('Mary', 'pythagorean', 'vowels').reduced, 8);
eq('MARY personality 13->4', Nu.nameParts('Mary', 'pythagorean', 'consonants').reduced, 4);
eq('LYNN soul Y=7', Nu.nameParts('Lynn', 'pythagorean', 'vowels').reduced, 7);
eq('KAY soul A only', Nu.nameParts('Kay', 'pythagorean', 'vowels').reduced, 1);
eq('KAY personality K+Y=9', Nu.nameParts('Kay', 'pythagorean', 'consonants').reduced, 9);

// Einstein
var einAll = Nu.nameParts('Albert Einstein', 'pythagorean', 'all');
var einSoul = Nu.nameParts('Albert Einstein', 'pythagorean', 'vowels');
var einPers = Nu.nameParts('Albert Einstein', 'pythagorean', 'consonants');
eq('Einstein expression 9', einAll.reduced, 9);
eq('Einstein soul 7', einSoul.reduced, 7);
eq('Einstein personality 11', einPers.reduced, 11);

// punctuation, accents, empty
eq('hyphenated Mary-Jane words', Nu.wordsOf("Mary-Jane"), ['MARY', 'JANE']);
eq("O'Neil words", Nu.wordsOf("O'Neil"), ['O', 'NEIL']);
eq('Jose accent folds', Nu.wordsOf('José'), ['JOSE']);
eq('empty name reduced 0', Nu.nameParts('', 'pythagorean', 'all').reduced, 0);
eq('digits only reduced 0', Nu.nameParts('123', 'pythagorean', 'all').reduced, 0);

// ---- Chaldean ----
eq('Chaldean JOHN 18->9', Nu.nameParts('John', 'chaldean', 'all').reduced, 9);
eq('Chaldean ANN 11', Nu.nameParts('Ann', 'chaldean', 'all').reduced, 11);
eq('Chaldean Einstein 46->1', Nu.nameParts('Albert Einstein', 'chaldean', 'all').reduced, 1);
eq('Chaldean Einstein soul 18->9', Nu.nameParts('Albert Einstein', 'chaldean', 'vowels').reduced, 9);
eq('Chaldean Einstein personality 28->1', Nu.nameParts('Albert Einstein', 'chaldean', 'consonants').reduced, 1);

// system default is Pythagorean
eq('default system is pythagorean', Nu.profile('Ann', '1990-07-15').system, 'pythagorean');
eq('profile Ann life path + destiny', [Nu.profile('Ann', '1990-07-15').lifePath, Nu.profile('Ann', '1990-07-15').expression], [5, 11]);

// ---- timing (calendar year) ----
eq('personal year 1990-07-15 in 2026', Nu.personalYear('1990-07-15', '2026-11-10'), 5);
eq('personal month Nov 2026', Nu.personalMonth('1990-07-15', '2026-11-10'), 7);
eq('personal day 10 Nov 2026', Nu.personalDay('1990-07-15', '2026-11-10'), 8);
eq('personal year uses Jan 1 (before birthday)', Nu.personalYear('1990-07-15', '2026-01-02'), 5);
ok('timing bad date', Nu.personalYear('nope', '2026-11-10') === null);

// ---- compatibility ----
var c15 = Nu.compat(1, 5);
eq('compat 1-5 score 90', c15.score, 90);
eq('compat 1-5 Easy', c15.label, 'Easy');
eq('compat symmetric 5-1', Nu.compat(5, 1).score, 90);
eq('compat 1-4 needs work', Nu.compat(1, 4).label, 'Needs work');
eq('compat 11-2 uses table 85', Nu.compat(11, 2).score, 85);
eq('compat 22-22', Nu.compat(22, 22).score, 80);
eq('compat 22-4', Nu.compat(22, 4).score, 90);
eq('compat 33-6', Nu.compat(33, 6).score, 90);
ok('same number note', /Same Life Path/.test(Nu.compat(7, 7).note));
ok('master note', /master number/.test(Nu.compat(11, 1).note));
ok('meaning 5', /Freedom/.test(Nu.meaning(5)));
ok('year meaning 5', /change/.test(Nu.yearMeaning(5)));
ok('meaning 33', /master/.test(Nu.meaning(33)));

// profile with asOf
var p = Nu.profile('John Smith', '1990-07-15', 'pythagorean', '2026-11-10');
ok('profile hasName', p.hasName);
eq('profile personal day', p.personalDay, 8);
ok('profile invalid dob', Nu.profile('John', 'bad') === null);

if (fails.length) {
  console.log('\n' + fails.length + ' FAILED');
  fails.forEach(function (f) { console.log('FAIL', f); });
  process.exit(1);
}
console.log('\nAll tests passed.');
