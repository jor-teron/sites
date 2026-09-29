/*=============================================================================
  romanizer.test.js — Node check for the local romanizer (not loaded by
  the page). Run: node tools/transcribe/tests/romanizer.test.js
  Prints input → output for every case; exits 1 if a pinned case fails.
=============================================================================*/

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = path.join(__dirname, "..");
const FILES = ["hindi.js", "assamese.js", "bengali.js", "romanizer.js"];

/*----------------------------------------------------------------------------
  loadRomanizer
  Run the page scripts in one context, like the browser does.
----------------------------------------------------------------------------*/
function loadRomanizer(style) {
  const ctx = vm.createContext({ CONFIG: { ROMANIZER_STYLE: style, ENABLE_ROMANIZER: true } });
  FILES.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(DIR, f), "utf8"), ctx, { filename: f });
  });
  return function (text, lang) {
    ctx.__t = text;
    ctx.__l = lang;
    return vm.runInContext("romanize(__t, __l)", ctx);
  };
}

/* [lang, input, expected or null (print only)] — inputs are NFC-normalized */
const CASES = {
  hi: [
    ["कमल", "kamal"], ["ज्ञान", "gyaan"], ["ज़रूर", "zaroor"], ["हिंदी", "hindi"],
    ["नमस्ते", "namaste"], ["मैं घर जा रहा हूँ", "main ghar jaa rahaa hoon"],
    ["समझना", "samajhnaa"], ["करना", "karnaa"], ["लड़का", "ladkaa"],
    ["सरकार", "sarkaar"], ["अपना", "apnaa"], ["बहुत", "bahut"], ["क्या", "kyaa"],
    ["नहीं", "nahin"], ["हाँ", "haan"], ["माँ", "maan"], ["संभव", "sambhav"],
    ["धर्म", "dharm"], ["मित्र", "mitra"], ["धन्यवाद", "dhanyavaad"],
    ["पानी", "paani"], ["जीवन", "jeevan"], ["इसलिए", "isliye"], ["गए", "gaye"],
    ["फ़िल्म", "film"], ["क़लम", "qalam"], ["ख़ुश", "khush"], ["सड़क", "sadak"],
    ["पढ़ना", "padhnaa"], ["भारत", "bhaarat"], ["स्वतंत्रता", "svatantrataa"],
    ["कृष्ण", "krishna"], ["अच्छा", "acchaa"], ["आप कैसे हैं?", "aap kaise hain?"],
    ["यह मेरा दोस्त है।", "yah meraa dost hai."], ["ॐ", "om"], ["२०२६", "2026"],
    ["मदद", "madad"], ["क्षमा", "kshamaa"], ["दुःख", "duhkh"], ["में", "mein"],
    ["समय", "samay"], ["कमरे", "kamre"]
  ],
  ne: [
    ["नमस्ते", "namaste"], ["तपाईंलाई कस्तो छ?", "tapaainlaai kasto chha?"],
    ["म ठीक छु", "ma thik chhu"], ["मेरो नाम", "mero naam"], ["राम्रो", "raamro"],
    ["हुन्छ", "hunchha"], ["गर्छ", "garchha"], ["भयो", "bhayo"], ["नेपाल", "nepaal"],
    ["धन्यवाद", "dhanyavaad"], ["के गर्दै हुनुहुन्छ", "ke gardai hunuhunchha"],
    ["आउनुहोस्", "aaunuhos"], ["खाना खानुभयो?", "khaanaa khaanubhayo?"],
    ["पानी", "paani"], ["जान्छु", "jaanchhu"], ["छन्", "chhan"],
    ["बिहान", "bihaan"], ["दिदी", "didi"], ["हामी", "haami"], ["भात", "bhaat"],
    ["काठमाडौं", null], ["ज़रूर", null], ["कृपया", null], ["सँग", "sang"],
    ["पनि", "pani"], ["थियो", "thiyo"], ["किन", "kin"], ["कहाँ", "kahaan"],
    ["अहिले", "ahile"], ["साथी", "saathi"], ["घर", "ghar"], ["गाउँ", "gaaun"],
    ["ज्ञान", "gyaan"], ["मलाई", "malaai"], ["त्यो", "tyo"], ["यो", "yo"],
    ["हजुर", "hajur"], ["सकिन्छ", "sakinchha"], ["आमा", "aamaa"], ["बुबा", "bubaa"]
  ],
  as: [
    ["মই যাম", "moi zam"], ["যায়", "zay"], ["পড়া", "pora"], ["উৎসৱ", "utxow"],
    ["অসম", "oxom"], ["অসমীয়া", "oxomiya"], ["মোৰ নাম", "mor nam"],
    ["আপুনি কেনে আছে?", "apuni kene ase?"], ["ভাল", "bhal"], ["চাহ", "sah"],
    ["কি কৰিছা", "ki korisa"], ["মানুহ", "manuh"], ["মানুহজন", "manuhzon"],
    ["বিহু", "bihu"], ["গুৱাহাটী", "guwahati"], ["ব্ৰহ্মপুত্ৰ", "brohmoputro"],
    ["জ্ঞান", "gyan"], ["সময়", "xomoy"], ["যোৱা", "zowa"], ["শিক্ষা", "xikhya"],
    ["ধন্যবাদ", "dhonyobad"], ["আমি", "ami"], ["তুমি", "tumi"], ["ঘৰ", "ghor"],
    ["নাই", "nai"], ["কাম", "kam"], ["লাগিব", "lagib"], ["স্বাধীন", "xadhin"],
    ["জল", "zol"], ["পানী", "pani"], ["দেউতা", "deuta"], ["আই", "ai"],
    ["ক'ত", null], ["১২৩", "123"], ["এইটো কি?", "eito ki?"], ["বাটত", "batot"],
    ["চিন্তা", "sinta"], ["ভাষা", "bhaxa"], ["কথা", "kotha"], ["সকলো", "xokolo"]
  ],
  bn: [
    ["আমি", "ami"], ["চা", "cha"], ["পড়া", "pora"], ["আমার নাম", "amar nam"],
    ["তোমার", "tomar"], ["ভালো", "bhalo"], ["বাংলা", "bangla"],
    ["কেমন আছো?", "kemon achho?"], ["বাংলাদেশ", "bangladesh"],
    ["কলকাতা", "kolkata"], ["রবীন্দ্রনাথ", "robindronath"], ["স্কুল", "skul"],
    ["রাস্তা", "rasta"], ["জল", "jol"], ["বই", "boi"], ["যাবো", "jabo"],
    ["শুভ", "shubho"], ["ক্ষমা", "khoma"], ["উৎসব", "utshob"], ["বিশ্ব", "bisho"],
    ["স্বাধীন", "shadhin"], ["চাঁদ", "chand"], ["ছেলে", "chhele"], ["মেয়ে", "meye"],
    ["কমল", "komol"], ["করছি", "korchhi"], ["বলছে", "bolchhe"], ["ছিল", "chhilo"],
    ["দেহ", "deho"], ["শব্দ", "shobdo"], ["সত্য", "shotyo"], ["মানুষ", "manush"],
    ["ধন্যবাদ", "dhonyobad"], ["কী করছ?", "ki korchho?"], ["আজ", "aj"],
    ["কাল", "kal"], ["বাড়ি", "bari"], ["জানি না", "jani na"], ["১৯৭১", "1971"],
    ["সময়", "shomoy"], ["অনেক", "onek"]
  ]
};

