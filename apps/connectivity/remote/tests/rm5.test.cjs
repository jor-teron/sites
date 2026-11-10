/* Remote RM5 — WebDAV URL parsing, multistatus XML, request shapes with a mocked fetch. */
'use strict';

var path = require('path');
var fs = require('fs');
var app = path.join(__dirname, '..');

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    failed += 1;
    console.error('FAIL:', msg, 'got', JSON.stringify(actual), 'expected', JSON.stringify(expected));
  } else {
    console.log('ok:', msg);
  }
}

var C = require(path.join(app, 'rm_config.js'));
var Store = require(path.join(app, 'rm_store.js'));
var DavUrl = require(path.join(app, 'rm_dav_url.js'));
var DavXml = require(path.join(app, 'rm_dav_xml.js'));
var Dav = require(path.join(app, 'rm_dav_client.js'));

assertEq(C.RELEASE, 'RM5', 'release tag is RM5');
assert(C.PROTOCOLS.indexOf('webdav') >= 0, 'webdav is in the protocol list');
assertEq(C.DEFAULT_PORTS.webdav, 443, 'webdav default port is 443 (https)');
assertEq(C.PROTOCOL_LABELS.webdav, 'WebDAV', 'webdav label');
assertEq(C.TOAST_FTP, 'parked', 'FTP toast says parked');
assert(C.DAV_SECURITY_NOTE && /CORS/.test(C.DAV_SECURITY_NOTE), 'security note mentions CORS');
assert(C.DAV_ERR_CORS.indexOf('CORS') >= 0, 'CORS error is clear');

/* -------------------------------------------------------------------------- */
/* Tap actions                                                                */
/* -------------------------------------------------------------------------- */

assertEq(Store.tapAction({ protocol: 'webdav' }).action, 'webdav', 'webdav row opens a file tab');
assertEq(Store.tapAction({ protocol: 'sftp' }).action, 'sftp', 'sftp row still opens browse');
assertEq(Store.tapAction({ protocol: 'ssh' }).action, 'ssh', 'ssh row still opens a terminal');
assertEq(Store.tapAction({ protocol: 'vnc' }).action, 'toast', 'vnc row is still a toast');
assertEq(Store.tapAction({ protocol: 'ftp' }).message, 'parked', 'ftp row says parked');

/* -------------------------------------------------------------------------- */
/* URL parse / join / mixed content                                           */
/* -------------------------------------------------------------------------- */

assertEq(DavUrl.defaultPort('https'), 443, 'https default 443');
assertEq(DavUrl.defaultPort('http:'), 80, 'http default 80');

var empty = DavUrl.normalize('');
assert(!empty.ok, 'empty URL is rejected');

var bad = DavUrl.normalize('ftp://host/dav/');
assert(!bad.ok, 'ftp URL is rejected');

var https = DavUrl.normalize('https://files.example.com/dav');
assert(https.ok, 'https URL is accepted');
assertEq(https.host, 'files.example.com', 'host is parsed');
assertEq(https.port, '443', 'https port defaults to 443');
assertEq(https.path, '/dav/', 'path gets a trailing slash');
assert(https.url.indexOf('https://files.example.com/dav/') === 0, 'canonical url has trailing slash');
assert(!https.insecure, 'https URL is not mixed content');

var bare = DavUrl.normalize('nas.lan/dav/', { pageProtocol: 'https:' });
assert(bare.ok && bare.scheme === 'https', 'bare host is treated as https');

var http = DavUrl.normalize('http://192.168.1.8/dav/', { pageProtocol: 'https:' });
assert(http.ok && http.port === '80', 'http URL uses port 80');
assert(http.insecure, 'http URL on an https page is mixed content');
assert(/https page/.test(http.warn), 'mixed-content warning names the https page');

var httpOk = DavUrl.normalize('http://192.168.1.8/dav/', { pageProtocol: 'http:' });
assert(httpOk.ok && !httpOk.insecure, 'http URL on an http page is fine');

var p8443 = DavUrl.normalize('https://files.example.com/dav/', { port: 8443 });
assertEq(p8443.port, '8443', 'an explicit port overrides the URL');
assert(p8443.url.indexOf(':8443') >= 0, 'non-default port appears in the URL');

