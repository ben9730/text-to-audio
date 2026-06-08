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
