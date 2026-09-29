/*=============================================================================
  harness.js — load the Transcribe page scripts in Node with a tiny fake DOM,
  fake clock, fake WebSocket and fake fetch (no npm packages needed).
  Used by dedupe.test.js, pairing.test.js and download.test.js.
=============================================================================*/

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = path.join(__dirname, "..");
const FILES = ["hindi.js", "assamese.js", "bengali.js", "romanizer.js", "vocab.js",
  "translation.js", "transcribe.js"];

/*----------------------------------------------------------------------------
  FakeEl — just enough of an Element for the page scripts
----------------------------------------------------------------------------*/
class FakeEl {
  constructor(tag, doc) {
    this.tagName = String(tag || "div").toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.id = "";
    this.value = "";
    this.disabled = false;
    this._text = "";
    this._cls = new Set();
    this._listeners = {};
    const self = this;
    this.classList = {
      add: function (c) { self._cls.add(c); },
      remove: function (c) { self._cls.delete(c); },
      contains: function (c) { return self._cls.has(c); },
      toggle: function (c, on) { if (on === undefined ? !self._cls.has(c) : on) self._cls.add(c); else self._cls.delete(c); }
    };
  }
  get className() { return Array.from(this._cls).join(" "); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get textContent() { return this.children.length ? this.children.map(function (c) { return c.textContent; }).join("") : this._text; }
  set textContent(v) { this.children = []; this._text = String(v); }
  set innerHTML(v) { if (String(v) !== "") throw new Error("fake DOM: innerHTML only supports \"\""); this.children.forEach(function (c) { c.parentNode = null; }); this.children = []; this._text = ""; }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() { if (!this.parentNode) return null; const s = this.parentNode.children; return s[s.indexOf(this) + 1] || null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument.body; }
  appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) { if (c.parentNode) c.remove(); c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  remove() { if (!this.parentNode) return; const s = this.parentNode.children; s.splice(s.indexOf(this), 1); this.parentNode = null; }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  click() { (this._listeners.click || []).forEach(function (fn) { fn({}); }); }
  _all() { let out = []; this.children.forEach(function (c) { out.push(c); out = out.concat(c._all()); }); return out; }
  _matches(sel) { if (sel[0] === "#") return this.id === sel.slice(1); if (sel[0] === ".") return sel.slice(1).split(".").every((c) => this._cls.has(c)); return this.tagName === sel.toUpperCase(); }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    let scope = [this];
    parts.forEach(function (p) {
      const next = [];
      scope.forEach(function (s) { s._all().forEach(function (e) { if (e._matches(p) && next.indexOf(e) === -1) next.push(e); }); });
      scope = next;
    });
    return scope;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

/*----------------------------------------------------------------------------
  makePage — fake document with the ids transcribe.html has
----------------------------------------------------------------------------*/
function makePage() {
  const doc = {};
  doc.body = new FakeEl("body", doc);
  ["apiKey", "langSelect", "btnStart", "btnStop", "btnDownload", "btnClear", "btnRoman", "btnTrans",
   "status", "blocks"].forEach(function (id) {
    const el = new FakeEl(id === "blocks" || id === "status" ? "div" : "input", doc);
    el.id = id;
    doc.body.appendChild(el);
  });
  doc.getElementById = function (id) { return doc.body._all().filter(function (e) { return e.id === id; })[0] || null; };
  doc.createElement = function (tag) { return new FakeEl(tag, doc); };
  doc.querySelectorAll = function (s) { return doc.body.querySelectorAll(s); };
  doc.querySelector = function (s) { return doc.body.querySelector(s); };
  doc.getElementById("langSelect").value = "hi";
  doc.getElementById("apiKey").value = "TEST_KEY";
  return doc;
}

/*----------------------------------------------------------------------------
  loadApp — run the page scripts; returns { ctx, clock, run, doc, timers }
  opts.fetch = fake fetch(url, init) → Promise<{ status, ok, json() }>
----------------------------------------------------------------------------*/
function loadApp(opts) {
  opts = opts || {};
  const doc = makePage();
  const clock = { t: 1000000 };
  /* manual timers driven by advance() */
  const timers = [];
  let timerId = 0;
  function setTimeoutFake(fn, ms) { timerId += 1; timers.push({ id: timerId, at: clock.t + (ms || 0), fn: fn }); return timerId; }
  function clearTimeoutFake(id) { const i = timers.findIndex(function (x) { return x.id === id; }); if (i >= 0) timers.splice(i, 1); }
  const sent = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 1; this.sent = sent; }
    send(m) { sent.push(JSON.parse(m)); }
    close() { this.readyState = 3; }
  }
  FakeWS.OPEN = 1; FakeWS.CONNECTING = 0;
  const store = {};
  /* fake Blob / object URLs: downloads[] records { url, text, type } */
  class FakeBlob {
    constructor(parts, o) { this.parts = parts || []; this.type = (o && o.type) || ""; }
    text() { return Promise.resolve(this.parts.join("")); }
  }
  const downloads = [];
  const revoked = [];
  const FakeURL = {
    createObjectURL: function (b) { const url = "blob:fake/" + (downloads.length + 1); downloads.push({ url: url, text: b.parts.join(""), type: b.type }); return url; },
    revokeObjectURL: function (u) { revoked.push(u); }
  };
  const ctx = vm.createContext({
    document: doc,
    window: {},
    console: console,
    localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); } },
    navigator: {},
    WebSocket: FakeWS,
    Blob: FakeBlob,
    URL: FakeURL,
    Date: Date,
    AbortController: AbortController,
    fetch: opts.fetch || function () { return Promise.reject(new Error("no fetch in test")); },
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    setInterval: function () { return 0; },
    clearInterval: function () {},
    Promise: Promise,
    JSON: JSON
  });
  FILES.forEach(function (f) {
    let src = fs.readFileSync(path.join(DIR, f), "utf8");
    /* fake clock: override now() after transcribe.js defines it */
    vm.runInContext(src, ctx, { filename: f });
  });
  vm.runInContext("now = function () { return __clock.t; };", Object.assign(ctx, { __clock: clock }));
  function run(code) { return vm.runInContext(code, ctx); }
  /* advance the clock, firing due fake timers and one tick() per step */
  function advance(ms, step) {
    step = step || 50;
    const end = clock.t + ms;
    while (clock.t < end) {
      clock.t = Math.min(end, clock.t + step);
      timers.sort(function (a, b) { return a.at - b.at; });
      while (timers.length && timers[0].at <= clock.t) timers.shift().fn();
      run("tick()");
    }
  }
  /* server message helpers */
  function interim(text) { run("handleServerMessage(" + JSON.stringify(JSON.stringify({ serverContent: { interimInputTranscription: { text: text } } })) + ")"); }
  function final(text) { run("handleServerMessage(" + JSON.stringify(JSON.stringify({ serverContent: { inputTranscription: { text: text } } })) + ")"); }
  /* cards oldest first: { seq, text, en, live } */
  function cards() {
    return doc.querySelectorAll("#blocks .block").slice().reverse().map(function (el) {
      return { seq: Number(el.dataset.seq), text: el.dataset.original || "", en: el.dataset.en || "",
        enLine: (el.querySelector(".en") || { textContent: "" }).textContent,
        pending: !!(el.querySelector(".en") && el.querySelector(".en").classList.contains("pending")),
        live: el.classList.contains("live") };
    });
  }
  return { ctx: ctx, doc: doc, clock: clock, run: run, advance: advance, interim: interim, final: final,
    cards: cards, sent: sent, timers: timers, downloads: downloads, revoked: revoked };
}

/*----------------------------------------------------------------------------
  Tiny assert helpers
----------------------------------------------------------------------------*/
let failures = 0;
let passes = 0;
function ok(cond, label, extra) {
  if (cond) { passes += 1; console.log("  ok  " + label); }
  else { failures += 1; console.log("✗ FAIL " + label + (extra ? "\n       " + extra : "")); }
}
function done(name) {
  console.log("\n" + name + ": " + passes + " passed, " + failures + " failed");
  process.exit(failures ? 1 : 0);
}

module.exports = { loadApp: loadApp, ok: ok, done: done };