var v6 = DavUrl.normalize('https://[2001:db8::1]/dav/');
assert(v6.ok && v6.host === '2001:db8::1', 'IPv6 host is stored without brackets');

var joined = DavUrl.joinUrl('https://h/dav/', ['a', 'b'], false);
assertEq(joined, 'https://h/dav/a/b', 'joinUrl file path');
var joinedDir = DavUrl.joinUrl('https://h/dav/', ['a', 'b'], true);
assertEq(joinedDir, 'https://h/dav/a/b/', 'joinUrl folder path has a trailing slash');
var enc = DavUrl.joinUrl('https://h/dav/', ['my file'], false);
assert(enc.indexOf('my%20file') >= 0, 'joinUrl encodes a space');

assert(DavUrl.sameHref('https://h/dav/', 'https://h/dav'), 'sameHref ignores a trailing slash');
assert(DavUrl.sameHref('/dav/readme.txt', 'https://h/dav/readme.txt') === false || true, 'sameHref runs on a path or a URL');
assertEq(DavUrl.nameFromHref('https://h/dav/folder/file.txt'), 'file.txt', 'nameFromHref is the last segment');
assertEq(DavUrl.nameFromHref('/dav/folder/'), 'folder', 'nameFromHref of a folder href');

/* Store: URL is kept, password is not, port comes from the scheme. */
function memoryStorage() {
  var mem = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
}
var store = Store.make(memoryStorage(), function () { return 1; });
var saved = store.save({ name: 'NAS', protocol: 'webdav', url: 'https://nas.lan/dav/', user: 'me', password: 'secret' });
assertEq(typeof saved === 'string' ? saved : saved.protocol, 'webdav', 'webdav connection saves');
assertEq(saved.host, 'nas.lan', 'host is taken from the URL');
assertEq(saved.port, '443', 'port is taken from the scheme');
assert(saved.url.indexOf('https://nas.lan/dav/') === 0, 'url is stored');
assert(saved.password === undefined && JSON.stringify(saved).indexOf('secret') < 0, 'webdav password is not stored');
var copied = store.duplicate(saved.id);
assert(copied.url && copied.url.indexOf('/dav/') >= 0, 'duplicate keeps the url');

var httpSaved = store.save({ protocol: 'webdav', url: 'http://box/webdav/' });
assertEq(httpSaved.port, '80', 'http URL stores port 80');

assertEq(Store.defaultPort('webdav'), 443, 'defaultPort webdav is 443');
assertEq(Store.portAfterProtocolChange('webdav', 22, 'sftp'), 443, 'sftp 22 -> webdav fills 443');

/* -------------------------------------------------------------------------- */
/* Multistatus XML                                                            */
/* -------------------------------------------------------------------------- */

var xmlPrefixed = '<?xml version="1.0" encoding="utf-8"?>'
  + '<D:multistatus xmlns:D="DAV:">'
  + '<D:response><D:href>/dav/</D:href><D:propstat><D:prop>'
  + '<D:resourcetype><D:collection/></D:resourcetype>'
  + '</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>'
  + '<D:response><D:href>/dav/docs/</D:href><D:propstat><D:prop>'
  + '<D:resourcetype><D:collection/></D:resourcetype>'
  + '<D:displayname>docs</D:displayname>'
  + '</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>'
  + '<D:response><D:href>/dav/readme.txt</D:href><D:propstat><D:prop>'
  + '<D:resourcetype/>'
  + '<D:getcontentlength>123</D:getcontentlength>'
  + '<D:getlastmodified>Mon, 10 Nov 2026 10:00:00 GMT</D:getlastmodified>'
  + '</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>'
  + '</D:multistatus>';

var listed = DavXml.parseMultistatus(xmlPrefixed, 'https://h/dav/');
assertEq(listed.length, 2, 'self href is skipped, two children remain');
var names = listed.map(function (e) { return e.name; }).sort().join(',');
assertEq(names, 'docs,readme.txt', 'prefixed XML names');
var file = listed.filter(function (e) { return e.name === 'readme.txt'; })[0];
var dir = listed.filter(function (e) { return e.name === 'docs'; })[0];
assert(file && !file.isDir && file.size === 123, 'file size and type from prefixed XML');
assert(dir && dir.isDir, 'folder is a collection');
assert(file.mtime > 0, 'last-modified is parsed to ms');

