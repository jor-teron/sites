/* nei-dict — XOBDO-backed search (API version) */
(function () {
  const API = "https://xobdo.org/2025-web/api/wordsalpha.php";
  const FUZZY_LIMIT = 10;

  // Display / search order
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

  const langEl = document.getElementById("lang");
  const qEl = document.getElementById("q");
  const goEl = document.getElementById("go");
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");

  if (!langEl) return;

  LANGS.forEach((lang) => {
    const opt = document.createElement("option");
    opt.value = String(lang.id);
    opt.textContent = lang.name;
    if (lang.id === 1) opt.selected = true;
    langEl.appendChild(opt);
  });

  function selectedLangs() {
    const id = langEl.value;
    const meta = LANGS.find((l) => String(l.id) === id);
    if (!meta) return [];
    return [{ id: String(meta.id), name: meta.name, script: meta.script || "latin" }];
  }

  function friendlyPos(w) {
    return (w.posDesc || w.pos || "").trim() || "—";
  }

  function meaningText(w) {
    return (
      (w.meanings || [])
        .map((m) => (m.text || "").trim())
        .filter(Boolean)
        .join(" · ") || "—"
    );
  }

  /** Same start & end keyword — tight, fast response. */
  function rangeForQuery(q) {
    const key = q.trim();
    return { start: key, end: key };
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

  function classify(word, q) {
    const w = (word || "").toLowerCase();
    const query = q.toLowerCase();
    if (w === query) return "exact";
    if (w.startsWith(query) || w.includes(query)) return "fuzzy";
    return null;
  }

  function renderItem(r) {
    const li = document.createElement("li");
    li.className = "entry";

    const word = document.createElement("div");
    word.className = "entry-word";
    word.textContent = r.word;

    const meta = document.createElement("div");
    meta.className = "entry-grammar";
    meta.textContent = r.lang + " · " + r.pos;

    const meaning = document.createElement("div");
    meaning.className = "entry-meaning";
    meaning.textContent = r.meaning;

    li.appendChild(word);
    li.appendChild(meta);
    li.appendChild(meaning);
    return li;
  }

  function renderBlock(title, className, rows) {
    const section = document.createElement("section");
    section.className = "result-block " + className;
    const h = document.createElement("h2");
    h.textContent = title;
    section.appendChild(h);
    const ul = document.createElement("ul");
    ul.className = "entry-list";
    rows.forEach((r) => ul.appendChild(renderItem(r)));
    section.appendChild(ul);
    return section;
  }

  async function search() {
    const q = (qEl.value || "").trim();
    const langs = selectedLangs();
    resultsEl.innerHTML = "";
    if (!q) {
      statusEl.textContent = "Type a word to search.";
      return;
    }
    if (!langs.length) {
      statusEl.textContent = "Pick a language.";
      return;
    }

    statusEl.textContent = "Searching…";
    const exact = [];
    const fuzzy = [];
    const errors = [];
    const seen = new Set();
    const { start, end } = rangeForQuery(q);

    for (const lang of langs) {
      try {
        const words = await fetchRange(lang.id, start, end);
        for (const w of words) {
          const kind = classify(w.word || "", q);
          if (!kind) continue;
          const key = lang.id + "|" + (w.word || "").toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const row = {
            word: w.word,
            lang: lang.name,
            pos: friendlyPos(w),
            meaning: meaningText(w),
          };
          if (kind === "exact") exact.push(row);
          else fuzzy.push(row);
        }
      } catch (err) {
        errors.push(lang.name + ": " + (err.message || err));
      }
    }

    const fuzzyShown = fuzzy.slice(0, FUZZY_LIMIT);

    if (!exact.length && !fuzzyShown.length) {
      statusEl.textContent = errors.length
        ? "No hits. " + errors.join(" · ")
        : "No matches.";
      return;
    }

    statusEl.textContent =
      exact.length +
      " exact, " +
      fuzzyShown.length +
      " similar" +
      (errors.length ? " · " + errors.join(" · ") : "");

    if (exact.length) {
      resultsEl.appendChild(renderBlock("Exact", "block-exact", exact));
    }
    if (fuzzyShown.length) {
      resultsEl.appendChild(renderBlock("Similar", "block-fuzzy", fuzzyShown));
    }
  }

  goEl?.addEventListener("click", search);
  qEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") search();
  });
})();
