# TTS Reader v2 — Redesign, Highlighting & Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Implement with Sonnet** (standing project preference). Every code step contains the complete file content — transcribe it exactly; do not redesign.

**Goal:** Restyle the offline TTS reader to the UI UX Pro Max "ambient minimal / calm indigo + green" design system, add a synced read-along (segment) highlight, bundle the Lexend font locally, and deploy to GitHub Pages.

**Architecture:** Pure client-side, unchanged from v1. `chunk.js`, `speech-engine.js`, `file-loader.js`, and the chunker tests are **untouched**. The redesign is `style.css` + `index.html`; the highlighting is added to `app.js` only, driven by the existing `onprogress(i, n)` engine callback (a "segment" = one engine chunk). The Lexend variable font is bundled at `fonts/lexend.woff2` (no CDN) so the app stays offline-capable and self-contained when deployed.

**Tech Stack:** Vanilla HTML/CSS/JS (ES5 classic scripts), Web Speech API. Lexend variable webfont. `curl` to fetch the font; `git` + `gh` for deploy. No frameworks, no build step.

**Source of truth:** `docs/superpowers/specs/2026-06-08-tts-reader-v2-redesign-and-highlighting.md` (§ refs point there). v1 spec remains authoritative for engine/chunker semantics.

---

## File structure

| File | Change | Verified by |
|---|---|---|
| `fonts/lexend.woff2` | **Create** — bundled Lexend variable font | file exists, non-zero size (Task 1) |
| `style.css` | **Rewrite** — design tokens, `@font-face`, controls, reader/seg, motion | `node --check` n/a (CSS); manual QA |
| `index.html` | **Rewrite** — SVG icon buttons, `#reader` panel, status dot+text | manual QA |
| `app.js` | **Modify** — reading view + segment highlight, icon/label toggle, status span | `node --check app.js` + manual QA |
| `README.txt` | **Modify** — mention highlight + live URL | review |
| `chunk.js`, `speech-engine.js`, `file-loader.js`, `chunk.test.js`, `chunk.test.html` | **Unchanged** | `node chunk.test.js` regression |

Implement in order. Each task ends with a commit.

---

### Task 1: Bundle the Lexend font locally

**Files:**
- Create: `fonts/lexend.woff2`

- [ ] **Step 1: Fetch the Lexend variable woff2** (a modern User-Agent makes Google Fonts serve the variable woff2)

Run (Bash tool):
```bash
mkdir -p fonts
curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=Lexend:wght@300..700&display=swap" -o fonts/lexend.css
WOFF2_URL=$(grep -oE "https://fonts\.gstatic\.com/[^)]+\.woff2" fonts/lexend.css | head -1)
echo "Font URL: $WOFF2_URL"
curl -s "$WOFF2_URL" -o fonts/lexend.woff2
rm fonts/lexend.css
```

- [ ] **Step 2: Verify the font downloaded**

Run: `ls -l fonts/lexend.woff2`
Expected: file exists, size is non-trivial (roughly 30 KB–120 KB). If size is 0 or the file is missing, the UA/URL extraction failed — re-run Step 1.

- [ ] **Step 3: Commit**

```bash
git add fonts/lexend.woff2
git commit -m "feat: bundle Lexend variable font locally"
```

---

### Task 2: Rewrite `style.css` to the design system

**Files:**
- Modify: `style.css` (full replacement)

Implements §2 (tokens, typography, motion, controls) and §3.4 (reader/seg styles).

- [ ] **Step 1: Replace the entire contents of `style.css` with:**

