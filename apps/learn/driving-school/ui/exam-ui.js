(function () {
  const D = window.DS;
  // Use Road Safety's existing procedural Indian signs rather than duplicate artwork.
  D.showQuiz = function (dialog, best, saveBest) {
    const questions = D.signQuiz(window.RS.signs); let i = 0, score = 0, answered = false;
    const title = document.createElement('h2'), picture = document.createElement('div');
    const choices = document.createElement('div'), feedback = document.createElement('p');
    const next = document.createElement('button'); next.textContent = 'Next sign';
    const close = document.createElement('button'); close.textContent = 'Return to driving'; close.onclick = () => dialog.close();
    choices.className = 'quiz-choices'; feedback.setAttribute('aria-live','polite');
    function ask() {
      answered = false; const q = questions[i]; title.textContent = 'Road signs · ' + (i + 1) + '/20';
      picture.innerHTML = window.RS.svg(q.sign, 'quiz-sign'); feedback.textContent = 'What does this sign mean?';
      next.hidden = true;
      choices.replaceChildren(...q.choices.map(choice => {
        const b = document.createElement('button'); b.textContent = choice;
        b.onclick = () => {
          if (answered) return; answered = true;
          const ok = choice === q.answer; if (ok) score++;
          feedback.textContent = (ok ? 'Correct. ' : 'Answer: ' + q.answer + '. ') + q.sign.meaning;
          [...choices.children].forEach(c => { c.disabled = true; if (c.textContent === q.answer) c.classList.add('correct'); });
          b.classList.add(ok ? 'correct' : 'incorrect'); next.hidden = false; next.focus();
        }; return b;
      }));
    }
    next.onclick = () => {
      i++;
      if (i < questions.length) ask();
      else { best = Math.max(best, score); saveBest(best); title.textContent = 'Signs quiz · ' + score + '/20'; picture.replaceChildren(); choices.replaceChildren(); next.hidden = true; feedback.textContent = 'Best ' + best + '/20. Practise the signs again in Road Safety.'; close.focus(); }
    };
    dialog.replaceChildren(title, picture, choices, feedback, next, close); ask(); dialog.showModal();
  };
  D.showReport = function (dialog, report) {
    const h = document.createElement('h2'); h.textContent = (report.pass ? 'PASS' : 'NOT YET') + ' · practice test';
    const p = document.createElement('p'); p.textContent = report.minor + ' minor / ' + report.serious + ' serious faults · ' + report.elapsed + ' s · score ' + report.score + '/100. Practice threshold: complete route with no serious faults and at most 10 minor faults. Not a licence assessment.';
    const ul = document.createElement('ul');
    report.faults.forEach(f => { const li = document.createElement('li'); li.textContent = f.severity.toUpperCase() + ' · ' + f.time + ' s · ' + f.reason; ul.append(li); });
    if (!report.faults.length) { const li = document.createElement('li'); li.textContent = 'No faults recorded on this route.'; ul.append(li); }
    const b = document.createElement('button'); b.textContent = 'Return to practice'; b.onclick = () => dialog.close();
    dialog.replaceChildren(h,p,ul,b); dialog.showModal();
  };
})();
