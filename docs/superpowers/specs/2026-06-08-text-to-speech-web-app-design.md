# Offline Text-to-Speech Reader — Software Design Spec (v1)

A zero-dependency, single-page browser app that reads pasted or uploaded English text aloud using the device's built-in voices via the Web Speech API, working fully offline by double-clicking `index.html`.

> This spec was hardened against verified W3C/MDN research and two adversarial reviews (technical + document-quality). Findings are folded in; see the changelog at the end.

---

## 1. Summary

A browser web app (plain HTML + CSS + JavaScript — no build tools, no dependencies, no backend) that speaks user-supplied English text aloud using `window.speechSynthesis` and the device's local voices. The user pastes/types text or uploads a `.txt` file, picks a voice, adjusts speed and pitch, and uses Play / Pause / Stop. **Playback only — no audio export.** Runs by double-clicking `index.html` in Microsoft Edge or Google Chrome on Windows.

---

## 2. Goal & Non-Goals

### Goal
Let a non-expert Windows user reliably hear arbitrary English text read aloud, fully offline, with control over voice, speed, and pitch, and clear status feedback — using only the browser's built-in speech engine and a few static files.

### Non-Goals (explicitly out of scope for v1)
- Audio file download / export of any kind.
- Live word/sentence highlighting during playback.
- Cloud voices, local AI / neural voices beyond what the OS provides, or any API keys.
- User accounts, login, or profiles.
- Any server-side functionality (no backend, no database, no telemetry).
- A volume control (utterance volume stays at its default; see §6.3).
- Languages other than English as a first-class concern (English voices are prioritized; the app does not translate or detect language).

---

## 3. Target Environment

- **Browsers:** Microsoft Edge and Google Chrome (Chromium) on Windows 10/11. These ship local Microsoft voices (e.g. David, Zira, Mark) backed by the Windows speech engine and support the Web Speech API.
- **Offline:** No network required. The app uses OS-level **local** voices (`localService === true`) only by default (see §8.2). No assets are fetched at runtime; everything is in the local files.
- **Launch:** The user double-clicks `index.html`; it opens via the `file://` protocol and works directly. To keep `file://` working, `app.js` is loaded as a **classic script** (`<script src="app.js"></script>`, NOT `type="module"`), because ES modules are blocked by CORS on `file://` origins.
- **Fallback:** If a particular browser/configuration blocks something over `file://`, the user can run a one-line local server from the project folder: `python -m http.server 8000`, then open `http://localhost:8000/`. This is documented as a backup only; it is not required for normal use.
- **Known environmental limitations (documented, not engineered around in v1):**
  - Available voices differ per machine and per browser; the app never hard-codes voice names — it always builds the list from `getVoices()`.
  - Network ("Google") voices (`localService === false`) are **excluded by default** because they go silent offline and send text to a vendor server; they are only shown as a last resort if the device has zero local voices (see §8.2).
  - Switching browser tabs (backgrounding) may throttle or pause synthesis in Chrome; this is noted to the user as a limitation, not worked around.
  - Pause→Resume of an in-flight utterance is best-effort: the exact resume point depends on the browser (some Chromium versions restart the current chunk). Because chunks are short (§6.4), the worst case is re-hearing a sentence, not losing the queue.

---

## 4. Architecture Overview

Pure client-side. No frameworks. Four components, each with a single responsibility:

| Component | File(s) | Single responsibility |
|---|---|---|
| **UI** | `index.html`, `style.css` | Declarative markup and styling only: textarea, file input, voice `<select>`, speed/pitch sliders with value outputs, Play/Pause and Stop buttons, and a status line. No logic. |
| **Speech Engine** | `app.js` (namespace, e.g. `SpeechEngine`) | Wraps `window.speechSynthesis`. Owns voice loading (`voiceschanged`), the pure chunking call, building one utterance per chunk, queuing, and exposing `speak / pause / resume / stop / getVoices` plus state-change callbacks. Knows nothing about the DOM. |
| **File Loader** | `app.js` (function `loadTextFile`) | Validates and reads an uploaded `.txt` via `FileReader`, normalizes the text, returns a `Promise<string>`. Knows nothing about speech. |
| **Controller** | `app.js` (init/wiring code) | Wires UI events to the Speech Engine and File Loader, keeps button/status state in sync via engine callbacks, and reads/writes `localStorage`. The only component that touches both the DOM and the engine. |

