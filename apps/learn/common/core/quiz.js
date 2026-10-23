/* Learn kit — quiz logic: pick up to `max` questions from a card, shuffle the answers, score. Pure functions, no DOM. */
window.LRN = window.LRN || {};
(() => {
  const L = window.LRN;
  const shuffle = (a, rnd) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  L.quiz = {
    shuffle,
    // card.quiz -> [{q, options:[...], answer:indexOfRight}] (at most 5 questions, at most 4 options each)
    build(card, rnd, max) {
      rnd = rnd || Math.random;
      return shuffle(card.quiz, rnd).slice(0, max || 5).map(x => {
        const options = shuffle([x.right].concat(shuffle(x.wrong, rnd).slice(0, 3)), rnd);
        return { q: x.q, options, answer: options.indexOf(x.right) };
      });
    }
  };
})();
