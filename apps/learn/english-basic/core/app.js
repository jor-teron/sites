/* English Basic — the only app-specific glue: where the text files are, which keys to save under, and the default topic list used if
   index.txt cannot be read. Everything else (parsing, views, quiz, progress) is the shared Learn kit in ../common. */
window.EB = { id: 'english-basic', ver: 'LRN2a', base: 'assets/data/', prefix: 'learn.english-basic.',
  fallback: ['alphabet', 'words', 'sentences', 'questions', 'phrases', 'spelling'] };
LRN.app({ root: document.getElementById('app'), base: EB.base, ver: EB.ver, prefix: EB.prefix, fallback: EB.fallback,
  title: 'English Basic', disclaimer: 'A simple beginner guide: practise a little every day.' });