The **pure chunking function** `chunkText(text, maxLen)` lives in `app.js` as a named, side-effect-free function (no DOM, no speech), so it is unit-testable in isolation (§9, §12).

Data flow: `UI event → Controller → (File Loader | Speech Engine) → Controller updates UI from engine callbacks`.

---

## 5. File Layout

```
text to audio/
├─ index.html        # UI markup; loads style.css and app.js (classic script)
├─ style.css         # All styling
├─ app.js            # Speech Engine + File Loader + Controller + pure chunkText()
├─ chunk.test.html   # Standalone unit test for chunkText() (open in browser)
└─ README.txt        # One-paragraph "how to run" for the non-expert user
```

- **`app.js`** exposes `chunkText` on the global scope (`window.chunkText = chunkText;`) so the test page can call it without a module system (keeps `file://` working).
- **`chunk.test.html`** is a single self-contained HTML file that includes `app.js` and a small assertion runner; opening it in a browser prints PASS/FAIL per case to the page and the console. No test framework, no Node, no install (see §12.1 for the exact cases).

---

## 6. Speech Engine Module

A namespace (e.g. `const SpeechEngine = (function () { … })();`) wrapping `window.speechSynthesis`. It holds the in-flight utterance queue so utterances are not garbage-collected before their events fire.

### 6.1 Public interface

**Methods**
- `isSupported() → boolean` — `('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window)`.
- `loadVoices() → Promise<SpeechSynthesisVoice[]>` — resolves when voices are available (see §6.2).
- `getVoices() → SpeechSynthesisVoice[]` — current cached voice list.
- `speak(text, { voice, rate, pitch }) → void` — chunk, build utterances, and enqueue. Cancels any in-progress speech first (see §6.4 for the exact sequence).
- `pause() → void`, `resume() → void`, `stop() → void` (see §6.5).
- `getState() → 'idle' | 'speaking' | 'paused'` — the **engine** state machine has exactly these three states.

**State-change callbacks (set by the Controller)**
- `onstatechange(state, info)` — fired on transitions. `state ∈ {'idle','speaking','paused'}`. When `state === 'idle'`, `info.reason ∈ {'finished','stopped','error'}` so the Controller can present the right status text. ("Finished" and "Error" are **UI presentations of the idle state**, not separate engine states.)
- `onprogress(chunkIndex, chunkCount)` — fired on each chunk's `start` (`chunkIndex` is 1-based) so the Controller can show "chunk N of M".
- `onerror(reason)` — fired only for genuine, non-self-cancelled errors.
- `onvoiceschanged(voices)` — fired when the voice list is (re)populated.

Internal state: `voices[]`, `queue[]` (the utterance objects), `chunkCount`, `endedCount`, `state`, and a boolean `selfCancelled` flag used to suppress the "interrupted/canceled" error that `cancel()` can raise (§6.5).

### 6.2 Async voice loading (`voiceschanged`)

Robust pattern handling both async (Chrome/Edge) and synchronous (Safari) browsers:

1. On init, call `populateVoices()` immediately (reads `speechSynthesis.getVoices()`).
2. Register `speechSynthesis.addEventListener('voiceschanged', populateVoices)` (guarded by `typeof speechSynthesis.onvoiceschanged !== 'undefined'`).
3. `populateVoices()` is **idempotent**: it replaces the cached list and re-fires `onvoiceschanged` each time. `voiceschanged` may fire more than once, or never.
4. `loadVoices()` returns a `Promise` that **resolves only when `getVoices()` is actually non-empty, OR on a 1500 ms fallback timeout** (resolving with whatever list exists, possibly `[]`). `voiceschanged` is treated as a *re-check trigger*, **not** a resolve trigger — this avoids the Chromium race where `voiceschanged` fires while `getVoices()` is still empty and the Controller would falsely show "no voices."

The Controller never reads `getVoices()` directly at startup; it awaits `loadVoices()`.

### 6.3 Rate, pitch, volume — ranges & defaults (verified against W3C/MDN)

| Property | Engine range | Engine default | v1 UI exposure |
|---|---|---|---|
| `utterance.rate` | 0.1 – 10 (values outside strictly disallowed) | 1 | Slider **0.5 – 2.0**, step 0.1, default **1.0** |
| `utterance.pitch` | 0 – 2 inclusive | 1 | Slider **0.5 – 1.5**, step 0.1, default **1.0** |
| `utterance.volume` | 0 – 1 inclusive | 1 | **Not exposed**; left at default **1** |

