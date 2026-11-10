const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const base = path.join(__dirname, '..');
require('../core/data/base.js');
if (fs.existsSync(path.join(base, 'core/data/expanded.js'))) require('../core/data/expanded.js');
require('../core/model.js');
const H = globalThis.HT, events = H.events;
test('schema: ids are unique; date, text, category and representative place are valid', () => {
  const ids = new Set();
  for (const e of events) {
    assert.match(e.id, /^[a-z0-9-]+$/); assert(!ids.has(e.id), e.id); ids.add(e.id);
    assert(Number.isInteger(e.year) && e.year !== 0 && e.year >= H.MIN && e.year <= H.MAX, e.id);
    if (e.endYear !== undefined) assert(Number.isInteger(e.endYear) && e.endYear !== 0 && e.endYear >= e.year && e.endYear <= H.MAX, e.id);
    assert(e.title.length > 3 && e.fact.length > 25 && e.fact.length < 500, e.id);
    assert(['world','india'].includes(e.region)); assert(H.topics.includes(e.topic)); assert.equal(typeof e.approximate, 'boolean');
    assert(Number.isFinite(e.place.lat) && Math.abs(e.place.lat) <= 90, e.id); assert(Number.isFinite(e.place.lon) && Math.abs(e.place.lon) <= 180, e.id);
    assert(e.place.name.length > 1);
  }
  assert(events.length >= 150);
});
for (const mode of ['linear', 'log']) {
  test(mode + ': round trips, monotonic scale and full range', () => {
    const years = [-300000,-10000,-1000,-1,1,500,1800,2000,H.MAX], view = H.view(mode);
    for (const y of years) { assert(Math.abs(H.decode(H.encode(y,mode),mode)-y)<1e-6); assert(Math.abs(H.yearAt(H.x(y,view,1000),view,1000)-y)<1e-6); }
    assert.equal(H.x(H.MIN,view,1000),0); assert.equal(H.x(H.MAX,view,1000),1000);
    for(let i=1;i<years.length;i++) assert(H.encode(years[i],mode)>H.encode(years[i-1],mode));
    assert(H.astro(1)-H.astro(-1)===1, 'BCE to CE has no year zero');
  });
  test(mode + ': zoom from all history to a decade and back; pan clamps at both ends', () => {
    let v=H.view(mode); for(let i=0;i<30;i++)v=H.zoom(v,2,.99);
    const [a,b]=H.range(v); assert(b-a < 10.3 && b-a > 9.7, `${a} to ${b}`);
    for(let i=0;i<30;i++)v=H.zoom(v,.5);
    assert(Math.abs(v.lo-H.view(mode).lo)<1e-6); assert(Math.abs(v.hi-H.view(mode).hi)<1e-6);
    assert(H.range(H.pan(v,-100))[0]>=H.MIN-1e-5); assert(H.range(H.pan(v,100))[1]<=H.MAX+1e-5);
  });
}
test('search is case- and accent-insensitive; region and topics intersect', () => {
  assert(H.query(events,{search:'  GANDHI '}).some(e=>e.id==='gandhi-return'));
  assert(H.query(events,{search:'rontgen'}).some(e=>e.id==='xray'));
  assert(H.query(events,{region:'india',topics:['science']}).every(e=>e.region==='india'&&e.topic==='science'));
  assert.equal(H.query(events,{search:'not-a-historical-title'}).length,0);
  assert.equal(H.query(events,{ids:[]}).length,0);
});
test('at the same time includes ±25 boundaries but excludes selected event', () => {
  const rows=[{id:'a',year:100},{id:'b',year:75},{id:'c',year:125},{id:'d',year:126}];
  assert.deepEqual(H.contemporary(rows,rows[0]).map(e=>e.id),['b','c']);
  assert(H.contemporary(events,events.find(e=>e.id==='independence')).some(e=>e.id==='un'));
});
test('chronology ordering, centuries and BCE formatting', () => {
  assert.deepEqual(H.ordered([{id:'b',year:1},{id:'a',year:-1},{id:'d',year:2000}]).map(e=>e.id),['a','b','d']);
  for(const [year,n] of [[-100,-1],[-101,-2],[1,1],[100,1],[1900,19],[1901,20],[2000,20],[2001,21]]) assert.equal(H.century(year),n);
  assert.equal(H.centuryLabel(-21),'21st century BCE'); assert.equal(H.centuryLabel(12),'12th century CE');
  assert.equal(H.date(-500,true),'c. 500 BCE');
});
test('well-established anchors retained without invented exactness', () => {
  const byId=id=>events.find(e=>e.id===id);
  assert.equal(byId('sapiens').approximate,true); assert.equal(byId('buddha').approximate,true);
  assert.equal(byId('independence').year,1947); assert.equal(byId('apollo11').year,1969);
  assert.equal(byId('constitution').year,1950); assert.equal(byId('indus').endYear,-1900);
});
test('combined filters preserve all regions in the contemporaries query', () => {
  const selected=events.find(e=>e.id==='independence');
  const related=H.contemporary(events,selected);
  assert(related.some(e=>e.region==='world'));assert(related.some(e=>e.region==='india'));
  assert(related.every(e=>e.id!==selected.id&&Math.abs(H.astro(e.year)-H.astro(selected.year))<=25));
  const filtered=H.query(events,{region:'india',topics:['science','culture'],search:'Raman',ids:['raman']});
  assert.deepEqual(filtered.map(e=>e.id),['raman']);
});
