(() => {
  'use strict';

  const form = document.getElementById('translation-form');
  if (!form) return;

  const input = document.getElementById('source-text');
  const language = document.getElementById('source-language');
  const translateButton = document.getElementById('translate-button');
  const status = document.getElementById('app-status');
  const phraseChips = document.getElementById('phrase-chips');
  const resultCard = document.getElementById('result-card');
  const devaOutput = document.getElementById('result-devanagari');
  const iastOutput = document.getElementById('result-iast');
  const sourceOutput = document.getElementById('translation-source');
  const accentMeta = document.getElementById('accent-meta');
  const syllableStrip = document.getElementById('syllable-strip');
  const pitchChart = document.getElementById('pitch-chart');
  const playButton = document.getElementById('play-button');
  const stopButton = document.getElementById('stop-button');
  const accentToggle = document.getElementById('accent-toggle');
  const roomToggle = document.getElementById('room-toggle');
  const droneToggle = document.getElementById('drone-toggle');
  const melodyTitle = document.getElementById('melody-title');
  const downloadButton = document.getElementById('download-button');
  const shareButton = document.getElementById('share-button');
  const voiceStatus = document.getElementById('voice-status');

  let currentAnalysis = null;
  let requestNumber = 0;
  let speaking = false;
  let activeSpeechRun = null;

  function setStatus(message, state = '') {
    status.textContent = message;
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  }

  function setVoiceStatus(message) {
    voiceStatus.textContent = message || '';
  }

  function initEmbers() {
    const canvas = document.getElementById('ember-canvas');
    const hero = canvas && canvas.closest('.speak-hero');
    if (!canvas || !hero) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const particles = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = false;
    let inView = true;
    const palette = ['255, 138, 61', '255, 191, 94', '255, 77, 46', '245, 199, 107'];

    function resize() {
      const rect = hero.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(64, Math.max(24, Math.round(width / 13)));
      particles.length = 0;
      for (let i = 0; i < count; i += 1) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: .7 + Math.random() * 1.9,
          speed: .12 + Math.random() * .47,
          drift: (Math.random() - .5) * .28,
          alpha: .18 + Math.random() * .56,
          phase: Math.random() * Math.PI * 2,
          color: palette[Math.floor(Math.random() * palette.length)]
        });
      }
      if (reducedMotion) draw(true);
    }

    function draw(staticFrame = false) {
      context.clearRect(0, 0, width, height);
      particles.forEach((particle) => {
        const shimmer = staticFrame ? .6 : .63 + Math.sin(particle.phase) * .28;
        context.beginPath();
        context.fillStyle = `rgba(${particle.color}, ${particle.alpha * shimmer})`;
        context.shadowColor = `rgba(${particle.color}, .65)`;
        context.shadowBlur = particle.radius * 5;
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
        if (!staticFrame) {
          particle.y -= particle.speed;
          particle.x += particle.drift + Math.sin(particle.phase) * .12;
          particle.phase += .018;
          if (particle.y < -5) {
            particle.y = height + 5;
            particle.x = Math.random() * width;
          }
          if (particle.x < -5) particle.x = width + 5;
          if (particle.x > width + 5) particle.x = -5;
        }
      });
      context.shadowBlur = 0;
    }

    function tick() {
      if (!running) return;
      draw();
      frame = window.requestAnimationFrame(tick);
    }

    function updateRunning() {
      const shouldRun = !reducedMotion && inView && !document.hidden && !document.body.classList.contains('is-speaking');
      if (shouldRun && !running) {
        running = true;
        frame = window.requestAnimationFrame(tick);
      } else if (!shouldRun && running) {
        running = false;
        window.cancelAnimationFrame(frame);
      }
    }

    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', updateRunning);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        updateRunning();
      }, { threshold: 0 });
      observer.observe(hero);
    }
    resize();
    updateRunning();
    window.__emberUpdate = updateRunning;
  }

  function renderPhrases() {
    const phrases = window.Translate && Array.isArray(window.Translate.phrases) ? window.Translate.phrases : [];
    phraseChips.replaceChildren();
    phrases.slice(0, 20).forEach((phrase) => {
      if (!phrase || typeof phrase.en !== 'string' || typeof phrase.deva !== 'string') return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'phrase-chip';
      chip.textContent = phrase.en;
      chip.title = phrase.tag || phrase.deva;
      chip.addEventListener('click', () => {
        input.value = phrase.en;
        input.focus();
        form.requestSubmit();
      });
      phraseChips.append(chip);
    });
  }

  function flattenSyllables(analysis) {
    const syllables = [];
    (Array.isArray(analysis.words) ? analysis.words : []).forEach((word, wordIndex) => {
      (Array.isArray(word.syllables) ? word.syllables : []).forEach((syllable, syllableIndex) => {
        syllables.push({
          wordIndex,
          syllableIndex,
          deva: syllable.deva || '',
          iast: syllable.iast || '',
          tone: ['U', 'A', 'S', 'P'].includes(syllable.tone) ? syllable.tone : 'P'
        });
      });
    });
    return syllables;
  }

  // (Tab) v2: the chart is drawn on the real time axis of the audio; the curve is the measured pitch of what you hear.
  const SVGNS = 'http://www.w3.org/2000/svg';
  let chartInfo = null;
  function svgAdd(name, attrs, parent = pitchChart) {
    const node = document.createElementNS(SVGNS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    parent.append(node);
    return node;
  }
  const TONE_ST = { U: 1.6, P: 1.0, A: -1.0, S: 0.6 };
  function drawPitch(syllables, info) {
    pitchChart.replaceChildren();
    chartInfo = null;
    [24, 64, 104].forEach((y) => svgAdd('line', { x1: 0, y1: y, x2: 1000, y2: y, class: 'pitch-grid-line' }));
    if (!syllables.length) return;
    const X0 = 20, X1 = 980;
    let dur, syl, f0;
    if (info && info.syl && info.syl.length === syllables.length) {
      dur = info.dur; syl = info.syl; f0 = info.f0;
      if (melodyTitle) melodyTitle.textContent = 'Pitch of the voice, as heard';
    } else {
      dur = syllables.length; syl = syllables.map((_, i) => [i + 0.1, i + 0.9]); f0 = null;
      if (melodyTitle) melodyTitle.textContent = 'Accent pattern (exact curve appears when it plays)';
    }
    const xOf = (t) => X0 + (X1 - X0) * Math.max(0, Math.min(1, t / dur));
    const yOf = (st) => 64 - Math.max(-5, Math.min(5, st)) * 10;
    // syllable bands with their tone letters
    syl.forEach(([a, b], i) => {
      const g = svgAdd('g', { 'data-point': i, class: 'pitch-syl' });
      svgAdd('rect', { x: xOf(a), y: 8, width: Math.max(2, xOf(b) - xOf(a)), height: 112, rx: 4, class: 'pitch-band', 'data-tone': syllables[i].tone }, g);
    });
    let d = '';
    if (f0 && f0.st) {
      // measured pitch, smoothed, gaps where the voice is unvoiced
      const pts = f0.st.map((v, k) => (v == null ? null : [f0.t0 + k / f0.rate, v]));
      let pen = false;
      pts.forEach((p, k) => {
        if (!p) { pen = false; return; }
        const prev = pts[k - 1], next = pts[k + 1];
        const v = [prev, p, next].filter(Boolean).reduce((s, q) => s + q[1], 0) / [prev, p, next].filter(Boolean).length;
        d += (pen ? ' L ' : ' M ') + xOf(p[0]).toFixed(1) + ' ' + yOf(v).toFixed(1);
        pen = true;
      });
    } else {
      syl.forEach(([a, b], i) => {
        const t = syllables[i].tone;
        const v0 = t === 'S' ? 2.0 : TONE_ST[t] || 0, v1 = t === 'S' ? -0.8 : v0;
        d += (i ? ' L ' : 'M ') + xOf(a + 0.15 * (b - a)).toFixed(1) + ' ' + yOf(v0) + ' L ' + xOf(b - 0.15 * (b - a)).toFixed(1) + ' ' + yOf(v1);
      });
    }
    svgAdd('path', { d, class: 'pitch-contour' });
    svgAdd('line', { x1: X0, y1: 8, x2: X0, y2: 120, class: 'pitch-cursor', id: 'pitch-cursor', opacity: 0 });
    chartInfo = { xOf, dur, real: !!f0 };
  }
  function moveCursor(t) {
    if (!chartInfo || !chartInfo.real) return;
    const cur = pitchChart.querySelector('#pitch-cursor');
    if (!cur) return;
    const x = chartInfo.xOf(t).toFixed(1);
    cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.setAttribute('opacity', 1);
  }
  function setActiveSyllable(index) {
    syllableStrip.querySelectorAll('.syllable-pill').forEach((pill, pillIndex) => pill.classList.toggle('is-active', pillIndex === index));
    pitchChart.querySelectorAll('.pitch-syl').forEach((g) => g.classList.toggle('is-current', Number(g.dataset.point) === index));
  }
  function clearActive() {
    setActiveSyllable(-1);
    const cur = pitchChart.querySelector('#pitch-cursor');
    if (cur) cur.setAttribute('opacity', 0);
  }

  let syllablesForCurrent = [];
  function renderAnalysis(analysis, translation) {
    currentAnalysis = analysis;
    syllablesForCurrent = flattenSyllables(analysis);
    devaOutput.textContent = analysis.devaAccented || translation.deva;
    iastOutput.textContent = analysis.iast || '';
    sourceOutput.textContent = translation.via === 'live' ? 'via live translation' : 'via phrasebook';
    const sources = new Set((analysis.words || []).map((word) => word.accentSource).filter(Boolean));
    accentMeta.replaceChildren();
    if (sources.size === 0) sources.add('unaccented');
    sources.forEach((source) => {
      const chip = document.createElement('span');
      chip.className = 'meta-chip';
      chip.dataset.kind = source;
      chip.textContent = source === 'text' ? 'accent marks from the Rigveda' : source === 'lexicon' ? 'accent from lexicon' : source === 'rule' ? 'accent by rule' : 'unaccented word';
      accentMeta.append(chip);
    });
    syllableStrip.replaceChildren();
    syllablesForCurrent.forEach((syllable) => {
      const pill = document.createElement('span');
      pill.className = 'syllable-pill';
      pill.dataset.tone = syllable.tone;
      pill.append(document.createTextNode(syllable.deva || syllable.iast));
      const label = document.createElement('small');
      label.textContent = syllable.tone;
      pill.append(label);
      syllableStrip.append(pill);
    });
    drawPitch(syllablesForCurrent);
    if (window.Voice && window.Voice.lookup) {
      const forAnalysis = analysis;
      window.Voice.lookup(analysis).then((clip) => {
        if (!clip || currentAnalysis !== forAnalysis) return;
        drawPitch(syllablesForCurrent, { dur: clip.dur, syl: clip.syl, f0: accentToggle.checked ? clip.f0_acc : clip.f0_plain });
      }).catch(() => {});
    }
      playButton.disabled = false;
      stopButton.disabled = true;
      downloadButton.disabled = true;
    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }

  async function translateAndRender() {
    const text = input.value.trim();
    if (!text) {
      setStatus('Enter a phrase, or choose one from the phrasebook.', 'error');
      input.focus();
      return;
    }
    if (!window.Translate || typeof window.Translate.toSanskrit !== 'function' || !window.Vedic || typeof window.Vedic.analyze !== 'function') {
      setStatus('The Sanskrit translation or accent module could not be loaded. Check that its script is available beside this page.', 'error');
      return;
    }
    const thisRequest = ++requestNumber;
    translateButton.disabled = true;
    translateButton.querySelector('span:nth-child(2)').textContent = 'Finding the words…';
    setStatus('Translating, then estimating the Vedic accents…', 'loading');
    setVoiceStatus('');
    try {
      const translation = await window.Translate.toSanskrit(text, language.value);
      if (thisRequest !== requestNumber) return;
      if (!translation || typeof translation.deva !== 'string' || !translation.deva.trim()) throw new Error('The translator returned no Sanskrit text. Try another phrase.');
      const analysis = window.Vedic.analyze(translation.deva);
      if (!analysis || typeof analysis !== 'object') throw new Error('The accent analyzer returned no result.');
      renderAnalysis(analysis, translation);
      setStatus(translation.note || 'The Sanskrit and pitch contour are ready.', '');
    } catch (error) {
      if (thisRequest === requestNumber) setStatus(error && error.message ? error.message : 'This phrase could not be translated. Try a shorter phrase.', 'error');
    } finally {
      if (thisRequest === requestNumber) {
        translateButton.disabled = false;
        translateButton.querySelector('span:nth-child(2)').textContent = 'Speak it in Vedic';
      }
    }
  }

  async function play() {
    if (!currentAnalysis || !window.Voice || typeof window.Voice.speak !== 'function') {
      setVoiceStatus('The voice module is not available yet.');
      return;
    }
    speaking = true;
    playButton.disabled = true;
    stopButton.disabled = false;
    downloadButton.disabled = true;
    setVoiceStatus('Preparing the voice…');
    window.Voice.onstatus = (message) => setVoiceStatus(message || '');
    const speechRun = Symbol('speech-run');
    activeSpeechRun = speechRun;
    try {
      document.body.classList.add('is-speaking');
      if (window.__emberUpdate) window.__emberUpdate();
      await window.Voice.speak(currentAnalysis, {
        accent: accentToggle.checked,
        room: roomToggle.checked,
        drone: droneToggle.checked,
        onReady: (info) => drawPitch(syllablesForCurrent, info),
        onFrame: (t) => moveCursor(t),
        onSyllable: setActiveSyllable
      });
      if (activeSpeechRun === speechRun) setVoiceStatus('');
    } catch (error) {
      if (activeSpeechRun === speechRun) setVoiceStatus(error && error.message ? error.message : 'The voice could not finish. Try again.');
    } finally {
      if (activeSpeechRun === speechRun) {
        activeSpeechRun = null;
        speaking = false;
        playButton.disabled = !currentAnalysis;
        stopButton.disabled = true;
        downloadButton.disabled = !(window.Voice && window.Voice.lastBlob);
        clearActive();
        document.body.classList.remove('is-speaking');
        if (window.__emberUpdate) window.__emberUpdate();
      }
    }
  }

  function stop() {
    if (!speaking || !window.Voice) return;
    activeSpeechRun = null;
    window.Voice.stop();
    speaking = false;
    downloadButton.disabled = !(window.Voice && window.Voice.lastBlob);
    setVoiceStatus('Recitation stopped.');
    stopButton.disabled = true;
    playButton.disabled = !currentAnalysis;
    clearActive();
    document.body.classList.remove('is-speaking');
    if (window.__emberUpdate) window.__emberUpdate();
  }

  function download() {
    const blob = window.Voice && window.Voice.lastBlob;
    if (!(blob instanceof Blob)) {
      setVoiceStatus('Press Play first, then download.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'vedic-sanskrit.wav';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function share() {
    const blob = window.Voice && window.Voice.lastBlob;
    const file = blob instanceof Blob ? new File([blob], 'vedic.wav', { type: blob.type || 'audio/wav' }) : null;
    try {
      if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: 'A Vedic Sanskrit reconstruction', text: iastOutput.textContent, files: [file] });
        setVoiceStatus('Audio shared.');
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: 'Dead Language Live', text: 'A scholarly best-guess reconstruction of Vedic Sanskrit.', url: window.location.href });
        setVoiceStatus('Link shared.');
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        setVoiceStatus('Page link copied.');
      } else {
        setVoiceStatus('Sharing is not available in this browser.');
      }
    } catch (error) {
      if (error && error.name !== 'AbortError') setVoiceStatus('The share could not be completed.');
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (window.Voice && window.Voice.unlock) window.Voice.unlock(); // (Tab) allow audio on phones
    translateAndRender().then(() => { if (currentAnalysis) play(); }); // (Tab) speak right after translating
  });
  playButton.addEventListener('click', play);
  accentToggle.addEventListener('change', () => { if (currentAnalysis) { drawPitch(syllablesForCurrent); window.Voice && window.Voice.lookup && window.Voice.lookup(currentAnalysis).then((clip) => { if (clip) drawPitch(syllablesForCurrent, { dur: clip.dur, syl: clip.syl, f0: accentToggle.checked ? clip.f0_acc : clip.f0_plain }); }); } });
  stopButton.addEventListener('click', stop);
  downloadButton.addEventListener('click', download);
  shareButton.addEventListener('click', share);
  renderPhrases();
  initEmbers();
})();

// (Tab) warm the voice engine shortly after load
setTimeout(() => { try { window.Voice && window.Voice.preload && window.Voice.preload().catch(() => {}); } catch (e) {} }, 1500);
