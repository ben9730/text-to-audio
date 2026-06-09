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
  var generation = 0;      // bumped on each speak()/stop()/genuine error; stale callbacks no-op

  // Pause state: saved so resume() can re-enqueue remaining chunks.
  // Mobile browsers don't reliably support synth.pause()/resume(), so we
  // simulate pause by cancelling and replaying from the last known position.
  var savedChunks = [];
  var savedOpts = {};
  var pausedChunkIndex = 0;

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

  // Create utterances for `chunks` and feed them to synth.
  // `offset` is the index in savedChunks where this slice begins — used to
  // keep onprogress numbers and pausedChunkIndex consistent across resumes.
  function enqueueFrom(chunks, opts, offset, myGen) {
    queue = [];
    endedCount = offset;
    chunkCount = savedChunks.length;

    chunks.forEach(function (chunk, i) {
      var index = offset + i;
      var u = new SpeechSynthesisUtterance(chunk);
      if (opts.voice) { u.voice = opts.voice; u.lang = opts.voice.lang; }
      u.rate = (opts.rate != null) ? opts.rate : 1;
      u.pitch = (opts.pitch != null) ? opts.pitch : 1;

      u.onstart = function () {
        if (myGen !== generation) return;
        state = 'speaking';
        pausedChunkIndex = index;
        if (typeof api.onprogress === 'function') api.onprogress(index + 1, chunkCount);
        emitState();
      };
      u.onend = function () {
        if (myGen !== generation) return;
        endedCount++;
        if (endedCount === chunkCount) {
          state = 'idle';
          queue = [];
          emitState({ reason: 'finished' });
        }
      };
      u.onerror = function (e) {
        if (myGen !== generation) return;
        generation++;
        synth.cancel();
        queue = []; endedCount = 0; chunkCount = 0;
        state = 'idle';
        if (typeof api.onerror === 'function') api.onerror((e && e.error) || 'unknown');
        emitState({ reason: 'error' });
      };

      queue.push(u);
      synth.speak(u);
    });
  }

  function speak(text, opts) {
    if (!isSupported()) return;
    opts = opts || {};
    var chunks = (typeof chunkText === 'function') ? chunkText(text, 200) : [text];
    if (!chunks.length) return;

    savedChunks = chunks;
    savedOpts = opts;
    pausedChunkIndex = 0;

    var wasActive = synth.speaking || synth.paused;

    generation++;
    var myGen = generation;
    synth.cancel();
    if (synth.paused) synth.resume();

    function doEnqueue() {
      if (myGen !== generation) return;
      enqueueFrom(chunks, opts, 0, myGen);
    }

    if (wasActive) setTimeout(doEnqueue, 100); else doEnqueue();
  }

  function pause() {
    if (!isSupported() || state !== 'speaking') return;
    // Cancel is the only reliable cross-platform way to stop playback.
    // pausedChunkIndex was updated by the last onstart, so resume() can
    // re-enqueue from exactly that chunk.
    generation++;
    synth.cancel();
    if (synth.paused) synth.resume();   // clear any stuck paused state
    state = 'paused';
    emitState();
  }

  function resume() {
    if (!isSupported() || state !== 'paused') return;
    if (!savedChunks.length) return;

    var resumeChunks = savedChunks.slice(pausedChunkIndex);
    if (!resumeChunks.length) {
      state = 'idle';
      emitState({ reason: 'finished' });
      return;
    }

    generation++;
    var myGen = generation;
    state = 'speaking';
    emitState();

    enqueueFrom(resumeChunks, savedOpts, pausedChunkIndex, myGen);
  }

  function stop() {
    if (!isSupported()) return;
    generation++;
    var wasPaused = synth.paused;
    synth.cancel();
    if (wasPaused) synth.resume();   // avoid wedged-paused state (§6.5)
    queue = [];
    endedCount = 0;
    chunkCount = 0;
    savedChunks = [];
    state = 'idle';
    emitState({ reason: 'stopped' });
  }

  // Persistent voiceschanged listener (§6.2): keeps the voice list fresh for the
  // whole session, separate from loadVoices()'s temporary one.
  if (synth && synth.addEventListener) {
    synth.addEventListener('voiceschanged', populateVoices);
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
