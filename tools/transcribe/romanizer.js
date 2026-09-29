/*=============================================================================
  romanizer.js — local Indic → Latin (not translation)
  Needs hindi.js + assamese.js loaded first. Uses CONFIG.ROMANIZER_STYLE.
=============================================================================*/

/* IAST overlays when ROMANIZER_STYLE === "iast" */
const IAST_SWAP = {
  aa: "ā", ii: "ī", uu: "ū",
  kh: "kh", gh: "gh", ch: "c", chh: "ch",
  sh: "ś", ng: "ṅ", ny: "ñ"
};

/*----------------------------------------------------------------------------
  isDevanagari
  True if the character sits in the Devanagari block.
----------------------------------------------------------------------------*/
function isDevanagari(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x0900 && c <= 0x097F;
}

/*----------------------------------------------------------------------------
  isBengaliAssamese
  True if the character sits in the Bengali / Assamese block.
----------------------------------------------------------------------------*/
function isBengaliAssamese(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x0980 && c <= 0x09FF;
}

/*----------------------------------------------------------------------------
  applyStyle
  Optional IAST polish on a simple syllable token.
----------------------------------------------------------------------------*/
function applyStyle(token) {
  if (typeof CONFIG === "undefined" || CONFIG.ROMANIZER_STYLE !== "iast") return token;
  return IAST_SWAP[token] || token;
}

/*----------------------------------------------------------------------------
  romanizeScript
  Walk one Indic script using the given maps.
----------------------------------------------------------------------------*/
function romanizeScript(text, maps) {
  const vowels = maps.vowels;
  const cons = maps.cons;
  const matra = maps.matra;
  const virama = maps.virama;
  const nukta = maps.nukta;
  const signs = maps.signs;
  /* Inherent vowel after a bare consonant */
  const inherent = maps.inherent;

  let out = "";
  let i = 0;
  const chars = Array.from(text);

  while (i < chars.length) {
    const ch = chars[i];

    if (vowels[ch]) {
      out += applyStyle(vowels[ch]);
      i += 1;
      continue;
    }

    if (cons[ch]) {
      const base = cons[ch];
      i += 1;
      if (chars[i] === nukta) i += 1;

      const mark = chars[i] || "";
      if (mark === virama) {
        out += base;
        i += 1;
        continue;
      }
      if (matra[mark]) {
        out += base + applyStyle(matra[mark]);
        i += 1;
        continue;
      }
      out += base + inherent;
      continue;
    }

    if (matra[ch]) {
      out += applyStyle(matra[ch]);
      i += 1;
      continue;
    }
    if (ch === virama || ch === nukta) {
      i += 1;
      continue;
    }
    if (signs[ch]) {
      out += signs[ch];
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

/*----------------------------------------------------------------------------
  romanize
  Transliterate Hindi (Devanagari) and Assamese/Bengali letters to Latin.
----------------------------------------------------------------------------*/
function romanize(text) {
  if (!text) return "";
  const chars = Array.from(text);
  let out = "";
  let buf = "";
  let mode = ""; /* "" | "dev" | "as" */

  function flush() {
    if (!buf) return;
    if (mode === "dev") {
      out += romanizeScript(buf, {
        vowels: DEV_VOWELS, cons: DEV_CONS, matra: DEV_MATRA,
        virama: DEV_VIRAMA, nukta: DEV_NUKTA, signs: DEV_SIGN,
        inherent: "a"
      });
    } else if (mode === "as") {
      out += romanizeScript(buf, {
        vowels: AS_VOWELS, cons: AS_CONS, matra: AS_MATRA,
        virama: AS_VIRAMA, nukta: AS_NUKTA, signs: AS_SIGN,
        inherent: "o"
      });
    } else {
      out += buf;
    }
    buf = "";
    mode = "";
  }

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const nextMode = isDevanagari(ch) ? "dev" : isBengaliAssamese(ch) ? "as" : "";
    if (nextMode !== mode) flush();
    if (!nextMode) {
      out += ch;
    } else {
      mode = nextMode;
      buf += ch;
    }
  }
  flush();
  return out.replace(/ +/g, " ").trim();
}

/*----------------------------------------------------------------------------
  paintRoman
  Fill or hide the romanized line on a block.
----------------------------------------------------------------------------*/
function paintRoman(blockEl, sourceText) {
  if (!blockEl) return;
  let rom = blockEl.querySelector(".rom");
  if (!CONFIG.ENABLE_ROMANIZER) {
    if (rom) rom.textContent = "";
    return;
  }
  if (!rom) {
    rom = document.createElement("div");
    rom.className = "line rom";
    blockEl.appendChild(rom);
  }
  const r = romanize(sourceText || "");
  rom.textContent = r ? ("(Roman) " + r) : "";
}
