'use strict';

// loadTextFile(file, opts) -> Promise<string>. Validates and reads a .txt via
// FileReader, strips a BOM, and normalizes line endings. Knows nothing about speech.
function loadTextFile(file, opts) {
  opts = opts || {};
  var maxBytes = (opts.maxBytes != null) ? opts.maxBytes : 1000000; // ~1 MB

  return new Promise(function (resolve, reject) {
    if (!file) { reject(new Error('Please choose a plain-text .txt file.')); return; }

    var nameOk = !!file.name && file.name.toLowerCase().slice(-4) === '.txt';
    var typeOk = !file.type || file.type.indexOf('text/') === 0;
    if (!nameOk || !typeOk) {
      reject(new Error('Please choose a plain-text .txt file.'));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error('File too large (limit ~1 MB).'));
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result);
      text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n'); // strip BOM, unify EOL
      resolve(text);
    };
    reader.onerror = function () {
      reject(new Error('Could not read that file. Please try another.'));
    };
    reader.readAsText(file, 'UTF-8');
  });
}

if (typeof window !== 'undefined') window.loadTextFile = loadTextFile;