The UI ranges are deliberately narrower than the engine extremes because the full ranges sound garbled/robotic for a non-expert listener. The engine applies the selected `rate`, `pitch`, and the assigned `voice` object to **every** utterance it creates. `volume` is never set.

`utterance.voice` is always assigned a real `SpeechSynthesisVoice` **object** from `getVoices()` (never a string). `utterance.lang` is set from the chosen voice's `lang` (e.g. `'en-US'`) for consistency.

### 6.4 Chunking + the exact `speak()` sequence (defeating the ~15 s Chromium cutoff)

Chromium silently cancels a single long utterance after ~15 seconds of speech (Chromium bug 679437 / 41294170), which in normal English prose lands near 200–250 characters. Because v1 uses **local voices only** (which are *not* subject to this cutoff), chunking is defense-in-depth — but it is still implemented so behavior is robust regardless of voice.

`speak(text, opts)` executes this exact sequence:

1. Compute `chunks = chunkText(text, 200)` (§9). If `chunks.length === 0`, do nothing (Play is already disabled for empty text, §8.4).
2. `const wasActive = speechSynthesis.speaking || speechSynthesis.paused;`
3. `speechSynthesis.cancel();` then, if `speechSynthesis.paused`, `speechSynthesis.resume();` (clears the wedged-paused state, §6.5).
4. Reset internal queue: `queue = []`, `endedCount = 0`, `chunkCount = chunks.length`.
5. Enqueue, wrapped in a delay **only if a cancel of active speech actually occurred** (avoids needless lag on a cold first Play):
   - `const enqueue = () => { chunks.forEach((chunk, i) => { … }); };`
   - `wasActive ? setTimeout(enqueue, 100) : enqueue();`
6. For **each** chunk `i`: create a **fresh** `new SpeechSynthesisUtterance(chunk)` (utterances are not reliably reusable across browsers), set `voice`, `rate`, `pitch`, `lang`; attach handlers (the index `i` is **captured in the closure** so progress is deterministic):
   - `utterance.onstart = () => { state='speaking'; onprogress(i + 1, chunkCount); onstatechange('speaking'); }`
   - `utterance.onend = () => { endedCount++; if (endedCount === chunkCount && !selfCancelled) { state='idle'; onstatechange('idle', {reason:'finished'}); } }`
   - `utterance.onerror = (e) => { if (selfCancelled) return; /* suppress Stop-induced */ speechSynthesis.cancel(); state='idle'; onerror(e.error); onstatechange('idle', {reason:'error'}); }`
   - `queue.push(utterance); speechSynthesis.speak(utterance);`
7. All chunks are enqueued up front; the browser's native FIFO queue plays them back-to-back for gapless playback (the engine does **not** wait for each `end` before speaking the next — that would add audible gaps).

**Completion is counted, not assumed:** the engine transitions to idle when `endedCount === chunkCount`, so a single dropped/late `end` on a non-final chunk cannot wedge the UI in "speaking" — the final chunk's `end` still completes the count. If a **genuine** error fires on any chunk, the engine cancels the rest of the queue and goes to idle with `reason:'error'`.

The pause/resume "heartbeat" hack is **not** used (fragile; breaks on Android where `pause()` ≈ `cancel()`).

### 6.5 Pause / Resume / Stop semantics

- **Pause:** `speechSynthesis.pause()`. Note `speechSynthesis.speaking` stays `true` while paused; the engine distinguishes play vs pause via `speechSynthesis.paused`. State → `paused`; `onstatechange('paused')`.
- **Resume:** `speechSynthesis.resume()`. State → `speaking`; `onstatechange('speaking')`. *Resume point is best-effort per browser (§3).*
- **Stop:** set `selfCancelled = true`; `speechSynthesis.cancel()`; clear `queue` / `endedCount` / `chunkCount`; if the engine had been paused, also call `speechSynthesis.resume()` afterward to avoid the wedged-paused-state bug where a later `speak()` silently no-ops; then state → `idle`, `onstatechange('idle', {reason:'stopped'})`; reset `selfCancelled = false` on the next tick (after the cancel-induced error/`end` has drained).
- **Self-cancel vs real error:** `cancel()` may surface an `error` with reason `interrupted`/`canceled`. While `selfCancelled` is `true`, the engine swallows it (does NOT call `onerror`). Genuine errors propagate.
- **Page unload:** the Controller registers `window.addEventListener('beforeunload', () => { try { window.speechSynthesis.cancel(); } catch (e) {} })` so speech stops on reload/close.

