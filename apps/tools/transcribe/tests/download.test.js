/*=============================================================================
  download.test.js — card row order, Download (.txt) content, the Download
  button state and keepScroll (Node, no packages).
  Run: node tools/transcribe/tests/download.test.js
=============================================================================*/

const H = require("./harness");
const ok = H.ok;

/* Fake fetch whose calls are answered by the test */
function fakeFetch() {
  const calls = [];
  function fetch(url, init) {
    return new Promise(function (resolve) { calls.push({ body: JSON.parse(init.body), resolve: resolve }); });
  }
  function answer(call, fn) {
    const items = JSON.parse(call.body.contents[0].parts[0].text).items;
    const out = { items: items.map(function (it) { return { id: it.id, en: fn(it) }; }) };
    call.resolve({ status: 200, ok: true, json: function () {
      return Promise.resolve({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] });
    } });
  }
  return { fetch: fetch, calls: calls, answer: answer };
}

function flush() {
  return new Promise(function (r) { setImmediate(r); }).then(function () {
    return new Promise(function (r) { setImmediate(r); });
  });
}

/* Session starting at a fixed local time (10:22:00 on 2026-09-29) */
function session(ff) {
  const app = H.loadApp({ fetch: ff.fetch });
  app.clock.t = new Date(2026, 8, 29, 10, 22, 0).getTime();
  app.run("ws = new WebSocket('x'); sessionReady = true; running = true; ensureLiveBlock(); " +
    "CONFIG.TRANSLATE_MIN_GAP_MS = 0;");
  return app;
}

/* One utterance → one closed card */
function sayCard(app, text) {
  app.interim(text.split(" ")[0]);
  app.advance(200);
  app.final(text);
  app.advance(1600);
}

function rowClasses(el) {
  return el.children.map(function (c) { return c.className; }).join(" | ");
}

