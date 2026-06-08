# 🔊 Text-to-Speech Reader

A zero-dependency, offline-friendly web app that reads English text aloud using your browser's built-in voices. Paste or upload text, pick a voice, tune the speed and pitch, and follow along as the current sentence is highlighted in sync with the audio.

**▶️ Live app: <https://ben9730.github.io/text-to-audio/>**

No installs, no accounts, no backend — just open it and listen. It also works fully offline by double-clicking the file locally.

---

## ✨ Features

- **Read any English text** — type/paste it, or upload a `.txt` file.
- **Read-along highlighting** — the current sentence lights up and auto-scrolls into view as it's spoken.
- **Voice picker** — lists your device's local English voices (offline-safe); the recommended default is pre-selected.
- **Speed & pitch** controls with live readouts.
- **Play / Pause / Stop** with a clear status line.
- **Adjustable text size** (A− / A+) for comfortable reading.
- **Automatic dark mode** that follows your Windows/OS theme.
- **Accessible** — keyboard-friendly, labeled controls, visible focus rings, `prefers-reduced-motion` respected.
- **Reading-optimized typography** — bundled [Lexend](https://www.lexend.com/) font, a typeface designed to improve reading.

---

## 🚀 How to use

### Online (easiest)
Open **<https://ben9730.github.io/text-to-audio/>** in **Microsoft Edge** or **Google Chrome**, then:

1. Type or paste text into the box — or click **Upload a .txt file**.
2. Pick a **Voice** and adjust **Speed** / **Pitch** if you like.
3. Press **Play**. Watch the current sentence highlight as it reads.
4. Use **Pause** / **Stop** as needed, and **A− / A+** to resize the text.

### Offline (double-click)
1. [Download the repository](https://github.com/ben9730/text-to-audio/archive/refs/heads/main.zip) and unzip it.
2. Keep all the files together (including the `fonts/` folder).
3. **Double-click `index.html`** — it opens in your browser and works with no internet connection.

> **Voices** come from your operating system and differ per machine. On Windows, the app shows your local Microsoft voices (e.g. David, Zira, Mark). The live and offline versions behave identically because voices are always supplied by *your* browser.

---

## 🧠 How it works

Pure client-side: plain HTML, CSS, and JavaScript with **no build step and no dependencies**. It uses the browser's [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) (`speechSynthesis`).

| File | Responsibility |
|---|---|
| `index.html` | UI markup |
| `style.css` | Styling, light/auto-dark themes, bundled Lexend `@font-face` |
| `chunk.js` | Pure sentence-chunking function (unit-tested) |
| `speech-engine.js` | Wraps `speechSynthesis`: voice loading, chunked queueing, play/pause/stop |
| `file-loader.js` | Validates and reads uploaded `.txt` files |
| `app.js` | Controller: wires the UI to the engine, builds the reading view, drives highlighting |
| `fonts/lexend.woff2` | Bundled reading font (so offline looks identical) |

Long text is split into short segments so playback never hits Chromium's ~15-second utterance cutoff, and the segments double as the units that get highlighted while reading.

---

## 🧪 Running the tests (developers)

The sentence chunker has a dependency-free unit test that runs in Node **or** the browser:

```bash
node chunk.test.js          # prints PASS/FAIL per case, exits non-zero on failure
```

Or open `chunk.test.html` in a browser to see the same results on the page. End users never need this.

---

## 🌐 Browser support

Designed and tested for **Microsoft Edge** and **Google Chrome** on Windows 10/11. Other Chromium browsers should work; voice availability and pause/resume precision vary by browser.

---

## 📄 License

Free to use. Provided as-is, without warranty.
