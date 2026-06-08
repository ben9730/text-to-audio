'use strict';

// Pragmatic abbreviation set: protects a trailing "." from being read as a
// sentence boundary. Single capitals U/S/A keep initialisms like "U.S.A." intact.
// Matched case-insensitively against the word token immediately before the dot.
var ABBREVIATIONS = {
  mr: 1, mrs: 1, ms: 1, dr: 1, prof: 1, sr: 1, jr: 1, st: 1, vs: 1, etc: 1,
  eg: 1, ie: 1, no: 1, inc: 1, ltd: 1, co: 1, u: 1, s: 1, a: 1
};

function isDigit(ch) { return ch >= '0' && ch <= '9'; }

// Split text into TTS-safe chunks, each <= maxLen chars (a single whitespace-free
// token longer than maxLen is cut at maxLen). Pure: no DOM, no speech.
function chunkText(text, maxLen) {
  if (maxLen === undefined) maxLen = 200;
  if (typeof text !== 'string' || text.trim().length === 0) return [];

  // ---- Pass 1: scan into raw sentences; decide AT each terminator ----
  var sentences = [];
  var buf = '';
  var i = 0;
  var n = text.length;

  while (i < n) {
    var ch = text[i];

    if (ch === '\n') {
      if (buf.trim().length > 0) sentences.push(buf.trim());
      buf = '';
      while (i < n && text[i] === '\n') i++; // consume the whole newline run
      continue;
    }

    if (ch === '.' || ch === '!' || ch === '?') {
      var isBoundary = true;
      if (ch === '.') {
        if (text[i - 1] === '.' || text[i + 1] === '.') {
          isBoundary = false;                              // ellipsis
        } else if (isDigit(text[i - 1]) && isDigit(text[i + 1])) {
          isBoundary = false;                              // decimal (3.14)
        } else {
          var m = buf.match(/([A-Za-z]+)$/);               // abbreviation
          if (m && ABBREVIATIONS[m[1].toLowerCase()]) isBoundary = false;
        }
      }

      buf += ch;
      i++;

      if (isBoundary) {
        while (i < n && (text[i] === '!' || text[i] === '?')) { buf += text[i]; i++; }
        while (i < n && (text[i] === '"' || text[i] === "'" ||
                         text[i] === ')' || text[i] === ']')) { buf += text[i]; i++; }
        if (buf.trim().length > 0) sentences.push(buf.trim());
        buf = '';
      }
      continue;
    }

    buf += ch;
    i++;
  }
  if (buf.trim().length > 0) sentences.push(buf.trim());

  // ---- Pass 2: pack greedily; hard-split anything longer than maxLen ----
  var chunks = [];
  var current = '';
  function pushCurrent() {
    if (current.trim().length > 0) chunks.push(current.trim());
    current = '';
  }

  for (var s = 0; s < sentences.length; s++) {
    var sentence = sentences[s];

    if (sentence.length > maxLen) {
      pushCurrent();
      var rest = sentence;
      while (rest.length > maxLen) {
        var cut = rest.lastIndexOf(' ', maxLen);
        if (cut <= 0) cut = maxLen;                        // one giant token
        var piece = rest.slice(0, cut).trim();
        if (piece.length > 0) chunks.push(piece);
        rest = rest.slice(cut).trim();
      }
      if (rest.length > 0) current = rest;                 // remainder seeds next pack
      continue;
    }

    if (current.length === 0) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= maxLen) {
      current += ' ' + sentence;
    } else {
      pushCurrent();
      current = sentence;
    }
  }
  pushCurrent();

  return chunks;
}

if (typeof window !== 'undefined') window.chunkText = chunkText;
if (typeof module !== 'undefined' && module.exports) module.exports = { chunkText };
