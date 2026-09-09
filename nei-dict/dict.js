/* nei-dict — XOBDO-backed search */
(function () {
  const API = "https://xobdo.org/2025-web/api/wordsalpha.php";

  // v1 languages (Assamese deferred)
  const LANGS = [
    { id: 1, name: "English", script: "latin" },
    { id: 10, name: "Karbi", script: "latin" },
    { id: 15, name: "Dimasa", script: "latin" },
    { id: 13, name: "Hmar", script: "latin" },
    { id: 7, name: "Meeteilon", script: "latin" },
    { id: 9, name: "Mizo", script: "latin" },
    { id: 14, name: "Nagamese", script: "latin" },
    { id: 5, name: "Khasi", script: "latin" },
    { id: 12, name: "Kok-Borok", script: "latin" },
    { id: 37, name: "Singpho", script: "latin" },
    { id: 23, name: "Nepali", script: "deva" },
  ];

  const langsEl = document.getElementById("langs");
  const qEl = document.getElementById("q");
  const goEl = document.getElementById("go");
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");

  if (!langsEl) return;

  LANGS.forEach((lang, i) => {
    const id = "lang-" + lang.id;
    const label = document.createElement("label");
    label.htmlFor = id;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.value = String(lang.id);
    // skip English by default — large + some letter buckets break on XOBDO
    cb.checked = lang.id !== 1 && i < 5;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(" " + lang.name));
    langsEl.appendChild(label);
  });

  function selectedLangs() {
    return Array.from(langsEl.querySelectorAll("input:checked")).map((el) => {
      const meta = LANGS.find((l) => String(l.id) === el.value);
      return { id: el.value, name: meta?.name || el.value, script: meta?.script || "latin" };
    });
  }

  function matchWord(word, q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    return re.test(word);
  }

  /** Prefix window from the query itself — avoids XOBDO empty responses on huge letter buckets (English c/d/h/m/n/p/r). */
  function rangeForQuery(q, script) {
    const t = q.trim();
    if (script === "deva") {
      const ch = t[0] || "अ";
      return { start: ch, end: ch + "\uffff" };
    }
    const prefix = t.toLowerCase();
    return { start: prefix, end: prefix + "zzzz" };
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
    if (!text) return []; // XOBDO sometimes returns a blank body with HTTP 200
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("Bad JSON from XOBDO (empty or truncated response)");
    }
    return data?.data?.words || [];
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
      statusEl.textContent = "Pick at least one language.";
      return;
    }

    statusEl.textContent = "Searching…";
    const rows = [];
    const errors = [];

    for (const lang of langs) {
      const { start, end } = rangeForQuery(q, lang.script);
      try {
        const words = await fetchRange(lang.id, start, end);
        for (const w of words) {
          if (!matchWord(w.word || "", q)) continue;
          const meanings = (w.meanings || [])
            .map((m) => (m.text || "").trim())
            .filter(Boolean);
          rows.push({
            word: w.word,
            lang: lang.name,
            pos: w.pos || "",
            meaning: meanings.join(" · ") || "—",
          });
        }
      } catch (err) {
        errors.push(lang.name + ": " + (err.message || err));
      }
    }

    if (!rows.length) {
      statusEl.textContent = errors.length
        ? "No hits. " + errors.join(" · ")
        : "No matches for that prefix.";
      return;
    }

    statusEl.textContent =
      rows.length +
      " result(s)" +
      (errors.length ? " · some languages failed: " + errors.join(" · ") : "");

    const table = document.createElement("table");
    table.innerHTML =
      "<thead><tr><th>Word</th><th>Language</th><th>POS</th><th>Meaning</th></tr></thead>";
    const tbody = document.createElement("tbody");
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      for (let i = 0; i < 4; i++) tr.appendChild(document.createElement("td"));
      tr.children[0].textContent = r.word;
      tr.children[1].textContent = r.lang;
      tr.children[2].textContent = r.pos;
      tr.children[3].textContent = r.meaning;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    resultsEl.appendChild(table);
  }

  goEl?.addEventListener("click", search);
  qEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") search();
  });
})();
