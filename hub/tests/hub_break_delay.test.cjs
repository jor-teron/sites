// H137 short offline smoke: no browser, network, or real-time waits.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('hub/core/hub_break.js', 'utf8');
let now = 1000000;
const values = new Map([['sites-hub.breakOn', '1'], ['sites-hub.breakWork', '5'], ['sites-hub.breakLen', '1']]);
function page() {
  const events = {};
  let doc;
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = new Map(); this.hidden = false; this.classList = { add() {}, remove() {} }; this.events = {}; this.isConnected = true; }
    append(...children) { children.forEach(c => this.appendChild(c)); }
    appendChild(c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter(x => x !== c); this.children.push(c); c.parentNode = this; }
    get lastElementChild() { return this.children.at(-1); }
    setAttribute(k, v) { this.attrs.set(k, v); }
    hasAttribute(k) { return this.attrs.has(k); }
    removeAttribute(k) { this.attrs.delete(k); }
    addEventListener(k, f) { (this.events[k] ||= []).push(f); }
    focus() { doc.activeElement = this; }
    blur() { doc.activeElement = doc.body; }
    click() { (this.events.click || []).forEach(f => f({ target: this })); }
  }
  doc = { documentElement: new Element('html'), body: new Element('body'), createElement: tag => new Element(tag), addEventListener() {} };
  const work = new Element('input'); doc.body.appendChild(work); work.focus();
  let interval;
  const win = { addEventListener(k, f) { (events[k] ||= []).push(f); } };
  vm.runInNewContext(source, { window: win, document: doc, localStorage: { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }, Date: { now: () => now }, setInterval: f => { interval = f; return 1; }, clearInterval() {}, setTimeout: f => f(), console });
  const all = () => { const out = []; const walk = e => { out.push(e); e.children.forEach(walk); }; walk(doc.body); return out; };
  return { api: win.HubBreak, tick: () => interval(), sync: () => (events.storage || []).forEach(f => f({ key: 'hub-break.delay' })), byId: id => all().find(e => e.id === id), button: text => all().find(e => e.textContent === text), work, doc };
}
const first = page();
first.api.start(60);
assert(first.api.locked());
assert(first.work.hasAttribute('inert'));
first.button('Give me 15 seconds').click();
assert(!first.api.locked());
assert(!first.work.hasAttribute('inert'));
assert.equal(first.doc.activeElement, first.work);
assert.equal(first.api.state().delayEndsIn, 15000);
assert.equal(first.api.canTurnOff(), false);
assert.equal(first.byId('hub-break-grace').hidden, false);
const reloaded = page();
assert.equal(reloaded.api.state().delayEndsIn, 15000);
assert(!reloaded.api.locked());
now += 15000; // absolute deadline even if all interval callbacks were throttled
reloaded.tick();
assert(reloaded.api.locked());
assert.equal(reloaded.api.state().breakEndsIn, 60000);
assert(reloaded.button('Give me 15 seconds').hidden);
reloaded.button('Give me 15 seconds').click();
assert(reloaded.api.locked());
now += 60000; reloaded.tick();
assert(!reloaded.api.locked());
now += 300000; // simulate work with a recent open mark (no sleep gap)
values.set('hub-break.breakSeen', String(now - 1000));
reloaded.tick();
assert(reloaded.api.locked());
assert(!reloaded.button('Give me 15 seconds').hidden);
reloaded.button('Give me 15 seconds').click();
now += 4000;
reloaded.button('Lock now').click();
assert(reloaded.api.locked());
assert.equal(reloaded.api.state().breakEndsIn, 60000);
first.sync();
assert(first.api.locked());
assert(first.button('Give me 15 seconds').hidden);
const afterLock = page();
assert(afterLock.api.locked());
assert(afterLock.button('Give me 15 seconds').hidden);
now += 60000; afterLock.tick();
assert(!afterLock.api.locked());
afterLock.api.start(60); // ignoring allowance preserves forced break duration
now += 60000; afterLock.tick();
assert(!afterLock.api.locked());
console.log('H137 offline smoke passed: once-only, expiry/full duration, Lock now, reload, tab sync, next break, ignore.');
