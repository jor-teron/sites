/*=============================================================================
  translation.js — English line: one text request per closed card
  Needs CONFIG, now, getApiKey, setStatus from transcribe.js.

  A card is translated only after it closes, from its final transcript.
  Every request carries the cards as JSON items keyed by card number
  (data-seq) and the reply is written back by that number, so English can
  never land on the wrong card — even if replies come back out of order.
  If a request went out less than TRANSLATE_MIN_GAP_MS ago, closed cards
  wait and go together in the next request. The previous
  TRANSLATE_CONTEXT_CARDS cards ride along as context only.
=============================================================================*/

/* Closed cards waiting for a request */
let trQueue = [];
/* Time the last request went out (ms) */
let trLastSentAt = 0;
/* Pending "send the waiting cards" timer */
let trTimer = null;
/* AbortControllers of requests in flight (Clear / Translate off abort) */
let trAborts = [];
/* Bumped by clearTranslations: replies from older generations are dropped */
let trGen = 0;
/* model id → time until which it is skipped (after a 429) */
let trCooldown = {};

/* Target code → language name for the prompt */
const TRANSLATE_LANG_NAMES = { en: "English", hi: "Hindi", as: "Assamese", bn: "Bengali", ne: "Nepali" };

/* Dropdown value → source language name for the prompt */
const SOURCE_LANG_NAMES = {
  as: "Assamese", hi: "Hindi", bn: "Bengali", ne: "Nepali",
  auto: "an Indian language (Assamese, Hindi, Bengali or Nepali)"
};

/*----------------------------------------------------------------------------
  paintEn
  Fill or hide the English translation line on a block.
----------------------------------------------------------------------------*/
function paintEn(blockEl, enText) {
  if (!blockEl) return;
  let en = blockEl.querySelector(".en");
  if (!CONFIG.ENABLE_TRANSLATION) {
    if (en) {
      en.textContent = "";
      en.classList.remove("pending");
    }
    return;
  }
  if (!en) {
    en = document.createElement("div");
    en.className = "line en";
    blockEl.insertBefore(en, blockEl.firstChild.nextSibling);
  }
  const t = (enText || "").trim();
  en.textContent = t ? ("(ENG) " + t) : "";
}

/*----------------------------------------------------------------------------
  setEnPending
  Toggle the "translating…" marker on a block's English line.
  The marker is CSS ::after, so copyAll never picks it up.
----------------------------------------------------------------------------*/
function setEnPending(blockEl, on) {
  if (!blockEl) return;
  const en = blockEl.querySelector(".en");
  if (!en) return;
  if (on) en.classList.add("pending");
  else en.classList.remove("pending");
}

/*----------------------------------------------------------------------------
  requestTranslation
  A card just closed: queue it (nothing is sent while Translate is off).
----------------------------------------------------------------------------*/
function requestTranslation(el) {
  if (!el || !CONFIG.ENABLE_TRANSLATION) return;
  if (!(el.dataset.original || "").trim()) return;
  if (trQueue.indexOf(el) !== -1) return;
  el.dataset.enTries = el.dataset.enTries || "0";
  paintEn(el, "");
  setEnPending(el, true);
  trQueue.push(el);
  pumpTranslations();
}

/*----------------------------------------------------------------------------
  pumpTranslations
  Send the waiting cards now, or schedule them for when the gap is over.
----------------------------------------------------------------------------*/
function pumpTranslations() {
  trQueue = trQueue.filter(function (el) { return el.isConnected; });
  if (!trQueue.length || !CONFIG.ENABLE_TRANSLATION) return;
  const wait = CONFIG.TRANSLATE_MIN_GAP_MS - (now() - trLastSentAt);
  if (trLastSentAt && wait > 0) {
    if (!trTimer) {
      trTimer = setTimeout(function () {
        trTimer = null;
        pumpTranslations();
      }, wait);
    }
    return;
  }
  const batch = trQueue.splice(0, Math.max(1, CONFIG.TRANSLATE_MAX_BATCH));
  trLastSentAt = now();
  translateBatch(batch);
  if (trQueue.length) pumpTranslations();
}

