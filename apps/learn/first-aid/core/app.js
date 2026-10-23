/* First Aid — the only app-specific glue: where the text files are, which keys to save under, and the default card list used if
   index.txt cannot be read. Everything else (parsing, views, quiz, progress) is the shared Learn kit in ../common. */
window.FA = { id: 'first-aid', ver: 'LRN1c', base: 'assets/data/', prefix: 'learn.first-aid.',
  fallback: ['cuts', 'burns', 'choking', 'cpr', 'nosebleed', 'sprain', 'fainting'] };
LRN.app({ root: document.getElementById('app'), base: FA.base, ver: FA.ver, prefix: FA.prefix, fallback: FA.fallback,
  title: 'First Aid', disclaimer: 'General guidance, not a substitute for professional help or emergency services' });
