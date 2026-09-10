/* nei-dict — XOBDO-backed search (API version) */
(function () {
  const API = "https://xobdo.org/2025-web/api/wordsalpha.php";

  const LANGS = [
    { id: 1, name: "English", script: "latin" },
    { id: 14, name: "Nagamese", script: "latin" },
    { id: 5, name: "Khasi", script: "latin" },
    { id: 9, name: "Mizo", script: "latin" },
    { id: 23, name: "Nepali", script: "deva" },
    { id: 10, name: "Karbi", script: "latin" },
    { id: 15, name: "Dimasa", script: "latin" },
    { id: 7, name: "Meeteilon", script: "latin" },
    { id: 13, name: "Hmar", script: "latin" },
    { id: 12, name: "Kok-Borok", script: "latin" },
    { id: 37, name: "Singpho", script: "latin" },
  ];

  const qEl = document.getElementById("q");
  const goEl = document.getElementById("go");
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");

  let grammarMap = {};

  async function loadGrammar() {
    try {
      const res = await fetch("grammar.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      grammarMap = await res.json();
    } catch (e) {
      grammarMap = {};
    }
  }

  function friendlyPos(w) {
    const pos = (w.pos || "").trim();
    if (pos && grammarMap[pos]) return grammarMap[pos];
    const desc = (w.posDesc || "").trim();
    if (desc) return desc;
    return pos || "—";
  }

  function meaningText(w) {
    return (
      (w.meanings || [])
        .map((m) => (m.text || "").trim())
        .filter(Boolean)
        .join(" · ") || "—"
    );
  }

  /** Prefix-ish window: start=query, end=query+"zz" */
  function rangeForQuery(q, script) {
    const key = q.trim();
    if (script === "deva") {
      return { start: key, end: key + "zz" };
    }
    return { start: key.toLowerCase(), end: key.toLowerCase() + "zz" };
  }

  async function fetchRange(langId, start, end) {
    const url = new URL(API);
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
    url.searchParams.set("l", String(langId));
    url.searchParams.set("p", "0");
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = (await res.text()).trim();
    if (!text) return [];
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("Bad JSON from XOBDO");
    }
    return data?.data?.words || [];
  }

  function matchesQuery(word, q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    return re.test(word || "");
  }

  function renderItem(r) {
    const li = document.createElement("li");
    li.className = "entry";

    const wordLine = document.createElement("div");
    wordLine.className = "entry-word-line";

    const word = document.createElement("span");
    word.className = "entry-word";
    word.textContent = r.word;

    const lang = document.createElement("span");
    lang.className = "entry-lang";
    lang.textContent = " (" + r.lang + ")";

    wordLine.appendChild(word);
    wordLine.appendChild(lang);

    const meta = document.createElement("div");
    meta.className = "entry-grammar";
    meta.textContent = r.pos;

    const meaning = document.createElement("div");
    meaning.className = "entry-meaning";
    meaning.textContent = r.meaning;

    li.appendChild(wordLine);
    li.appendChild(meta);
    li.appendChild(meaning);
    return li;
  }

  async function search() {
    const q = (qEl.value || "").trim();
    resultsEl.innerHTML = "";
    statusEl.textContent = "";
    if (!q) {
      statusEl.textContent = "Type a word to search.";
      return;
    }

    statusEl.textContent = "Searching…";
    const rows = [];
    const errors = [];
    const seen = new Set();

    for (const lang of LANGS) {
      const { start, end } = rangeForQuery(q, lang.script);
      try {
        const words = await fetchRange(lang.id, start, end);
        for (const w of words) {
          if (!matchesQuery(w.word || "", q)) continue;
          const key = lang.id + "|" + (w.word || "").toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({
            word: w.word,
            lang: lang.name,
            pos: friendlyPos(w),
            meaning: meaningText(w),
          });
        }
      } catch (err) {
        errors.push(lang.name + ": " + (err.message || err));
      }
    }

    statusEl.textContent = "";

    if (!rows.length) {
      statusEl.textContent = errors.length
        ? "No matches. " + errors.join(" · ")
        : "No matches.";
      return;
    }

    if (errors.length) {
      statusEl.textContent = "Some languages failed: " + errors.join(" · ");
    }

    const ul = document.createElement("ul");
    ul.className = "entry-list";
    rows.forEach((r) => ul.appendChild(renderItem(r)));
    resultsEl.appendChild(ul);
  }

  goEl?.addEventListener("click", search);
  qEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") search();
  });

  loadGrammar();
})();
