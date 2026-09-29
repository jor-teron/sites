/*=============================================================================
  dedupe.test.js — transcript dedupe / card boundaries (Node, no packages).
  Run: node tools/transcribe/tests/dedupe.test.js
  Replays Live Transcribe message sequences that used to produce repeated
  lines and checks: one clean line per utterance, no cross-card repeats.
=============================================================================*/

const H = require("./harness");
const ok = H.ok;

/* Start a fake running session (socket open, setupComplete seen) */
function session(opts) {
  const app = H.loadApp(opts);
  app.run("CONFIG.ENABLE_TRANSLATION = false; ws = new WebSocket('x'); sessionReady = true; running = true; ensureLiveBlock();");
  return app;
}

/* All card texts joined, oldest first */
function allText(app) {
  return app.cards().map(function (c) { return c.text; }).filter(Boolean).join(" ");
}

/* True if some word run of 2+ words from one card starts the next card */
function crossRepeat(app) {
  const cs = app.cards().map(function (c) { return c.text.split(/\s+/).filter(Boolean); }).filter(function (w) { return w.length; });
  for (let i = 1; i < cs.length; i++) {
    const prev = cs[i - 1], cur = cs[i];
    for (let m = Math.min(prev.length, cur.length); m >= 1; m--) {
      if (prev.slice(-m).join(" ") === cur.slice(0, m).join(" ")) return true;
    }
  }
  return false;
}

function feed(app, steps) {
  steps.forEach(function (s) {
    if (s[0] === "i") app.interim(s[1]);
    else if (s[0] === "f") app.final(s[1]);
    app.advance(s[2] == null ? 200 : s[2]);
  });
}

console.log("== A: two utterances in one card ==");
{
  const app = session();
  feed(app, [["i", "मेरा"], ["i", "मेरा नाम"], ["i", "मेरा नाम जोर"], ["f", "मेरा नाम जोर है।"],
    ["i", "आप"], ["i", "आप कैसे"], ["i", "आप कैसे हैं"], ["f", "आप कैसे हैं?"]]);
  app.advance(2000);
  ok(allText(app) === "मेरा नाम जोर है। आप कैसे हैं?", "A text clean", allText(app));
  ok(app.cards().filter(function (c) { return c.text; }).length === 1, "A one card");
  ok(!app.cards().some(function (c) { return c.live && c.text; }), "A card closed after pause");
}

console.log("== B: interim revises an earlier word ==");
{
  const app = session();
  feed(app, [["i", "मेरा"], ["i", "मेरा नम"], ["i", "मेरा नाम"], ["f", "मेरा नाम जोर है।"]]);
  app.advance(2000);
  ok(allText(app) === "मेरा नाम जोर है।", "B text clean", allText(app));
}

console.log("== C: SMART final drops a filler ==");
{
  const app = session();
  feed(app, [["i", "मेरा"], ["i", "मेरा उह"], ["i", "मेरा उह नाम"], ["f", "मेरा नाम।"]]);
  app.advance(2000);
  ok(allText(app) === "मेरा नाम।", "C text clean", allText(app));
}

console.log("== D: card hits SEGMENT_MAX_MS mid-utterance ==");
{
  const app = session();
  feed(app, [["i", "आप"], ["f", "आप कैसे हैं?", 300]]);
  const words = "मैं ठीक हूँ और मेरा घर दिफू में है और मैं कल गुवाहाटी जाऊँगा".split(" ");
  for (let n = 1; n <= words.length; n++) app.interim(words.slice(0, n).join(" ")), app.advance(700);
  app.final(words.join(" ") + "।");
  app.advance(2500);
  const cs = app.cards().filter(function (c) { return c.text; });
  ok(cs.length >= 2, "D split into " + cs.length + " cards");
  ok(allText(app) === "आप कैसे हैं? " + words.join(" ") + "।", "D no repeated words across cards", cs.map(function (c) { return "[" + c.text + "]"; }).join(" "));
  ok(!crossRepeat(app), "D no cross-card repeat");
}