State backbone uses the reliable `start` / `end` / `error` events (not `pause`/`resume`/`boundary`, which are inconsistent or not Baseline).

---

## 7. File Loader

A single function, DOM-free except for `FileReader`:

```
loadTextFile(file, { maxBytes = 1_000_000 } = {}) → Promise<string>
```

**Accepted type**
- Primary gate: filename ends with `.txt` (case-insensitive: `file.name.toLowerCase().endsWith('.txt')`).
- Secondary gate: if `file.type` is non-empty, it must start with `'text/'`. An **empty** `file.type` is accepted (common and benign on Windows).
- The `<input type="file" accept=".txt,text/plain">` attribute only filters the picker UI; the loader **re-validates** in JS.

**Max size**
- Hard cap **1,000,000 bytes (~1 MB)**. If `file.size > maxBytes`, **reject before reading** (do not call `readAsText`) with `"File too large (limit ~1 MB)."` This byte cap is the **only** size guard; the resulting character count (and therefore chunk count) is intentionally unbounded — ~1 MB is far more text than anyone will listen to via TTS and decodes instantly. (Manual test 12.2 includes a near-1 MB file to confirm no UI freeze when chunking ~1 M characters.)

**Encoding**
- `reader.readAsText(file, 'UTF-8')` (UTF-8 passed explicitly).

**Normalization** (applied to `reader.result` before resolving):
- Strip a leading UTF-8 BOM: `text.replace(/^﻿/, '')`.
- Unify line endings: `text.replace(/\r\n?/g, '\n')`.

**Error handling**
- `reader.onload` → resolve with normalized text.
- `reader.onerror` → reject with `reader.error` (a `DOMException`).
- Validation failures reject with a short, friendly message.
- The Controller catches all rejections and shows the message in the status line; it never fails silently. Reading is asynchronous — `reader.result` is only consumed inside `onload`.

On success, the Controller drops the resolved text into the textarea and re-runs the empty-text check (§8.4).

---

## 8. Controller & UI

### 8.1 Controls, defaults, and ranges

| Control | Element | Default | Range / detail |
|---|---|---|---|
| Text input | `<textarea id="text">` | empty | User types/pastes; also receives loaded file contents. |
| File upload | `<input type="file" id="file" accept=".txt,text/plain">` | — | `.txt` only; validated by File Loader (§7). |
| Voice | `<select id="voice">` | platform default voice (marked "— recommended") | Populated from `getVoices()`, English-local prioritized (§8.2). |
| Speed | `<input type="range" id="rate" min="0.5" max="2" step="0.1" value="1">` | **1.0** | Maps to `utterance.rate`. |
| Pitch | `<input type="range" id="pitch" min="0.5" max="1.5" step="0.1" value="1">` | **1.0** | Maps to `utterance.pitch`. Positioned secondary to Speed. |
| Play / Pause | `<button id="playPause">` | label "Play" | One button toggles label Play ⇄ Pause (also acts as Resume when paused). **This is a deliberate consolidation of the locked "Play / Pause" controls into a single toggle**, with Stop separate — the established accessible media-control pattern. |
| Stop | `<button id="stop">` | disabled | Separate, always-distinct button. |
| Status | `<div id="status" role="status" aria-live="polite">` | "Ready" | Live region present at load (§8.4, §11). |

Each slider has an associated `<output>` showing the live value (e.g. "1.0×" for speed, "1.0" for pitch), updated on `input`.

### 8.2 Voice-list construction (deterministic, English-local prioritized)

On `loadVoices()` resolve and on every `onvoiceschanged`, the Controller **rebuilds** the `<select>` idempotently using this exact precedence:

1. **Candidate set:** start with all voices where `localService === true` (offline-safe). If that set is **empty**, fall back to *all* voices (so the dropdown is never empty even on an unusual device); network voices included in the fallback are suffixed `" (online)"`.
2. **English filter:** keep voices where `voice.lang.toLowerCase().startsWith('en')` (covers en-US, en-GB, en-AU, en-IN, …). If this yields **zero** English voices, fall back to showing all candidate voices rather than an empty dropdown.
3. **Order:** English voices first (alphabetical by display name), then any non-English fallback voices.
4. `<option>` text = `` `${voice.name} (${friendlyLang})` ``, where `friendlyLang` maps codes to accent words: `en-US → "US English"`, `en-GB → "UK English"`, `en-AU → "Australian"`, `en-IN → "Indian English"`, `en-CA → "Canadian"`, `en-IE → "Irish"`, `en-ZA → "South African"`, `en-NZ → "New Zealand"`, otherwise the raw `lang`.
5. **Default selection:** the platform default voice (`voice.default === true`) gets a `" — recommended"` suffix and is preselected on first run, **even if it is not first in the list**. On later runs, the persisted voice (§8.5) wins if it still exists.
6. `option.value = voice.voiceURI`; a JS `Map<voiceURI, voice>` resolves the selection back to the live `SpeechSynthesisVoice` object before speaking (voiceURI is more stable than name).

### 8.3 Button & status state machine

Three engine states — **idle**, **speaking**, **paused** — kept in sync from engine callbacks (`onstatechange`, `onprogress`, `onerror`), not from click handlers alone, because speech can end on its own. "Finished" and "Error" are **idle** presented with a `reason`.

| Presented state | Play/Pause button | Stop button | Status line |
|---|---|---|---|
| idle, text present | label "Play", enabled | disabled | "Ready" |
| idle, text empty | label "Play", **disabled** | disabled | "Type or paste some text to begin" |
| speaking | label "Pause", enabled | enabled | "Speaking… (chunk N of M)" |
| paused | label "Play", enabled | enabled | "Paused" |
| idle, reason `finished` | label "Play", enabled | disabled | "Finished" |
| idle, reason `stopped` | label "Play", enabled | disabled | "Ready" |
| idle, reason `error` | label "Play", enabled | disabled | "Something went wrong. Please try again." |

The Play/Pause toggle changes the **accessible name** (Play ⇄ Pause), **not** `aria-pressed` (§11). The native `disabled` attribute is used for unavailable buttons.

### 8.4 Empty-text handling & status transitions

- On every `textarea` `input` event and after a file load, the Controller computes `text.trim().length === 0`.
- If empty/whitespace-only: disable Play (native `disabled`) and set status to **"Type or paste some text to begin"**. The engine is never asked to `speak('')`.
- **Editing after a read:** any `input` event re-runs this check and **resets the status**, overriding a lingering "Finished" — to "Ready" when non-empty, or the empty-text message when empty. This closes the `finished → edit → ?` gap.

### 8.5 Persistence (localStorage) — *small addition beyond the locked control list; see §13 changelog note*

- On change of voice/rate/pitch, the Controller writes `{ voiceURI, rate, pitch }` to `localStorage` (values stored as strings; **never** the voice object — it is non-serializable and session-specific).
- On startup, after voices load, it restores `rate`/`pitch` directly and re-resolves the saved `voiceURI` to a live voice; if that voice no longer exists, it falls back to the default voice.
- All `localStorage` reads/writes are wrapped in `try/catch` because `file://` origins and private windows can throw or partition storage. On failure the app degrades to in-memory defaults and never crashes.

### 8.6 Inline hint — *small addition; see §13 note*

A small static hint near the controls: *"Tip: lower the speed for tricky text, raise it to skim."* Replaces a separate help screen for the non-expert audience.

---

## 9. The Sentence-Chunking Function

Pure, deterministic, side-effect-free (no DOM, no speech). Signature:

```
chunkText(text, maxLen = 200) → string[]
```

### 9.1 Contract (precise word-preservation invariant)

- Input: a string. Output: an array of non-empty, trimmed chunks.
- Every returned chunk satisfies `chunk.length <= maxLen`, **except** a single unbreakable token (no internal whitespace) longer than `maxLen`, which is allowed to exceed it.
- **No chunk contains a double space.**
- **Word-preservation invariant (the testable definition):** `normalizeWords(input)` deep-equals `normalizeWords(chunks.join(' '))`, where `normalizeWords(s) = s.trim().split(/\s+/).filter(Boolean)`. In words: interior whitespace is **normalized to single spaces and is not preserved**; the sequence of word tokens is preserved exactly (no loss, no duplication).
- Empty or whitespace-only input returns `[]`.

### 9.2 Algorithm — single char-by-char state-machine scan (no regex-then-rejoin)