(async function () {
  console.log("== rows: meta, English, Original, Roman ==");
  {
    const ff = fakeFetch();
    const app = session(ff);
    const live = app.doc.querySelector("#blocks .block");
    ok(rowClasses(live) === "meta | line en | line txt | line rom", "new live card row order", rowClasses(live));
    sayCard(app, "मेरा नाम जोर है।");
    ff.answer(ff.calls[0], function () { return "My name is Jor."; }); await flush();
    const closed = app.doc.querySelectorAll("#blocks .block").filter(function (b) { return !b.classList.contains("live"); })[0];
    ok(rowClasses(closed) === "meta | line en | line txt | line rom", "closed card row order", rowClasses(closed));
    ok(closed.children[1].textContent === "(ENG) My name is Jor." &&
       closed.children[2].textContent === "(Original) मेरा नाम जोर है।" &&
       closed.children[3].textContent === "(Roman) mera naam jor hai.", "row texts");
    app.doc.getElementById("btnRoman").click();
    ok(closed.children[3].textContent === "" && closed.children[1].textContent === "(ENG) My name is Jor.",
      "Romanizer off empties the Roman row only");
    app.doc.getElementById("btnRoman").click();
    ok(closed.children[3].textContent === "(Roman) mera naam jor hai.", "Romanizer on paints it again");
  }

  console.log("== Download content ==");
  let sample = "";
  {
    const ff = fakeFetch();
    const app = session(ff);
    const btn = app.doc.getElementById("btnDownload");
    ok(btn.disabled === true, "Download disabled with no cards (empty live card only)");
    sayCard(app, "पहला वाक्य है।");            /* 10:22:00 – 10:22:01 */
    ok(btn.disabled === false, "Download enabled once a card has text");
    sayCard(app, "दूसरा वाक्य है।");            /* 10:22:01 – 10:22:03 */
    ff.answer(ff.calls[0], function () { return "This is the first sentence."; }); await flush();
    app.advance(300);
    app.interim("तीसरा वाक्य");                 /* live, from 10:22:03 */
    app.advance(200);
    const text = app.run("buildDownloadText(new Date(2026, 8, 29, 10, 25, 0))");
    sample = text;
    const expected = [
      "Transcribe — 2026-09-29 10:25",
      "Language: Hindi (hi-IN)",
      "",
      "[10:22:00 – 10:22:01]",
      "(ENG) This is the first sentence.",
      "(Original) पहला वाक्य है।",
      "(Roman) pahla vaakya hai.",
      "",
      "[10:22:01 – 10:22:03]",
      "(ENG) (translation pending)",
      "(Original) दूसरा वाक्य है।",
      "(Roman) doosra vaakya hai.",
      "",
      "[10:22:03 – …] (live)",
      "(ENG) (translation pending)",
      "(Original) तीसरा वाक्य",
      "(Roman) teesra vaakya",
      ""
    ].join("\n");
    ok(text === expected, "download text: oldest first, timestamps, row order, pending, live marker",
      "\n---- got ----\n" + text + "\n---- want ----\n" + expected);
    const lines = text.split("\n");
    ok(lines.indexOf("[10:22:00 – 10:22:01]") < lines.indexOf("[10:22:01 – 10:22:03]"), "chronological order");

    app.doc.getElementById("btnRoman").click();
    const noRom = app.run("buildDownloadText(new Date(2026, 8, 29, 10, 25, 0))");
    ok(noRom.indexOf("(Roman)") === -1, "Romanizer off → no Roman lines");
    app.doc.getElementById("btnRoman").click();

    ok(app.run("downloadFileName(new Date(2026, 0, 5, 9, 7, 44))") === "transcribe-2026-01-05-0907.txt", "file name (local, zero padded)");
    btn.click();
    ok(app.downloads.length === 1 && app.downloads[0].type === "text/plain;charset=utf-8", "Download makes one UTF-8 text blob");
    ok(app.downloads[0].text.indexOf("[10:22:00 – 10:22:01]\n(ENG) This is the first sentence.") !== -1, "blob holds the transcript");
    ok(/^Downloaded transcribe-\d{4}-\d\d-\d\d-\d{4}\.txt$/.test(app.doc.getElementById("status").textContent), "status names the file: " + app.doc.getElementById("status").textContent);
    ok(!app.doc.querySelector("a"), "temporary <a> removed");
    app.advance(2000);
    ok(app.revoked.length === 1 && app.revoked[0] === app.downloads[0].url, "object URL revoked afterwards");

    app.doc.getElementById("btnClear").click();
    ok(btn.disabled === true, "Clear disables Download again");
    ok(app.run("buildDownloadText(new Date())") === "", "no text after Clear");
  }

  console.log("== Translate off → English marked off ==");
  {
    const ff = fakeFetch();
    const app = session(ff);
    app.doc.getElementById("btnTrans").click();
    sayCard(app, "कुछ भी।");
    const text = app.run("buildDownloadText(new Date(2026, 8, 29, 10, 25, 0))");
    ok(text.indexOf("[10:22:00 – 10:22:01]\n(ENG) (translation off)\n(Original) कुछ भी।") !== -1, "translation off line", text);
  }

  console.log("== keepScroll ==");
  {
    const app = H.loadApp({});
    const host = app.doc.getElementById("blocks");
    const a = app.doc.createElement("div"), b = app.doc.createElement("div");
    host.appendChild(a); host.appendChild(b);
    a.offsetTop = 0; a.offsetHeight = 150; b.offsetTop = 158; b.offsetHeight = 100;
    host.scrollHeight = 258;
    host.scrollTop = 200;
    app.ctx.__grow = function () { b.offsetTop = 258; a.offsetHeight = 250; host.scrollHeight = 358; };
    app.run("keepScroll(__grow)");
    ok(host.scrollTop === 300, "scrolled away: view kept when a card above grows (" + host.scrollTop + ")");
    app.ctx.__grow2 = function () { b.offsetHeight = 400; host.scrollHeight = 658; };
    app.run("keepScroll(__grow2)");
    ok(host.scrollTop === 300, "anchor card growing below the view top: no jump (" + host.scrollTop + ")");
    host.scrollTop = 30;
    app.ctx.__grow3 = function () { b.offsetTop = 358; };
    app.run("keepScroll(__grow3)");
    ok(host.scrollTop === 30, "near the top: stays put (new cards show at top)");
    host.scrollTop = 500;
    app.ctx.__nested = function () { b.offsetTop = 408; app.run("keepScroll(function(){})"); };
    app.run("keepScroll(__nested)");
    ok(host.scrollTop === 550, "nested calls do not double-adjust (" + host.scrollTop + ")");
  }

  console.log("\n---- sample download ----\n" + sample + "---- end sample ----");
  H.done("download");
})();
