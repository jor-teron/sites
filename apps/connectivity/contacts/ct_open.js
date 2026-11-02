/* CT1 open — call / message / video a number in Telephone or Messages.
   Telephone: #dial=<num>[&video=1] (CT1 deep link). Messages: #chat=<num>.
   Inside the Hub: window.top.__hubOpenApp(entry, {hash}); else the same tab. online(num): Hub Line presence, or null. */
(function () {
  'use strict';
  function top() { try { return window.top; } catch (_) { return null; } }
  function open(entry, file, hash) {
    var t = top();
    try { if (t && t !== window && t.__hubOpenApp && t.__hubOpenApp('apps/connectivity/' + entry + '/', { hash: hash }) !== false) return; } catch (_) { /* cross-origin */ }
    location.href = '../' + entry + '/' + file + '#' + hash;
  }
  window.CTOpen = {
    call: function (num) { open('telephone', 'telephone.html', 'dial=' + num); },
    video: function (num) { open('telephone', 'telephone.html', 'dial=' + num + '&video=1'); },
    message: function (num) { open('messages', 'messages.html', 'chat=' + num); },
    online: function (num) {
      var t = top();
      try { var h = t && t.HubLine; if (h && typeof h.online === 'function') return !!h.online(num); } catch (_) { /* */ }
      return null;
    }
  };
})();
