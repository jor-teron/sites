/* Agent — app/core/length.js: answer length preference (AG31). HR.length.
   Setting agent.settings.answerLength: 'normal' (default, adds nothing, same request as before AG31) | 'short' | 'detailed'.
   text() is a plain-language line HR.prompt.system puts before the memory block (AG35; AG31 appended it in chat.js), so it reaches every model call of a message,
   tool follow-ups included (the loop asks system() each step). It only asks; it never cuts output or sets max tokens,
   and it tells the model to keep code, file contents and tool arguments complete. */
HR.length = (function () {
  var OPTS = [['short', 'Short'], ['normal', 'Normal'], ['detailed', 'Detailed']];
  var KEEP = ' Always keep code, file contents, commands and tool arguments complete; length applies to your explanation only.';
  var TEXT = {
    short: 'Answer length: Short. Reply briefly, usually a few sentences or a short list, and skip background unless asked.' + KEEP,
    detailed: 'Answer length: Detailed. Give a thorough answer with steps, reasons and examples where they help.' + KEEP
  };
  function get() { var v = HR.set.get('answerLength'); return TEXT[v] || v === 'normal' ? v : 'normal'; }
  function text() { return TEXT[get()] || ''; }
  function addTo(sys) { var t = text(); if (!t) return sys; return sys ? sys + '\n\n' + t : t; }
  return { OPTS: OPTS, get: get, text: text, addTo: addTo };
})();