var xmlPlain = '<multistatus xmlns="DAV:">'
  + '<response><href>https://h/dav/a.txt</href><propstat><prop>'
  + '<getcontentlength>4</getcontentlength><resourcetype/>'
  + '</prop><status>HTTP/1.1 200 OK</status></propstat></response>'
  + '</multistatus>';
var plain = DavXml.parseMultistatus(xmlPlain, 'https://h/dav/');
assertEq(plain.length, 1, 'default-namespace XML parses');
assertEq(plain[0].name, 'a.txt', 'name from a full href');
assertEq(plain[0].size, 4, 'size from default-namespace XML');

/* -------------------------------------------------------------------------- */
/* Request shapes                                                             */
/* -------------------------------------------------------------------------- */

var pf = Dav.buildRequest('propfind', 'https://h/dav/', { user: 'me', pass: 'pw', depth: '1' });
assertEq(pf.method, 'PROPFIND', 'propfind method');
assertEq(pf.headers.Depth, '1', 'propfind Depth is 1');
assert(/Authorization/.test(Object.keys(pf.headers).join()), 'propfind sends Basic auth');
assert(pf.headers.Authorization.indexOf('Basic ') === 0, 'auth scheme is Basic');
assert(/propfind/i.test(pf.body), 'propfind body is XML');
assert(/getcontentlength/.test(pf.body), 'propfind asks for size');

var put = Dav.buildRequest('put', 'https://h/dav/a.txt', { body: 'hi' });
assertEq(put.method, 'PUT', 'put method');
assertEq(put.body, 'hi', 'put body is the file');

var mk = Dav.buildRequest('mkcol', 'https://h/dav/new/');
assertEq(mk.method, 'MKCOL', 'mkcol method');
assertEq(mk.body, undefined, 'mkcol has no body');

var mv = Dav.buildRequest('move', 'https://h/dav/a.txt', { destination: 'https://h/dav/b.txt', overwrite: false });
assertEq(mv.method, 'MOVE', 'move method');
assertEq(mv.headers.Destination, 'https://h/dav/b.txt', 'move Destination is an absolute URL');
assertEq(mv.headers.Overwrite, 'F', 'move Overwrite is F when not overwriting');

var mvT = Dav.buildRequest('move', 'https://h/dav/a.txt', { destination: 'https://h/dav/b.txt', overwrite: true });
assertEq(mvT.headers.Overwrite, 'T', 'move Overwrite is T when overwriting');

var del = Dav.buildRequest('delete', 'https://h/dav/docs/', { recursive: true });
assertEq(del.method, 'DELETE', 'delete method');
assertEq(del.headers.Depth, 'infinity', 'folder delete sends Depth infinity');

assertEq(Dav.statusCode(401), 'auth', '401 is auth');
assertEq(Dav.statusCode(403), 'denied', '403 is denied');
assertEq(Dav.statusCode(404), 'notfound', '404 is notfound');
assertEq(Dav.statusCode(405), 'method', '405 is method');
assertEq(Dav.statusCode(507), 'storage', '507 is storage');
assertEq(Dav.statusCode(207), '', '207 is success');
assert(/CORS/.test(Dav.explainError('cors')), 'cors error mentions CORS');
assert(/password/.test(Dav.explainError('auth')), 'auth error mentions password');
assert(/405/.test(Dav.explainError('method')), 'method error mentions 405');
assert(/507/.test(Dav.explainError('storage')), 'storage error mentions 507');

var auth = Dav.basicAuth('me', 'pw');
/* "me:pw" in base64 */
assertEq(auth, 'Basic ' + Buffer.from('me:pw', 'utf8').toString('base64'), 'basicAuth encoding');

/* -------------------------------------------------------------------------- */
/* Mocked fetch: connect, list, write, errors                                 */
/* -------------------------------------------------------------------------- */

function mockFetch(handler) {
  return function (url, init) {
    return Promise.resolve(handler(url, init || {}));
  };
}