```css
/* ---- Bundled font (offline + deployable) ---- */
@font-face {
  font-family: "Lexend";
  src: url("fonts/lexend.woff2") format("woff2");
  font-weight: 300 700;
  font-style: normal;
  font-display: swap;
}

/* ---- Design tokens: UI UX Pro Max "calm indigo + success green" ---- */
:root {
  --bg: #F5F3FF;
  --surface: #FFFFFF;
  --fg: #1E1B2E;
  --muted: #4B4763;
  --border: #D9D5EC;
  --primary: #6366F1;
  --primary-weak: #EEF0FF;
  --play: #10B981;
  --play-fg: #FFFFFF;
  --banner-bg: #FDECEA;
  --banner-fg: #8A1C12;

  --reader-font-size: 18px;
  --radius: 12px;
  --radius-sm: 8px;
  --shadow: 0 1px 2px rgba(17, 12, 46, 0.06), 0 8px 24px rgba(17, 12, 46, 0.06);
  --ring: 0 0 0 3px rgba(99, 102, 241, 0.45);
  --font: "Lexend", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16151F;
    --surface: #211F2E;
    --fg: #ECEAF6;
    --muted: #A9A4C2;
    --border: #3A3650;
    --primary: #818CF8;
    --primary-weak: #2C2A45;
    --play: #34D399;
    --play-fg: #06281E;
    --banner-bg: #3A1F1C;
    --banner-fg: #F6A89F;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.30), 0 8px 24px rgba(0, 0, 0, 0.35);
    --ring: 0 0 0 3px rgba(129, 140, 248, 0.50);
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.app { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }

h1 { font-size: 1.6rem; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 4px; }
.subtitle { color: var(--muted); margin: 0 0 24px; font-size: 0.95rem; }

label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.95rem; }

textarea {
  width: 100%;
  font-family: var(--font);
  font-size: var(--reader-font-size);
  line-height: 1.7;
  padding: 16px;
  background: var(--surface);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  resize: vertical;
  transition: border-color 200ms, box-shadow 200ms;
}
textarea:focus-visible { outline: none; border-color: var(--primary); box-shadow: var(--ring); }

.row { margin: 16px 0; }
input[type="file"] { color: var(--muted); font-family: var(--font); }
input[type="file"]::file-selector-button {
  font-family: var(--font);
  font-size: 0.9rem;
  margin-right: 12px;
  padding: 8px 14px;
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  transition: background 200ms, border-color 200ms;
}
input[type="file"]::file-selector-button:hover { border-color: var(--primary); }

/* ---- Controls card ---- */
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 20px 28px;
  margin: 20px 0;
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.control { display: flex; flex-direction: column; gap: 4px; min-width: 160px; flex: 1; }
.control output { color: var(--muted); font-variant-numeric: tabular-nums; }

select {
  font-family: var(--font);
  font-size: 1rem;
  padding: 8px 10px;
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
select:focus-visible { outline: none; border-color: var(--primary); box-shadow: var(--ring); }

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--border);
  cursor: pointer;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid var(--surface);
  box-shadow: var(--shadow);
}
input[type="range"]::-moz-range-thumb {
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid var(--surface);
}
input[type="range"]:focus-visible { outline: none; box-shadow: var(--ring); }

/* ---- Buttons ---- */
.buttons { display: flex; align-items: center; gap: 10px; margin: 8px 0 4px; flex-wrap: wrap; }
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: var(--font);
  font-size: 1rem;
  font-weight: 600;
  min-height: 44px;
  padding: 10px 20px;
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  transition: background 200ms, border-color 200ms, color 200ms, box-shadow 200ms;
}
button:hover:not(:disabled) { border-color: var(--primary); }
button:focus-visible { outline: none; box-shadow: var(--ring); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button svg { width: 20px; height: 20px; flex: none; }

button.primary { background: var(--play); color: var(--play-fg); border-color: transparent; }
button.primary:hover:not(:disabled) { filter: brightness(0.96); border-color: transparent; }

.text-size { margin-left: auto; display: inline-flex; gap: 6px; }
.text-size button { min-width: 44px; padding: 8px 12px; }

.hint { color: var(--muted); font-size: 0.9rem; margin: 14px 0 0; }

/* ---- Reading view ---- */
.reader {
  margin-top: 20px;
  max-width: 70ch;
  max-height: 320px;
  overflow: auto;
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  font-family: var(--font);
  font-size: var(--reader-font-size);
  line-height: 1.8;
}
.seg { transition: background 150ms, color 150ms; border-radius: 6px; padding: 0 2px; }
.seg--active {
  background: var(--primary-weak);
  color: var(--fg);
  font-weight: 600;
  box-shadow: -3px 0 0 var(--primary);
}

/* ---- Status ---- */
#status {
  margin-top: 16px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  min-height: 1.5em;
}
#status.speaking { color: var(--fg); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--play); flex: none; display: none; }
#status.speaking .dot { display: inline-block; animation: pulse 1.2s ease-in-out infinite; }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

/* ---- Banner ---- */
.banner {
  padding: 12px 16px;
  background: var(--banner-bg);
  color: var(--banner-fg);
  border-radius: var(--radius-sm);
  font-weight: 500;
}

/* ---- Respect reduced motion ---- */
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "feat: restyle to UI UX Pro Max design system (indigo/green, Lexend)"
```

