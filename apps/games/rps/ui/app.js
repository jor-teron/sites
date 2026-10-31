/* Rock Paper Scissors RPS1 — UI. */
(function () {
  'use strict';

  var score = { win: 0, lose: 0, draw: 0 };
  var last = null;

  function render() {
    var choices = RPS.CHOICES.map(function (c) {
      return '<button type="button" data-id="' + c.id + '" title="' + c.name + '">' + c.emoji + '</button>';
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
  }

  function bind() {
    document.querySelectorAll('.rps-choices button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        last = RPS.play(id);
        score[last.result]++;
        render();
      });
    });

    var reset = document.getElementById('rps-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        score = { win: 0, lose: 0, draw: 0 };
        last = null;
        render();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