The split decision is made **at** each terminator, before any cutting, so there is no fragile "split everything then merge back" step:

1. **Scan** the input left to right, accumulating the current sentence buffer. Track the current whitespace-delimited token as you go.
2. **Boundary test.** At a character `c`:
   - If `c` is `\n`: treat a newline (and runs of newlines / blank lines) as a **hard** sentence boundary — close the current sentence.
   - If `c` is one of `. ! ?`: it ends the current sentence **unless** it is a *protected dot* (rules below). When it ends a sentence, also consume any immediately following closing quotes/brackets (`" ' ) ]`) and trailing run of `! ?` (so `?!` and `."` stay attached), then close the sentence.
3. **Protected-dot rules** (a `.` is *not* a boundary when):
   - (a) the token immediately before the dot is in the pragmatic **ABBREVIATIONS** set (case-insensitive): `{Mr, Mrs, Ms, Dr, Prof, Sr, Jr, St, vs, etc, eg, ie, no, inc, ltd, co, U, S, A}` — common English titles, Latin abbreviations, and single capitals for initialisms like `U.S.A.`;
   - (b) it is a decimal point **between two digits** (previous char is a digit and next char is a digit), e.g. `3.14`;
   - (c) it is part of an ellipsis (`.` immediately preceded or followed by another `.`).

   These are intentionally pragmatic, **not** a full NLP tokenizer. The known tradeoff: over-protection can only *merge* two sentences into a longer run, which step 4 then hard-splits if needed — it can never **drop** a sentence. (Bare lowercase `a`/`m`/`p` are deliberately **excluded** from the set: the false-suppression of a real sentence break ending in "a." was judged worse than missing the rare `a.m.`/`p.m.` case.)
4. **Pack greedily.** Trim each closed raw sentence. Append the next sentence to the current chunk with exactly one separating space while `current.length + 1 + next.length <= maxLen`; when it would overflow, push `current` and start a new chunk with `next`. (Packing avoids one tiny utterance per short sentence, which would cause audible gaps.) Because raw sentences are trimmed first and joined with a single space, no chunk can contain a double space.
5. **Hard-split over-long sentences.** For any single sentence longer than `maxLen`: repeatedly take the substring up to `maxLen`, back up to the last whitespace within that window, and cut there; if there is no whitespace in the window (one giant token), cut at exactly `maxLen`. Continue until the remainder fits.
6. **Finalize.** Trim each chunk; drop any empty after trimming. Return the array.

The function is exposed globally (`window.chunkText`) so the test page can call it (§5, §12).

---

## 10. Error & Edge-Case Handling

| Case | Detection | Behavior |
|---|---|---|
| No `speechSynthesis` support | `!isSupported()` at startup, before wiring anything | Disable all controls; status banner: **"Sorry, your browser can't read text aloud. Please try the latest Microsoft Edge or Google Chrome."** |
| No voices found | After `loadVoices()` (1500 ms fallback included), `getVoices()` still `[]` | Status: **"No voices were found on this device. You may need to add a language/voice in Windows Settings."** Play disabled. |
| No English / no local voices | English-local filter empty | Fall back per §8.2 precedence (never an empty dropdown). |
| Bad file type | Filename not `.txt`, or non-empty `file.type` not starting with `text/` | Reject; status: **"Please choose a plain-text .txt file."** Textarea unchanged. |
| Oversized file | `file.size > 1,000,000` bytes | Reject **before** reading; status: **"File too large (limit ~1 MB)."** |
| File read error | `reader.onerror` | Reject; status: **"Could not read that file. Please try another."** |
| Empty / whitespace text | `text.trim().length === 0` on input/load | Play disabled; status: **"Type or paste some text to begin."** Engine never called with empty text. |
| Self-cancelled (Stop) | `selfCancelled` true when an `interrupted`/`canceled` error arrives | Suppress error; treat as normal Stop; status → "Ready". |
| Genuine speech error | `error` event, not self-cancelled | Cancel remaining queue; status: **"Something went wrong. Please try again."**; reset to idle. |
| Wedged paused state after Stop | Engine paused at Stop time | `cancel()` then `resume()`; self-heal `resume()` on next Play (§6.4/§6.5). |
| Speech still running on reload/close | `beforeunload` | `speechSynthesis.cancel()` in a `try/catch`. |
| Backgrounded-tab throttling | (Not engineered around) | Documented limitation in README and hint text. |

