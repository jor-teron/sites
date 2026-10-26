/* Maths and Logic (ML1a) — app-specific glue only: where the topic .txt files live, the localStorage key prefix,
   and the fallback topic list used if index.txt cannot be read. Parsing, views, Basics/Expert (shared learn.mode),
   Quick check and progress all come from the shared Learn kit in ../common (unchanged).
   No emergency panel: the kit only draws it when a card has a "call:" header, and these cards have none.
   To add a topic: drop <topic>.txt in assets/data/ and list it in index.txt — no code edits needed. */
window.ML = { id: 'maths-logic', ver: 'ML1a', base: 'assets/data/', prefix: 'learn.maths-logic.',
  fallback: ['everyday-numbers', 'times-tables', 'fractions-percent', 'money-maths', 'shapes-measuring', 'patterns-puzzles'] };
LRN.app({ root: document.getElementById('app'), base: ML.base, ver: ML.ver, prefix: ML.prefix, fallback: ML.fallback,
  title: 'Maths and Logic', disclaimer: 'Everyday maths for real life. Examples use Indian rupees (₹) and metric units' });
