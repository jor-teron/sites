/* Node tests for Invoice Maker INV1 (inv_calc.js).
   Run: node test_inv_calc.js
   No DOM, no jsdom, no browser. */
'use strict';

var Inv = require('./inv_calc.js');
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

function close(name, a, b) {
  if (Math.abs(Number(a) - Number(b)) < 1e-9) console.log('ok', name);
  else fails.push(name + ' got ' + a + ' expected ' + b);
}

/* ---- money / round ---- */
close('round2 1.225', Inv.round2(1.225), 1.23);
close('round2 1.224', Inv.round2(1.224), 1.22);
close('round2 0', Inv.round2(0), 0);
close('toPaise 10.015', Inv.toPaise(10.015), 1002);
eq('fromPaise 1002', Inv.fromPaise(1002), 10.02);

/* ---- GST split: intra vs inter ---- */
var s18 = Inv.splitTax(1000, 18, true);
close('intra 18 cgst', s18.cgst, 90);
close('intra 18 sgst', s18.sgst, 90);
close('intra 18 igst', s18.igst, 0);
close('intra 18 tax', s18.tax, 180);

var i18 = Inv.splitTax(1000, 18, false);
close('inter 18 cgst', i18.cgst, 0);
close('inter 18 sgst', i18.sgst, 0);
close('inter 18 igst', i18.igst, 180);

var s5 = Inv.splitTax(100, 5, true);
close('intra 5 cgst', s5.cgst, 2.5);
close('intra 5 sgst', s5.sgst, 2.5);
close('intra 5 tax', s5.tax, 5);

var odd = Inv.splitTax(100.11, 18, true);
close('odd tax sum', Inv.round2(odd.cgst + odd.sgst), odd.tax);
ok('odd halves differ by at most 0.01', Math.abs(odd.cgst - odd.sgst) <= 0.01);

close('zero tax', Inv.splitTax(100, 0, true).tax, 0);

/* ---- line amounts ---- */
var line = Inv.lineAmounts({ qty: 2, rate: 500, discount: 50, gstPct: 18 });
close('line gross', line.gross, 1000);
close('line disc', line.discount, 50);
close('line taxable', line.taxable, 950);
close('line tax', line.tax, 171);
close('line total', line.total, 1121);

var cap = Inv.lineAmounts({ qty: 1, rate: 100, discount: 250, gstPct: 18 });
close('disc capped at gross', cap.discount, 100);
close('disc cap taxable', cap.taxable, 0);
close('disc cap tax', cap.tax, 0);

var neg = Inv.lineAmounts({ qty: -2, rate: -10, discount: -1, gstPct: 18 });
close('negatives clamped qty effect', neg.gross, 0);

/* ---- invoice totals + round-off ---- */
var items = [
  { description: 'A', qty: 1, rate: 100, discount: 0, gstPct: 18 },
  { description: 'B', qty: 2, rate: 50, discount: 10, gstPct: 5 }
];
/* A: taxable 100 tax 18; B: taxable 90 tax 4.50; taxable 190 tax 22.50 grand 212.50 → 213 */
var totIntra = Inv.invoiceTotals(items, { sellerState: '27', placeOfSupply: 'Maharashtra', roundOff: true });
ok('intra flag', totIntra.intraState);
close('tot taxable', totIntra.taxable, 190);
close('tot cgst', totIntra.cgst, 11.25);
close('tot sgst', totIntra.sgst, 11.25);
close('tot igst', totIntra.igst, 0);
close('tot tax', totIntra.tax, 22.5);
close('tot before consider 212.50 + 0.50', totIntra.grand, 213);
close('round off +0.50', totIntra.roundOff, 0.5);
ok('words mention Two Hundred Thirteen', totIntra.words.indexOf('Two Hundred Thirteen') !== -1 && totIntra.words.indexOf('Paise') === -1);

var totInter = Inv.invoiceTotals(items, { sellerState: '27', placeOfSupply: '24', roundOff: false });
ok('inter flag', !totInter.intraState);
close('inter igst', totInter.igst, 22.5);
close('inter cgst', totInter.cgst, 0);
close('inter no round', totInter.roundOff, 0);
close('inter grand', totInter.grand, 212.5);

var down = Inv.invoiceTotals(
  [{ description: 'X', qty: 1, rate: 100.10, discount: 0, gstPct: 0 }],
  { sellerState: '07', placeOfSupply: '07', roundOff: true }
);
close('round down 100.10 → 100', down.grand, 100);
close('round off -0.10', down.roundOff, -0.10);

var mid = Inv.invoiceTotals(
  [{ description: 'X', qty: 1, rate: 100.50, discount: 0, gstPct: 0 }],
  { sellerState: '07', placeOfSupply: '07', roundOff: true }
);
close('round .50 up to 101', mid.grand, 101);

var bos = Inv.invoiceTotals(
  [{ description: 'Exempt', qty: 1, rate: 1000, discount: 0, gstPct: 18 }],
  { sellerState: '27', placeOfSupply: '27', docType: 'bill-of-supply', roundOff: false }
);
close('bill of supply ignores GST', bos.tax, 0);
close('bill of supply grand', bos.grand, 1000);

var empty = Inv.invoiceTotals(
  [{ description: '', qty: 0, rate: 0, discount: 0, gstPct: 18 }],
  { sellerState: '27', placeOfSupply: '27' }
);
close('blank line ignored in totals', empty.grand, 0);

ok('summary has 18 and 5', totIntra.summary.length === 2 && totIntra.summary[0].gstPct === 5 && totIntra.summary[1].gstPct === 18);