---

### Task 3: Rewrite `index.html`

**Files:**
- Modify: `index.html` (full replacement)

Adds the subtitle, SVG icon+label buttons, the `#reader` panel, and the status dot + `#statusText` span. Element IDs from v1 are preserved; new IDs: `reader`, `statusText`.

- [ ] **Step 1: Replace the entire contents of `index.html` with:**

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
    <p class="subtitle">Paste or upload text, pick a voice, and listen — fully offline.</p>

    <p id="unsupported" class="banner" hidden>
      Sorry, your browser can't read text aloud. Please try the latest Microsoft Edge or Google Chrome.
    </p>

    <label for="text">Text to read</label>
    <textarea id="text" rows="8"
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
          aria-valuetext="1.0 times normal speed" />
        <output id="rateOut" for="rate">1.0&times;</output>
      </div>
      <div class="control">
        <label for="pitch">Pitch</label>
        <input type="range" id="pitch" min="0.5" max="1.5" step="0.1" value="1"
          aria-valuetext="pitch 1.0" />
        <output id="pitchOut" for="pitch">1.0</output>
      </div>
    </div>

    <div class="buttons">
      <button id="playPause" class="primary" type="button" disabled>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        <span class="btn-label">Play</span>
      </button>
      <button id="stop" type="button" disabled>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
        <span class="btn-label">Stop</span>
      </button>
      <span class="text-size">
        <button id="textSmaller" type="button" aria-label="Decrease text size">A&minus;</button>
        <button id="textLarger" type="button" aria-label="Increase text size">A+</button>
      </span>
    </div>

    <p class="hint">Tip: lower the speed for tricky text, raise it to skim.</p>

    <div id="reader" class="reader" aria-hidden="true" hidden></div>

    <div id="status" role="status" aria-live="polite">
      <span class="dot" aria-hidden="true"></span>
      <span id="statusText">Ready</span>
    </div>
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
git commit -m "feat: add reading panel, SVG icon buttons, status indicator markup"
```

---

### Task 4: Add reading view + segment highlighting to `app.js`

**Files:**
- Modify: `app.js` (full replacement)

Implements §3.3: build the reading view on Play (using the same `chunkText(text, 200)` the engine uses), highlight `segments[i-1]` on each `onprogress(i, n)`, auto-scroll (smooth unless reduced-motion), clear+hide on idle. Also toggles the play/pause icon+label and the status `.speaking` pulse, and routes status text through `#statusText`.

- [ ] **Step 1: Replace the entire contents of `app.js` with:**

