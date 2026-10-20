/*
  File: story.js
  Project: Story
  Description: App entry. Wires UI, history and model together.
               Flow: open DB -> show history -> enable input -> load the
               chosen model lazily (Lite by default, ~1 MB).
*/
import { openDB, saveMessage, loadHistory, clearHistory } from "./story_db.js";
import { MODELS, loadModel, generate, stop, onCrash } from "./story_model.js";
import * as ui from "./story_ui.js";

const prefs = ui.loadPrefs();
if (!MODELS[prefs.model]) prefs.model = "lite";   // stale or corrupted saved model key
let readyKey = null;    // model key loaded in the worker
let busy = false;

// Worker crashed: it was respawned empty, so the model must load again.
// Pending promises were rejected, so onSend's catch resets busy itself.
onCrash(() => { readyKey = null; if (!busy) ui.setStatus(`${MODELS[prefs.model].label} · failed (offline?)`); });

/** Load the current model, updating status. Returns true when ready, "stopped" if superseded/stopped. */
async function ensureModel() {
  const key = prefs.model, label = MODELS[key].label;
  if (readyKey === key) return true;
  ui.setStatus(`${label} · loading…`);
  try {
    await loadModel(key, (pct) => ui.setStatus(`${label} · ${pct}%`));
    readyKey = key;
    ui.setStatus(`${label} · ready`);
    return true;
  } catch (e) {
    if (e.message === "superseded") return "stopped";
    console.error(e); ui.setStatus(`${label} · failed (offline?)`);
    return false;
  }
}

async function onSend(e) {
  e.preventDefault();
  if (busy) { stop(); readyKey = null; return; }              // send button doubles as Stop
  const prompt = ui.el.input.value.trim();
  if (!prompt) return;
  busy = true; ui.setBusy(true); ui.setModelLock(true);
  ui.el.input.value = "";
  ui.addMessage("user", prompt); saveMessage("user", prompt);
  const card = ui.addMessage("bot", "");
  card.setAttribute("aria-busy", "true");
  const head = document.createTextNode(prompt), body = document.createTextNode("");
  const cursor = document.createElement("span"); cursor.className = "cursor";
  card.append(head, body, cursor);
  try {
    const ok = await ensureModel();
    if (ok === "stopped") {          // Stop pressed while the model was loading: not an error
      card.remove();
      ui.setStatus(`${MODELS[prefs.model].label} · stopped`);
      ensureModel();
      return;
    }
    if (!ok) throw new Error("model not loaded");
    const label = MODELS[prefs.model].label;
    const t0 = performance.now(); let n = 0;
    const res = await generate(prompt, prefs, (chunk, count) => {
      body.appendData(chunk); n = count || n + 1;
      ui.scrollDown();
      const sec = (performance.now() - t0) / 1000;
      if (sec > 0.3) ui.setStatus(`${label} · ${(n / sec).toFixed(1)} tok/s`);
    });
    cursor.remove();
    card.removeAttribute("aria-busy");
    saveMessage("bot", body.data);   // continuation only; the prompt is already saved as the user message
    ui.announce(prompt + body.data);
    ui.setStatus(res.stopped ? `${label} · stopped` : `${label} · ${res.tps.toFixed(1)} tok/s`);
    if (res.stopped) ensureModel();
  } catch (err) {
    console.error(err);
    card.textContent = "Couldn't write a story. Check your connection for the first download, or try Lite.";
    card.classList.add("err");
    card.removeAttribute("aria-busy");
    ui.announce(card.textContent);
  } finally {
    busy = false; ui.setBusy(false); ui.setModelLock(false);
  }
}

function pickModel(key) {
  if (!MODELS[key] || key === prefs.model) return;
  prefs.model = key; ui.savePrefs(prefs); ui.markModel(key);
  if (!busy) ensureModel();
}

async function init() {
  ui.markModel(prefs.model); ui.showPrefs(prefs);
  ui.el.form.addEventListener("submit", onSend);
  ui.el.settingsBtn.addEventListener("click", () => ui.showSettings(true));
  ui.el.closeBtn.addEventListener("click", () => ui.showSettings(false));
  ui.el.sheet.addEventListener("click", (e) => { if (e.target === ui.el.sheet) ui.showSettings(false); });
  ui.el.seg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && !busy) pickModel(b.dataset.model); });
  ui.el.len.addEventListener("input", () => { prefs.maxTokens = +ui.el.len.value; ui.showPrefs(prefs); ui.savePrefs(prefs); });
  ui.el.temp.addEventListener("input", () => { prefs.temperature = +ui.el.temp.value; ui.showPrefs(prefs); ui.savePrefs(prefs); });
  ui.el.clear.addEventListener("click", async () => {
    if (!confirm("Delete all saved stories on this device?")) return;
    await clearHistory(); ui.clearFeed();
  });

  await openDB();
  (await loadHistory()).forEach((m) => ui.addMessage(m.role, m.content));
  ensureModel();
}

init();
