/* Rock Paper Scissors RPSQ1a — UI. */
(function () {
  'use strict';

  var score = { win: 0, lose: 0, draw: 0 };
  var last = null;

  function render(focusSel) {
    var choices = RPS.CHOICES.map(function (c) {
      return '<button type="button" data-id="' + c.id + '" title="' + c.name + '" aria-label="' + c.name + '">' + c.emoji + '</button>';
    }).join('');

    var resultHtml = '';
    if (last) {
      var p = RPS.CHOICES.find(function (c) { return c.id === last.player; });
      var c = RPS.CHOICES.find(function (c) { return c.id === last.cpu; });
      var msg = last.result === 'win' ? 'You win!' : last.result === 'lose' ? 'Computer wins' : 'Draw';
      resultHtml =
        '<div class="rps-result ' + last.result + '">' +
          '<div class="hands">' + p.emoji + ' vs ' + c.emoji + '</div>' +
          '<div class="msg">' + msg + '</div>' +
        '</div>';
    } else {
      resultHtml = '<div class="rps-result"><div class="msg" style="color:var(--muted)">Choose one</div></div>';
    }

    document.getElementById('app').innerHTML =
      '<div class="rps-wrap">' +
        '<h1 class="rps-title">✊✋✌️ Rock Paper Scissors</h1>' +
        '<div class="rps-score">' +
          '<div>You<br><b>' + score.win + '</b></div>' +
          '<div>Draw<br><b>' + score.draw + '</b></div>' +
          '<div>CPU<br><b>' + score.lose + '</b></div>' +
        '</div>' +
        '<div class="rps-choices">' + choices + '</div>' +
        resultHtml +
        '<button type="button" class="rps-reset" id="rps-reset">Reset score</button>' +
      '</div>';

    bind();
    var f = typeof focusSel === 'string' && document.querySelector(focusSel);   // RPSQ1a: re-render replaced the buttons; keep keyboard focus where it was
    if (f) f.focus();
  }

  function say(t) { var el = document.getElementById('rps-live'); if (el) el.textContent = t; }   // RPSQ1a: persistent live region (the result box is rebuilt each round)

  function bind() {
    document.querySelectorAll('.rps-choices button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        last = RPS.play(id);
        score[last.result]++;
        render(document.activeElement === btn ? '.rps-choices [data-id="' + id + '"]' : null);
        say('Computer chose ' + RPS.CHOICES.find(function (c) { return c.id === last.cpu; }).name + '. ' + (last.result === 'win' ? 'You win!' : last.result === 'lose' ? 'Computer wins.' : 'Draw.') + ' You ' + score.win + ', draw ' + score.draw + ', CPU ' + score.lose + '.');
      });
    });

    var reset = document.getElementById('rps-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        score = { win: 0, lose: 0, draw: 0 };
        last = null;
        render(document.activeElement === reset ? '#rps-reset' : null);
        say('Score reset.');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