---

## 11. Accessibility Notes

- **Native controls only.** Sliders are native `<input type="range">` (keyboard support, focus styling, value announcement for free — per W3C ARIA APG, prefer native range over a hand-rolled slider).
- **Labels.** Every control has a visible, programmatically associated `<label for="…">`: textarea ("Text to read"), file input ("Upload a .txt file"), voice `<select>` ("Voice"), Speed, Pitch. Buttons have clear text labels (Play/Pause, Stop) — no icon-only buttons.
- **Slider feedback.** Each slider pairs with an `<output>` (live value for sighted users) and sets `aria-valuetext` for screen readers — e.g. `"1.2 times normal speed"`, `"pitch 1.0 (normal)"` — so announcements are meaningful, not bare numbers.
- **Status line.** A single `<div id="status" role="status" aria-live="polite">` exists in the DOM **at load** (so updates are announced) and is only mutated, never created on demand. Routine state uses polite, never assertive.
- **Play/Pause toggling.** Toggle the button's **accessible name** (Play ⇄ Pause); do **not** use `aria-pressed` (it produces confusing output like "play button off"). Stop remains separate and always distinct.
- **Disabled states.** Use the native `disabled` attribute for unavailable buttons (removes them from tab order); always pair a disabled Play with a status message explaining why.
- **Focus.** Logical tab order: text → file → voice → speed → pitch → Play/Pause → Stop → status. Focus is not stolen during playback.

---

## 12. Testing Plan

### 12.1 Automated unit test (the one required test) — `chunkText`

Self-contained `chunk.test.html`: includes `app.js`, runs assertions against `window.chunkText`, prints PASS/FAIL per case to the page and `console`. No framework, no Node.

Helper used by assertions: `normalizeWords(s) = s.trim().split(/\s+/).filter(Boolean)`.

| # | Input | Expected |
|---|---|---|
| 1 | `""` and `"   \n  "` | `[]` (both) |
| 2 | `"Hello world. How are you?"` | `["Hello world. How are you?"]` — both sentences packed into one chunk; **exactly one space** between them |
| 3 | `"Dr. Smith went home."` | one chunk; **not** split after `"Dr."` |
| 4 | `"Pi is 3.14 exactly."` | one chunk; **not** split at the decimal |
| 5 | `"It happened in the U.S.A. yesterday."` | one chunk; initialism `U.S.A.` not split into pieces |
| 6 | A 600-char string of words with no `.!?` | multiple chunks, **each `length <= 200`**, split on spaces; `normalizeWords(join)` equals input words |
| 7 | `"Line one\nLine two\nLine three"` | split at newlines into 3 logical pieces (packed if they fit under 200) |
| 8 | `"Wait... really?! Yes."` | ellipsis not treated as 3 breaks; `?!` ends a sentence |
| 9 | A sentence ending in a single capital **not** in the set, e.g. `"I gave it to B. Then I left."` | splits into 2 sentences (`B` is not an abbreviation member, so the period is a real boundary) — confirms only the listed initialism letters `U/S/A` are protected |
| 10 | Any non-empty input | **invariants:** every `chunk.length <= 200` (allow one over-length only for a single whitespace-free token); no empty chunks; **no chunk contains `"  "` (double space)**; `normalizeWords(chunks.join(' '))` deep-equals `normalizeWords(input)` |

> Note on the abbreviation set: only the single capitals `U/S/A` are protected (to keep `U.S.A.` intact). The known tradeoff is that a rare sentence ending in a lone `U.`, `S.`, or `A.` will over-merge with the next sentence; over-merging only yields a longer chunk (hard-split by step 5), never a dropped sentence. This is asserted, not hidden.

### 12.2 Manual test checklist (Edge and Chrome on Windows, run offline)