/*----------------------------------------------------------------------------
  contextCards
  The TRANSLATE_CONTEXT_CARDS closed cards just before card number `seq`,
  oldest first: [{ text, en }].
----------------------------------------------------------------------------*/
function contextCards(seq) {
  const out = [];
  const n = CONFIG.TRANSLATE_CONTEXT_CARDS || 0;
  if (!n) return out;
  const cards = Array.prototype.slice.call(document.querySelectorAll("#blocks .block"));
  cards
    .filter(function (el) { return Number(el.dataset.seq) < seq && (el.dataset.original || "").trim(); })
    .sort(function (a, b) { return Number(b.dataset.seq) - Number(a.dataset.seq); })
    .slice(0, n)
    .reverse()
    .forEach(function (el) {
      const item = { text: el.dataset.original.trim() };
      if ((el.dataset.en || "").trim()) item.en = el.dataset.en.trim();
      out.push(item);
    });
  return out;
}

/*----------------------------------------------------------------------------
  translatePrompt
  System instruction + JSON user message for one batch of cards.
----------------------------------------------------------------------------*/
function translatePrompt(items, context) {
  const sel = document.getElementById("langSelect");
  const src = SOURCE_LANG_NAMES[sel ? sel.value : "auto"] || SOURCE_LANG_NAMES.auto;
  const target = TRANSLATE_LANG_NAMES[CONFIG.TRANSLATE_TARGET] || CONFIG.TRANSLATE_TARGET;
  const system =
    "You translate live speech captions from " + src + " (it may be mixed with English) " +
    "into natural, everyday " + target + ". The user message is JSON: \"items\" are the " +
    "caption cards to translate, each with an \"id\"; \"context\" holds the cards just " +
    "before them, for meaning only — never translate or repeat the context. " +
    "Translate each item on its own; if an item is an unfinished fragment, translate the " +
    "fragment without completing it. Keep names of people and places as spoken " +
    "(e.g. Diphu, Karbi Anglong, Teron). Reply only with JSON: " +
    "{\"items\": [{\"id\": \"<same id>\", \"en\": \"<translation>\"}]} with one entry per item.";
  return {
    system: system,
    user: JSON.stringify({ context: context, items: items })
  };
}

/*----------------------------------------------------------------------------
  parseTranslateReply
  Model text → { id: translation }. Tolerates ``` fences / extra text.
----------------------------------------------------------------------------*/
function parseTranslateReply(textOut) {
  const raw = String(textOut || "").trim();
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a === -1 || b <= a) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(a, b + 1));
  } catch (e) {
    return null;
  }
  const list = parsed && Array.isArray(parsed.items) ? parsed.items : null;
  if (!list) return null;
  const map = {};
  list.forEach(function (it) {
    if (!it) return;
    const id = String(it.id == null ? "" : it.id).trim();
    const en = typeof it.en === "string" ? it.en.trim() : "";
    if (id && en) map[id] = en;
  });
  return map;
}

/*----------------------------------------------------------------------------
  pickModels
  TRANSLATE_MODELS in order, skipping ones cooling down after a 429.
----------------------------------------------------------------------------*/
function pickModels() {
  const t = now();
  return (CONFIG.TRANSLATE_MODELS || []).filter(function (m) {
    return !(trCooldown[m] > t);
  });
}

