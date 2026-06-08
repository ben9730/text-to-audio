# Text-to-Speech Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Implement with Sonnet** (the user asked for the build to run on a lower-tier model). Every code step below contains the complete file content — transcribe it exactly; do not redesign.

**Goal:** Build an offline, browser-only text-to-speech reader: paste/type or upload a `.txt`, pick an English voice, adjust speed/pitch, and Play/Pause/Stop — using the browser's built-in Web Speech API, no backend, no build step.

**Architecture:** Pure client-side. Four focused classic-script files realize the four components — `chunk.js` (pure sentence chunker), `speech-engine.js` (wraps `speechSynthesis`), `file-loader.js` (`.txt` reader), `app.js` (Controller wiring UI ↔ engine). `index.html` + `style.css` are markup/styling. Scripts load in dependency order and share global scope (no ES modules, so `file://` double-click works). The chunker is dual-exported so its unit test runs under Node **and** in the browser.

**Tech Stack:** Vanilla HTML/CSS/JavaScript (ES5-compatible, classic scripts). Web Speech API (`window.speechSynthesis`, `SpeechSynthesisUtterance`). `FileReader` for uploads. Node (already installed, v16) only as the developer test runner. No frameworks, no dependencies, no bundler.

**Source of truth:** `docs/superpowers/specs/2026-06-08-text-to-speech-web-app-design.md`. Section references (e.g. §6.4) point there.

---

## File structure

| File | Responsibility | Verified by |
|---|---|---|
| `chunk.js` | Pure `chunkText(text, maxLen)` — no DOM, no speech. Dual export. | `node chunk.test.js` (Task 1) |
| `chunk.test.js` | Assertion cases for `chunkText` (Node + browser). | itself |
| `chunk.test.html` | Browser test page for `chunkText`. | open in browser (Task 9) |
| `speech-engine.js` | `SpeechEngine` wrapping `speechSynthesis`: voice loading, chunked queueing, play/pause/stop, state callbacks. | `node --check` + manual QA |
| `file-loader.js` | `loadTextFile(file)` → `Promise<string>`; validate + read + normalize. | `node --check` + manual QA |
| `index.html` | UI markup; loads the four scripts in order. | manual QA |
| `style.css` | Styling + light/auto-dark themes. | manual QA |
| `app.js` | Controller: wire UI, voice dropdown, state machine, text size, file upload. | `node --check` + manual QA |
| `README.txt` | One-paragraph run instructions for the user. | review |

Implement in the order below. Each task ends with a commit.

---

### Task 1: `chunk.js` — the pure sentence chunker (TDD)

**Files:**
- Create: `chunk.test.js`
- Create: `chunk.js`

