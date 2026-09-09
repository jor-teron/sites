/* nei-dict — minimal XOBDO-backed search scaffold */
(function () {
  const API =
    "https://xobdo.org/2025-web/api/wordsalpha.php";

  // v1 languages (Assamese deferred)
  const LANGS = [
    { id: 1, name: "English" },
    { id: 10, name: "Karbi" },
    { id: 15, name: "Dimasa" },
    { id: 13, name: "Hmar" },
    { id: 7, name: "Meeteilon" },
    { id: 9, name: "Mizo" },
    { id: 14, name: "Nagamese" },
    { id: 5, name: "Khasi" },
    { id: 12, name: "Kok-Borok" },
    { id: 37, name: "Singpho" },
    { id: 23, name: "Nepali" }
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
    cb.checked = i < 4; // a few on by default
    label.appendChild(cb);
    label.appendChild(document.createTextNode(" " + lang.name));
    langsEl.appendChild(label);
  });

  function selectedLangs() {
    return Array.from(langsEl.querySelectorAll("input:checked")).map((el) => ({
      id: el.value,
      name: LANGS.find((l) => String(l.id) === el.value)?.name || el.value,
    }));
  }

  // Tiny escape for RegExp (2-liner core)
  function matchWord(word, q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    return re.test(word);
  }

  async function fetchRange(langId, start, end) {
    const url = new URL(API);
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
    url.searchParams.set("l", String(langId));
    url.searchParams.set("p", "0");
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return data?.data?.words || [];
  }

  // First-letter window keeps payloads small for Latin-script langs
  function rangeForQuery(q) {
    const ch = (q.trim()[0] || "a").toLowerCase();
    if (/[a-z]/.test(ch)) return { start: ch, end: ch + "zzzz" };
    // non-Latin (e.g. Nepali): broader script-ish window using the char itself
    return { start: ch, end: ch + "\uffff" };
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
    const { start, end } = rangeForQuery(q);
    const rows = [];

    try {
      for (const lang of langs) {
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
      }
    } catch (err) {
      statusEl.textContent = "Search failed: " + (err.message || err);
      return;
    }

    if (!rows.length) {
      statusEl.textContent = "No exact/regex hits in the loaded range. (Fuzzy suggestions come next.)";
      return;
    }

    statusEl.textContent = rows.length + " result(s)";
    const table = document.createElement("table");
    table.innerHTML =
      "<thead><tr><th>Word</th><th>Language</th><th>POS</th><th>Meaning</th></tr></thead>";
    const tbody = document.createElement("tbody");
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td></td><td></td><td></td><td></td>";
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
