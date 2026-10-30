/* voice.js — Dead Language Live voice (v2).
   Clear human-sounding voice first, Vedic accent second.
   • Phrasebook + Rigveda lines: pre-rendered studio-clean recordings of a neural Sanskrit reading voice, with a gentle
     Vedic pitch contour applied offline (Praat PSOLA, ±1–2 semitones, smooth glides) and syllable timings from
     forced alignment (MMS). Highlight + pitch cursor follow the real audio clock.
   • Your own words: a natural Hindi neural voice reads the Sanskrit live; syllable timings are measured from the
     audio (energy valleys + proportional fit), and the same gentle contour is applied in the browser.
   Room echo and drone are optional and off by default. Exposes window.Voice. */
(function (root) {
  'use strict';
  var CLIP_BASE = root.DLL_CLIP_BASE || 'https://dll-voice2.sites.tab.bot/a/';
  var GENTLE = { U: 1.6, P: 1.0, A: -1.0, sannatara: -1.5, S: [2.0, -0.8] };
  var clips = null, clipsReady = null, ctx = null, current = null, rafId = 0;
  var Voice = { engines: [{ id: 'clear', label: 'Clear voice' }], lastBlob: null, onstatus: null, current: null };

  function status(m) { if (typeof Voice.onstatus === 'function') Voice.onstatus(m); }
  function plain(s) { return String(s || '').normalize('NFC').replace(/[\u0951\u0952\u1CD0-\u1CFF]/g, '').replace(/[।॥|.,!?\s]+/g, ''); }
  function loadClips() {
    if (!clipsReady) clipsReady = fetch('clips.json?v=3').then(function (r) { return r.ok ? r.json() : { clips: {} }; })
      .then(function (j) { clips = {}; Object.keys(j.clips || {}).forEach(function (id) { var c = j.clips[id]; c.id = id; clips[plain(c.deva)] = c; }); return clips; })
      .catch(function () { clips = {}; return clips; });
    return clipsReady;
  }
  function audioCtx() {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!ctx) ctx = new AC({ latencyHint: 'interactive' });
    return ctx;
  }
  Voice.unlock = function () { try { var c = audioCtx(); if (c.state === 'suspended') c.resume(); var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {} };
  Voice.preload = function () { return loadClips(); };
  function decode(ab) { var c = audioCtx(); return new Promise(function (res, rej) { var p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }); }
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('The voice took too long to answer. Try again.')); }, ms); })]); }

  function flat(analysis) { var out = []; (analysis.words || []).forEach(function (w, wi) { (w.syllables || []).forEach(function (s, si) { out.push({ wi: wi, si: si, deva: s.deva, slp: s.slp || [], tone: s.tone, sannatara: !!s.sannatara, wordEnd: si === w.syllables.length - 1 }); }); }); return out; }
  function analysisDeva(analysis) { return (analysis.words || []).map(function (w) { return w.deva; }).join(' '); }

  // ---------- pitch analysis (autocorrelation) ----------
  function analysePitch(x, sr, hopS) {
    var hop = Math.round(sr * (hopS || 0.01)), win = Math.round(sr * 0.03), minLag = Math.floor(sr / 420), maxLag = Math.ceil(sr / 65);
    var f0 = [], n = Math.floor((x.length - win - maxLag) / hop), gmax = 0, i;
    for (i = 0; i < x.length; i++) gmax = Math.max(gmax, Math.abs(x[i]));
    for (var f = 0; f < Math.max(0, n); f++) {
      var o = f * hop, e0 = 0;
      for (i = 0; i < win; i++) e0 += x[o + i] * x[o + i];
      if (Math.sqrt(e0 / win) < gmax * 0.03) { f0.push(0); continue; }
      var best = 0, bestLag = 0;
      for (var lag = minLag; lag <= maxLag; lag++) {
        var s = 0, e1 = 0;
        for (i = 0; i < win; i += 2) { var b = x[o + i + lag]; s += x[o + i] * b; e1 += b * b; }
        var r = s / Math.sqrt(e0 * 0.5 * e1 + 1e-12);
        if (r > best) { best = r; bestLag = lag; }
      }
      f0.push(best > 0.55 ? sr / bestLag : 0);
    }
    var sm = f0.slice();
    for (f = 2; f < f0.length - 2; f++) { var w5 = [f0[f - 2], f0[f - 1], f0[f], f0[f + 1], f0[f + 2]].sort(function (a, b) { return a - b; }); sm[f] = w5[2]; }
    return { f0: sm, hop: hop };
  }
  function pitchMarks(x, sr, pa) {
    var marks = [], hop = pa.hop, f0 = pa.f0, t = 0, N = x.length;
    function f0At(i) { var k = Math.min(f0.length - 1, Math.max(0, Math.round(i / hop))); return f0[k]; }
    while (t < N) {
      var f = f0At(t);
      if (!f) { marks.push({ t: t, p: Math.round(sr * 0.006), v: false }); t += Math.round(sr * 0.006); continue; }
      var P = sr / f, lo, hi;
      if (marks.length && marks[marks.length - 1].v) { lo = Math.round(t - 0.25 * P); hi = Math.round(t + 0.25 * P); } else { lo = t; hi = Math.round(t + P); }
      var best = lo, bv = -1e9;
      for (var i = Math.max(0, lo); i < Math.min(N, hi); i++) if (x[i] > bv) { bv = x[i]; best = i; }
      marks.push({ t: best, p: Math.round(P), v: true });
      t = Math.round(best + P);
    }
    return marks;
  }
  // TD-PSOLA with a smooth semitone curve; timing unchanged.
  function psola(x, sr, semis, pa) {
    var marks = pitchMarks(x, sr, pa), N = x.length, out = new Float32Array(N), norm = new Float32Array(N);
    var mi = 0, ts = marks.length ? marks[0].t : 0;
    while (ts < N && marks.length) {
      while (mi < marks.length - 1 && Math.abs(marks[mi + 1].t - ts) <= Math.abs(marks[mi].t - ts)) mi++;
      var m = marks[mi], P = Math.max(16, m.p), r = m.v ? Math.pow(2, semis(ts / sr) / 12) : 1;
      for (var k = -P; k < P; k++) {
        var src = m.t + k, dst = ts + k; if (src < 0 || src >= N || dst < 0 || dst >= N) continue;
        var w = 0.5 - 0.5 * Math.cos(Math.PI * (k + P) / P);
        out[dst] += x[src] * w; norm[dst] += w;
      }
      ts += Math.max(8, Math.round(P / r));
    }
    for (var i = 0; i < N; i++) if (norm[i] > 0.15) out[i] /= norm[i]; else out[i] = x[i];
    return out;
  }
  function f0Semis(x, sr) {
    var pa = analysePitch(x, sr, 0.02), v = pa.f0.filter(function (f) { return f > 0; }).sort(function (a, b) { return a - b; });
    var med = v.length ? v[Math.floor(v.length / 2)] : 120;
    return { t0: 0.015, rate: 50, st: pa.f0.map(function (f) { return f > 0 ? Math.round(120 * Math.log(f / med) / Math.LN2) / 10 : null; }) };
  }

  // ---------- timing for live audio: proportional fit + snap to energy valleys ----------
  var LONG = 'AIUFXeEoO';
  function weight(s) {
    var w = 1, u = s.slp, vow = 0;
    u.forEach(function (c) { if ('aAiIuUfFxXeEoO'.indexOf(c) >= 0) { vow++; if (LONG.indexOf(c) >= 0) w += 0.55; } else if (c === 'M' || c === 'H') w += 0.35; else w += 0.18; });
    if (s.wordEnd) w += 0.15;
    return w;
  }
  function envelope(x, sr) { var hop = Math.round(sr * 0.01), n = Math.floor(x.length / hop), e = new Float32Array(n); for (var f = 0; f < n; f++) { var s = 0; for (var i = 0; i < hop; i++) { var v = x[f * hop + i]; s += v * v; } e[f] = 10 * Math.log(s / hop + 1e-10) / Math.LN10; } return e; }
  function measureTiming(x, sr, syl) {
    var e = envelope(x, sr), n = e.length, mx = -200, f;
    for (f = 0; f < n; f++) mx = Math.max(mx, e[f]);
    var th = mx - 32, speech = []; for (f = 0; f < n; f++) speech.push(e[f] > th);
    // pauses ≥ 150 ms inside the speech span
    var first = speech.indexOf(true), last = speech.lastIndexOf(true); if (first < 0) { first = 0; last = n - 1; }
    var runs = [], st = -1;
    for (f = first; f <= last; f++) { if (!speech[f] && st < 0) st = f; if (speech[f] && st >= 0) { if (f - st >= 15) runs.push([st, f]); st = -1; } }
    // voiced time axis skipping pauses
    var segs = [], a = first; runs.forEach(function (r) { segs.push([a, r[0]]); a = r[1]; }); segs.push([a, last + 1]);
    var total = segs.reduce(function (s, g) { return s + g[1] - g[0]; }, 0);
    var ws = syl.map(weight), W = ws.reduce(function (s, w) { return s + w; }, 0);
    // word-boundary candidates for pauses: put each pause at the word boundary whose cumulative share is nearest
    var cum = 0, cumAt = []; ws.forEach(function (w, i) { cumAt.push(cum / W); cum += w; });
    var segShare = [], acc = 0; segs.forEach(function (g) { acc += (g[1] - g[0]); segShare.push(acc / total); });
    var breakAt = [], used = {};
    segShare.slice(0, -1).forEach(function (share) {
      var best = -1, bd = 9;
      for (var i = 1; i < syl.length; i++) if (syl[i - 1].wordEnd && !used[i] && Math.abs(cumAt[i] - share) < bd) { bd = Math.abs(cumAt[i] - share); best = i; }
      if (best < 0 || bd > 0.18) best = -1; else used[best] = 1; breakAt.push(best);
    });
    // build groups of syllables per segment (fall back to pure proportional if a pause found no word boundary)
    var ok = breakAt.every(function (b) { return b > 0; }) && breakAt.every(function (b, i) { return i === 0 || b > breakAt[i - 1]; });
    var times = new Array(syl.length);
    function place(i0, i1, f0, f1) { var sw = 0, k; for (k = i0; k < i1; k++) sw += ws[k]; var t = f0; for (k = i0; k < i1; k++) { var d = (f1 - f0) * ws[k] / sw; times[k] = [t, t + d]; t += d; } }
    if (ok) { var bounds = [0].concat(breakAt, [syl.length]); segs.forEach(function (g, gi) { place(bounds[gi], bounds[gi + 1], g[0], g[1]); }); }
    else { // proportional over voiced axis
      var mapT = function (u) { var rem = u * total; for (var gi = 0; gi < segs.length; gi++) { var L = segs[gi][1] - segs[gi][0]; if (rem <= L) return segs[gi][0] + rem; rem -= L; } return last; };
      var c2 = 0; ws.forEach(function (w, i) { times[i] = [mapT(c2 / W), mapT((c2 + w) / W)]; c2 += w; });
    }
    // snap inner boundaries to the deepest energy valley within ±6 frames
    for (var i = 1; i < syl.length; i++) {
      if (times[i][0] - times[i - 1][1] > 2) continue; // already separated by a pause
      var b = Math.round(times[i][0]), bb = b, bv = 1e9;
      for (var k = Math.max(Math.round(times[i - 1][0]) + 3, b - 6); k <= Math.min(Math.round(times[i][1]) - 3, b + 6); k++) if (k >= 0 && k < n && e[k] < bv) { bv = e[k]; bb = k; }
      times[i - 1][1] = bb; times[i][0] = bb;
    }
    return times.map(function (t) { return [t[0] / 100, t[1] / 100]; });
  }
  function contour(syl, times, g) {
    var pts = [];
    syl.forEach(function (s, i) {
      var a = times[i][0], b = times[i][1], d = b - a, v;
      if (s.tone === 'S') { pts.push([a + 0.15 * d, g.S[0]], [b - 0.1 * d, g.S[1]]); return; }
      v = (s.tone === 'A' && s.sannatara) ? g.sannatara : (g[s.tone] || 0);
      pts.push([a + 0.2 * d, v], [b - 0.2 * d, v]);
    });
    return function (t) {
      if (!pts.length) return 0; if (t <= pts[0][0]) return pts[0][1]; if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
      for (var i = 1; i < pts.length; i++) if (t <= pts[i][0]) { var p = pts[i - 1], q = pts[i], u = (t - p[0]) / Math.max(1e-4, q[0] - p[0]); u = u * u * (3 - 2 * u); return p[1] + (q[1] - p[1]) * u; }
      return 0;
    };
  }

  // ---------- live voice (any text) ----------
  function chunks(text) {
    var parts = text.split(/(?<=[।॥])\s*/), out = [];
    parts.forEach(function (p) { p = p.trim(); while (p.length > 180) { var cut = p.lastIndexOf(' ', 180); if (cut < 40) cut = 180; out.push(p.slice(0, cut)); p = p.slice(cut).trim(); } if (p) out.push(p); });
    return out;
  }
  function liveRender(analysis, opts) {
    var text = (analysis.words || []).map(function (w) { return w.deva; }).join(' ');
    var list = chunks(text);
    status('Speaking it live…');
    return Promise.all(list.map(function (q) {
      return withTimeout(fetch('/api/tts?tl=hi&q=' + encodeURIComponent(q)), 15000).then(function (r) { if (!r.ok) throw new Error('The live voice is unreachable right now. Try a phrase from the list.'); return r.arrayBuffer(); }).then(decode);
    })).then(function (bufs) {
      var sr = bufs[0].sampleRate, gap = Math.round(sr * 0.3), len = gap, i;
      bufs.forEach(function (b) { len += b.length + gap; });
      var x = new Float32Array(len), o = Math.round(sr * 0.15);
      bufs.forEach(function (b) { x.set(b.getChannelData(0), o); o += b.length + gap; });
      x = trimPad(x, sr);
      var syl = flat(analysis), times = measureTiming(x, sr, syl);
      var y = x;
      if (opts.accent !== false) { var pa = analysePitch(x, sr, 0.005); y = psola(x, sr, contour(syl, times, GENTLE), pa); }
      var pk = 0; for (var k = 0; k < y.length; k++) pk = Math.max(pk, Math.abs(y[k]));
      if (pk > 0) { var gn = 0.89 / pk; for (k = 0; k < y.length; k++) y[k] *= gn; }
      return { pcm: y, sr: sr, syl: times, f0: f0Semis(y, sr), source: 'live' };
    });
  }
  function trimPad(x, sr) {
    var e = envelope(x, sr), mx = -200, f; for (f = 0; f < e.length; f++) mx = Math.max(mx, e[f]);
    var a = 0, b = e.length - 1; while (a < e.length && e[a] < mx - 45) a++; while (b > a && e[b] < mx - 45) b--;
    var hop = Math.round(sr * 0.01), s0 = Math.max(0, a * hop - Math.round(sr * 0.04)), s1 = Math.min(x.length, (b + 3) * hop);
    var out = new Float32Array(Math.round(sr * 0.12) + (s1 - s0) + Math.round(sr * 0.45));
    out.set(x.subarray(s0, s1), Math.round(sr * 0.12)); return out;
  }

  // ---------- pre-rendered clip ----------
  function clipRender(clip, opts) {
    var v = opts.accent === false ? 'plain' : 'acc';
    status('Loading the voice…');
    return withTimeout(fetch(CLIP_BASE + clip.id + '_' + v + '.mp3'), 15000).then(function (r) { if (!r.ok) throw new Error('The recording could not load. Check your connection and try again.'); return r.arrayBuffer(); })
      .then(decode).then(function (b) { return { pcm: b.getChannelData(0), sr: b.sampleRate, syl: clip.syl, f0: clip['f0_' + v], source: 'clip' }; });
  }
  Voice.prepare = function (analysis, opts) {
    opts = opts || {};
    return loadClips().then(function () {
      var clip = clips[plain(analysisDeva(analysis))];
      return clip ? clipRender(clip, opts) : liveRender(analysis, opts);
    });
  };
  Voice.lookup = function (analysis) { return loadClips().then(function () { return clips[plain(analysisDeva(analysis))] || null; }); };

  // ---------- playback with an exact clock ----------
  function roomIR(c) { var len = Math.round(c.sampleRate * 0.5), b = c.createBuffer(2, len, c.sampleRate); for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4) * (i < 200 ? i / 200 : 1); } return b; }
  Voice.speak = function (analysis, opts) {
    opts = opts || {};
    Voice.stop();
    var c = audioCtx(); if (c.state === 'suspended') c.resume();
    var run = {}; current = run;
    return Voice.prepare(analysis, opts).then(function (r) {
      if (current !== run) return;
      var buf = c.createBuffer(1, r.pcm.length, r.sr); buf.getChannelData(0).set(r.pcm);
      Voice.lastBlob = toWav(r.pcm, r.sr);
      var src = c.createBufferSource(); src.buffer = buf;
      var master = c.createGain(); master.gain.value = 0.95; master.connect(c.destination);
      src.connect(master);
      var nodes = [src];
      if (opts.room) { var conv = c.createConvolver(); conv.buffer = roomIR(c); var wet = c.createGain(); wet.gain.value = 0.14; src.connect(conv); conv.connect(wet); wet.connect(master); nodes.push(conv); }
      var dur = r.pcm.length / r.sr, t0 = c.currentTime + 0.08;
      if (opts.drone) {
        var med = 110, g = c.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.025, t0, 0.4); g.gain.setTargetAtTime(0, t0 + dur - 0.2, 0.3); g.connect(master);
        [med / 2, med * 0.75].forEach(function (hz) { var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = hz; o.connect(g); o.start(t0); o.stop(t0 + dur + 1); nodes.push(o); });
      }
      src.start(t0);
      run.info = { dur: dur, syl: r.syl, f0: r.f0, source: r.source };
      if (typeof opts.onReady === 'function') opts.onReady(run.info);
      status(r.source === 'clip' ? 'Playing the recording.' : 'Playing your words (live voice).');
      var lat = (c.outputLatency || c.baseLatency || 0);
      return new Promise(function (resolve) {
        var lastIdx = -2;
        function frame() {
          if (current !== run) { resolve(); return; }
          var t = c.currentTime - t0 - lat;
          var idx = -1; for (var i = 0; i < r.syl.length; i++) if (t >= r.syl[i][0] - 0.02 && t < (r.syl[i + 1] ? Math.min(r.syl[i + 1][0], r.syl[i][1] + 0.25) : r.syl[i][1] + 0.15)) { idx = i; break; }
          if (typeof opts.onFrame === 'function') opts.onFrame(Math.max(0, t), idx, run.info);
          if (idx !== lastIdx) { lastIdx = idx; if (typeof opts.onSyllable === 'function') opts.onSyllable(idx); }
          if (t > dur + 0.05) { current = null; resolve(); return; }
          rafId = root.requestAnimationFrame(frame);
        }
        run.nodes = nodes; rafId = root.requestAnimationFrame(frame);
      });
    });
  };
  Voice.stop = function () {
    if (current && current.nodes) current.nodes.forEach(function (n) { try { n.stop && n.stop(); n.disconnect(); } catch (e) {} });
    current = null; if (rafId) root.cancelAnimationFrame(rafId); rafId = 0;
  };
  function toWav(pcm, sr) {
    var len = pcm.length, data = new DataView(new ArrayBuffer(44 + len * 2));
    function ws(o, s) { for (var i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); }
    ws(0, 'RIFF'); data.setUint32(4, 36 + len * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
    data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); ws(36, 'data'); data.setUint32(40, len * 2, true);
    for (var i = 0; i < len; i++) { var v = Math.max(-1, Math.min(1, pcm[i])); data.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
    return new Blob([data], { type: 'audio/wav' });
  }
  Voice._test = { measureTiming: measureTiming, contour: contour, flat: flat, plain: plain };
  root.Voice = Voice;
})(typeof window !== 'undefined' ? window : globalThis);