/*----------------------------------------------------------------------------
  translateBatch
  One generateContent request for a batch of closed cards. Model fallback
  on error / 429. Each reply item is written to the card with that number.
----------------------------------------------------------------------------*/
async function translateBatch(batch) {
  const gen = trGen;
  const items = batch.map(function (el) {
    return { id: el.dataset.seq, text: el.dataset.original.trim() };
  });
  const minSeq = Math.min.apply(null, batch.map(function (el) { return Number(el.dataset.seq); }));
  const prompt = translatePrompt(items, contextCards(minSeq));
  const key = getApiKey();
  if (!key) {
    finishBatch(batch, gen, {}, "Add an API key to translate");
    return;
  }
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  if (ctrl) trAborts.push(ctrl);
  const body = {
    systemInstruction: { parts: [{ text: prompt.system }] },
    contents: [{ role: "user", parts: [{ text: prompt.user }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { id: { type: "STRING" }, en: { type: "STRING" } },
              required: ["id", "en"]
            }
          }
        },
        required: ["items"]
      }
    }
  };
  let lastError = "";
  let map = null;
  const models = pickModels();
  for (let i = 0; i < models.length && !map; i++) {
    const model = models[i];
    try {
      const res = await fetch(
        CONFIG.CHAT_API_BASE + model + ":generateContent?key=" + encodeURIComponent(key),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl ? ctrl.signal : undefined
        }
      );
      if (gen !== trGen) break;
      if (res.status === 429) {
        trCooldown[model] = now() + CONFIG.TRANSLATE_COOLDOWN_MS;
        lastError = "Translate: rate limit (" + model + ")";
        continue;
      }
      const data = await res.json();
      if (gen !== trGen) break;
      if (!res.ok) {
        lastError = "Translate error: " + ((data && data.error && data.error.message) || res.status);
        continue;
      }
      const parts = data && data.candidates && data.candidates[0] &&
        data.candidates[0].content && data.candidates[0].content.parts;
      const textOut = parts ? parts.map(function (p) { return p.text || ""; }).join("") : "";
      map = parseTranslateReply(textOut);
      if (!map) lastError = "Translate: unreadable reply (" + model + ")";
    } catch (err) {
      if (err && err.name === "AbortError") break;
      if (gen !== trGen) break;
      lastError = "Translate failed (" + model + ")";
    }
  }
  if (ctrl) trAborts = trAborts.filter(function (c) { return c !== ctrl; });
  if (gen !== trGen) return;
  if (!models.length) lastError = "Translate: all models rate-limited, wait a minute";
  finishBatch(batch, gen, map || {}, lastError);
}

/*----------------------------------------------------------------------------
  finishBatch
  Write each translation to its own card (by card number). Cards missing
  from the reply are asked again up to TRANSLATE_RETRIES times.
----------------------------------------------------------------------------*/
function finishBatch(batch, gen, map, errorMsg) {
  if (gen !== trGen) return;
  let missing = 0;
  batch.forEach(function (el) {
    if (!el.isConnected) return;
    const en = map[el.dataset.seq];
    if (en) {
      el.dataset.en = en;
      paintEn(el, en);
      setEnPending(el, false);
      return;
    }
    const tries = Number(el.dataset.enTries || 0) + 1;
    el.dataset.enTries = String(tries);
    if (CONFIG.ENABLE_TRANSLATION && tries <= CONFIG.TRANSLATE_RETRIES && errorMsg.indexOf("API key") === -1) {
      trQueue.push(el);
      missing += 1;
    } else {
      setEnPending(el, false);
    }
  });
  if (errorMsg && !Object.keys(map).length) setStatus(errorMsg, "err");
  if (missing) pumpTranslations();
}

/*----------------------------------------------------------------------------
  clearTranslations
  Clear / Translate off: abort requests in flight, forget waiting cards.
----------------------------------------------------------------------------*/
function clearTranslations() {
  trGen += 1;
  trAborts.forEach(function (c) { try { c.abort(); } catch (e) {} });
  trAborts = [];
  trQueue.forEach(function (el) { setEnPending(el, false); });
  trQueue = [];
  if (trTimer) {
    clearTimeout(trTimer);
    trTimer = null;
  }
}
