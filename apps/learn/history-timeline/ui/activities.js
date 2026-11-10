(function () {
  'use strict';
  const H = window.HT, $ = id => document.getElementById(id), el = H.el, dialog = $('quiz-card');
  const button = (label, fn) => { const b = el('button', label); b.onclick = fn; return b; };
  const safeScore = key => { const n = H.read(key, 0); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0; };
  function score(kind, n) { H.write('last-' + kind, n); H.write('best-' + kind, Math.max(n, safeScore('best-' + kind))); }
  function closeQuiz() { dialog.close(); }
  function menu() {
    dialog.replaceChildren(el('h2', 'History quiz'), el('p', 'Practice chronology with exact-date records. Ancient approximate dates are excluded.'));
    const order = button('Put events in order', ordering), centuryStart = button('Guess the century', () => century(0, 0));
    order.id = 'order-start'; centuryStart.id = 'century-start';
    dialog.append(order, el('p', 'Last: ' + safeScore('last-order') + '/100 · Best: ' + safeScore('best-order') + '/100'),
      centuryStart, el('p', 'Last: ' + safeScore('last-century') + '/100 · Best: ' + safeScore('best-century') + '/100'), button('Back to timeline', closeQuiz));
  }
  function ordering() {
    const question = H.orderQuestion(H.events), ids = question.items.map(e => e.id);
    dialog.replaceChildren(el('h2', 'Earliest → latest'), el('p', 'Drag the handle, or use ↑ / ↓ to move five events. Dates appear after checking.'));
    const list = el('ol', null, 'quiz-order'); list.id = 'quiz-order';
    let dragId = '', graded = false;
    function move(id, to) {
      const from = ids.indexOf(id); to = Math.max(0, Math.min(ids.length - 1, to)); if (from < 0 || from === to || graded) return;
      ids.splice(from, 1); ids.splice(to, 0, id);
      const nodes = [...list.children], node = nodes.find(n => n.dataset.quizId === id);
      const target = nodes[to]; list.insertBefore(node, from < to ? target.nextSibling : target);
      [...list.children].forEach((li,i) => {
        li.querySelector('[data-dir="-1"]').disabled = i === 0; li.querySelector('[data-dir="1"]').disabled = i === ids.length - 1;
        li.querySelector('.drag-handle').setAttribute('aria-label', 'Drag event ' + (i + 1) + ': ' + li.querySelector('strong').textContent);
      });
    }
    question.items.forEach((e,i) => {
      const row = el('li'); row.dataset.quizId = e.id; row.draggable = true;
      const handle = button('⠿', () => {}); handle.className = 'drag-handle'; handle.setAttribute('aria-label', 'Drag event ' + (i+1) + ': ' + e.title);
      row.append(handle, el('strong', e.title));
      [-1,1].forEach(d => { const b = button(d < 0 ? '↑' : '↓', () => { move(e.id, ids.indexOf(e.id) + d); b.focus(); }); b.dataset.dir = d; b.setAttribute('aria-label', (d<0?'Move earlier: ':'Move later: ') + e.title); b.disabled = d < 0 ? i === 0 : i === ids.length - 1; row.append(b); });
      row.ondragstart = event => { if (graded) return event.preventDefault(); dragId = e.id; event.dataTransfer.setData('text/plain', e.id); event.dataTransfer.effectAllowed = 'move'; };
      row.ondragover = event => { event.preventDefault(); if (dragId) move(dragId, ids.indexOf(e.id)); };
      row.ondrop = event => { event.preventDefault(); dragId = ''; }; row.ondragend = () => { dragId = ''; };
      list.append(row);
    });
    list.onpointerdown = e => {
      if (!e.target.closest('.drag-handle') || graded) return; e.preventDefault(); dragId = e.target.closest('li').dataset.quizId; list.setPointerCapture(e.pointerId);
    };
    list.onpointermove = e => { if (!dragId || !list.hasPointerCapture(e.pointerId)) return; const row = document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-quiz-id]'); if (row && list.contains(row)) move(dragId, ids.indexOf(row.dataset.quizId)); };
    list.onpointerup = list.onpointercancel = e => { if (list.hasPointerCapture(e.pointerId)) list.releasePointerCapture(e.pointerId); dragId = ''; };
    const feedback = el('div'); feedback.id = 'quiz-feedback'; feedback.setAttribute('aria-live','polite');
    const check = button('Check order', () => {
      if (graded) return; graded = true; const n = H.gradeOrder(ids, question.answer); score('order', n); check.disabled = true;
      feedback.replaceChildren(el('h3', n + '/100 · Best ' + safeScore('best-order') + '/100'), el('p', n === 100 ? 'Correct chronological order!' : 'Score is based on correct positions. The correct order is:'));
      const answer = el('ol'); question.answer.forEach(id => { const e = H.events.find(e => e.id === id); answer.append(el('li', H.dates(e) + ' — ' + e.title)); }); feedback.append(answer);
      list.querySelectorAll('button').forEach(b => b.disabled = true);
    });
    check.id = 'check-order'; dialog.append(list, check, feedback, button('New ordering puzzle', ordering), button('Quiz menu', menu), button('Back to timeline', closeQuiz));
  }
  function century(round, points) {
    if (round >= 5) {
      score('century', points); dialog.replaceChildren(el('h2', 'Century quiz complete'), el('p', 'Score ' + points + '/100 · Best ' + safeScore('best-century') + '/100'), button('Play again', () => century(0,0)), button('Quiz menu', menu), button('Back to timeline', closeQuiz)); return;
    }
    const question = H.centuryQuestion(H.events);
    dialog.replaceChildren(el('h2', 'Which century? · ' + (round+1) + '/5'), el('p', 'Score ' + points + '/100'), el('h3', question.event.title));
    const options = el('div', null, 'centuries'), feedback = el('p'); feedback.setAttribute('aria-live','polite'); let answered = false;
    const next = button(round === 4 ? 'Show score' : 'Next question', () => century(round + 1, points)); next.id = 'century-next'; next.disabled = true;
    for (const n of question.options) {
      const b = button(H.centuryLabel(n), () => {
        if (answered) return; answered = true; const correct = n === question.answer; if (correct) points += 20;
        feedback.textContent = (correct ? 'Correct. ' : 'Not this time. ') + H.dates(question.event) + ' belongs to the ' + H.centuryLabel(question.answer) + '.';
        options.querySelectorAll('button').forEach(b => b.disabled = true); next.disabled = false; next.focus();
      }); b.dataset.century = n; options.append(b);
    }
    dialog.append(options, feedback, next, button('Quiz menu', menu), button('Back to timeline', closeQuiz));
  }
  $('quiz').onclick = () => { H.pauseTour(); menu(); dialog.showModal(); };
  $('help').onclick = () => { H.pauseTour(); $('help-card').showModal(); }; $('close-help').onclick = () => $('help-card').close();
  const bar = el('section', null, 'tour-bar'); bar.setAttribute('aria-label','Guided tours');
  const picker = el('select'); picker.id = 'tour-choice'; picker.setAttribute('aria-label','Choose guided tour');
  H.tours.forEach(t => { const o = el('option', t.name); o.value = t.id; picker.append(o); });
  const status = el('span', 'Guided tours · auto-advance every 8 seconds'); status.id = 'tour-status'; status.setAttribute('aria-live','polite');
  let tour = null, index = 0, playing = false, timer = null;
  function stopTimer() { clearTimeout(timer); timer = null; }
  function controls() {
    prev.disabled = !tour || index === 0; next.disabled = !tour || index === tour.ids.length-1; pause.disabled = !tour || index === tour.ids.length-1;
    pause.textContent = playing ? 'Pause tour' : 'Resume tour'; pause.setAttribute('aria-pressed', playing);
    end.disabled = !tour; status.textContent = tour ? tour.name + ' · ' + (index+1) + '/' + tour.ids.length + (playing ? ' · playing' : index === tour.ids.length-1 ? ' · complete' : ' · paused') : 'Guided tours · auto-advance every 8 seconds';
  }
  function schedule() { stopTimer(); if (playing) timer = setTimeout(() => step(index + 1), 8000); }
  function step(n) {
    if (!tour) return; index = Math.max(0, Math.min(tour.ids.length-1, n));
    H.select(H.events.find(e => e.id === tour.ids[index]));
    if (index === tour.ids.length-1) playing = false; controls(); schedule();
  }
  H.pauseTour = () => { playing = false; stopTimer(); controls(); };
  const start = button('Start tour', () => {
    H.state.search = ''; $('search').value = ''; H.state.topics = []; H.state.bookmarksOnly = false;
    $('lanes').value = 'both'; $('lanes').dispatchEvent(new Event('change')); H.syncFilters(); H.update();
    tour = H.tours.find(t => t.id === picker.value); index = 0; playing = true; step(0);
  }); start.id = 'start-tour';
  const prev = button('‹ Previous', () => step(index-1)), next = button('Next ›', () => step(index+1)); prev.id='tour-prev'; next.id='tour-next';
  const pause = button('Pause tour', () => { playing = !playing; controls(); schedule(); }); pause.id='pause-tour';
  const end = button('End tour', () => { stopTimer(); playing = false; tour = null; controls(); }); end.id='end-tour';
  picker.onchange = () => { H.pauseTour(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) H.pauseTour(); });
  window.addEventListener('pagehide', stopTimer);
  bar.append(picker, start, prev, pause, next, end, status); document.querySelector('main').before(bar); controls();
})();