console.log("== E: server never sends finals (implicit final fallback) ==");
{
  const app = session();
  feed(app, [["i", "मेरा"], ["i", "मेरा नाम"], ["i", "मेरा नाम जोर है", 2600]]);
  feed(app, [["i", "आप"], ["i", "आप कैसे"], ["i", "आप कैसे हैं", 2600]]);
  app.advance(2000);
  ok(allText(app) === "मेरा नाम जोर है आप कैसे हैं", "E stale interims become finals, no repeats", allText(app));
  /* shorter, different interim = previous utterance ended */
  const app2 = session();
  feed(app2, [["i", "हाँ"], ["i", "हाँ ठीक है"], ["i", "चलो"], ["i", "चलो चलते हैं", 2600]]);
  app2.advance(2000);
  ok(allText(app2) === "हाँ ठीक है चलो चलते हैं", "E new-utterance interim commits the old one", allText(app2));
  /* stale interim became an implicit final, then the real final arrives late */
  const app3 = session();
  feed(app3, [["i", "मेरा नाम", 2600], ["f", "मेरा नाम जोर है।"]]);
  app3.advance(2500);
  ok(allText(app3) === "मेरा नाम जोर है।", "E late real final after implicit final: no repeat", allText(app3));
}

console.log("== F: repeat loops collapse, reduplication stays ==");
{
  const app = session();
  const c = function (s) { app.ctx.__s = s; return app.run("collapseRepeats(__s)"); };
  ok(c("आप कैसे हैं आप कैसे हैं") === "आप कैसे हैं", "3-word phrase twice → once");
  ok(c("चलो ना चलो ना चलो ना अब") === "चलो ना अब", "2-word phrase 3× → once");
  ok(c("धीरे धीरे चलो") === "धीरे धीरे चलो", "single-word reduplication kept");
  ok(c("बहुत अच्छा बहुत अच्छा") === "बहुत अच्छा बहुत अच्छा", "2-word phrase twice kept");
  ok(c("জাল জাল জাল") === "জাল জাল জাল", "single word ×3 kept");
  feed(app, [["f", "मैं घर जा रहा हूँ मैं घर जा रहा हूँ।"]]);
  app.advance(2000);
  ok(allText(app) === "मैं घर जा रहा हूँ।", "looping final collapsed", allText(app));
}

console.log("== G: resent / cumulative finals ==");
{
  const app = session();
  feed(app, [["f", "नमस्ते।", 300], ["f", "नमस्ते।", 300], ["f", "नमस्ते। आप कैसे हैं?"]]);
  app.advance(2000);
  ok(allText(app) === "नमस्ते। आप कैसे हैं?", "resend dropped, cumulative trimmed", allText(app));
}

console.log("== H: late interim after its final is ignored ==");
{
  const app = session();
  feed(app, [["i", "ठीक"], ["f", "ठीक है।", 100], ["i", "ठीक है"]]);
  app.advance(2000);
  ok(allText(app) === "ठीक है।", "late interim ignored", allText(app));
}

console.log("== I: setup / audio gate ==");
{
  const app = H.loadApp();
  app.run("ws = new WebSocket('x'); sessionReady = false; running = true; sendSetup();");
  const setup = app.sent[0] && app.sent[0].setup;
  ok(setup && setup.inputAudioTranscription.mode === "SMART", "mode SMART (uppercase)");
  ok(setup && setup.inputAudioTranscription.customVocabulary.indexOf("Diphu") !== -1 &&
     setup.inputAudioTranscription.customVocabulary.indexOf("Teron") !== -1, "customVocabulary from vocab.js");
  app.run("sendPcmChunk(new ArrayBuffer(8))");
  ok(app.sent.length === 1, "no audio before setupComplete");
  app.run("handleServerMessage(JSON.stringify({ setupComplete: {} }))");
  app.run("btoa = function () { return 'AA=='; }; sendPcmChunk(new ArrayBuffer(8))");
  ok(app.sent.length === 2 && app.sent[1].realtimeInput && app.sent[1].realtimeInput.audio, "audio after setupComplete");
}

console.log("== J: Stop sends audioStreamEnd and waits for the last final ==");
(async function () {
  const app = session();
  app.run("stopMic = function () {};");
  feed(app, [["i", "मैं आ"], ["i", "मैं आ रहा"]]);
  const p = app.run("stopAll(true)");
  ok(app.sent.some(function (m) { return m.realtimeInput && m.realtimeInput.audioStreamEnd; }), "audioStreamEnd sent");
  app.advance(300);
  app.final("मैं आ रहा हूँ।");
  app.advance(100);
  await p;
  ok(allText(app) === "मैं आ रहा हूँ।", "last final kept on Stop", allText(app));
  ok(!app.cards().some(function (c) { return c.live; }), "no live card after Stop");

  /* no final within STOP_FINAL_WAIT_MS → interim kept once */
  const app2 = session();
  app2.run("stopMic = function () {};");
  feed(app2, [["i", "चलो"], ["i", "चलो चलें"]]);
  const p2 = app2.run("stopAll(true)");
  app2.advance(1600);
  await p2;
  ok(allText(app2) === "चलो चलें", "interim kept when no final comes", allText(app2));
  H.done("dedupe");
})();