```js
'use strict';

(function () {
  var FRIENDLY_LANG = {
    'en-US': 'US English', 'en-GB': 'UK English', 'en-AU': 'Australian',
    'en-IN': 'Indian English', 'en-CA': 'Canadian', 'en-IE': 'Irish',
    'en-ZA': 'South African', 'en-NZ': 'New Zealand'
  };
  var MIN_FONT = 14, MAX_FONT = 30, STEP_FONT = 2, DEFAULT_FONT = 18;

  var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span class="btn-label">Play</span>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg><span class="btn-label">Pause</span>';

  function prefersReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

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
      reader: document.getElementById('reader'),
      status: document.getElementById('status'),
      statusText: document.getElementById('statusText'),
      unsupported: document.getElementById('unsupported')
    };

    var voiceMap = {};            // voiceURI -> SpeechSynthesisVoice
    var fontSize = DEFAULT_FONT;
    var lastProgress = '';        // last "Speaking…" line, for resume display

    function setStatus(msg) { els.statusText.textContent = msg; }
    function isEmpty() { return els.text.value.trim().length === 0; }

    // ---- Reading view (§3.3): segments mirror the engine's chunks exactly ----
    function buildReader(text) {
      els.reader.innerHTML = '';
      var segments = (typeof chunkText === 'function') ? chunkText(text, 200) : [];
      segments.forEach(function (seg) {
        var span = document.createElement('span');
        span.className = 'seg';
        span.textContent = seg;
        els.reader.appendChild(span);
        els.reader.appendChild(document.createTextNode(' '));
      });
      els.reader.hidden = segments.length === 0;
    }
    function clearReader() {
      els.reader.innerHTML = '';
      els.reader.hidden = true;
    }
    function highlightSegment(idx) {
      var segs = els.reader.getElementsByClassName('seg');
      for (var k = 0; k < segs.length; k++) segs[k].classList.remove('seg--active');
      var active = segs[idx];
      if (active) {
        active.classList.add('seg--active');
        active.scrollIntoView({ block: 'nearest', behavior: prefersReduced() ? 'auto' : 'smooth' });
      }
    }

    // ---- Unsupported browser (§10 v1) ----
    if (!SpeechEngine.isSupported()) {
      els.unsupported.hidden = false;
      setStatus('');
      [els.text, els.file, els.voice, els.rate, els.pitch,
       els.playPause, els.stop, els.textSmaller, els.textLarger]
        .forEach(function (el) { if (el) el.disabled = true; });
      return;
    }

    // ---- Voice dropdown (§8.2 v1) ----
    function friendlyLang(lang) { return FRIENDLY_LANG[lang] || lang; }

    function buildVoiceList(voices) {
      var local = voices.filter(function (v) { return v.localService; });
      var pool = local.length ? local : voices;
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
      if (voices.length) { buildVoiceList(voices); refreshEmptyState(); }
    };

    // ---- Sliders (§8.1 v1) ----
    els.rate.addEventListener('input', function () {
      var v = parseFloat(els.rate.value).toFixed(1);
      els.rateOut.textContent = v + '×';
      els.rate.setAttribute('aria-valuetext', v + ' times normal speed');
    });
    els.pitch.addEventListener('input', function () {
      var v = parseFloat(els.pitch.value).toFixed(1);
      els.pitchOut.textContent = v;
      els.pitch.setAttribute('aria-valuetext', 'pitch ' + v);
    });

    // ---- Empty-text handling + finished->edit->Ready (§8.4 v1) ----
    function refreshEmptyState() {
      if (SpeechEngine.getState() !== 'idle') return;
      var empty = isEmpty();
      els.playPause.disabled = empty;
      setStatus(empty ? 'Type or paste some text to begin' : 'Ready');
    }
    els.text.addEventListener('input', refreshEmptyState);

    // ---- Engine state -> UI (§8.3 v1 + §3.3 v2) ----
    SpeechEngine.onstatechange = function (state, info) {
      els.status.classList.toggle('speaking', state === 'speaking');
      if (state === 'speaking') {
        els.playPause.innerHTML = ICON_PAUSE;
        els.playPause.disabled = false;
        els.stop.disabled = false;
      } else if (state === 'paused') {
        els.playPause.innerHTML = ICON_PLAY;
        els.playPause.disabled = false;
        els.stop.disabled = false;
        setStatus('Paused');
      } else { // idle
        els.playPause.innerHTML = ICON_PLAY;
        els.stop.disabled = true;
        els.playPause.disabled = isEmpty();
        clearReader();
        var reason = info && info.reason;
        if (reason === 'finished') setStatus('Finished');
        else if (reason === 'error') setStatus('Something went wrong. Please try again.');
        else setStatus(isEmpty() ? 'Type or paste some text to begin' : 'Ready');
      }
    };
    SpeechEngine.onprogress = function (i, n) {
      lastProgress = 'Speaking… (segment ' + i + ' of ' + n + ')';
      setStatus(lastProgress);
      highlightSegment(i - 1);
    };
    SpeechEngine.onerror = function () { /* message set via onstatechange reason */ };

    // ---- Play / Pause / Stop ----
    els.playPause.addEventListener('click', function () {
      var state = SpeechEngine.getState();
      if (state === 'speaking') {
        SpeechEngine.pause();
      } else if (state === 'paused') {
        SpeechEngine.resume();
        setStatus(lastProgress || 'Speaking…');
      } else {
        if (isEmpty()) return;
        buildReader(els.text.value);
        SpeechEngine.speak(els.text.value, {
          voice: selectedVoice(),
          rate: parseFloat(els.rate.value),
          pitch: parseFloat(els.pitch.value)
        });
      }
    });
    els.stop.addEventListener('click', function () { SpeechEngine.stop(); });

    // ---- File upload (§7 v1 consumer) ----
    els.file.addEventListener('change', function () {
      var file = els.file.files && els.file.files[0];
      if (!file) return;
      loadTextFile(file).then(function (text) {
        els.text.value = text;
        refreshEmptyState();
      }).catch(function (err) {
        setStatus(err.message || 'Could not read that file. Please try another.');
      });
      els.file.value = '';
    });

    // ---- Text size (§8.7 v1) ----
    function applyFontSize() {
      document.documentElement.style.setProperty('--reader-font-size', fontSize + 'px');
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
git commit -m "feat: add synced read-along segment highlighting"
```