/* ---- amount in words ---- */
eq('words 0', Inv.amountInWords(0), 'Rupees Zero Only');
eq('words 1', Inv.amountInWords(1), 'Rupees One Only');
eq('words 20', Inv.amountInWords(20), 'Rupees Twenty Only');
eq('words 21', Inv.amountInWords(21), 'Rupees Twenty One Only');
eq('words 100', Inv.amountInWords(100), 'Rupees One Hundred Only');
eq('words 101', Inv.amountInWords(101), 'Rupees One Hundred One Only');
eq('words 110', Inv.amountInWords(110), 'Rupees One Hundred Ten Only');
eq('words 999', Inv.amountInWords(999), 'Rupees Nine Hundred Ninety Nine Only');
eq('words 1000', Inv.amountInWords(1000), 'Rupees One Thousand Only');
eq('words 100000', Inv.amountInWords(100000), 'Rupees One Lakh Only');
eq('words 100010', Inv.amountInWords(100010), 'Rupees One Lakh Ten Only');
eq('words 1000000', Inv.amountInWords(1000000), 'Rupees Ten Lakh Only');
eq('words 10000000', Inv.amountInWords(10000000), 'Rupees One Crore Only');
eq('words 12345678.90', Inv.amountInWords(12345678.90),
  'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Paise Ninety Only');
eq('words 0.50', Inv.amountInWords(0.50), 'Rupees Zero and Paise Fifty Only');
eq('words 123.45', Inv.amountInWords(123.45), 'Rupees One Hundred Twenty Three and Paise Forty Five Only');
eq('words 0.01', Inv.amountInWords(0.01), 'Rupees Zero and Paise One Only');
eq('words negative', Inv.amountInWords(-12.5), 'Minus Rupees Twelve and Paise Fifty Only');
ok('words 213 no paise', Inv.amountInWords(213).indexOf('Paise') === -1);
eq('indian grouping 123456.7', Inv.formatInr(123456.7, false), '1,23,456.70');
eq('indian grouping 1000', Inv.formatInr(1000, false), '1,000.00');
eq('indian grouping 10000000', Inv.formatInr(10000000, false), '1,00,00,000.00');

/* ---- FY numbering ---- */
eq('FY 2026-04-01', Inv.financialYear('2026-04-01').label, '2026-27');
eq('FY 2026-03-31', Inv.financialYear('2026-03-31').label, '2025-26');
eq('FY 2026-11-10', Inv.financialYear('2026-11-10').label, '2026-27');
eq('FY 2027-03-31', Inv.financialYear('2027-03-31').label, '2026-27');
eq('FY 2027-04-01', Inv.financialYear('2027-04-01').label, '2027-28');
eq('FY start year', Inv.financialYear('2026-04-01').start, 2026);
eq('FY end year', Inv.financialYear('2026-04-01').end, 2027);

eq('format INV/2026-27/001', Inv.formatNumber('INV', '2026-27', 1, 3), 'INV/2026-27/001');
eq('format keeps 4 digits when needed', Inv.formatNumber('INV', '2026-27', 1000, 3), 'INV/2026-27/1000');
eq('format strips trailing slash', Inv.formatNumber('INV/', '2026-27', 2), 'INV/2026-27/002');

eq('next from empty', Inv.nextNumber('INV', '2026-27', [], 3), 'INV/2026-27/001');
eq('next after 001 and 003 uses max', Inv.nextNumber('INV', '2026-27', ['INV/2026-27/001', 'INV/2026-27/003'], 3), 'INV/2026-27/004');
eq('next ignores other FY', Inv.nextNumber('INV', '2026-27', ['INV/2025-26/099'], 3), 'INV/2026-27/001');
eq('next ignores other prefix', Inv.nextNumber('QT', '2026-27', ['INV/2026-27/009'], 3), 'QT/2026-27/001');
eq('parse number', Inv.parseNumber('INV/2026-27/001'), { prefix: 'INV', fy: '2026-27', seq: 1 });
eq('parse bad', Inv.parseNumber('hello'), null);

/* ---- states ---- */
ok('same state by name and code', Inv.sameState('Maharashtra', '27'));
ok('same state aliases UP', Inv.sameState('UP', 'Uttar Pradesh'));
ok('different states', !Inv.sameState('27', '24'));
ok('empty not same', !Inv.sameState('', '27'));
eq('stateCode Orissa', Inv.stateCode('Orissa'), '21');
eq('stateName 33', Inv.stateName('33'), 'Tamil Nadu');
ok('gstin ok sample', Inv.gstinLooksOk('27ABCDE1234F1Z5'));
ok('gstin empty ok', Inv.gstinLooksOk(''));
ok('gstin bad rejected', !Inv.gstinLooksOk('123'));

/* ---- UPI ---- */
eq('upi url', Inv.upiUrl({ pa: 'shop@upi', pn: 'My Shop', am: 213, tn: 'INV/2026-27/001' }),
  'upi://pay?pa=shop%40upi&cu=INR&pn=My%20Shop&am=213.00&tn=INV%2F2026-27%2F001');
eq('upi without id is empty', Inv.upiUrl({ pn: 'X' }), '');

ok('all GST rates expected', JSON.stringify(Inv.GST_RATES) === JSON.stringify([0, 5, 12, 18, 28]));
ok('doc types 4', Inv.DOC_TYPES.length === 4);
eq('doc type quote title', Inv.docTypeInfo('quote').title, 'QUOTE');

if (fails.length) {
  console.log('\nFAILED ' + fails.length);
  fails.forEach(function (f) { console.log('  -', f); });
  process.exit(1);
}
console.log('\nAll ' + 'tests passed.');
