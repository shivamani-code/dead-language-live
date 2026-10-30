/* vedic.js — Devanagari → IAST, syllables and Vedic pitch accent (Pāṇinian rules).
   Written for Dead Language Live. Exposes window.Vedic. */
(function (root) {
  'use strict';
  // ---------- Devanagari tables (SLP1 internally) ----------
  var CONS = {'क':'k','ख':'K','ग':'g','घ':'G','ङ':'N','च':'c','छ':'C','ज':'j','झ':'J','ञ':'Y','ट':'w','ठ':'W','ड':'q','ढ':'Q','ण':'R',
    'त':'t','थ':'T','द':'d','ध':'D','न':'n','प':'p','फ':'P','ब':'b','भ':'B','म':'m','य':'y','र':'r','ल':'l','व':'v','श':'S','ष':'z','स':'s','ह':'h','ळ':'L',
    'क़':'k','ख़':'K','ग़':'g','ज़':'j','ड़':'q','ढ़':'Q','फ़':'P','य़':'y','ऴ':'L','ऩ':'n','ऱ':'r'};
  var NUKTA_BASE = {'क':1,'ख':1,'ग':1,'ज':1,'ड':1,'ढ':1,'फ':1,'य':1};
  var VOW = {'अ':'a','आ':'A','इ':'i','ई':'I','उ':'u','ऊ':'U','ऋ':'f','ॠ':'F','ऌ':'x','ॡ':'X','ए':'e','ऐ':'E','ओ':'o','औ':'O','ऎ':'e','ऒ':'o','ऍ':'e','ऑ':'o'};
  var MATRA = {'ा':'A','ि':'i','ी':'I','ु':'u','ू':'U','ृ':'f','ॄ':'F','ॢ':'x','ॣ':'X','े':'e','ै':'E','ो':'o','ौ':'O','ॆ':'e','ॊ':'o','ॅ':'e','ॉ':'o'};
  var VIRAMA = '्', ANUS = 'ं', VISARGA = 'ः', CANDRA = 'ँ', AVAGRAHA = 'ऽ', NUKTA = '़';
  var VOWELS = 'aAiIuUfFxXeEoO';
  var IAST = {a:'a',A:'ā',i:'i',I:'ī',u:'u',U:'ū',f:'ṛ',F:'ṝ',x:'ḷ',X:'ḹ',e:'e',E:'ai',o:'o',O:'au',
    k:'k',K:'kh',g:'g',G:'gh',N:'ṅ',c:'c',C:'ch',j:'j',J:'jh',Y:'ñ',w:'ṭ',W:'ṭh',q:'ḍ',Q:'ḍh',R:'ṇ',t:'t',T:'th',d:'d',D:'dh',n:'n',
    p:'p',P:'ph',b:'b',B:'bh',m:'m',y:'y',r:'r',l:'l',v:'v',S:'ś',z:'ṣ',s:'s',h:'h',L:'ḷ',M:'ṃ',H:'ḥ','~':'m̐',"'":'’'};
  var ACUTE = '\u0301', GRAVE = '\u0300';
  var UDATTA_MARK = '', ANUDATTA = '\u0952', SVARITA = '\u0951';

  function isDeva(ch) { var c = ch.charCodeAt(0); return c >= 0x0900 && c <= 0x097F || (c >= 0xA8E0 && c <= 0xA8FF) || (c >= 0x1CD0 && c <= 0x1CFF); }

  // Parse one Devanagari word into aksharas: [{deva, units:[slp1...]}], units include vowels and consonants.
  function parseWord(w) {
    w = w.normalize('NFC').replace(/[\u1CD0-\u1CFF\uA8E0-\uA8F1\u200C\u200D]/g, '');
    var aks = [], cur = null, i, ch, pendingCons = false;
    function newAk() { cur = { deva: '', units: [] }; aks.push(cur); }
    for (i = 0; i < w.length; i++) {
      ch = w[i];
      var next = w[i + 1];
      if (CONS[ch] !== undefined) {
        var slp = CONS[ch];
        if (next === NUKTA) { i++; }
        // a consonant starts a new akshara unless previous ended with virama (conjunct)
        if (!(cur && pendingCons)) newAk();
        cur.deva += ch + (next === NUKTA ? NUKTA : '');
        cur.units.push(slp);
        pendingCons = true; // waiting for vowel sign / virama
        // inherent vowel unless followed by matra or virama
        var n2 = w[i + 1];
        if (n2 === VIRAMA) { cur.deva += VIRAMA; i++; pendingCons = true; cur.open = true; continue; }
        if (MATRA[n2] !== undefined) { cur.deva += n2; cur.units.push(MATRA[n2]); i++; }
        else cur.units.push('a');
        cur.open = false; pendingCons = false;
      } else if (VOW[ch] !== undefined) {
        newAk(); cur.deva += ch; cur.units.push(VOW[ch]); pendingCons = false; cur.open = false;
      } else if (ch === ANUS || ch === VISARGA || ch === CANDRA) {
        if (!cur) newAk();
        cur.deva += ch; cur.units.push(ch === ANUS ? 'M' : ch === VISARGA ? 'H' : '~'); pendingCons = false;
      } else if (ch === ANUDATTA || ch === SVARITA) {
        if (cur) cur.mark = (ch === ANUDATTA ? 'A' : 'S');
      } else if (ch === AVAGRAHA) {
        if (!cur) newAk();
        cur.deva += ch; cur.units.push("'");
      }
      // anything else ignored
    }
    // merge vowel-less trailing aksharas (final consonant clusters with virama) into previous akshara
    var out = [];
    aks.forEach(function (a) {
      var hasV = a.units.some(function (u) { return VOWELS.indexOf(u) >= 0; });
      if (!hasV && out.length) { var p = out[out.length - 1]; p.deva += a.deva; p.units = p.units.concat(a.units); if (a.mark) p.mark = a.mark; }
      else out.push(a);
    });
    return out;
  }

  function slpToIast(units) { return units.map(function (u) { return IAST[u] !== undefined ? IAST[u] : u; }).join(''); }

  function addAccentIast(iast, tone) {
    // put acute (udātta) / grave (svarita) on the first vowel letter of the akshara
    if (tone !== 'U' && tone !== 'S') return iast;
    var m = iast.normalize('NFD').match(/^(.*?)([aeiouṛḷ])/);
    var s = iast.normalize('NFD');
    var idx = s.search(/[aeiou]|r\u0323|l\u0323/);
    if (idx < 0) return iast;
    // find end of the vowel base + its existing combining marks
    var j = idx + 1; while (j < s.length && /[\u0300-\u036f]/.test(s[j])) j++;
    return (s.slice(0, j) + (tone === 'U' ? ACUTE : GRAVE) + s.slice(j)).normalize('NFC');
  }

  // ---------- accent lexicon (Monier-Williams accented headwords, SLP1 → udātta vowel index) ----------
  var LEX = null;
  function loadLexicon(text) {
    LEX = Object.create(null);
    text.split('\n').forEach(function (line) {
      var m = line.match(/^([A-Za-z|~']+?)(\d+)$/); if (m) LEX[m[1]] = +m[2];
    });
    Vedic.lexiconSize = Object.keys(LEX).length;
  }
  var ENCLITIC = { ca: 1, vA: 1, u: 1, iva: 1, ha: 1, sma: 1, cit: 1, svit: 1, me: 1, naH: 1, vaH: 1, tvA: 1, nO: 1, vAm: 1 };
  var VERB_END = ['anti', 'nti', 'ati', 'ti', 'Ami', 'mi', 'AmaH', 'maH', 'masi', 'si', 'Taha', 'TaH', 'Ta', 'ante', 'nte', 'ate', 'te', 'mahe', 'vahe', 'se', 'antu', 'ntu', 'tu', 'tAm', 'atu', 'eyam', 'et', 'eyuH', 'syati', 'syAmi', 'syanti', 'tavyam'];
  // common pronoun / particle accents not in the stem list (udātta vowel index)
  var EXTRA = { aham: 1, tvam: 0, vayam: 1, yUyam: 1, saH: 0, sA: 0, tat: 0, te: 0, mama: 0, tava: 0, idam: 0, ayam: 0, iyam: 1, na: 0, eva: 1, api: 0, iti: 0, yaTA: 1, tadA: 1, sarve: 0, sarvam: 0, saha: 1, adya: 0 };
  var NOUN_END = ['ezu', 'eBiH', 'eByaH', 'AnAm', 'INAm', 'UnAm', 'AByAm', 'Aya', 'asya', 'ena', 'At', 'AH', 'An', 'EH', 'am', 'aH', 'O', 'e', 'Ani', 'ayA', 'AyAH', 'AyAm', 'iH', 'im', 'inA', 'aye', 'eH', 'uH', 'um', 'unA', 'ave', 'oH', 'A', 'm', 'H', 'i', 'I', 'u', 'a'];

  function lookupAccent(slp) {
    if (!LEX) return null;
    if (EXTRA[slp] !== undefined) return { idx: EXTRA[slp], src: 'lexicon' };
    var bare = slp.replace(/[MH~']$/, '');
    if (LEX[slp] !== undefined) return { idx: LEX[slp], src: 'lexicon' };
    if (LEX[bare] !== undefined) return { idx: LEX[bare], src: 'lexicon' };
    // strip endings, try stem and stem+a / stem+i / stem+u
    for (var e = 0; e < NOUN_END.length; e++) {
      var end = NOUN_END[e];
      if (slp.length - end.length >= 2 && slp.slice(-end.length) === end) {
        var stem = slp.slice(0, -end.length);
        var cands = [stem, stem + 'a', stem + 'i', stem + 'u', stem + 'A', stem + 'f'];
        for (var c = 0; c < cands.length; c++) if (LEX[cands[c]] !== undefined) return { idx: LEX[cands[c]], src: 'lexicon' };
      }
    }
    // longest known prefix (compounds / unknown endings), at least 3 letters
    for (var L = slp.length - 1; L >= 3; L--) {
      var pre = slp.slice(0, L);
      if (LEX[pre] !== undefined && slp.length - L <= 4) return { idx: LEX[pre], src: 'lexicon' };
    }
    return null;
  }
  function looksFiniteVerb(slp) {
    for (var i = 0; i < VERB_END.length; i++) { var e = VERB_END[i]; if (slp.length > e.length + 1 && slp.slice(-e.length) === e) return true; }
    return false;
  }

  // ---------- analysis ----------
  function analyze(text) {
    text = String(text || '').normalize('NFC');
    var sentences = text.split(/[।॥.!?\n]+/);
    var words = [], outWordsSource = false;
    sentences.forEach(function (sent, si) {
      var toks = sent.split(/[^\u0900-\u097F\uA8E0-\uA8FF\u1CD0-\u1CFF]+/).filter(function (t) { return t && /[\u0905-\u0939\u0958-\u0961\u0972-\u097F]/.test(t); });
      toks.forEach(function (tok, ti) {
        var aks = parseWord(tok);
        if (!aks.length) return;
        var slp = aks.map(function (a) { return a.units.join(''); }).join('');
        var nV = aks.length;
        var udatta = -1, src = 'rule', note = '';
        if (ENCLITIC[slp]) { src = 'unaccented'; note = 'enclitic particle: no accent of its own'; }
        else {
          var exact = (LEX && (EXTRA[slp] !== undefined || LEX[slp] !== undefined || LEX[slp.replace(/[MH~']$/, '')] !== undefined));
          var hit = (exact || !(ti > 0 && looksFiniteVerb(slp))) ? lookupAccent(slp) : null;
          if (hit) { udatta = Math.min(hit.idx, nV - 1); src = 'lexicon'; }
          else if (ti > 0 && looksFiniteVerb(slp)) { src = 'unaccented'; note = 'finite verb in a main clause is unaccented (Pāṇini 8.1.28)'; }
          else { udatta = 0; src = 'rule'; note = 'not in the accent lexicon: first-syllable accent assumed'; }
        }
        words.push({ deva: tok, slp: slp, aks: aks, udatta: udatta, accentSource: src, note: note, sentence: si });
      });
    });
    // flatten syllables across the utterance (saṃhitā) and apply Pāṇinian tone sandhi
    var flat = [];
    words.forEach(function (w, wi) { w.aks.forEach(function (a, ai) { flat.push({ wi: wi, ai: ai, tone: (ai === w.udatta ? 'U' : 'A'), sentence: w.sentence }); }); });
    for (var k = 0; k < flat.length; k++) {
      if (flat[k].tone !== 'A') continue;
      var prev = flat[k - 1];
      if (prev && prev.sentence === flat[k].sentence && prev.tone === 'U') flat[k].tone = 'S';            // 8.4.66 udāttād anudāttasya svaritaḥ
      else if (prev && prev.sentence === flat[k].sentence && (prev.tone === 'S' || prev.tone === 'P')) flat[k].tone = 'P'; // 1.2.39 ekaśruti after svarita
    }
    if (/[\u0951\u0952]/.test(text)) { // authentic accented source text (e.g. Rigveda): read the tones straight from the marks
      var prevT = null, prevS = -1;
      flat.forEach(function (f) {
        var mk = words[f.wi].aks[f.ai].mark;
        if (f.sentence !== prevS) prevT = null;
        if (mk) f.tone = mk;
        else f.tone = (prevT === 'S' || prevT === 'P') ? 'P' : 'U';
        prevT = f.tone; prevS = f.sentence;
      });
      words.forEach(function (w) { w.accentSource = 'text'; w.note = 'accent marks taken from the traditional accented text'; });
      outWordsSource = true;
    }
    // 1.2.40: an anudātta (or pracaya) right before an udātta/svarita is lowered (sannatara)
    for (k = 0; k < flat.length - 1; k++) {
      var nx = flat[k + 1];
      if ((flat[k].tone === 'P' || flat[k].tone === 'A') && (nx.tone === 'U' || nx.tone === 'S') && nx.sentence === flat[k].sentence) { if (!outWordsSource) flat[k].tone = 'A'; if (flat[k].tone === 'A') flat[k].sannatara = true; }
    }
    var outWords = words.map(function (w) { return { deva: w.deva, iast: '', accentSource: w.accentSource, note: w.note, slp: w.slp, syllables: [] }; });
    flat.forEach(function (f) {
      var w = words[f.wi], a = w.aks[f.ai];
      var iast = slpToIast(a.units);
      outWords[f.wi].syllables.push({ deva: a.deva, iast: addAccentIast(iast, f.tone), plain: iast, slp: a.units.slice(), tone: f.tone, sannatara: !!f.sannatara });
    });
    outWords.forEach(function (w) { w.iast = w.syllables.map(function (s) { return s.iast; }).join(''); });
    function markDeva(s) {
      var d = s.deva;
      var mark = s.tone === 'A' ? ANUDATTA : s.tone === 'S' ? SVARITA : '';
      if (!mark) return d;
      // the mark closes the akshara (after vowel sign / anusvara / visarga), but sits before a word-final dead consonant cluster
      var m = d.match(/^(.*?)((?:[\u0915-\u0939\u0958-\u095F\u0933]\u093C?\u094D)+)$/);
      if (m && m[1]) return m[1] + mark + m[2];
      return d + mark;
    }
    var devaAccented = outWords.map(function (w) { return w.syllables.map(markDeva).join(''); }).join(' ');
    var iast = outWords.map(function (w) { return w.iast; }).join(' ');
    return { iast: iast, devaAccented: devaAccented, words: outWords };
  }

  // ---------- espeak-ng phoneme string (reconstructed Vedic values) ----------
  var PH = {a:'@',A:'a:',i:'I',I:'i:',u:'U',U:'u:',f:'@r',F:'@rr',x:'@l',X:'@l',e:'e:',E:'a:I',o:'o:',O:'a:U',
    k:'k',K:'k#',g:'g',G:'g#',N:'N',c:'c',C:'c#',j:'J',J:'J#',Y:'n^',w:'t.',W:'t.#',q:'d.',Q:'d.#',R:'n.',t:'t',T:'t#',d:'d',D:'d#',n:'n',
    p:'p',P:'p#',b:'b',B:'b#',m:'m',y:'j',r:'r',l:'l',v:'v',S:'S',z:'s.',s:'s',h:'H',L:'l.'};
  var NASAL_FOR = {k:'N',K:'N',g:'N',G:'N',c:'n^',C:'n^',j:'n^',J:'n^',w:'n.',W:'n.',q:'n.',Q:'n.',t:'n',T:'n',d:'n',D:'n',p:'m',P:'m',b:'m',B:'m'};
  // returns { text:"[[...]]", map:[syllableGlobalIndex per phoneme] }
  function phonemes(analysis) {
    var parts = [], map = [], g = 0;
    analysis.words.forEach(function (w, wi) {
      var wordPh = [];
      var units = []; w.syllables.forEach(function (s, si) { s.slp.forEach(function (u) { units.push({ u: u, s: g + si }); }); });
      units.forEach(function (x, i) {
        var u = x.u, nxt = units[i + 1] ? units[i + 1].u : null, prevV = null;
        var p;
        if (u === 'M') p = nxt && NASAL_FOR[nxt] ? NASAL_FOR[nxt] : (nxt ? 'n' : 'm');
        else if (u === '~') p = 'n';
        else if (u === 'H') { // visarga: voiceless breath + short echo of the previous vowel at a pause
          for (var j = i - 1; j >= 0; j--) if (VOWELS.indexOf(units[j].u) >= 0) { prevV = units[j].u; break; }
          wordPh.push({ p: 'h', s: x.s });
          if (!nxt) { var ev = { a: '@', A: '@', i: 'I', I: 'I', u: 'U', U: 'U', e: 'I', E: 'I', o: 'U', O: 'U' }[prevV] || '@'; wordPh.push({ p: ev, s: x.s }); }
          return;
        }
        else if (u === "'") return;
        else p = PH[u];
        if (!p) return;
        p.split(' ').forEach(function (q) { wordPh.push({ p: q, s: x.s }); });
      });
      // split multi-phoneme mnemonics like "@r" or "a:I" so the event count matches
      var flatPh = [];
      wordPh.forEach(function (o) {
        var toks = o.p.match(/(@rr|a:I|a:U)/) ? (o.p === '@rr' ? ['@', 'r:'] : o.p === 'a:I' ? ['a:', 'I'] : o.p === 'a:U' ? ['a:', 'U'] : [o.p]) : (o.p === '@r' ? ['@', 'r'] : o.p === '@l' ? ['@', 'l'] : [o.p]);
        toks.forEach(function (t) { flatPh.push({ p: t, s: o.s }); });
      });
      parts.push(flatPh);
      g += w.syllables.length;
    });
    var text = '[[' + parts.map(function (ws) { ws.forEach(function (o) { map.push(o.s); }); return ws.map(function (o) { return o.p; }).join(''); }).join(' ') + ']]';
    return { text: text, map: map, syllableCount: g };
  }

  var Vedic = {
    analyze: analyze,
    phonemes: phonemes,
    loadLexicon: loadLexicon,
    lexiconSize: 0,
    ready: null,
    toneSemitones: { U: 3.5, P: 2.5, A: -2, sannatara: -3, S: [4.5, -1.5] }
  };
  root.Vedic = Vedic;
  // auto-load the lexicon in the browser
  if (typeof fetch === 'function' && typeof document !== 'undefined') {
    Vedic.ready = fetch('lexicon.txt').then(function (r) { return r.ok ? r.text() : ''; }).then(loadLexicon).catch(function () { LEX = Object.create(null); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
