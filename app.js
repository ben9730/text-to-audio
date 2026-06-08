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
