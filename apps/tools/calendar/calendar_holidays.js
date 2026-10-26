/* Fixed-date Indian holidays only (same date every year). No movable festivals. */
window.CalHolidays = (function () {
  'use strict';
  const FIXED = [
    [0, 1, "New Year's Day"],
    [0, 14, 'Makar Sankranti / Pongal / Magh Bihu'],
    [0, 23, 'Netaji Jayanti'],
    [0, 26, 'Republic Day'],
    [2, 8, "Women's Day"],
    [3, 14, 'Ambedkar Jayanti / Bohag Bihu'],
    [4, 1, 'May Day'],
    [7, 15, 'Independence Day'],
    [8, 5, "Teachers' Day"],
    [9, 2, 'Gandhi Jayanti'],
    [10, 14, "Children's Day"],
    [11, 25, 'Christmas Day']
  ];
  const p2 = (n) => String(n).padStart(2, '0');
  const key = (y, m, d) => y + '-' + p2(m + 1) + '-' + p2(d);
  const MAP = {}; FIXED.forEach(([m, d, n]) => { MAP[p2(m + 1) + '-' + p2(d)] = n; });
  return {
    list: (y) => FIXED.map(([m, d, n]) => ({ date: key(y, m, d), m, d, name: n })),
    get: (s) => (MAP[s.slice(5)] ? [MAP[s.slice(5)]] : null)
  };
})();
