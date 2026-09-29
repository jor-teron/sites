/*=============================================================================
  pairing.test.js — per-card translation pairing (Node, no packages).
  Run: node tools/transcribe/tests/pairing.test.js
  Fake fetch answers requests out of order / with 429 / never; each English
  must still land on its own card (matched by card number, not order).
=============================================================================*/

const H = require("./harness");
const ok = H.ok;

/* Controllable fake fetch: every call is recorded; answer it later */
function fakeFetch() {
  const calls = [];
  function fetch(url, init) {
    return new Promise(function (resolve, reject) {
      const call = { url: url, body: JSON.parse(init.body), resolve: resolve, reject: reject, signal: init.signal };
      if (init.signal) {
        init.signal.addEventListener("abort", function () {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      }
      calls.push(call);
    });
  }
  /* reply with a translation for every item (or a custom map) */
  function answer(call, fn) {
    const items = JSON.parse(call.body.contents[0].parts[0].text).items;
    const out = { items: items.map(function (it) { return { id: it.id, en: fn ? fn(it) : "EN<" + it.text + ">" }; }) };
    call.resolve({ status: 200, ok: true, json: function () {
      return Promise.resolve({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] });
    } });
  }
  function status(call, code) {
    call.resolve({ status: code, ok: false, json: function () { return Promise.resolve({ error: { message: "HTTP " + code } }); } });
  }
  return { fetch: fetch, calls: calls, answer: answer, status: status };
}

function flush() {
  return new Promise(function (r) { setImmediate(r); }).then(function () {
    return new Promise(function (r) { setImmediate(r); });
  });
}

function session(ff, gap) {
  const app = H.loadApp({ fetch: ff.fetch });
  app.run("ws = new WebSocket('x'); sessionReady = true; running = true; ensureLiveBlock(); " +
    "CONFIG.TRANSLATE_MIN_GAP_MS = " + gap + ";");
  return app;
}

/* One utterance → one closed card */
function sayCard(app, text) {
  app.interim(text.split(" ")[0]);
  app.advance(200);
  app.final(text);
  app.advance(1600);
}

function items(call) {
  return JSON.parse(call.body.contents[0].parts[0].text);
}

(async function () {
  console.log("== out-of-order replies land on their own cards ==");
  {
    const ff = fakeFetch();
    const app = session(ff, 0);
    sayCard(app, "पहला वाक्य है।");
    sayCard(app, "दूसरा वाक्य है।");
    sayCard(app, "तीसरा वाक्य है।");
    ok(ff.calls.length === 3, "one request per closed card (gap 0): " + ff.calls.length);
    ok(app.cards().filter(function (c) { return c.text; }).every(function (c) { return c.pending; }), "translating… marker while waiting");
    ff.answer(ff.calls[2]); await flush();
    ff.answer(ff.calls[0]); await flush();
    ff.answer(ff.calls[1]); await flush();
    const cs = app.cards().filter(function (c) { return c.text; });
    ok(cs.length === 3 && cs.every(function (c) { return c.en === "EN<" + c.text + ">"; }), "each card got its own English",
      JSON.stringify(cs.map(function (c) { return [c.seq, c.text, c.en]; })));
    ok(cs.every(function (c) { return c.enLine === "(ENG) EN<" + c.text + ">" && !c.pending; }), "(ENG) line painted, marker off");
    ok(ff.calls[0].url.indexOf("gemini-3.5-flash-lite:generateContent?key=TEST_KEY") !== -1, "flash-lite REST endpoint with the same key");
    ok(items(ff.calls[1]).context.length === 1 && items(ff.calls[2]).context.length === 2, "previous cards sent as context");
    ok(items(ff.calls[2]).context[0].text === "पहला वाक्य है।", "context oldest first");
    ok(ff.calls[0].body.generationConfig.responseMimeType === "application/json", "JSON reply requested");
  }

  console.log("== batching when a request went out < gap ago ==");
  {
    const ff = fakeFetch();
    const app = session(ff, 4000);
    sayCard(app, "एक।");
    ok(ff.calls.length === 1, "first card sent at once");
    sayCard(app, "दो।");
    sayCard(app, "तीन।");
    ok(ff.calls.length === 1, "next cards wait during the gap");
    app.advance(1000);
    ok(ff.calls.length === 2, "one batched request after the gap: " + ff.calls.length);
    const ids = items(ff.calls[1]).items.map(function (it) { return it.id; });
    ok(ids.length === 2, "batch holds both cards: " + ids.join(","));
    /* reply lists items in reverse order: still matched by id */
    const call = ff.calls[1];
    const its = items(call).items.slice().reverse();
    call.resolve({ status: 200, ok: true, json: function () {
      return Promise.resolve({ candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify({ items: its.map(function (it) { return { id: it.id, en: "EN<" + it.text + ">" }; }) }) + "\n```" }] } }] });
    } });
    ff.answer(ff.calls[0]);
    await flush();
    const cs = app.cards().filter(function (c) { return c.text; });
    ok(cs.every(function (c) { return c.en === "EN<" + c.text + ">"; }), "batched reply (reversed, fenced) paired by id",
      JSON.stringify(cs.map(function (c) { return [c.text, c.en]; })));
  }

  console.log("== 429 falls back to the next model ==");
  {
    const ff = fakeFetch();
    const app = session(ff, 0);
    sayCard(app, "नमस्ते।");
    ff.status(ff.calls[0], 429); await flush();
    ok(ff.calls.length === 2 && ff.calls[1].url.indexOf("gemini-3.1-flash-lite") !== -1, "second request uses gemini-3.1-flash-lite");
    ff.answer(ff.calls[1]); await flush();
    ok(app.cards()[0].en === "EN<नमस्ते।>", "fallback reply lands");
    sayCard(app, "फिर से।");
    ok(ff.calls[2].url.indexOf("gemini-3.1-flash-lite") !== -1, "rate-limited model skipped during cooldown");
  }

  console.log("== missing item is asked again once ==");
  {
    const ff = fakeFetch();
    const app = session(ff, 0);
    sayCard(app, "अ।");
    ff.answer(ff.calls[0], function () { return ""; }); await flush();
    ok(ff.calls.length === 2, "retry request sent");
    ff.answer(ff.calls[1]); await flush();
    ok(app.cards()[0].en === "EN<अ।>", "retry reply lands");
  }

  console.log("== Clear aborts requests in flight ==");
  {
    const ff = fakeFetch();
    const app = session(ff, 0);
    sayCard(app, "पुराना।");
    app.run("clearAll()");
    await flush();
    ok(ff.calls[0].signal.aborted, "AbortController aborted");
    sayCard(app, "नया।");
    ff.answer(ff.calls[1]); await flush();
    const cs = app.cards().filter(function (c) { return c.text; });
    ok(cs.length === 1 && cs[0].text === "नया।" && cs[0].en === "EN<नया।>", "new card after Clear paired correctly");
  }

  console.log("== Translate off: no requests ==");
  {
    const ff = fakeFetch();
    const app = session(ff, 0);
    app.doc.getElementById("btnTrans").click();
    ok(app.doc.getElementById("btnTrans").textContent === "Translate: off", "button shows off");
    sayCard(app, "कुछ भी।");
    ok(ff.calls.length === 0, "no request while off");
    ok(!app.cards()[0].pending, "no translating… marker while off");
    app.doc.getElementById("btnTrans").click();
    sayCard(app, "अब चालू।");
    ok(ff.calls.length === 1, "requests again after turning on");
  }

  H.done("pairing");
})();
