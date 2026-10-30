/* translate.js — any text (English / Hindi / Telugu) → Sanskrit in Devanagari. Exposes window.Translate. */
(function (root) {
  'use strict';
  var PHRASES = [
    { en: 'I praise Agni, the household priest, the god of the sacrifice, the giver of treasure', deva: 'अ॒ग्निमी॑ळे पु॒रोहि॑तं य॒ज्ञस्य॑ दे॒वमृ॒त्विज॑म् । होता॑रं रत्न॒धात॑मम् ॥', tag: 'Rigveda 1.1.1 · the first verse of the oldest Veda', keys: ['agni', 'fire', 'praise', 'rigveda', 'first'] },
    { en: 'Agni, worthy of praise by the seers of old and of today, brings the gods here', deva: 'अ॒ग्निः पूर्वे॑भि॒र्ऋषि॑भि॒रीड्यो॒ नूत॑नैरु॒त । स दे॒वाँ एह व॑क्षति ॥', tag: 'Rigveda 1.1.2', keys: ['seers', 'rigveda 1.1.2', 'second verse'] },
    { en: 'May my friends be safe', deva: 'मम मित्राणि सुरक्षितानि भवन्तु', tag: 'machine translation, accent by rule', keys: ['friends', 'safe'] },
    { en: 'Gāyatrī mantra', deva: 'तत्स॑वि॒तुर्वरे॑ण्यं॒ भर्गो॑ दे॒वस्य॑ धीमहि । धियो॒ यो नः॑ प्रचो॒दया॑त्', tag: 'Rigveda 3.62.10', keys: ['gayatri', 'gāyatrī', 'savitur', 'sun mantra'] },
    { en: 'May noble thoughts come to us from every side', deva: 'आ नो॑ भ॒द्राः क्रत॑वो यन्तु वि॒श्वतः॑', tag: 'Rigveda 1.89.1', keys: ['noble', 'thoughts', 'every side', 'good thoughts'] },
    { en: 'Walk together, speak together, let your minds agree', deva: 'सं ग॑च्छध्वं॒ सं व॑दध्वं॒ सं वो॒ मनां॑सि जानताम्', tag: 'Rigveda 10.191.2', keys: ['together', 'unity', 'speak together'] },
    { en: 'My name is Mani', deva: 'मम नाम मणिः', tag: 'try your own name', keys: ['my name', 'mani'] },
    { en: 'Truth alone triumphs', deva: 'सत्यमेव जयते', tag: 'Muṇḍaka Upaniṣad 3.1.6', keys: ['truth', 'triumph', 'satyameva'] },
    { en: 'May all be happy', deva: 'सर्वे भवन्तु सुखिनः', tag: 'peace prayer', keys: ['all be happy', 'happy', 'happiness'] },
    { en: 'Lead me from darkness to light', deva: 'तमसो मा ज्योतिर्गमय', tag: 'Bṛhadāraṇyaka Upaniṣad 1.3.28', keys: ['darkness', 'light', 'lead me'] },
    { en: 'The world is one family', deva: 'वसुधैव कुटुम्बकम्', tag: 'Mahā Upaniṣad 6.71', keys: ['world', 'family', 'one family'] },
    { en: 'Peace, peace, peace', deva: 'ॐ शान्तिः शान्तिः शान्तिः', tag: 'closing of many Vedic hymns', keys: ['peace', 'shanti'] },
    { en: 'Welcome', deva: 'स्वागतम्', tag: 'greeting', keys: ['welcome'] },
    { en: 'Hello / I bow to you', deva: 'नमस्ते', tag: 'greeting', keys: ['hello', 'hi', 'namaste', 'greetings'] },
    { en: 'Mother, father, friend', deva: 'माता पिता मित्रम्', tag: 'old Indo-European words', keys: ['mother', 'father', 'friend'] },
    { en: 'The sun shines', deva: 'सूर्यः प्रकाशते', tag: 'simple sentence', keys: ['sun', 'shines'] },
    { en: 'Fire, water, wind, earth, sky', deva: 'अग्निः आपः वायुः पृथिवी आकाशः', tag: 'the five elements', keys: ['elements', 'water', 'wind', 'earth', 'sky'] },
    { en: 'Dawn has come', deva: 'उषाः आगता', tag: 'Uṣas, goddess of dawn', keys: ['dawn', 'morning', 'good morning'] },
    { en: 'Victory to India', deva: 'भारतस्य विजयः', tag: 'modern', keys: ['india', 'victory', 'bharat'] },
    { en: 'I love you', deva: 'अहं त्वां प्रीणामि', tag: 'modern sentence, Vedic accent', keys: ['love you', 'i love'] },
    { en: 'Thank you', deva: 'धन्यवादः', tag: 'modern coinage', keys: ['thank', 'thanks'] },
    { en: 'Knowledge is the highest wealth', deva: 'विद्या परमं धनम्', tag: 'proverb', keys: ['knowledge', 'wealth', 'education'] }
  ];
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); }
  function parseGoogle(j) {
    // shapes seen: [["अहं …","en"]]  |  ["अहं …"]  |  [[["अहं…","I…",…]],…] (gtx)
    var out = [];
    (function walk(x, depth) {
      if (typeof x === 'string') { if (/[\u0900-\u097F]/.test(x)) out.push(x); return; }
      if (Array.isArray(x)) { if (depth > 3) return; if (x.length && typeof x[0] === 'string' && /[\u0900-\u097F]/.test(x[0])) { out.push(x[0]); return; } x.forEach(function (y) { walk(y, depth + 1); }); }
    })(j, 0);
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }
  function direct(text, sl) {
    var url = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=' + encodeURIComponent(sl) + '&tl=sa&q=' + encodeURIComponent(text);
    return withTimeout(fetch(url), 9000).then(function (r) { if (!r.ok) throw new Error('translate ' + r.status); return r.json(); }).then(parseGoogle);
  }
  function viaWorker(text, sl) {
    return withTimeout(fetch('/api/tr?sl=' + encodeURIComponent(sl) + '&q=' + encodeURIComponent(text)), 12000)
      .then(function (r) { if (!r.ok) throw new Error('translate ' + r.status); return r.json(); }).then(parseGoogle);
  }
  function phrasebook(text) {
    var t = text.toLowerCase().trim();
    var best = null, bestScore = 0;
    PHRASES.forEach(function (p) {
      var s = 0;
      if (p.en.toLowerCase() === t) s = 100;
      p.keys.forEach(function (k) { if (t.indexOf(k) >= 0) s += k.length; });
      if (s > bestScore) { bestScore = s; best = p; }
    });
    return best;
  }
  function toSanskrit(text, lang) {
    text = String(text || '').trim();
    if (!text) return Promise.reject(new Error('Type something first.'));
    if (text.length > 400) text = text.slice(0, 400);
    var hit = PHRASES.filter(function (p) { return p.en.toLowerCase() === text.toLowerCase() || p.deva === text; })[0];
    if (hit) return Promise.resolve({ deva: hit.deva, via: 'phrasebook', note: hit.tag });
    var sl = !lang || lang === 'auto' ? 'auto' : lang;
    return direct(text, sl).catch(function () { return viaWorker(text, sl); }).then(function (deva) {
      if (!deva) throw new Error('empty translation');
      return { deva: deva, via: 'live', note: 'machine translation into Sanskrit' };
    }).catch(function () {
      var p = phrasebook(text);
      if (p) return { deva: p.deva, via: 'phrasebook', note: 'live translation is unreachable right now; closest phrase: “' + p.en + '”' };
      throw new Error('Live translation is unreachable right now. Try one of the phrases below.');
    });
  }
  root.Translate = { toSanskrit: toSanskrit, phrases: PHRASES.map(function (p) { return { en: p.en, deva: p.deva, tag: p.tag }; }) };
})(typeof window !== 'undefined' ? window : globalThis);
