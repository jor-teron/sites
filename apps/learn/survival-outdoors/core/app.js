/* Survival and Outdoors (SO1a) — app-specific glue only: where the topic .txt files live, the localStorage key prefix,
   and the fallback topic list used if index.txt cannot be read. Parsing, views, Basics/Expert (shared learn.mode),
   Quick check and progress all come from the shared Learn kit in ../common (unchanged).
   To add a topic: drop <topic>.txt in assets/data/ and list it in index.txt — no code edits needed. */
window.SO = { id: 'survival-outdoors', ver: 'SO1a', base: 'assets/data/', prefix: 'learn.survival-outdoors.',
  fallback: ['fire-and-water'] };
LRN.app({ root: document.getElementById('app'), base: SO.base, ver: SO.ver, prefix: SO.prefix, fallback: SO.fallback,
  title: 'Survival and Outdoors', disclaimer: 'General outdoor guidance. Always follow local fire bans, park rules and expert advice' });
