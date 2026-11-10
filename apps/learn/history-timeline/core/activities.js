/* Pure quiz generation/scoring and curated tour definitions. */
(function (g) {
  'use strict';
  const H = g.HT;
  H.shuffle = (items, random = Math.random) => {
    const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i],copy[j]] = [copy[j],copy[i]]; } return copy;
  };
  H.quizPool = events => events.filter(e => !e.approximate && e.year >= -3000 && !/traditional/i.test(e.title));
  H.orderQuestion = (events, random = Math.random) => {
    const used = new Set(), items = H.shuffle(H.quizPool(events), random).filter(e => { if (used.has(e.year)) return false; used.add(e.year); return true; }).slice(0, 5);
    const answer = H.ordered(items).map(e => e.id); let shuffled = H.shuffle(items, random);
    if (shuffled.every((e,i) => e.id === answer[i])) shuffled = shuffled.slice(1).concat(shuffled[0]);
    return { items: shuffled, answer };
  };
  H.gradeOrder = (ids, answer) => {
    if (ids.length !== answer.length || new Set(ids).size !== ids.length || !ids.every(id => answer.includes(id))) return 0;
    return Math.round(ids.reduce((s,id,i) => s + (id === answer[i] ? 1 : 0), 0) / answer.length * 100);
  };
  H.centuryQuestion = (events, random = Math.random) => {
    const pool = H.quizPool(events), event = pool[Math.floor(random() * pool.length)], answer = H.century(event.year);
    const alternatives = [answer, ...[-2,-1,1,2,3].map(d => answer + d).filter(n => n !== 0)].slice(0,4);
    return { event, answer, options: H.shuffle(alternatives, random) };
  };
  H.tours = [
    { id: 'freedom', name: 'Indian freedom struggle', ids: ['congress','bengal-partition','gandhi-return','champaran','jallianwala','noncooperation','salt-march','poona-pact','quit-india','independence','constitution'] },
    { id: 'space', name: 'The space race', ids: ['sputnik','gagarin','tereshkova','leonov','luna9','apollo8','apollo11','iss'] },
    { id: 'ancient', name: 'Ancient civilisations', ids: ['farming','uruk','writing','egypt-unified','indus','giza','shang','olmec','qin','teotihuacan'] },
    { id: 'inventions', name: 'Age of inventions', ids: ['paper','diamond-sutra','gutenberg','watt','faraday','telephone','wright','transistor','integrated-circuit','web-proposal'] }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
