/* Agent — app/gui/imagemode.js: AG11 Chat | Image toggle next to the composer (merged from the Lab Image Gen app).
   HR.imode: the chip flips the composer between 💬 Chat and 🖼 Image (this tab only). In Image mode Send calls
   run(prompt, signal): the user bubble, then a progress note, then an assistant bubble with the picture (stored as a
   ≤1024 px JPEG in m.image) and a Download button (bubbles.js). Always Ollama at Settings' Ollama URL (Hub keys apply);
   model = setting `imageModel`, else picked from the installed list (z-image first, like Image Gen) and saved. */
HR.imode = (function () {
  var mode = 'chat', chip, input, PH = '';
  function set(m) {
    mode = m === 'image' ? 'image' : 'chat';
    chip.textContent = mode === 'image' ? '🖼 Image' : '💬 Chat'; chip.setAttribute('aria-pressed', mode === 'image' ? 'true' : 'false');
    chip.title = mode === 'image' ? 'Image mode: Send makes a picture. Tap for Chat.' : 'Chat mode. Tap for Image (make a picture).';
    input.placeholder = mode === 'image' ? 'Describe a picture to make…' : PH;
    if (HR.attach) HR.attach.show(mode === 'chat');
  }
  function help(e) {
    var pull = ' Run: ollama pull x/z-image-turbo (or x/flux2-klein).';
    if (e.kind === 'disabled') return ['🖼 Image generation is off in this Ollama', e.message + ' — Ollama 0.32.6 and later have image generation switched off for now. Use Ollama 0.32.5 on macOS with x/z-image-turbo.'];
    if (e.kind === 'nomodel') return ['🖼 Image model not found', e.message + '.' + pull];
    if (e.kind === 'noimage') return ['🖼 No image came back', e.message + pull];
    if (e.kind === 'unreachable') return ['🖼 Can\'t reach Ollama', e.message + '. Image mode needs Ollama (OLLAMA_ORIGINS must allow this page).'];
    return ['🖼 Image failed', e.message];
  }
  function model(b) {
    var m = (HR.set.get('imageModel') || '').trim(); if (m) return Promise.resolve(m);
    return HR.imagegen.models(b).then(function (l) { var p = HR.imagegen.pick(l); if (p) HR.set.put('imageModel', p); return p; });
  }
  function run(prompt, signal) {
    var b = HR.models.base('ollama'), u = HR.msgs.add({ role: 'user', content: prompt, imgMode: true }); HR.view.bubble(u); HR.logs.user('🖼 ' + prompt);
    var n = HR.view.note('🖼 Making a picture…'), t0 = Date.now();
    return model(b).then(function (m) {
      if (!m) { var e = new Error('This Ollama has no image-generation model.'); e.kind = 'nomodel'; throw e; }
      n.textContent = '🖼 Making a picture with ' + m + '…';
      return HR.imagegen.generate({ base: b, model: m, prompt: prompt, signal: signal, onProgress: function (c, t) { n.textContent = '🖼 ' + m + ' · step ' + c + ' / ' + t; } })
        .then(function (r) { return HR.attach.shrink('data:image/png;base64,' + r.b64).then(function (j) { return { j: j, m: m }; }); });
    }).then(function (x) {
      n.remove();
      var sec = (Date.now() - t0) / 1000, a = HR.msgs.add({ role: 'assistant', content: '🖼 Picture for: ' + prompt, image: x.j, model: x.m, stats: { sec: sec } });
      HR.view.bubble(a); HR.logs.assistant(a); HR.view.bottom(true);
      return { status: 'ok' };
    }, function (e) {
      n.remove();
      if (e.kind === 'abort') { HR.chat.note('■ Stopped.'); return { status: 'stop' }; }
      var h = help(e); HR.view.infoCard(h[0], h[1]); return { status: 'err' };
    });
  }
  function init() {
    chip = document.getElementById('btnMode'); input = document.getElementById('input'); PH = input.placeholder;
    chip.onclick = function () { set(mode === 'image' ? 'chat' : 'image'); input.focus(); };
    set('chat');
  }
  return { init: init, get: function () { return mode; }, set: set, run: run };
})();
