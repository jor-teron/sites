/* Node tests for Password Manager PW2 CSV import (Chrome, Firefox, Bitwarden).
   Run: node apps/tools/password-manager/tests/pm_csv_test.js */
'use strict';

var path = require('path');
var PMCsv = require(path.join(__dirname, '..', 'pm_csv.js'));

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

function csvTests() {
  eq('split simple', PMCsv.splitCsvLine('a,b,c'), ['a', 'b', 'c']);
  eq('split quoted comma', PMCsv.splitCsvLine('"a,b",c'), ['a,b', 'c']);
  eq('split escaped quote', PMCsv.splitCsvLine('"say ""hi""",x'), ['say "hi"', 'x']);

  var chrome = PMCsv.importCsv(
    'name,url,username,password,note\n' +
    'GitHub,https://github.com,jor,s3cret,dev\n' +
    'Bank,https://bank.example,me,hunter2,\n'
  );
  eq('chrome format', chrome.format, 'chrome');
  eq('chrome count', chrome.entries.length, 2);
  eq('chrome title', chrome.entries[0].title, 'GitHub');
  eq('chrome user', chrome.entries[0].username, 'jor');
  eq('chrome pw', chrome.entries[0].password, 's3cret');
  eq('chrome url', chrome.entries[0].url, 'https://github.com');
  eq('chrome note', chrome.entries[0].notes, 'dev');

  var firefox = PMCsv.importCsv(
    'url,username,password,httpRealm,formActionOrigin,guid,timeCreated,timeLastUsed,timePasswordChanged\n' +
    'https://mozilla.org,alice,foxpass,,,,1600000000000,1600000000000,1600000000000\n'
  );
  eq('firefox format', firefox.format, 'firefox');
  eq('firefox title fallback', firefox.entries[0].title, 'mozilla.org');
  eq('firefox user', firefox.entries[0].username, 'alice');
  eq('firefox changed', firefox.entries[0].passwordChanged, '2020-09-13T12:26:40.000Z');

  var bitwarden = PMCsv.importCsv(
    'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n' +
    'Work,1,login,Mail,office notes,"n: v",0,https://mail.example,jor,pw,otpauth://totp/Mail?secret=MFRGGZDF\n' +
    ',0,note,Secret,"a private note",,0,,,,\n' +
    ',0,card,Visa,"",,0,,,,\n'
  );
  eq('bitwarden format', bitwarden.format, 'bitwarden');
  eq('bitwarden count', bitwarden.entries.length, 3);
  var login = bitwarden.entries[0];
  eq('bw title', login.title, 'Mail');
  eq('bw user', login.username, 'jor');
  eq('bw totp kept', login.totp, 'otpauth://totp/Mail?secret=MFRGGZDF');
  eq('bw favourite', login.favourite, true);
  eq('bw tag from folder', login.tags, ['Work']);
  eq('bw note type', bitwarden.entries[1].type, 'note');
  eq('bw note text', bitwarden.entries[1].text, 'a private note');
  eq('bw card type', bitwarden.entries[2].type, 'card');

  var quoted = PMCsv.importCsv('name,url,username,password,note\n"Acme, Inc",https://acme.example,u,"p,w","line1\nline2"\n');
  eq('quoted name with comma', quoted.entries[0].title, 'Acme, Inc');
  eq('quoted password comma', quoted.entries[0].password, 'p,w');
  ok('multiline note', quoted.entries[0].notes.indexOf('line1') === 0 && quoted.entries[0].notes.indexOf('line2') !== -1, quoted.entries[0].notes);

  var empty = PMCsv.importCsv('');
  eq('empty file entries', empty.entries.length, 0);
  ok('empty file warns', empty.warnings.length > 0);

  var unknown = PMCsv.importCsv('foo,bar\n1,2\n');
  eq('unknown treated as chrome', unknown.format, 'chrome');
}

try { csvTests(); }
catch (e) { fails.push('exception: ' + (e && e.stack || e)); }
if (fails.length) {
  console.error('\nFAILED ' + fails.length);
  fails.forEach(function (f) { console.error(' -', f); });
  process.exit(1);
}
console.log('\nAll tests passed.');
