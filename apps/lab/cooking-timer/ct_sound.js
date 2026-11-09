/* Cooking Timer — ct_sound.js: WebAudio beep; repeats while any finished timer is undismissed. CT1 */
(function (root) {
  var CT = root.CT = root.CT || {};
  var ctx = null;
  var alarmId = null;

  function getCtx() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function resume() {
    getCtx();
  }

  function beep() {
    try {
      var c = getCtx();
      if (!c) return;
      for (var i = 0; i < 3; i++) {
        var osc = c.createOscillator();
        var gain = c.createGain();
        var t0 = c.currentTime + i * 0.25;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t0);
        gain.gain.setValueAtTime(0.2, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(t0);
        osc.stop(t0 + 0.15);
      }
    } catch (e) { /* ignore audio errors */ }
  }

  function startAlarm() {
    if (alarmId) return;
    beep();
    alarmId = setInterval(beep, 1500);
  }

  function stopAlarm() {
    if (!alarmId) return;
    clearInterval(alarmId);
    alarmId = null;
  }

  function isAlarming() {
    return !!alarmId;
  }

  CT.sound = {
    resume: resume,
    beep: beep,
    startAlarm: startAlarm,
    stopAlarm: stopAlarm,
    isAlarming: isAlarming
  };
})(typeof window !== 'undefined' ? window : global);