/* Auto-detect / script-order checks: [dropdown, input, expected] */
const AUTO = [
  ["auto", "মোৰ ঘৰ", "mor ghor"],
  ["auto", "মই ভাত খাম", "moi bhat kham"],
  ["auto", "আমি চা খাব", "ami cha khab"],
  ["auto", "म ठीक छु", "ma thik chhu"],
  ["auto", "मैं ठीक हूँ", "main theek hoon"],
  ["as", "আমি চা খাম", "ami sa kham"],
  ["bn", "আমি চা খাব", "ami cha khab"],
  ["hi", "Hello दोस्त, ok?", "Hello dost, ok?"]
];

/* IAST style: [input, expected] */
const IAST = [
  ["कमल", "kamala"], ["ज्ञान", "jñāna"], ["कृष्ण", "kṛṣṇa"], ["संस्कृतम्", "saṃskṛtam"],
  ["शिव", "śiva"], ["छात्र", "chātra"], ["चाय", "cāya"], ["दुःख", "duḥkha"],
  ["ठंडा", "ṭhaṃḍā"], ["ॐ", "oṃ"]
];

let fails = 0;
let pinned = 0;

/*----------------------------------------------------------------------------
  check
  Print one line and count a failure when expected is set and differs.
----------------------------------------------------------------------------*/
function check(label, input, got, want) {
  const ok = want == null || got === want;
  if (want != null) pinned += 1;
  if (!ok) fails += 1;
  console.log((ok ? "  " : "✗ ") + label.padEnd(5) + input + " → " + got +
    (ok ? "" : "   (want " + want + ")"));
}

const simple = loadRomanizer("simple");
Object.keys(CASES).forEach(function (lang) {
  console.log("\n== " + lang + " ==");
  CASES[lang].forEach(function (c) {
    const input = c[0].normalize("NFC");
    check(lang, input, simple(input, lang), c[1]);
  });
});

console.log("\n== auto / dropdown ==");
AUTO.forEach(function (c) { check(c[0], c[1], simple(c[1].normalize("NFC"), c[0]), c[2]); });

/* Precomposed nukta input (not NFC) must romanize the same */
console.log("\n== precomposed input ==");
check("hi", "\u095B\u0930\u0942\u0930", simple("\u095B\u0930\u0942\u0930", "hi"), "zaroor");
check("as", "\u09AF\u09BE\u09DF", simple("\u09AF\u09BE\u09DF", "as"), "zay");

const iast = loadRomanizer("iast");
console.log("\n== iast ==");
IAST.forEach(function (c) { check("iast", c[0], iast(c[0].normalize("NFC"), "hi"), c[1]); });

/* No stray combining marks or Indic letters in any output */
console.log("\n== cleanup ==");
let dirty = 0;
Object.keys(CASES).forEach(function (lang) {
  CASES[lang].forEach(function (c) {
    const out = simple(c[0].normalize("NFC"), lang);
    if (/[\u0300-\u036F\u0900-\u09FF\u200C\u200D]|  /.test(out)) { dirty += 1; console.log("✗ dirty: " + out); }
  });
});
if (dirty) fails += dirty; else console.log("  clean");

console.log("\n" + (pinned - fails) + "/" + pinned + " pinned cases pass");
process.exit(fails ? 1 : 0);
