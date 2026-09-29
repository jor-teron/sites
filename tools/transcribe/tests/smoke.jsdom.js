/*=============================================================================
  smoke.jsdom.js — load transcribe.html in jsdom (real HTML + scripts) with a
  fake mic, fake WebSocket and fake fetch; press Start, replay a short
  transcript, let a card close and get its English, press Stop.
  Needs the jsdom package (not part of the repo):
    NODE_PATH=/path/to/node_modules node tools/transcribe/tests/smoke.jsdom.js
  Without jsdom it prints "skipped" and exits 0.
=============================================================================*/

const path = require("path");
let JSDOM;
try {
  JSDOM = require("jsdom").JSDOM;
} catch (e) {
  console.log("smoke: skipped (jsdom not installed)");
  process.exit(0);
}

const DIR = path.join(__dirname, "..");
const errors = [];
let socket = null;
const fetchCalls = [];

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  /* Serve the page's own files from disk under an http origin
     (localStorage needs a non-file origin) */
  const jsdom = require("jsdom");
  const fs = require("fs");
  class DiskLoader extends jsdom.ResourceLoader {
    fetch(url) {
      const name = decodeURIComponent(new URL(url).pathname.split("/").pop());
      return Promise.resolve(fs.readFileSync(path.join(DIR, name)));
    }
  }
  const html = fs.readFileSync(path.join(DIR, "transcribe.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/tools/transcribe/transcribe.html",
    runScripts: "dangerously",
    resources: new DiskLoader(),
    pretendToBeVisual: true,
    beforeParse: function (w) {
      w.addEventListener("error", function (ev) { errors.push(ev.message || String(ev.error)); });
      w.console.error = function () { errors.push(Array.from(arguments).join(" ")); };
      w.localStorage.setItem("gemini_transcribe_api_key", "SMOKE_KEY");
      class FakeWS {
        constructor(url) {
          this.url = url; this.readyState = 0; this.sent = []; socket = this;
          setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 5);
        }
        send(m) {
          const msg = JSON.parse(m);
          this.sent.push(msg);
          if (msg.setup) setTimeout(() => this.emit({ setupComplete: {} }), 5);
        }
        emit(obj) { this.onmessage && this.onmessage({ data: JSON.stringify(obj) }); }
        close() { this.readyState = 3; }
      }
      FakeWS.OPEN = 1; FakeWS.CONNECTING = 0;
      w.WebSocket = FakeWS;
      w.navigator.mediaDevices = { getUserMedia: function () { return Promise.resolve({ getTracks: function () { return [{ stop: function () {} }]; } }); } };
      w.AudioContext = function () {
        return {
          sampleRate: 48000,
          createMediaStreamSource: function () { return { connect: function () {}, disconnect: function () {} }; },
          createScriptProcessor: function () { return { connect: function () {}, disconnect: function () {} }; },
          destination: {},
          close: function () { return Promise.resolve(); }
        };
      };
      w.fetch = function (url, init) {
        fetchCalls.push({ url: url, body: JSON.parse(init.body) });
        const its = JSON.parse(JSON.parse(init.body).contents[0].parts[0].text).items;
        const out = { items: its.map(function (it) { return { id: it.id, en: "My name is Jor." }; }) };
        return Promise.resolve({ status: 200, ok: true, json: function () {
          return Promise.resolve({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] });
        } });
      };
    }
  });
  const w = dom.window;
  await new Promise(function (r) { w.addEventListener("load", r); });
  const $ = function (id) { return w.document.getElementById(id); };
  let fails = 0;
  function ok(c, label, extra) { console.log((c ? "  ok  " : "✗ FAIL ") + label + (c || !extra ? "" : "\n       " + extra)); if (!c) fails++; }

  ok($("btnRoman").textContent === "Romanizer: on" && $("btnTrans").textContent === "Translate: on", "boot wired the buttons");
  ok($("apiKey").value === "SMOKE_KEY", "saved key restored");
  $("langSelect").value = "hi";
  $("btnStart").click();
  await wait(100);
  ok($("status").textContent === "Connected · listening", "Start → connected after setupComplete: " + $("status").textContent);
  ok(socket && socket.sent[0].setup.inputAudioTranscription.mode === "SMART", "setup sent with SMART");
  ok(socket.sent[0].setup.inputAudioTranscription.languageCodes[0] === "hi-IN", "language hint hi-IN");
  ok(w.document.querySelectorAll("#blocks .block.live").length === 1, "live card shown");
  socket.emit({ serverContent: { interimInputTranscription: { text: "मेरा नाम" } } });
  socket.emit({ serverContent: { interimInputTranscription: { text: "मेरा नाम जोर" } } });
  socket.emit({ serverContent: { inputTranscription: { text: "मेरा नाम जोर है।" } } });
  const live = w.document.querySelector("#blocks .block.live");
  ok(live && live.querySelector(".txt").textContent === "(Original) मेरा नाम जोर है।", "live card text");
  ok(live && live.querySelector(".rom").textContent === "(Roman) mera naam jor hai.", "roman line");
  await wait(2200);
  const closed = w.document.querySelector("#blocks .block:not(.live)");
  ok(!!closed, "card closed after pause");
  ok(fetchCalls.length === 1 && fetchCalls[0].url.indexOf("gemini-3.5-flash-lite:generateContent") !== -1, "one translate request");
  ok(closed && closed.querySelector(".en").textContent === "(ENG) My name is Jor.", "English on the card");
  $("btnStop").click();
  await wait(100);
  ok($("status").textContent === "Stopped", "Stop → Stopped: " + $("status").textContent);
  $("btnClear").click();
  ok(w.document.querySelectorAll("#blocks .block").length === 0, "Clear empties the list");
  ok(errors.length === 0, "no page errors", errors.join("\n"));
  console.log("\nsmoke: " + (fails ? fails + " failed" : "all passed"));
  w.close();
  process.exit(fails ? 1 : 0);
})();