- [ ] **Step 1: Write the failing test** — create `chunk.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node chunk.test.js`
Expected: throws `Error: Cannot find module './chunk.js'` (chunk.js doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation** — create `chunk.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node chunk.test.js`
Expected: every line `PASS`, final line `14/14 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add chunk.js chunk.test.js
git commit -m "feat: add pure sentence chunker with unit tests"
```

---

### Task 2: `chunk.test.html` — browser test page

**Files:**
- Create: `chunk.test.html`

- [ ] **Step 1: Create `chunk.test.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>chunkText tests</title>
</head>
<body>
  <p>Running chunkText tests… results will appear below.</p>
  <script src="chunk.js"></script>
  <script src="chunk.test.js"></script>
</body>
</html>
```

- [ ] **Step 2: Sanity-check it loads under Node syntax check** (the HTML isn't run here; just confirm the referenced JS is valid)

Run: `node --check chunk.js && node --check chunk.test.js`
Expected: no output, exit code 0. (Full browser verification happens in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add chunk.test.html
git commit -m "test: add browser test page for chunkText"
```

---

### Task 3: `speech-engine.js` — Web Speech API wrapper

**Files:**
- Create: `speech-engine.js`

Implements §6 exactly: voice loading with the `voiceschanged` race fix (§6.2), the precise `speak()` sequence and counted completion (§6.4), and pause/resume/stop with the self-cancel + wedged-pause guards (§6.5).

- [ ] **Step 1: Write `speech-engine.js`**

```js
'use strict';

// SpeechEngine wraps window.speechSynthesis. Knows nothing about the DOM.
// Callbacks (assign as properties): onstatechange(state, info), onprogress(i, n),
//   onerror(reason), onvoiceschanged(voices).
var SpeechEngine = (function () {
  var synth = (typeof window !== 'undefined') ? window.speechSynthesis : null;

  var voices = [];
  var queue = [];          // in-flight utterances, held so the GC bug can't drop them
  var chunkCount = 0;
  var endedCount = 0;
  var state = 'idle';      // 'idle' | 'speaking' | 'paused'
  var selfCancelled = false;

  var api = {
    onstatechange: null, onprogress: null, onerror: null, onvoiceschanged: null
  };

  function emitState(info) {
    if (typeof api.onstatechange === 'function') api.onstatechange(state, info || {});
  }

  function isSupported() {
    return (typeof window !== 'undefined') &&
      ('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window);
  }

  function populateVoices() {
    if (!synth) return;
    var list = synth.getVoices() || [];
    if (list.length > 0) {
      voices = list;
      if (typeof api.onvoiceschanged === 'function') api.onvoiceschanged(voices);
    }
  }

  // Resolve only when getVoices() is actually non-empty, or after a 1500ms fallback.
  // voiceschanged is a re-check trigger, NOT a resolve trigger (§6.2).
  function loadVoices() {
    return new Promise(function (resolve) {
      if (!isSupported()) { resolve([]); return; }
      populateVoices();
      if (voices.length > 0) { resolve(voices); return; }

      var done = false;
      function finish() {
        if (done) return;
        done = true;
        if (synth.removeEventListener) synth.removeEventListener('voiceschanged', onChange);
        resolve(voices);
      }
      function onChange() { populateVoices(); if (voices.length > 0) finish(); }
      if (synth.addEventListener) synth.addEventListener('voiceschanged', onChange);
      setTimeout(finish, 1500);
    });
  }

  function getVoices() { return voices; }
  function getState() { return state; }

  function speak(text, opts) {
    if (!isSupported()) return;
    opts = opts || {};
    var chunks = (typeof chunkText === 'function') ? chunkText(text, 200) : [text];
    if (!chunks.length) return;

    var wasActive = synth.speaking || synth.paused;

    selfCancelled = true;       // suppress the error from cancelling existing speech
    synth.cancel();
    if (synth.paused) synth.resume();

    queue = [];
    endedCount = 0;
    chunkCount = chunks.length;

    function enqueue() {
      selfCancelled = false;    // from here on, errors are real
      chunks.forEach(function (chunk, index) {
        var u = new SpeechSynthesisUtterance(chunk);
        if (opts.voice) { u.voice = opts.voice; u.lang = opts.voice.lang; }
        u.rate = (opts.rate != null) ? opts.rate : 1;
        u.pitch = (opts.pitch != null) ? opts.pitch : 1;

        u.onstart = function () {
          state = 'speaking';
          if (typeof api.onprogress === 'function') api.onprogress(index + 1, chunkCount);
          emitState();
        };
        u.onend = function () {
          endedCount++;
          if (endedCount === chunkCount && !selfCancelled) {
            state = 'idle';
            queue = [];          // release utterances immediately on completion (§6.4)
            emitState({ reason: 'finished' });
          }
        };
        u.onerror = function (e) {
          if (selfCancelled) return;   // intentional Stop/replace, not a real error
          synth.cancel();
          state = 'idle';
          if (typeof api.onerror === 'function') api.onerror((e && e.error) || 'unknown');
          emitState({ reason: 'error' });
        };

        queue.push(u);
        synth.speak(u);
      });
    }

    if (wasActive) setTimeout(enqueue, 100); else enqueue();
  }

  function pause() {
    if (!isSupported() || !synth.speaking) return;
    synth.pause();
    state = 'paused';
    emitState();
  }

  function resume() {
    if (!isSupported()) return;
    synth.resume();
    state = 'speaking';
    emitState();
  }

  function stop() {
    if (!isSupported()) return;
    selfCancelled = true;
    var wasPaused = synth.paused;
    synth.cancel();
    if (wasPaused) synth.resume();   // avoid wedged-paused state (§6.5)
    queue = [];
    endedCount = 0;
    chunkCount = 0;
    state = 'idle';
    emitState({ reason: 'stopped' });
    setTimeout(function () { selfCancelled = false; }, 0);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', function () {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    });
  }

  api.isSupported = isSupported;
  api.loadVoices = loadVoices;
  api.getVoices = getVoices;
  api.getState = getState;
  api.speak = speak;
  api.pause = pause;
  api.resume = resume;
  api.stop = stop;
  return api;
})();

if (typeof window !== 'undefined') window.SpeechEngine = SpeechEngine;
```

- [ ] **Step 2: Syntax-check**

Run: `node --check speech-engine.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add speech-engine.js
git commit -m "feat: add SpeechEngine wrapping the Web Speech API"
```

---

### Task 4: `file-loader.js` — `.txt` reader

**Files:**
- Create: `file-loader.js`

Implements §7: extension + type + size validation, UTF-8 read, BOM strip, EOL normalize.

- [ ] **Step 1: Write `file-loader.js`**

```js
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
```

- [ ] **Step 2: Syntax-check**

Run: `node --check file-loader.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add file-loader.js
git commit -m "feat: add .txt file loader with validation and normalization"
```

---

### Task 5: `index.html` — UI markup

**Files:**
- Create: `index.html`

Every control from §8.1, the unsupported banner, the inline hint, the `role="status"` live region, and the four scripts in dependency order.

- [ ] **Step 1: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Text-to-Speech Reader</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="app">
    <h1>Text-to-Speech Reader</h1>

    <p id="unsupported" class="banner" hidden>
      Sorry, your browser can't read text aloud. Please try the latest Microsoft Edge or Google Chrome.
    </p>

    <label for="text">Text to read</label>
    <textarea id="text" rows="10"
      placeholder="Type or paste text here, or upload a .txt file below."></textarea>

    <div class="row">
      <label for="file">Upload a .txt file</label>
      <input type="file" id="file" accept=".txt,text/plain" />
    </div>

    <div class="controls">
      <div class="control">
        <label for="voice">Voice</label>
        <select id="voice"></select>
      </div>
      <div class="control">
        <label for="rate">Speed</label>
        <input type="range" id="rate" min="0.5" max="2" step="0.1" value="1"
          aria-valuetext="1 times normal speed" />
        <output id="rateOut" for="rate">1.0&times;</output>
      </div>
      <div class="control">
        <label for="pitch">Pitch</label>
        <input type="range" id="pitch" min="0.5" max="1.5" step="0.1" value="1"
          aria-valuetext="pitch 1" />
        <output id="pitchOut" for="pitch">1.0</output>
      </div>
    </div>

    <div class="buttons">
      <button id="playPause" type="button" disabled>Play</button>
      <button id="stop" type="button" disabled>Stop</button>
      <span class="text-size">
        <button id="textSmaller" type="button" aria-label="Decrease text size">A&minus;</button>
        <button id="textLarger" type="button" aria-label="Increase text size">A+</button>
      </span>
    </div>

    <p class="hint">Tip: lower the speed for tricky text, raise it to skim.</p>

    <div id="status" role="status" aria-live="polite">Ready</div>
  </main>

  <!-- Classic scripts in dependency order (no modules → file:// works) -->
  <script src="chunk.js"></script>
  <script src="speech-engine.js"></script>
  <script src="file-loader.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add UI markup"
```

---

### Task 6: `style.css` — styling + light/auto-dark themes

**Files:**
- Create: `style.css`

Implements §8.7 auto dark mode via `prefers-color-scheme` using CSS custom properties, and the `--reader-font-size` hook the text-size buttons drive.

- [ ] **Step 1: Write `style.css`**

```css
:root {
  --bg: #ffffff;
  --fg: #1a1a1a;
  --muted: #555555;
  --border: #cccccc;
  --accent: #1565c0;
  --accent-fg: #ffffff;
  --banner-bg: #fdecea;
  --banner-fg: #8a1c12;
  --reader-font-size: 18px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1e1e;
    --fg: #eaeaea;
    --muted: #b0b0b0;
    --border: #555555;
    --accent: #4f9be6;
    --accent-fg: #0c0c0c;
    --banner-bg: #3a1f1c;
    --banner-fg: #f6a89f;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.5;
}

.app { max-width: 760px; margin: 0 auto; padding: 24px 20px 48px; }
h1 { font-size: 1.5rem; }
label { display: block; font-weight: 600; margin-bottom: 4px; }

textarea {
  width: 100%;
  font-size: var(--reader-font-size);
  padding: 12px;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 6px;
  resize: vertical;
}

.row { margin: 12px 0; }

.controls { display: flex; flex-wrap: wrap; gap: 20px; margin: 16px 0; }
.control { display: flex; flex-direction: column; }
.control output { color: var(--muted); }
select, input[type="range"] { font-size: 1rem; }

.buttons { display: flex; align-items: center; gap: 10px; margin: 8px 0 4px; }

button {
  font-size: 1rem;
  padding: 8px 16px;
  background: var(--accent);
  color: var(--accent-fg);
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }

.text-size { margin-left: auto; display: inline-flex; gap: 6px; }
.text-size button { padding: 6px 12px; }

.hint { color: var(--muted); font-size: 0.9rem; }

#status {
  margin-top: 12px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  min-height: 1.5em;
}

.banner {
  padding: 10px 14px;
  background: var(--banner-bg);
  color: var(--banner-fg);
  border-radius: 6px;
}
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "feat: add styling with automatic dark mode"
```

---

### Task 7: `app.js` — the Controller

**Files:**
- Create: `app.js`

Wires the UI to `SpeechEngine` and `loadTextFile`. Implements: unsupported-browser handling (§10), voice dropdown with local-English precedence (§8.2), slider outputs (§8.1), empty-text + status transitions incl. `finished → edit → Ready` (§8.4), the button/status state machine (§8.3), file upload (§7 consumer), and text size (§8.7).

- [ ] **Step 1: Write `app.js`**

```js
'use strict';

(function () {
  var FRIENDLY_LANG = {
    'en-US': 'US English', 'en-GB': 'UK English', 'en-AU': 'Australian',
    'en-IN': 'Indian English', 'en-CA': 'Canadian', 'en-IE': 'Irish',
    'en-ZA': 'South African', 'en-NZ': 'New Zealand'
  };
  var MIN_FONT = 14, MAX_FONT = 30, STEP_FONT = 2, DEFAULT_FONT = 18;

  function init() {
    var els = {
      text: document.getElementById('text'),
      file: document.getElementById('file'),
      voice: document.getElementById('voice'),
      rate: document.getElementById('rate'),
      rateOut: document.getElementById('rateOut'),
      pitch: document.getElementById('pitch'),
      pitchOut: document.getElementById('pitchOut'),
      playPause: document.getElementById('playPause'),
      stop: document.getElementById('stop'),
      textSmaller: document.getElementById('textSmaller'),
      textLarger: document.getElementById('textLarger'),
      status: document.getElementById('status'),
      unsupported: document.getElementById('unsupported')
    };

    var voiceMap = {};            // voiceURI -> SpeechSynthesisVoice
    var fontSize = DEFAULT_FONT;

    function setStatus(msg) { els.status.textContent = msg; }
    function isEmpty() { return els.text.value.trim().length === 0; }

    // ---- Unsupported browser (§10) ----
    if (!SpeechEngine.isSupported()) {
      els.unsupported.hidden = false;
      setStatus('');
      [els.text, els.file, els.voice, els.rate, els.pitch,
       els.playPause, els.stop, els.textSmaller, els.textLarger]
        .forEach(function (el) { if (el) el.disabled = true; });
      return;
    }

    // ---- Voice dropdown (§8.2) ----
    function friendlyLang(lang) { return FRIENDLY_LANG[lang] || lang; }

    function buildVoiceList(voices) {
      var local = voices.filter(function (v) { return v.localService; });
      var pool = local.length ? local : voices;            // last-resort fallback
      var english = pool.filter(function (v) {
        return v.lang && v.lang.toLowerCase().indexOf('en') === 0;
      });
      var chosen = (english.length ? english : pool).slice().sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });

      voiceMap = {};
      els.voice.innerHTML = '';
      var defaultURI = null;
      chosen.forEach(function (v) {
        voiceMap[v.voiceURI] = v;
        var label = v.name + ' (' + friendlyLang(v.lang) + ')';
        if (!v.localService) label += ' (online)';
        if (v.default) { label += ' — recommended'; defaultURI = v.voiceURI; }
        var opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = label;
        els.voice.appendChild(opt);
      });
      if (defaultURI) els.voice.value = defaultURI;
    }

    function selectedVoice() { return voiceMap[els.voice.value] || null; }

    SpeechEngine.loadVoices().then(function (voices) {
      if (!voices.length) {
        setStatus('No voices were found on this device. You may need to add a language/voice in Windows Settings.');
        els.playPause.disabled = true;
        return;
      }
      buildVoiceList(voices);
      refreshEmptyState();
    });
    SpeechEngine.onvoiceschanged = function (voices) {
      if (voices.length) buildVoiceList(voices);
    };

    // ---- Sliders (§8.1) ----
    els.rate.addEventListener('input', function () {
      els.rateOut.textContent = parseFloat(els.rate.value).toFixed(1) + '×';
      els.rate.setAttribute('aria-valuetext', els.rate.value + ' times normal speed');
    });
    els.pitch.addEventListener('input', function () {
      els.pitchOut.textContent = parseFloat(els.pitch.value).toFixed(1);
      els.pitch.setAttribute('aria-valuetext', 'pitch ' + els.pitch.value);
    });

    // ---- Empty-text handling + finished->edit->Ready (§8.4) ----
    function refreshEmptyState() {
      if (SpeechEngine.getState() !== 'idle') return;       // only manage idle UI
      var empty = isEmpty();
      els.playPause.disabled = empty;
      setStatus(empty ? 'Type or paste some text to begin' : 'Ready');
    }
    els.text.addEventListener('input', refreshEmptyState);

    // ---- Engine state -> UI (§8.3) ----
    SpeechEngine.onstatechange = function (state, info) {
      if (state === 'speaking') {
        els.playPause.textContent = 'Pause';
        els.playPause.disabled = false;
        els.stop.disabled = false;
      } else if (state === 'paused') {
        els.playPause.textContent = 'Play';
        els.playPause.disabled = false;
        els.stop.disabled = false;
        setStatus('Paused');
      } else { // idle
        els.playPause.textContent = 'Play';
        els.stop.disabled = true;
        els.playPause.disabled = isEmpty();
        var reason = info && info.reason;
        if (reason === 'finished') setStatus('Finished');
        else if (reason === 'error') setStatus('Something went wrong. Please try again.');
        else setStatus(isEmpty() ? 'Type or paste some text to begin' : 'Ready');
      }
    };
    SpeechEngine.onprogress = function (i, n) {
      setStatus('Speaking… (chunk ' + i + ' of ' + n + ')');
    };
    SpeechEngine.onerror = function () { /* message set via onstatechange reason */ };

    // ---- Play / Pause / Stop ----
    els.playPause.addEventListener('click', function () {
      var state = SpeechEngine.getState();
      if (state === 'speaking') {
        SpeechEngine.pause();
      } else if (state === 'paused') {
        SpeechEngine.resume();
        setStatus('Speaking…');
      } else {
        if (isEmpty()) return;
        SpeechEngine.speak(els.text.value, {
          voice: selectedVoice(),
          rate: parseFloat(els.rate.value),
          pitch: parseFloat(els.pitch.value)
        });
      }
    });
    els.stop.addEventListener('click', function () { SpeechEngine.stop(); });

    // ---- File upload (§7 consumer) ----
    els.file.addEventListener('change', function () {
      var file = els.file.files && els.file.files[0];
      if (!file) return;
      loadTextFile(file).then(function (text) {
        els.text.value = text;
        refreshEmptyState();
      }).catch(function (err) {
        setStatus(err.message || 'Could not read that file. Please try another.');
      });
      els.file.value = '';                                  // allow re-uploading same file
    });

    // ---- Text size (§8.7) ----
    function applyFontSize() {
      els.text.style.fontSize = fontSize + 'px';
      els.textSmaller.disabled = fontSize <= MIN_FONT;
      els.textLarger.disabled = fontSize >= MAX_FONT;
    }
    els.textSmaller.addEventListener('click', function () {
      fontSize = Math.max(MIN_FONT, fontSize - STEP_FONT); applyFontSize();
    });
    els.textLarger.addEventListener('click', function () {
      fontSize = Math.min(MAX_FONT, fontSize + STEP_FONT); applyFontSize();
    });

    // ---- Initial UI ----
    applyFontSize();
    refreshEmptyState();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', init);
  }
})();
```

- [ ] **Step 2: Syntax-check**

Run: `node --check app.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add Controller wiring UI to the speech engine"
```

---

### Task 8: `README.txt` — run instructions

**Files:**
- Create: `README.txt`

- [ ] **Step 1: Write `README.txt`**

```
Text-to-Speech Reader -- how to run

1. Keep all these files together in one folder:
   index.html, style.css, chunk.js, speech-engine.js, file-loader.js, app.js
2. Double-click index.html. It opens in your browser (use Microsoft Edge or
   Google Chrome on Windows). It works fully offline.
3. Type or paste text -- or click "Upload a .txt file" to load one.
   Pick a voice, set the speed and pitch, then press Play.
   Use Pause/Stop as needed, and A- / A+ to change the on-screen text size.

Notes:
- Voices come from Windows and differ per machine. For full offline use the app
  shows your local Microsoft voices (e.g. David, Zira, Mark).
- Switching to another browser tab during a long read may pause speech in Chrome.
- Dark mode follows your Windows theme automatically.

If a browser ever blocks opening the file directly, run a tiny local server:
   python -m http.server 8000
then open http://localhost:8000/ in your browser. Stop it later with Ctrl+C.

For developers -- run the chunker's unit test:
   node chunk.test.js
(or open chunk.test.html in a browser). The end user never needs this.
```

- [ ] **Step 2: Commit**

```bash
git add README.txt
git commit -m "docs: add README run instructions"
```

---

### Task 9: Integration & manual QA

**Files:** none created; this verifies the whole app per §12.

- [ ] **Step 1: Re-run the automated chunker test (regression)**

Run: `node chunk.test.js`
Expected: `14/14 passed, 0 failed`, exit 0.

- [ ] **Step 2: Open `chunk.test.html` in a browser**

Double-click `chunk.test.html`. Expected: the page shows `chunkText tests: 14/14 passed` with all green PASS lines.

- [ ] **Step 3: Run the core manual checklist in BOTH Edge and Chrome (offline)** — full list in spec §12.2; the must-pass smoke tests:

  1. Double-click `index.html` → status "Ready"; the voice dropdown fills within ~1.5 s with English voices, the default marked "— recommended".
  2. Empty textarea → **Play disabled**, status "Type or paste some text to begin".
  3. Type a sentence → Play enables; click Play → audio plays, button shows "Pause", Stop enabled, status shows "Speaking… (chunk N of M)".
  4. Pause → audio stops, status "Paused", button "Play"; click Play → resumes.
  5. Stop mid-playback → audio stops, status "Ready", Stop disabled; click Play again → plays from the start (no wedged-paused silence).
  6. Paste a long multi-paragraph article (> 2000 chars) → plays gaplessly to the end (no ~15 s cutoff), "chunk N of M" advances, ends on "Finished".
  7. After "Finished", edit the textarea → status resets to "Ready".
  8. Move Speed to 0.5 and 2.0, Pitch to 0.5 and 1.5 → the `<output>` values update; new playback reflects them.
  9. Upload a valid `.txt` (try one with CRLF and one with a BOM) → loads cleanly and plays.
  10. Upload a non-`.txt` → "Please choose a plain-text .txt file." Upload a > 1 MB file → "File too large (limit ~1 MB)." (no freeze).
  11. Click A+ several times, then A− → textarea text grows/shrinks within 14–30 px; buttons disable at the limits; audio unchanged.
  12. Set Windows to Dark mode and refresh → the app renders dark with readable contrast; switch to Light → renders light.
  13. Reload mid-playback → speech stops (no runaway audio).

- [ ] **Step 4: If any check fails, fix in the relevant file and re-verify** (re-run `node chunk.test.js` if the chunker changed; re-run the affected manual step). Use superpowers:systematic-debugging for any non-obvious failure. Commit each fix:

```bash
git add <changed-file>
git commit -m "fix: <what was wrong>"
```

- [ ] **Step 5: Final commit** (if anything is left uncommitted)

```bash
git add -A
git commit -m "chore: text-to-speech reader v1 complete"
```

---

## Self-review (completed by plan author)

- **Spec coverage:** §3 launch/classic-scripts → Task 5 (`index.html` script order); §6 SpeechEngine (voice load race, speak sequence, counted completion, pause/resume/stop guards, beforeunload) → Task 3; §7 file loader → Task 4; §8.1 controls/defaults/ranges → Tasks 5–7; §8.2 voice precedence → Task 7 `buildVoiceList`; §8.3 state machine → Task 7 `onstatechange`; §8.4 empty-text + finished→edit→Ready → Task 7 `refreshEmptyState`; §8.6 hint → Task 5; §8.7 text size + auto dark → Tasks 6–7; §9 chunker → Task 1; §10 error cases → Tasks 3/4/7; §11 a11y (labels, live region, aria-valuetext, accessible A−/A+ names) → Tasks 5–7; §12.1 chunker test → Tasks 1–2; §12.2 manual checklist → Task 9; §13 run instructions → Task 8.
- **Placeholder scan:** no TBD/TODO; every code step contains complete file content.
- **Type/name consistency:** globals `chunkText`, `SpeechEngine`, `loadTextFile` and the engine callbacks (`onstatechange(state, info)`, `onprogress(i, n)`, `onerror`, `onvoiceschanged`) are defined in Tasks 1/3/4 and consumed with the same names/signatures in Task 7. Element IDs in `index.html` (Task 5) match `document.getElementById` lookups in `app.js` (Task 7): `text, file, voice, rate, rateOut, pitch, pitchOut, playPause, stop, textSmaller, textLarger, status, unsupported`. CSS var `--reader-font-size` (Task 6) is the same surface the text-size buttons drive (Task 7 sets `els.text.style.fontSize`).
- **Out-of-scope confirmed absent:** no audio export, no word highlighting, no cloud/AI voices, no localStorage persistence, no backend.
