/* PARKED (NL2): not loaded by notely.html; kept so it may be reused. NL1 text size A− / A+ (#btn-smaller / #btn-bigger),
   12–32 px in steps of 2, remembered in 'notely-font'. To reuse: put back config fontSize {min:12,max:32,step:2,default:17},
   keys.font, the two buttons, and call NL.fontsize.init(textarea) after NL.editor.init(). */
NL.fontsize = (function () {
  const C = NL.config, S = NL.store, F = { min: 12, max: 32, step: 2, default: 17 };
  let ta, size = F.default;
  function setSize(px) {
    size = Math.max(F.min, Math.min(F.max, px));
    ta.style.fontSize = size + 'px';
    S.set('notely-font', String(size));
    document.getElementById('btn-smaller').disabled = size <= F.min;
    document.getElementById('btn-bigger').disabled = size >= F.max;
  }
  return {
    init(el) { ta = el; const f = parseInt(S.get('notely-font'), 10); setSize(isFinite(f) ? f : F.default);
      document.getElementById('btn-smaller').addEventListener('click', () => setSize(size - F.step));
      document.getElementById('btn-bigger').addEventListener('click', () => setSize(size + F.step)); },
    bigger() { setSize(size + F.step); }, smaller() { setSize(size - F.step); },
  };
})();
