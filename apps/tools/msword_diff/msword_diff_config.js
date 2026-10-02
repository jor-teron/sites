/*
 * MS Word Diff — configuration.
 * Settings, limits, file types, storage keys, docx layout constants and all
 * text the code puts on screen live here. msword_diff_logic.js reads
 * everything from MSWORD_DIFF_CONFIG. Static labels (title, buttons, option
 * names) are in msword_diff.html; colours and layout are in msword_diff.css.
 */
const MSWORD_DIFF_CONFIG = {
  // Starting values of the header options (applied before saved choices are restored)
  defaults: {
    wordMode: "on",   // Group words: "on" = semantic cleanup of the diff, "off" = raw character diff
    minimap: "off",   // Minimap (change bar beside the diff): "on" / "off"
    counts: "off",    // Counts line under the header: "on" / "off"
  },

  // Diff font size picker (points)
  font: {
    min: 10,             // smallest option
    max: 24,             // largest option
    step: 2,             // gap between options (saved values off this grid fall back to default)
    default: 12,         // used when nothing (or something invalid) is saved
    cssVar: "--diff-pt", // CSS custom property on #diffScroll that msword_diff.css reads
  },

  // Saved state
  storage: {
    idbName: "msword_diff",           // IndexedDB database holding the last Left/Right files
    idbStore: "files",                // object store inside it (keys "old" and "new")
    idbVersion: 1,                    // IndexedDB schema version
    fontKey: "msword_diff_pt",        // localStorage: font size
    minimapKey: "msword_diff_map",    // localStorage: minimap on/off
    countsKey: "msword_diff_counts",  // localStorage: counts on/off
  },

  // Accepted files
  files: {
    // accept="" list for the hidden file pickers (#fileOld / #fileNew)
    accept: ".docx,.txt,.text,.md,.markdown,.rst,.org,.adoc,.asciidoc,.csv,.tsv,.ssv,.psv,.log,.out,.err,.json,.jsonl,.ndjson,.xml,.html,.htm,.xhtml,.svg,.js,.mjs,.cjs,.ts,.tsx,.jsx,.css,.scss,.sass,.less,.ini,.conf,.cfg,.config,.env,.properties,.toml,.yaml,.yml,.sh,.bash,.zsh,.fish,.csh,.ksh,.bat,.cmd,.ps1,.psm1,.py,.pyw,.rb,.pl,.pm,.php,.lua,.r,.sql,.go,.rs,.c,.h,.cpp,.cc,.cxx,.hpp,.hh,.cs,.java,.kt,.kts,.swift,.m,.mm,.scala,.groovy,.dart,.vue,.svelte,.makefile,.mk,.cmake,.gradle,.sbt,.diff,.patch,.gitignore,.gitattributes,.gitmodules,.editorconfig,.dockerfile,.containerfile,.service,.timer,.socket,.desktop,.tex,.bib,.sty,.srt,.vtt,.ass,.vcf,.ics,.m3u,.m3u8,text/plain,text/csv,application/json,application/xml,application/x-sh,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docxPattern: /\.docx$/i,          // file name that is parsed as a Word document
    // File name extensions treated as plaintext
    textExtPattern: /\.(txt|text|md|markdown|rst|org|adoc|asciidoc|csv|tsv|ssv|psv|log|out|err|json|jsonl|ndjson|xml|html|htm|xhtml|svg|js|mjs|cjs|ts|tsx|jsx|css|scss|sass|less|ini|conf|cfg|config|env|properties|toml|yaml|yml|sh|bash|zsh|fish|csh|ksh|bat|cmd|ps1|psm1|py|pyw|rb|pl|pm|php|lua|r|sql|go|rs|c|h|cpp|cc|cxx|hpp|hh|cs|java|kt|kts|swift|m|mm|scala|groovy|dart|vue|svelte|mk|cmake|gradle|diff|patch|tex|bib|sty|srt|vtt|ass|vcf|ics|m3u|m3u8|service|timer|socket|desktop)$/i,
    // Extension-less file names treated as plaintext (also matched with a leading dot)
    textNamePattern: /^(makefile|gnumakefile|dockerfile|containerfile|readme|license|licence|changelog|authors|copying|gitignore|gitattributes|gitmodules|editorconfig|procfile|vagrantfile)$/i,
    textMimePrefix: "text/",          // any MIME type starting with this is plaintext
    textMimePattern: /^application\/(json|xml|javascript|x-sh|x-csh|x-shellscript|sql)$/i, // extra plaintext MIME types
    docxMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // type used when a saved file has none
    fallbackName: "document.docx",    // name used when a saved file has none
  },

  // Diff engine
  diff: {
    timeoutSec: 8,       // diff_match_patch Diff_Timeout (seconds) for the whole-document diff
    cacheFallbackMax: 8, // parsed-document cache size when WeakMap is unavailable
  },

  // Word (.docx) parsing / layout
  docx: {
    documentPath: "word/document.xml",   // main body inside the zip
    stylesPath: "word/styles.xml",       // style definitions (headings, bold/italic/underline)
    numberingPath: "word/numbering.xml", // list definitions (bullet vs numbered)
    headingPattern: /heading\s*([1-3])/, // style name -> heading level 1..3
    twipsPerPoint: 20,                   // Word measures indents/spacing in twips
    pxPerInch: 96,                       // CSS pixels per inch
    ptPerInch: 72,                       // points per inch
    listIndentPx: 24,                    // extra left padding per list level
    listLevels: 9,                       // Word list levels (deeper counters reset when a level restarts)
    maxSpacingPx: 36,                    // cap on paragraph space before/after
    tableRowSpacingPx: 4,                // space before/after each table row line
    tableCellSeparator: " | ",           // table cells are joined into one line with this
    bulletLabel: "•",                    // label shown for bullet list items
    numberSuffix: ".",                   // numbered list label = count + this
  },

  // Inline styles applied to diff text runs that were bold/italic/underlined in Word
  runStyle: {
    boldWeight: "700",
    italicStyle: "italic",
    underlineDecoration: "underline",
  },

  // Minimap (change bar)
  minimap: {
    minMarkPct: 3,  // minimum mark height (% of bar)
  },

  // Text the code puts on screen
  text: {
    hint: "Drop one or two files (.docx or plaintext) on the left or right pane.", // empty diff area
    dropFile: "Drop a file",                           // pane head with no file
    headTitle: "Click to choose or drop here",         // pane head tooltip with no file
    jumpTitle: "Jump to change",                       // minimap mark tooltip
    readingFile: "Reading file...",                    // single-file preview
    readingFiles: "Reading files…",                    // compare step 1
    comparing: "Comparing…",                           // compare step 2
    errorPrefix: "Error: ",                            // before any error message
    badFileType: "Use .docx or a text/script file (.txt, .sh, .csv, .py, …).",
    noUsableDrop: "Drop a .docx or plaintext file.",
    needBoth: "Choose both Left and Right files.",
    jszipMissingPreview: "JSZip not loaded.",
    jszipMissing: "JSZip not loaded. Put lib/jszip.min.js in lib/.",
    dmpMissing: "diff_match_patch not loaded. Put lib/diff_match_patch.js in lib/.",
    notDocx: " is not a .docx file (old .doc is not supported).", // after file name
    noDocumentXml: " has no word/document.xml. Is it a valid Word file?", // after file name
    badXml: "Could not parse Word XML.",
    statsChanged: "Changed lines: ",  // counts line pieces:
    statsAdded: " · Added chars: ",   //   Changed lines: N · Added chars: N · Removed chars: N
    statsRemoved: " · Removed chars: ",
  },
};
