/* Node helper tests for Read Aloud (RA1 sentence split + RA2 HTML extract, word count).
   Run: node apps/tools/read-aloud/ra_helpers_test.js
   No DOM, no jsdom, no browser. */
var path = require('path');
var dir = __dirname;
var RAText = require(path.join(dir, 'ra_text.js'));
var RAWeb = require(path.join(dir, 'ra_web.js'));
var fails = [];

function eq(name, a, b) {
  var sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) fails.push(name + ' got ' + sa + ' expected ' + sb);
  else console.log('ok', name);
}

eq('strip heading and bold', RAText.stripMd('# Hello\n\nThis is **bold** and *italic*.'), 'Hello\n\nThis is bold and italic.');
eq('strip link and list', RAText.stripMd('- click [here](https://example.com)\n- more'), 'click here\nmore');
eq('sentences basic', RAText.sentences('Hello world. How are you? I am fine!'), ['Hello world.', 'How are you?', 'I am fine!']);
eq('abbrev Mr.', RAText.sentences('Mr. Sharma went home. Then he slept.'), ['Mr. Sharma went home.', 'Then he slept.']);
eq('abbrev U.S.', RAText.sentences('The U.S. team won. Fans cheered.'), ['The U.S. team won.', 'Fans cheered.']);
eq('empty', RAText.sentences('   '), []);
eq('danda', RAText.sentences('Namaskar\u0964 Keu ase?'), ['Namaskar\u0964', 'Keu ase?']);
eq('ellipsis', RAText.sentences('Wait\u2026 Then go.'), ['Wait\u2026', 'Then go.']);
eq('code fence keeps text', RAText.stripMd('```js\ncode\n```\nAfter.'), 'code\n\nAfter.');
eq('wordCount', RAText.wordCount('one two  three'), 3);
eq('wordCount empty', RAText.wordCount('  '), 0);
eq('eta 160 words at 1x is 1 min', Math.round(RAText.etaMinutes(160, 1)), 1);
eq('eta label short', RAText.etaLabel(20, 1), 'less than a minute');
eq('eta label 8 min', RAText.etaLabel(1280, 1), 'about 8 min');

var articleHtml = [
  '<html><head><title>Site Name</title>',
  '<meta property="og:title" content="The real headline">',
  '</head><body>',
  '<nav>Home About Contact</nav>',
  '<main>',
  '<article><h1>The real headline</h1><p>First paragraph of the story.</p>',
  '<p>Second paragraph, still in the article.</p></article>',
  '</main>',
  '<aside>Related junk</aside>',
  '<footer>Copyright 2026</footer>',
  '<script>var x = "ignore me please.";</script>',
  '<style>body{color:red}</style>',
  '</body></html>'
].join('');

var art = RAWeb.extract(articleHtml);
eq('prefers og title', art.title, 'The real headline');
eq('article paragraphs kept', art.text, 'The real headline\n\nFirst paragraph of the story.\n\nSecond paragraph, still in the article.');
if (/Home About|Related junk|Copyright 2026|ignore me please/.test(art.text)) {
  fails.push('article extract leaked chrome: ' + art.text);
} else {
  console.log('ok stripped nav footer aside script');
}

var noArticle = [
  '<html><head><title>Plain page</title></head><body>',
  '<nav>Skip this nav</nav>',
  '<main><h1>Heading one</h1><p>Body paragraph here.</p>',
  '<h2>Sub head</h2><p>More body text.</p></main>',
  '<footer>Foot</footer></body></html>'
].join('');
var plain = RAWeb.extract(noArticle);
eq('fallback title', plain.title, 'Plain page');
eq('fallback main blocks', plain.text, 'Heading one\n\nBody paragraph here.\n\nSub head\n\nMore body text.');
if (/Skip this nav|Foot/.test(plain.text)) fails.push('main extract leaked chrome: ' + plain.text);
else console.log('ok main without article');

var ents = RAWeb.extract('<body><article><p>Fish &amp; chips &#8212; nice.</p></article></body>');
if (!/Fish & chips/.test(ents.text) || !/nice/.test(ents.text)) fails.push('entities: ' + ents.text);
else console.log('ok entity decode', ents.text);

eq('valid url ok', RAWeb.validHttpUrl('https://example.com/a'), 'https://example.com/a');
eq('valid url rejects js', RAWeb.validHttpUrl('javascript:alert(1)'), '');
eq('isGoogleNewsUrl', RAWeb.isGoogleNewsUrl('https://news.google.com/rss/articles/ABC'), true);
eq('not google', RAWeb.isGoogleNewsUrl('https://example.com/news'), false);

var inner = 'https://www.example.com/story-one';
var b64 = Buffer.from('xxxx' + inner + '\x00more').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
var gurl = 'https://news.google.com/rss/articles/' + b64;
eq('resolve Google embedded url', RAWeb.resolveGoogleUrl(gurl), inner);

var canHtml = '<link rel="canonical" href="https://www.example.com/canonical-story">';
eq('canonicalUrl', RAWeb.canonicalUrl(canHtml, 'https://news.google.com/articles/x'), 'https://www.example.com/canonical-story');

var outHtml = '<html><a href="https://news.google.com/foo">g</a><a href="https://publisher.example/story">p</a></html>';
eq('outboundLink skips google', RAWeb.outboundLink(outHtml), 'https://publisher.example/story');

if (fails.length) {
  console.error(fails.join('\n'));
  process.exit(1);
}
console.log('all helper tests passed');