1. Double-click `index.html`; app opens, status shows "Ready".
2. Voice dropdown populates within ~1.5 s; English local voices appear first; default voice marked "— recommended" and preselected.
3. Empty textarea → Play disabled, status "Type or paste some text to begin".
4. Type a short sentence → Play enables. Click Play → status "Speaking…", button shows "Pause", Stop enabled; audio plays.
5. Pause → status "Paused", button "Play", audio stops; Resume (click Play) continues playback (exact resume point is best-effort per browser).
6. Stop mid-playback → audio stops immediately, status "Ready", Stop disabled; click Play again → plays from the start (no wedged-paused silence).
7. Paste a long multi-paragraph article (> 2000 chars) → plays gaplessly to the end without cutting off at ~15 s; status shows "chunk N of M" advancing; "Finished" at the end.
8. After "Finished", edit the textarea → status resets to "Ready" (or empty-text message if cleared).
9. Change Speed to 0.5 and 2.0; change Pitch to 0.5 and 1.5; live `<output>` updates; new playback reflects settings.
10. Switch voices mid-session and replay → new voice used; no overlapping audio.
11. Upload a valid `.txt` (incl. one with CRLF line endings and one with a BOM) → contents load cleanly; play correctly.
12. Upload a non-`.txt` file → "Please choose a plain-text .txt file." Upload a > 1 MB file → "File too large (limit ~1 MB)." (no freeze).
13. Upload a **near-1 MB** valid `.txt` → loads and begins playing without UI freeze while chunking ~1 M characters.
14. Reload mid-playback → speech stops (no runaway audio); voice/rate/pitch restored from last session.
15. Reload after a settings change → saved voice/rate/pitch restored; if a saved voice is missing, falls back to default without error.
16. (Negative path) Temporarily stub `window.speechSynthesis` as undefined → unsupported banner shows, controls disabled.
17. Re-run key steps via the `python -m http.server` fallback to confirm parity.

---

## 13. How to Run

### Normal (recommended)
1. Keep `index.html`, `style.css`, and `app.js` together in one folder.
2. **Double-click `index.html`.** It opens in your default browser (use Microsoft Edge or Google Chrome on Windows).
3. Type or paste text, or click "Upload a .txt file". Pick a voice, set speed/pitch, press **Play**. Works fully offline.

### Fallback (only if a browser blocks `file://`)
1. Open a terminal in the project folder.
2. Run: `python -m http.server 8000`
3. Open `http://localhost:8000/` in Edge or Chrome. (Stop later with `Ctrl+C`.)

### Running the test
- Double-click `chunk.test.html` and read the PASS/FAIL results on the page (and in the console via F12).

> Notes for the user: voices come from Windows and differ per machine; for full offline use the app shows only the local Microsoft voices (e.g. David, Zira, Mark). Switching to another browser tab during a long read may pause speech in Chrome.

---

## Changelog — adversarial-review findings folded in

- **Chunking rewritten as a single char-by-char state-machine scan** (§9.2) instead of a regex-then-rejoin scheme that could not deliver the claimed abbreviation/decimal protection.
- **Double-space bug fixed** (§9.1/§9.2): raw sentences are trimmed before packing and joined with exactly one space; test case 2 and an explicit "no double space" invariant added.
- **Word-preservation invariant made precise** (§9.1) via `normalizeWords`; reconciles character-exact vs word-level test expectations.
- **Network voices excluded by default** (§3, §8.2), making the slow-rate + online-voice ~15 s cutoff path unreachable in the offline app, and preventing a user from picking a voice that goes silent offline.
- **`loadVoices()` race fixed** (§6.2): resolves only on a non-empty `getVoices()` or the 1500 ms timeout — never on a bare `voiceschanged` that fires while the list is still empty.
- **Exact `speak()` sequence specified** (§6.4): `cancel → resume-if-paused → 100 ms delay only when active speech was cancelled → enqueue loop`; cold-start has no delay.
- **Completion counted, not assumed** (§6.4): idle when `endedCount === chunkCount`, so a dropped non-final `end` can't wedge "speaking"; mid-queue genuine error cancels the rest and goes to error.
- **Engine vs UI states clarified** (§6.1, §8.3): engine is idle/speaking/paused; "Finished"/"Error"/"Ready-after-Stop" are idle presented with a `reason`.
- **Abbreviations set refined** (§9.2): case-insensitive; bare lowercase `a`/`m`/`p` dropped to avoid false-suppression; tradeoff documented and tested.
- **Status `finished → edit → ?` transition closed** (§8.4); **resume softened to best-effort** (§3, §6.5, test 12.2.5); **near-1 MB file** manual test added (§7, 12.2.13).
- **Scope notes** (§8.1, §8.5, §8.6): single Play/Pause toggle marked a deliberate consolidation of the locked "Play / Pause"; localStorage persistence and the inline tip flagged as small additions beyond the locked control list (pending owner confirmation in review).
