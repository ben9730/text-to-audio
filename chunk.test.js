'use strict';

// Load chunkText from chunk.js in BOTH environments:
//  - Node:    require('./chunk.js')
//  - Browser: chunk.js ran first (loaded before this script) and set window.chunkText
var chunkText =
  (typeof module !== 'undefined' && module.exports)
    ? require('./chunk.js').chunkText
    : window.chunkText;

function normalizeWords(s) {
  return s.trim().split(/\s+/).filter(Boolean);
}
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

var results = [];
function check(name, condition) { results.push({ name: name, pass: !!condition }); }

// Case 1: empty / whitespace -> []
check('1a empty -> []', chunkText('').length === 0);
check('1b whitespace-only -> []', chunkText('   \n  ').length === 0);

// Case 2: two short sentences pack into one chunk, single space
(function () {
  var r = chunkText('Hello world. How are you?');
  check('2 single chunk', r.length === 1);
  check('2 exact text', r[0] === 'Hello world. How are you?');
})();

// Case 3: abbreviation Dr. doesn't break packing
(function () {
  var r = chunkText('Dr. Smith went home.');
  check('3 single chunk equals input', r.length === 1 && r[0] === 'Dr. Smith went home.');
})();

// Case 4: decimal not split (no spurious space in 3.14)
(function () {
  var r = chunkText('Pi is 3.14 exactly.');
  check('4 decimal intact', r.length === 1 && r[0] === 'Pi is 3.14 exactly.');
})();

// Case 5: initialism U.S.A. intact
(function () {
  var r = chunkText('It happened in the U.S.A. yesterday.');
  check('5 initialism intact', r.length === 1 && r[0] === 'It happened in the U.S.A. yesterday.');
})();

// Case 6: long no-punctuation text -> many chunks, each <= 200, words preserved
(function () {
  var words = [];
  for (var i = 0; i < 120; i++) words.push('word' + i); // ~ 700+ chars
  var input = words.join(' ');
  var r = chunkText(input);
  check('6 multiple chunks', r.length > 1);
  check('6 every chunk <= 200', r.every(function (c) { return c.length <= 200; }));
  check('6 words preserved', arraysEqual(normalizeWords(r.join(' ')), normalizeWords(input)));
})();

// Case 7: newlines are boundaries; no chunk contains a newline
(function () {
  var input = 'Line one\nLine two\nLine three';
  var r = chunkText(input);
  check('7 no newline in any chunk', r.every(function (c) { return c.indexOf('\n') === -1; }));
  check('7 words preserved', arraysEqual(normalizeWords(r.join(' ')), normalizeWords(input)));
})();

// Case 8: ellipsis not 3 breaks; ?! ends a sentence
(function () {
  var r = chunkText('Wait... really?! Yes.');
  check('8 single chunk equals input', r.length === 1 && r[0] === 'Wait... really?! Yes.');
})();

// Case 9: invariants across cases 2-8
(function () {
  var inputs = [
    'Hello world. How are you?',
    'Dr. Smith went home.',
    'Pi is 3.14 exactly.',
    'It happened in the U.S.A. yesterday.',
    'Line one\nLine two\nLine three',
    'Wait... really?! Yes.'
  ];
  var ok = true;
  inputs.forEach(function (input) {
    var r = chunkText(input);
    r.forEach(function (c) {
      if (c.length > 200 && c.indexOf(' ') !== -1) ok = false; // >200 only for a single token
      if (c.trim().length === 0) ok = false;
      if (c.indexOf('  ') !== -1) ok = false;
      if (c.indexOf('\n') !== -1) ok = false;
    });
    if (!arraysEqual(normalizeWords(r.join(' ')), normalizeWords(input))) ok = false;
  });
  check('9 invariants hold across cases 2-8', ok);
})();

// Report
var passed = results.filter(function (r) { return r.pass; }).length;
var failed = results.length - passed;

if (typeof document !== 'undefined') {
  var html = '<h1>chunkText tests: ' + passed + '/' + results.length + ' passed</h1><ul>';
  results.forEach(function (r) {
    html += '<li style="color:' + (r.pass ? 'green' : 'red') + '">' +
      (r.pass ? 'PASS' : 'FAIL') + ' — ' + r.name + '</li>';
  });
  document.body.innerHTML = html + '</ul>';
}
results.forEach(function (r) { console.log((r.pass ? 'PASS' : 'FAIL') + ' — ' + r.name); });
console.log('\n' + passed + '/' + results.length + ' passed, ' + failed + ' failed');
if (typeof process !== 'undefined' && failed > 0) process.exit(1);
