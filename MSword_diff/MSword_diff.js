/* MSword_diff.js — see HTML comments for UI wiring */
(function () {
  var fileOld = document.getElementById("fileOld");
  var fileNew = document.getElementById("fileNew");
  var btn = document.getElementById("btnCompare");
  var btnClear = document.getElementById("btnClear");
  var statusEl = document.getElementById("status");
  var statsEl = document.getElementById("stats");
  var resultEl = document.getElementById("result");
  var diffScroll = document.getElementById("diffScroll");
  var changeBar = document.getElementById("changeBar");
  var wordMode = document.getElementById("wordMode");
  var fontSize = document.getElementById("fontSize");
  var minimapOpt = document.getElementById("minimapOpt");
  var countsOpt = document.getElementById("countsOpt");
  var diffBoard = document.getElementById("diffBoard");
  var headOld = document.getElementById("headOld");
  var headNew = document.getElementById("headNew");
  var btnSwap = document.getElementById("btnSwap");
  var appHeader = document.getElementById("appHeader");
  var held = { old: null, new: null };
  var pairNodes = [];
  var docCache = typeof WeakMap === "function" ? new WeakMap() : null;
  var docCacheFallback = [];

  var IDB_NAME = "msword_diff";
  var IDB_STORE = "files";
  var restoring = false;

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error("no idb")); return; }
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbPut(key, rec) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(rec, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function fileToRec(file) {
    if (!file) return Promise.resolve(null);
    return file.arrayBuffer().then(function (buf) {
      return { name: file.name, type: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buf: buf };
    });
  }

  function recToFile(rec) {
    if (!rec || !rec.buf) return null;
    return new File([rec.buf], rec.name || "document.docx", { type: rec.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  function saveHeld() {
    if (restoring) return;
    var oldF = held.old, newF = held.new;
    Promise.all([fileToRec(oldF), fileToRec(newF)]).then(function (pair) {
      return Promise.all([
        pair[0] ? idbPut("old", pair[0]) : idbPut("old", null),
        pair[1] ? idbPut("new", pair[1]) : idbPut("new", null)
      ]);
    }).catch(function () {});
  }

  function restoreHeld() {
    if (!window.indexedDB) return Promise.resolve();
    restoring = true;
    return Promise.all([idbGet("old"), idbGet("new")]).then(function (pair) {
      var a = recToFile(pair[0]);
      var b = recToFile(pair[1]);
      if (a) setFile("old", a);
      if (b) setFile("new", b);
      restoring = false;
      if (a && b) maybeCompare();
    }).catch(function () { restoring = false; });
  }

  function idbClear() {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () {});
  }

  function clearFiles() {
    held.old = null;
    held.new = null;
    try { fileOld.value = ""; fileNew.value = ""; } catch (e) {}
    pairNodes = [];
    if (diffScroll) diffScroll.innerHTML = '<p class="hint">Drop one or two .docx files on the left or right pane.</p>';
    if (changeBar) changeBar.textContent = "";
    if (statsEl) statsEl.hidden = true;
    updatePaneHeads();
    showStatus("");
    restoring = true;
    idbClear().then(function () { restoring = false; });
    restoring = false;
  }


  fileOld.addEventListener("change", function () {
    held.old = fileOld.files[0] || null;
    updatePaneHeads();
    maybeCompare();
  });
  fileNew.addEventListener("change", function () {
    held.new = fileNew.files[0] || null;
    updatePaneHeads();
    maybeCompare();
  });
  headOld.addEventListener("click", function () { fileOld.click(); });
  headNew.addEventListener("click", function () { fileNew.click(); });

  function docxFromList(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (/\.docx$/i.test(list[i].name)) out.push(list[i]);
    }
    return out;
  }

  function setFile(which, file) {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      showStatus("Only .docx files can be dropped.");
      return;
    }
    var input = which === "old" ? fileOld : fileNew;
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    } catch (e) {}
    held[which] = file;
    showStatus("");
    updatePaneHeads();
    saveHeld();
  }

  function updatePaneHeads() {
    if (!headOld || !headNew) return;
    headOld.textContent = held.old ? held.old.name : "Drop a .docx";
    headOld.title = held.old ? held.old.name : "Click to choose or drop here";
    headNew.textContent = held.new ? held.new.name : "Drop a .docx";
    headNew.title = held.new ? held.new.name : "Click to choose or drop here";
  }

  function takeTwo(files) {
    setFile("old", files[0]);
    setFile("new", files[1]);
    maybeCompare();
  }

  function maybeCompare() {
    var a = held.old || fileOld.files[0];
    var b = held.new || fileNew.files[0];
    if (a && b) {
      runCompare().catch(function (err) {
        showStatus("Error: " + (err && err.message ? err.message : err));
        btn.disabled = false;
      });
      return;
    }
    if (a || b) {
      showPreview(a ? "old" : "new", a || b).catch(function (err) {
        showStatus("Error: " + (err && err.message ? err.message : err));
      });
    }
  }

  async function showPreview(side, file) {
    if (typeof JSZip === "undefined") throw new Error("JSZip not loaded.");
    showStatus("Reading file...");
    var doc = await docxToDoc(file);
    var rows = [];
    for (var i = 0; i < doc.paras.length; i++) {
      var tx = doc.paras[i].text;
      if (side === "old") rows.push({ left: tx, right: "", leftKind: "eq", rightKind: "empty" });
      else rows.push({ left: "", right: tx, leftKind: "empty", rightKind: "eq" });
    }
    renderPanes(rows, false, side === "old" ? doc.paras : [], side === "new" ? doc.paras : []);
    showStatus("");
  }


  function sideFromEvent(e) {
    var box = (diffBoard || diffScroll).getBoundingClientRect();
    return e.clientX < box.left + box.width / 2 ? "old" : "new";
  }

  function acceptDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (diffBoard) diffBoard.classList.remove("drag");
    headOld.classList.remove("drag");
    headNew.classList.remove("drag");
    var files = docxFromList(e.dataTransfer.files);
    if (!files.length) { showStatus("Drop a .docx file."); return; }
    if (files.length >= 2) { takeTwo(files); return; }
    setFile(sideFromEvent(e), files[0]);
    maybeCompare();
  }

  function bindBoardDrop(el) {
    if (!el) return;
    el.addEventListener("dragenter", function (e) { e.preventDefault(); if (diffBoard) diffBoard.classList.add("drag"); });
    el.addEventListener("dragover", function (e) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
    el.addEventListener("dragleave", function (e) {
      if (diffBoard && !diffBoard.contains(e.relatedTarget)) diffBoard.classList.remove("drag");
    });
    el.addEventListener("drop", acceptDrop);
  }

  bindBoardDrop(diffBoard);
  bindBoardDrop(headOld);
  bindBoardDrop(headNew);

  document.addEventListener("dragover", function (e) { e.preventDefault(); });
  document.addEventListener("drop", function (e) {
    e.preventDefault();
    if (appHeader && appHeader.contains(e.target)) return;
    acceptDrop(e);
  });

  function swapSides() {
    var a = held.old, b = held.new;
    if (!a && !b) return;
    if (b) setFile("old", b); else { held.old = null; fileOld.value = ""; }
    if (a) setFile("new", a); else { held.new = null; fileNew.value = ""; }
    updatePaneHeads();
    saveHeld();
    maybeCompare();
  }
  if (btnSwap) btnSwap.addEventListener("click", swapSides);
  if (btnClear) btnClear.addEventListener("click", clearFiles);

  btn.addEventListener("click", function () {
    runCompare().catch(function (err) {
      showStatus("Error: " + (err && err.message ? err.message : err));
      btn.disabled = false;
    });
  });

  function fillFontOptions() {
    if (fontSize.options.length) return;
    var saved = parseInt(localStorage.getItem("msword_diff_pt") || "12", 10);
    if (isNaN(saved) || saved < 10 || saved > 24 || saved % 2) saved = 12;
    for (var pt = 10; pt <= 24; pt += 2) {
      var opt = document.createElement("option");
      opt.value = String(pt);
      opt.textContent = String(pt);
      if (pt === saved) opt.selected = true;
      fontSize.appendChild(opt);
    }
    applyFontSize();
  }
  function applyFontSize() {
    var pt = fontSize.value || "12";
    diffScroll.style.setProperty("--diff-pt", pt + "pt");
    try { localStorage.setItem("msword_diff_pt", pt); } catch (e) {}
  }
  function applyViewOptions() {
    var mapOn = minimapOpt && minimapOpt.value === "on";
    var countOn = countsOpt && countsOpt.value === "on";
    if (diffBoard) diffBoard.classList.toggle("no-map", !mapOn);
    var heads = document.querySelector(".pane-heads");
    if (heads) heads.classList.toggle("no-map", !mapOn);
    if (changeBar) changeBar.hidden = !mapOn;
    if (statsEl && !countOn) statsEl.hidden = true;
    try {
      localStorage.setItem("msword_diff_map", mapOn ? "on" : "off");
      localStorage.setItem("msword_diff_counts", countOn ? "on" : "off");
    } catch (e) {}
  }

  function restoreViewOptions() {
    try {
      var m = localStorage.getItem("msword_diff_map");
      var c = localStorage.getItem("msword_diff_counts");
      if (minimapOpt && (m === "on" || m === "off")) minimapOpt.value = m;
      if (countsOpt && (c === "on" || c === "off")) countsOpt.value = c;
    } catch (e) {}
    applyViewOptions();
  }

  fontSize.addEventListener("change", applyFontSize);
  if (minimapOpt) minimapOpt.addEventListener("change", applyViewOptions);
  if (countsOpt) countsOpt.addEventListener("change", applyViewOptions);
  fillFontOptions();
  restoreViewOptions();
  restoreHeld();

  function showStatus(msg) {
    statusEl.hidden = !msg;
    statusEl.textContent = msg || "";
  }

  async function runCompare() {
    if (typeof JSZip === "undefined") throw new Error("JSZip not loaded. Put lib/jszip.min.js in lib/.");
    if (typeof diff_match_patch === "undefined") throw new Error("diff_match_patch not loaded. Put lib/diff_match_patch.js in lib/.");
    var oldFile = held.old || fileOld.files[0];
    var newFile = held.new || fileNew.files[0];
    if (!oldFile || !newFile) throw new Error("Choose both Old and New .docx files.");
    btn.disabled = true;
    showStatus("Reading files…");
    resultEl.hidden = true;
    statsEl.hidden = true;
    var docOld = await docxToDoc(oldFile);
    var docNew = await docxToDoc(newFile);
    showStatus("Comparing…");
    var dmp = new diff_match_patch();
    dmp.Diff_Timeout = 8;
    var diffs = dmp.diff_main(docOld.text, docNew.text);
    if ((wordMode.value === "on")) dmp.diff_cleanupSemantic(diffs);
    var rows = pairChangeRows(diffsToRows(diffs));
    renderPanes(rows, (wordMode.value === "on"), docOld.paras, docNew.paras);
    showCounts(diffs, rows);
    resultEl.hidden = false;
    showStatus("");
    btn.disabled = false;
  }

  function firstChildLocal(el, name) {
    if (!el) return null;
    for (var n = el.firstElementChild; n; n = n.nextElementSibling) {
      if ((n.localName || "") === name) return n;
    }
    return null;
  }
  function firstByLocal(root, name) {
    if (!root) return null;
    var found = firstChildLocal(root, name);
    if (found) return found;
    for (var n = root.firstElementChild; n; n = n.nextElementSibling) {
      found = firstByLocal(n, name);
      if (found) return found;
    }
    return null;
  }
  function kidsByLocal(root, name) {
    var out = [];
    function walk(el) {
      for (var n = el.firstElementChild; n; n = n.nextElementSibling) {
        if ((n.localName || "") === name) out.push(n);
        if (n.firstElementChild) walk(n);
      }
    }
    if (root) walk(root);
    return out;
  }
  function attrVal(el, name) {
    if (!el) return "";
    if (el.getAttribute(name)) return el.getAttribute(name);
    if (el.getAttribute("w:" + name)) return el.getAttribute("w:" + name);
    for (var i = 0; i < el.attributes.length; i++) {
      if (el.attributes[i].localName === name) return el.attributes[i].value;
    }
    return "";
  }
  function twipToPx(v) {
    var n = parseInt(v, 10);
    if (!n) return 0;
    return Math.round(n / 20 * 96 / 72);
  }
  function cacheGet(file) {
    if (docCache) return docCache.get(file) || null;
    for (var i = 0; i < docCacheFallback.length; i++) {
      if (docCacheFallback[i].file === file) return docCacheFallback[i].doc;
    }
    return null;
  }
  function cacheSet(file, doc) {
    if (docCache) { docCache.set(file, doc); return; }
    docCacheFallback.push({ file: file, doc: doc });
    if (docCacheFallback.length > 8) docCacheFallback.shift();
  }

  async function docxToDoc(file) {
    if (!/\.docx$/i.test(file.name)) throw new Error(file.name + " is not a .docx file (old .doc is not supported).");
    var cached = cacheGet(file);
    if (cached) return cached;
    var zip = await JSZip.loadAsync(file);
    var xmlFile = zip.file("word/document.xml");
    if (!xmlFile) throw new Error(file.name + " has no word/document.xml. Is it a valid Word file?");
    var styleMap = {}, numMap = {};
    var stylesFile = zip.file("word/styles.xml");
    var numFile = zip.file("word/numbering.xml");
    if (stylesFile) styleMap = parseStyles(await stylesFile.async("string"));
    if (numFile) numMap = parseNumbering(await numFile.async("string"));
    var parsed = parseBody(await xmlFile.async("string"), styleMap, numMap);
    cacheSet(file, parsed);
    return parsed;
  }

  function parseStyles(xml) {
    var doc = new DOMParser().parseFromString(xml, "text/xml");
    var map = {}, styles = kidsByLocal(doc, "style");
    for (var i = 0; i < styles.length; i++) {
      var id = attrVal(styles[i], "styleId");
      if (!id) continue;
      var nameEl = firstChildLocal(styles[i], "name");
      var name = (attrVal(nameEl, "val") || id).toLowerCase();
      var heading = 0;
      var m = name.match(/heading\s*([1-3])/);
      if (m) heading = parseInt(m[1], 10);
      if (!heading && /heading\s*1/i.test(id)) heading = 1;
      if (!heading && /heading\s*2/i.test(id)) heading = 2;
      if (!heading && /heading\s*3/i.test(id)) heading = 3;
      var rPr = firstByLocal(styles[i], "rPr");
      map[id] = { heading: heading, bold: !!(rPr && firstChildLocal(rPr, "b")), italic: !!(rPr && firstChildLocal(rPr, "i")), underline: !!(rPr && firstChildLocal(rPr, "u")) };
    }
    return map;
  }

  function parseNumbering(xml) {
    var doc = new DOMParser().parseFromString(xml, "text/xml");
    var abstracts = {}, abs = kidsByLocal(doc, "abstractNum");
    for (var i = 0; i < abs.length; i++) {
      var aid = attrVal(abs[i], "abstractNumId"), levels = {};
      for (var n = abs[i].firstElementChild; n; n = n.nextElementSibling) {
        if ((n.localName || "") !== "lvl") continue;
        var ilvl = attrVal(n, "ilvl") || "0";
        var fmt = attrVal(firstChildLocal(n, "numFmt"), "val") || "bullet";
        levels[ilvl] = { kind: fmt === "bullet" ? "bullet" : "number", format: fmt };
      }
      abstracts[aid] = levels;
    }
    var map = {}, nums = kidsByLocal(doc, "num");
    for (var k = 0; k < nums.length; k++) {
      if ((nums[k].parentNode.localName || "") === "lvl") continue;
      map[attrVal(nums[k], "numId")] = abstracts[attrVal(firstChildLocal(nums[k], "abstractNumId"), "val")] || {};
    }
    return map;
  }

  function parseBody(xml, styleMap, numMap) {
    var doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.querySelector("parsererror")) throw new Error("Could not parse Word XML.");
    var paras = [], counters = {};
    var body = firstByLocal(doc, "body") || doc;
    walkBlocks(body, paras, styleMap, numMap, counters);
    var text = "";
    for (var t = 0; t < paras.length; t++) { if (t) text += "\n"; text += paras[t].text; }
    return { paras: paras, text: text };
  }

  function walkBlocks(el, paras, styleMap, numMap, counters) {
    for (var n = el.firstElementChild; n; n = n.nextElementSibling) {
      var name = n.localName || "";
      if (name === "p") paras.push(parsePara(n, styleMap, numMap, counters));
      else if (name === "tbl") emitTable(n, paras);
      else if (name === "sdt" || name === "sdtContent" || name === "body") {
        walkBlocks(n, paras, styleMap, numMap, counters);
      }
    }
  }

  function cellPlain(tc) {
    var bits = [];
    function grab(el) {
      for (var n = el.firstElementChild; n; n = n.nextElementSibling) {
        var name = n.localName || "";
        if (name === "t") bits.push(n.textContent || "");
        else if (name === "tab") bits.push("\t");
        else if (name === "br" || name === "cr") bits.push(" ");
        else if (name !== "tbl") grab(n);
      }
    }
    grab(tc);
    return bits.join("").replace(/\s+/g, " ").trim();
  }

  function emitTable(tbl, paras) {
    for (var n = tbl.firstElementChild; n; n = n.nextElementSibling) {
      var name = n.localName || "";
      if (name === "tblGrid" || name === "tblPr") continue;
      if (name === "tr") {
        var cells = [];
        for (var c = n.firstElementChild; c; c = c.nextElementSibling) {
          if ((c.localName || "") === "tc") cells.push(cellPlain(c));
        }
        var line = cells.join(" | ");
        paras.push({
          text: line,
          runs: [{ text: line, bold: false, italic: false, underline: false }],
          align: "left",
          heading: 0,
          padLeft: 0,
          padFirst: 0,
          spaceBefore: 4,
          spaceAfter: 4,
          listKind: null,
          listLabel: ""
        });
      } else if (name === "tbl") emitTable(n, paras);
    }
  }

  function parsePara(p, styleMap, numMap, counters) {
    var pPr = firstChildLocal(p, "pPr");
    var styleId = pPr ? attrVal(firstChildLocal(pPr, "pStyle"), "val") : "";
    var st = styleMap[styleId] || { heading: 0, bold: false, italic: false, underline: false };
    var jc = pPr ? attrVal(firstChildLocal(pPr, "jc"), "val") : "";
    var align = "left";
    if (jc === "center") align = "center";
    else if (jc === "right" || jc === "end") align = "right";
    else if (jc === "both") align = "justify";
    var ind = pPr ? firstChildLocal(pPr, "ind") : null;
    var left = twipToPx(attrVal(ind, "left") || attrVal(ind, "start"));
    var first = twipToPx(attrVal(ind, "firstLine"));
    var hang = twipToPx(attrVal(ind, "hanging"));
    var sp = pPr ? firstChildLocal(pPr, "spacing") : null;
    var before = twipToPx(attrVal(sp, "before"));
    var after = twipToPx(attrVal(sp, "after"));
    var heading = st.heading, listKind = null, listLabel = "";
    var numPr = pPr ? firstChildLocal(pPr, "numPr") : null;
    if (numPr) {
      var ilvl = attrVal(firstChildLocal(numPr, "ilvl"), "val") || "0";
      var numId = attrVal(firstChildLocal(numPr, "numId"), "val") || "0";
      var spec = (numMap[numId] || {})[ilvl] || { kind: "bullet" };
      listKind = spec.kind;
      left += parseInt(ilvl, 10) * 24;
      if (listKind === "number") {
        var key = numId + ":" + ilvl;
        counters[key] = (counters[key] || 0) + 1;
        listLabel = counters[key] + ".";
        for (var wipe = parseInt(ilvl, 10) + 1; wipe < 9; wipe++) delete counters[numId + ":" + wipe];
      } else listLabel = "•";
    }
    var runs = [];
    collectRuns(p, runs, st);
    var text = "";
    for (var r = 0; r < runs.length; r++) text += runs[r].text;
    return { text: text, runs: runs, align: align, heading: heading, padLeft: left, padFirst: first - hang, spaceBefore: Math.min(before, 36), spaceAfter: Math.min(after, 36), listKind: listKind, listLabel: listLabel };
  }

  function collectRuns(el, runs, st) {
    for (var n = el.firstElementChild; n; n = n.nextElementSibling) {
      var name = n.localName || "";
      if (name === "pPr") continue;
      if (name === "r") {
        var rPr = firstChildLocal(n, "rPr");
        var bEl = rPr ? firstChildLocal(rPr, "b") : null;
        var iEl = rPr ? firstChildLocal(rPr, "i") : null;
        var uEl = rPr ? firstChildLocal(rPr, "u") : null;
        var bold = st.bold || !!(bEl && attrVal(bEl, "val") !== "0" && attrVal(bEl, "val") !== "false");
        var italic = st.italic || !!(iEl && attrVal(iEl, "val") !== "0" && attrVal(iEl, "val") !== "false");
        var under = st.underline || !!(uEl && attrVal(uEl, "val") !== "none");
        var t = "";
        for (var c = n.firstElementChild; c; c = c.nextElementSibling) {
          var ln = c.localName || "";
          if (ln === "t") t += c.textContent || "";
          else if (ln === "tab") t += "\t";
          else if (ln === "br" || ln === "cr") t += "\n";
        }
        if (t) runs.push({ text: t, bold: bold, italic: italic, underline: under });
        continue;
      }
      if (name === "hyperlink" || name === "ins" || name === "del" || name === "smartTag" || name === "sdt" || name === "sdtContent") collectRuns(n, runs, st);
    }
  }

  function diffsToRows(diffs) {
    var rows = [], leftBuf = "", rightBuf = "", leftKind = "eq", rightKind = "eq";
    function flush() {
      var kindL = leftBuf ? leftKind : "empty";
      var kindR = rightBuf ? rightKind : "empty";
      if (leftBuf && rightBuf && leftKind === "del" && rightKind === "add") kindL = kindR = "mod";
      rows.push({ left: leftBuf, right: rightBuf, leftKind: kindL, rightKind: kindR });
      leftBuf = ""; rightBuf = ""; leftKind = "eq"; rightKind = "eq";
    }
    for (var i = 0; i < diffs.length; i++) {
      var op = diffs[i][0], parts = String(diffs[i][1]).split("\n");
      for (var p = 0; p < parts.length; p++) {
        if (op === 0) { leftBuf += parts[p]; rightBuf += parts[p]; }
        else if (op === -1) { leftBuf += parts[p]; leftKind = "del"; }
        else { rightBuf += parts[p]; rightKind = "add"; }
        if (p < parts.length - 1) flush();
      }
    }
    if (leftBuf || rightBuf) flush();
    return rows;
  }

  function pairChangeRows(rows) {
    var out = [], dels = [], adds = [];
    function flush() {
      var n = Math.max(dels.length, adds.length);
      for (var i = 0; i < n; i++) {
        var L = dels[i] ? dels[i].left : "";
        var R = adds[i] ? adds[i].right : "";
        out.push({ left: L, right: R, leftKind: L ? (R ? "mod" : "del") : "empty", rightKind: R ? (L ? "mod" : "add") : "empty" });
      }
      dels = []; adds = [];
    }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.leftKind === "eq" && r.rightKind === "eq") { flush(); out.push(r); }
      else if (r.leftKind === "mod" || (r.left && r.right && r.leftKind !== "eq")) { flush(); r.leftKind = "mod"; r.rightKind = "mod"; out.push(r); }
      else { if (r.left) dels.push(r); if (r.right) adds.push(r); }
    }
    flush();
    return out;
  }

  function renderPanes(rows, groupWords, parasOld, parasNew) {
    diffScroll.textContent = "";
    pairNodes = [];
    var frag = document.createDocumentFragment();
    var dmp = new diff_match_patch();
    var findOld = lookupPara(parasOld || []);
    var findNew = lookupPara(parasNew || []);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], marks = null;
      if (r.leftKind === "mod" && r.rightKind === "mod") {
        marks = dmp.diff_main(r.left || "", r.right || "");
        if (groupWords) dmp.diff_cleanupSemantic(marks);
      }
      var pair = document.createElement("div");
      pair.className = "pair";
      pair.appendChild(makeCell(r.left, r.leftKind, marks, -1, findOld(r.left)));
      pair.appendChild(makeCell(r.right, r.rightKind, marks, 1, findNew(r.right)));
      frag.appendChild(pair);
      pairNodes.push({ el: pair, changed: r.leftKind !== "eq" || r.rightKind !== "eq", kind: r.leftKind === "mod" || r.rightKind === "mod" ? "mod" : (r.rightKind === "add" ? "add" : (r.leftKind === "del" ? "del" : "eq")) });
    }
    diffScroll.appendChild(frag);
    diffScroll.scrollTop = 0;
    drawChangeBar();
  }

  function drawChangeBar() {
    changeBar.textContent = "";
    var total = pairNodes.length || 1;
    for (var i = 0; i < pairNodes.length; i++) {
      if (!pairNodes[i].changed) continue;
      var mark = document.createElement("button");
      mark.type = "button";
      mark.className = "mark " + pairNodes[i].kind;
      mark.style.top = ((i / total) * 100) + "%";
      mark.style.height = Math.max(3, (100 / total)) + "%";
      mark.title = "Jump to change";
      mark.setAttribute("data-i", String(i));
      changeBar.appendChild(mark);
    }
    changeBar.onclick = function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var idx = t.getAttribute("data-i");
      if (idx == null) return;
      var node = pairNodes[parseInt(idx, 10)];
      if (node && node.el) node.el.scrollIntoView({ block: "center" });
    };
  }

  function makeCell(text, kind, marks, side, para) {
    var row = document.createElement("div");
    row.className = "row " + kind;
    if (para && para.heading) row.className += " h" + para.heading;
    if (para && para.align && para.align !== "left") row.style.textAlign = para.align;
    if (para && para.padLeft) row.style.paddingLeft = para.padLeft + "px";
    if (para && para.spaceBefore) row.style.paddingTop = para.spaceBefore + "px";
    if (para && para.spaceAfter) row.style.paddingBottom = para.spaceAfter + "px";
    var tx = document.createElement("span");
    tx.className = "tx";
    if (para && para.listLabel) {
      var lab = document.createElement("span");
      lab.className = "list-mark";
      lab.textContent = para.listLabel + " ";
      tx.appendChild(lab);
    }
    var runs = para && para.runs && para.runs.length ? para.runs : [{ text: text || "", bold: false, italic: false, underline: false }];
    var paintMarks = marks;
    if (!paintMarks && kind === "del") paintMarks = [[-1, text || ""]];
    if (!paintMarks && kind === "add") paintMarks = [[1, text || ""]];
    if (!paintMarks) paintMarks = [[0, text || ""]];
    fillStyled(tx, paintMarks, side, runs);
    if (para && para.padFirst) tx.style.textIndent = para.padFirst + "px";
    row.appendChild(tx);
    return row;
  }

  function lookupPara(paras) {
    var used = {};
    return function (text) {
      if (!text) return null;
      for (var i = 0; i < paras.length; i++) {
        if (!used[i] && paras[i].text === text) { used[i] = true; return paras[i]; }
      }
      return null;
    };
  }

  function fillStyled(tx, marks, side, runs) {
    var runI = 0, runOff = 0, empty = true;
    function currentRun() { return runs[runI] || { text: "", bold: false, italic: false, underline: false }; }
    function advance(n) {
      while (n > 0 && runI < runs.length) {
        var left = currentRun().text.length - runOff;
        if (left <= 0) { runI++; runOff = 0; continue; }
        if (n < left) { runOff += n; n = 0; } else { n -= left; runI++; runOff = 0; }
      }
    }
    for (var i = 0; i < marks.length; i++) {
      var op = marks[i][0], data = marks[i][1];
      if (!data) continue;
      if (op !== 0 && op !== side) continue;
      var s = 0;
      while (s < data.length) {
        var st = currentRun();
        var room = runI >= runs.length ? (data.length - s) : Math.max(1, st.text.length - runOff);
        var take = Math.min(room, data.length - s);
        var chunk = data.slice(s, s + take);
        var el = op === 1 ? document.createElement("ins") : (op === -1 ? document.createElement("del") : document.createElement("span"));
        if (st.bold) el.style.fontWeight = "700";
        if (st.italic) el.style.fontStyle = "italic";
        if (st.underline) el.style.textDecoration = "underline";
        el.textContent = chunk;
        tx.appendChild(el);
        empty = false;
        advance(take);
        s += take;
      }
    }
    if (empty) tx.appendChild(document.createTextNode(" "));
  }

  function showCounts(diffs, rows) {
    var add = 0, del = 0, changedRows = 0;
    for (var i = 0; i < diffs.length; i++) {
      if (diffs[i][0] === 1) add += diffs[i][1].length;
      if (diffs[i][0] === -1) del += diffs[i][1].length;
    }
    for (var j = 0; j < rows.length; j++) {
      if (rows[j].leftKind !== "eq" || rows[j].rightKind !== "eq") changedRows++;
    }
    statsEl.textContent = "Changed lines: " + changedRows + " · Added chars: " + add + " · Removed chars: " + del;
    statsEl.hidden = !(countsOpt && countsOpt.value === "on");
  }
})();
