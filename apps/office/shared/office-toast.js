/*
 * apps/office/shared/office-toast.js
 * SH1 shared toast: one short message at the bottom of the screen.
 * OfficeToast.show(msg, ms). Uses an existing #toast / .of-toast node or creates one.
 * Style: office-toast.css. No dependencies.
 */
var OfficeToast = (function () {
  var timer = null;
  function node() {
    var t = document.querySelector('.of-toast') || document.getElementById('toast');
    if (!t && document.body) {
      t = document.createElement('div');
      t.className = 'of-toast'; t.id = 'toast'; t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    if (t) t.classList.add('of-toast');
    return t;
  }
  function show(msg, ms) {
    var t = node();
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () { t.classList.remove('show'); }, ms || 2200);
  }
  return { show: show };
})();