---

### Task 5: Update `README.txt`

**Files:**
- Modify: `README.txt`

- [ ] **Step 1: Replace the entire contents of `README.txt` with:**

```
Text-to-Speech Reader -- how to run

1. Keep all these files together in one folder:
   index.html, style.css, chunk.js, speech-engine.js, file-loader.js, app.js,
   and the fonts/ folder (Lexend reading font).
2. Double-click index.html. It opens in your browser (use Microsoft Edge or
   Google Chrome on Windows). It works fully offline.
3. Type or paste text -- or click "Upload a .txt file" to load one.
   Pick a voice, set the speed and pitch, then press Play.
   As it reads, the current sentence is highlighted in the reading panel and
   scrolls into view. Use Pause/Stop, and A- / A+ to change the text size.

Notes:
- Voices come from Windows and differ per machine. For full offline use the app
  shows your local Microsoft voices (e.g. David, Zira, Mark).
- Switching to another browser tab during a long read may pause speech in Chrome.
- Dark mode follows your Windows theme automatically.
- The Lexend reading font is bundled locally, so it looks the same offline.

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
git commit -m "docs: note highlighting and bundled font in README"
```

---

### Task 6: Regression + manual QA

**Files:** none created; verifies the whole app per spec §7.

- [ ] **Step 1: Chunker regression + syntax**

Run: `node chunk.test.js && node --check app.js`
Expected: `14/14 passed, 0 failed`, then no output from the check. Exit 0.

- [ ] **Step 2: Open `index.html` in a browser and run the must-pass checks** (spec §7):

  1. **Font:** double-click `index.html` (offline) → headings/text render in Lexend (rounded, even-width), not the system fallback.
  2. **Highlight sync:** type a multi-sentence paragraph, press Play → the reading panel appears, the active segment highlights (indigo tint + left bar + bold) and advances **in time with the audio**, auto-scrolling to stay visible.
  3. **Pause/Resume:** Pause → highlight freezes, button shows Play, dot stops pulsing; Play → resumes. **Stop**/finish → highlight clears and the panel hides.
  4. **Theme:** looks correct in light and in Windows **dark** mode; text is clearly readable; Tab shows visible focus rings on every control.
  5. **Reduced motion:** enable Windows "Animation effects off" → no smooth scroll/pulse, highlighting still advances.
  6. **Buttons:** Play is green with a play icon; on play it swaps to a pause icon + "Pause"; pointer cursor; hover changes border with no layout shift.
  7. **Regression of v1 behavior:** empty text disables Play with the prompt; long article (>2000 chars) plays gaplessly with "segment N of M"; `.txt` upload works; non-`.txt` and >1 MB files show the right errors; A−/A+ scales both the textarea and the reading panel.