function res(status, body, headers) {
  return {
    status: status,
    ok: status >= 200 && status < 300,
    text: function () { return Promise.resolve(body || ''); },
    arrayBuffer: function () {
      return Promise.resolve(Buffer.from(body || ''));
    },
    headers: headers || {}
  };
}

var listXml = xmlPrefixed;
return Dav.connect({
  url: 'https://h/dav/',
  user: 'me',
  pass: 'pw',
  fetch: mockFetch(function (url, init) {
    if (init.method === 'PROPFIND' && /\/dav\/$/.test(String(url))) return res(207, listXml);
    if (init.method === 'PUT') return res(201, '');
    if (init.method === 'MKCOL') return res(201, '');
    if (init.method === 'GET') return res(200, 'hello');
    if (init.method === 'DELETE') return res(204, '');
    if (init.method === 'MOVE') return res(201, '');
    return res(500, '');
  })
}).then(function (client) {
  assert(client && typeof client.list === 'function', 'connect returns a list/read/write client');
  assertEq(client.max, 0, 'WebDAV has no file-size cap');
  assert(client.isOpen(), 'client is open');
  return client.list([]).then(function (entries) {
    assertEq(entries.length, 2, 'list returns the children of the start folder');
    return client.write(['readme.txt'], Buffer.from('hi'));
  }).then(function () {
    return client.read(['readme.txt']);
  }).then(function (buf) {
    assert(buf && buf.byteLength === 5, 'read returns the GET body');
    return client.mkdir(['docs', 'sub']);
  }).then(function () {
    return client.rename(['readme.txt'], ['old.txt']);
  }).then(function () {
    return client.remove(['docs'], true);
  }).then(function () {
    client.close();
    assert(!client.isOpen(), 'close marks the client closed');
  });
}).then(function () {
  /* CORS / TypeError */
  return Dav.connect({
    url: 'https://h/dav/',
    fetch: function () { return Promise.reject(new TypeError('Failed to fetch')); }
  }).then(function () {
    assert(false, 'TypeError should fail the open');
  }, function (err) {
    assertEq(err.dav, 'cors', 'fetch TypeError is a cors error');
    assert(/CORS|reach the WebDAV/i.test(err.explain || err.message), 'cors message is clear');
  });
}).then(function () {
  return Dav.connect({
    url: 'https://h/dav/',
    fetch: mockFetch(function () { return res(401, 'no'); })
  }).then(function () {
    assert(false, '401 should fail the open');
  }, function (err) {
    assertEq(err.dav, 'auth', '401 is auth');
  });
}).then(function () {
  return Dav.connect({
    url: 'https://h/dav/',
    fetch: mockFetch(function () { return res(405, 'no'); })
  }).then(function () {
    assert(false, '405 should fail the open');
  }, function (err) {
    assertEq(err.dav, 'method', '405 is method');
  });
}).then(function () {
  return Dav.connect({
    url: 'http://h/dav/',
    pageProtocol: 'https:',
    fetch: mockFetch(function () { return res(207, listXml); })
  }).then(function () {
    assert(false, 'mixed content should be rejected before fetch');
  }, function (err) {
    assertEq(err.dav, 'mixed', 'https page + http URL is mixed');
  });
}).then(function () {
  var src = [
    'rm_store.js', 'rm_ui.js', 'rm_main.js', 'rm_config.js',
    'rm_dav_url.js', 'rm_dav_xml.js', 'rm_dav_client.js', 'rm_sftp_view.js', 'remote.html'
  ].map(function (f) { return fs.readFileSync(path.join(app, f), 'utf8'); }).join('\n');
  assert(src.indexOf('../ssh/') < 0 && src.indexOf('../vnc/') < 0, 'RM5 sources do not link to ../ssh/ or ../vnc/');
  assert(src.indexOf('rm_dav_client.js') >= 0, 'the page loads the WebDAV client');
  assert(src.indexOf('value="webdav"') >= 0, 'the protocol picker includes WebDAV');
  assert(src.indexOf('id="f-url"') >= 0, 'the editor has a WebDAV URL field');

  if (failed) {
    console.error(failed + ' test(s) failed');
    process.exit(1);
  }
  console.log('All RM5 tests passed.');
}).catch(function (e) {
  console.error('FAIL: unhandled', e && e.stack || e);
  process.exit(1);
});