- [ ] **Step 2b: Verify offline (no network)**

Disconnect the network (or use DevTools → Network → Offline) and reload `index.html`. Expected: Lexend still renders (bundled, not fetched) and everything works.

- [ ] **Step 3: Fix any failure** in the relevant file, then re-run Step 1 and the affected manual check. Use superpowers:systematic-debugging for non-obvious failures. Commit each fix:

```bash
git add <changed-file>
git commit -m "fix: <what was wrong>"
```

---

### Task 7: Merge to `main`, push to GitHub, enable Pages

**Files:** none; deploys per spec §5. Requires `gh` authenticated (`gh auth status`; if not, the user runs `! gh auth login`).

- [ ] **Step 1: Merge the feature branch to `main`**

```bash
git checkout main
git merge --no-ff feat/tts-reader-v1 -m "merge: TTS reader v1 + v2 redesign and highlighting"
node chunk.test.js
```
Expected: clean merge, `14/14 passed`.

- [ ] **Step 2: Create the GitHub repo and push** (public, so Pages is free)

```bash
gh repo create text-to-speech-reader --public --source=. --remote=origin --push
```
Expected: repo created, `main` pushed. (If the repo already exists, instead run `git remote add origin <url>` then `git push -u origin main`.)

- [ ] **Step 3: Enable GitHub Pages on `main` / root**

```bash
gh api -X POST "repos/{owner}/text-to-speech-reader/pages" -f "source[branch]=main" -f "source[path]=/" || \
gh api -X PUT  "repos/{owner}/text-to-speech-reader/pages" -f "source[branch]=main" -f "source[path]=/"
```
Then get the URL:
```bash
gh api "repos/{owner}/text-to-speech-reader/pages" --jq .html_url
```
Expected: prints `https://<owner>.github.io/text-to-speech-reader/`.

- [ ] **Step 4: Verify the live site** (after ~1 minute for the first build)

Open the printed URL in Edge/Chrome. Expected: app loads over https, Lexend renders, voices populate, playback + highlighting work end-to-end. (Voices come from the visitor's OS, identical to local.)

- [ ] **Step 5: Final commit** (only if anything is left uncommitted)

```bash
git add -A
git commit -m "chore: TTS reader v2 complete and deployed"
```

---

## Self-review (completed by plan author)

- **Spec coverage:** §2 design tokens/typography/motion/controls → Task 2 (`style.css`); §2.4 SVG icon buttons → Tasks 3 (markup) + 4 (icon/label toggle); §3 segment highlighting (reading view, `onprogress`-driven, auto-scroll, reduced-motion, aria-hidden) → Tasks 3 (`#reader`) + 4 (`buildReader`/`highlightSegment`/`clearReader`); Lexend bundling §2.2 → Task 1 + `@font-face` in Task 2; §5 deploy (merge, push, Pages, relative paths) → Task 7; §6 accessibility (contrast, weight-not-color, aria-hidden reader, focus rings, reduced motion) → Tasks 2–4; §7 testing → Task 6.
- **Placeholder scan:** no TBD/TODO; every code step has complete file content; deploy commands are concrete (only `{owner}`/auth are environment-supplied, with fallbacks given).
- **Type/name consistency:** new globals/IDs are consistent across tasks — `#reader`, `#statusText`, `.dot`, `.seg`, `.seg--active`, `.btn-label`, `button.primary` defined in `index.html` (Task 3) and `style.css` (Task 2) and consumed by `app.js` (Task 4: `els.reader`, `els.statusText`, `getElementsByClassName('seg')`, `ICON_PLAY`/`ICON_PAUSE` with `btn-label`). `chunkText(text, 200)` in `buildReader` matches the engine's internal `chunkText(text, 200)`, so segment indices align with `onprogress`. `--reader-font-size` drives both `textarea` and `.reader`.
- **Out-of-scope confirmed absent:** no engine/chunker/file-loader edits; no word-level highlighting; no persistence; no CDN font; no backend.
```
