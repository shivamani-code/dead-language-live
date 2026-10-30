(() => {
  'use strict';

  const grid = document.getElementById('sign-grid');
  if (!grid) return;
  const data = window.INDUS;
  const byId = new Map();
  const signSheet = document.getElementById('sign-sheet');
  const state = { theory: null, sequence: [] };
  const els = {
    signCount: document.getElementById('sign-count'), sealCount: document.getElementById('seal-count'),
    sealGallery: document.getElementById('seal-gallery'), theoryList: document.getElementById('theory-list'),
    theoryDetail: document.getElementById('theory-detail'), run: document.getElementById('run-test-button'),
    results: document.getElementById('analysis-results'), sequence: document.getElementById('sequence-display'),
    undo: document.getElementById('undo-sequence'), clear: document.getElementById('clear-sequence'),
    verdict: document.getElementById('sequence-verdict'), summary: document.getElementById('corpus-summary'),
    sources: document.getElementById('indus-sources'), sheetSign: document.getElementById('sheet-sign'),
    sheetName: document.getElementById('sheet-name'), sheetId: document.getElementById('sheet-id'),
    sheetFreq: document.getElementById('sheet-frequency'), sheetPositions: document.getElementById('sheet-positions'),
    sheetReadings: document.getElementById('sheet-readings'), sheetCompose: document.getElementById('sheet-compose')
  };

  if (!data || !Array.isArray(data.signs) || !Array.isArray(data.corpus)) {
    grid.textContent = 'The Indus corpus could not be loaded. Check that indus-data.js is available beside this page.';
    return;
  }

  data.signs.forEach((sign) => byId.set(sign.id, sign));
  const corpus = data.corpus.filter((text) => Array.isArray(text.seq) && text.seq.length);
  const allSignIds = new Set(data.signs.map((sign) => sign.id));
  corpus.forEach(({ seq }) => seq.forEach((id) => allSignIds.add(id)));
  allSignIds.forEach((id) => {
    if (!byId.has(id)) byId.set(id, { id, name: id, isUnknown: true });
  });
  const allSigns = [...allSignIds].map((id) => byId.get(id));
  const countBySign = new Map();
  const bigrams = new Map();
  const outgoingBigramTotals = new Map();
  let totalSigns = 0;
  corpus.forEach(({ seq }) => {
    seq.forEach((id, index) => {
      totalSigns += 1;
      countBySign.set(id, (countBySign.get(id) || 0) + 1);
      if (index < seq.length - 1) {
        const key = `${id}\u0000${seq[index + 1]}`;
        bigrams.set(key, (bigrams.get(key) || 0) + 1);
      }
    });
  });
  bigrams.forEach((count, key) => {
    const from = key.split('\u0000')[0];
    outgoingBigramTotals.set(from, (outgoingBigramTotals.get(from) || 0) + count);
  });

  function safeNumber(value) { return Number.isFinite(value) && value >= 0 ? value : null; }
  function signGlyph(sign, className = 'indus-glyph') {
    const holder = document.createElement('span');
    holder.className = className;
    if (!sign) {
      holder.textContent = '?';
      return holder;
    }
    if (sign.isUnknown) {
      holder.classList.add('indus-unknown-glyph');
      holder.textContent = sign.id;
      holder.setAttribute('aria-label', `Uncatalogued sign ${sign.id}`);
      return holder;
    }
    if (typeof sign.svg === 'string' && sign.svg.trim()) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '4');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      // (Tab fix) parse the drawing as SVG so its shapes get the SVG namespace and actually render
      const parsed = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + sign.svg + '</svg>', 'image/svg+xml');
      Array.from(parsed.documentElement.children).forEach((child) => {
        if (/^(path|line|circle|rect|ellipse|polyline|polygon|g)$/i.test(child.tagName)) svg.append(document.importNode(child, true));
      });
      holder.append(svg);
    } else {
      holder.textContent = sign.name ? sign.name.slice(0, 1).toUpperCase() : '·';
      holder.setAttribute('aria-label', sign.name || sign.id);
    }
    return holder;
  }

  function renderSigns() {
    els.signCount.textContent = `${allSigns.length.toLocaleString()} signs (${data.signs.length.toLocaleString()} illustrated; uncatalogued IDs included)`;
    const sorted = [...allSigns].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    const fragment = document.createDocumentFragment();
    sorted.forEach((sign) => {
      const tile = document.createElement('div');
      tile.className = 'sign-cell';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sign-tile';
      if (sign.isUnknown) {
        tile.classList.add('is-uncatalogued');
        button.classList.add('sign-tile-unknown');
        button.textContent = sign.id;
        button.setAttribute('aria-label', `Add uncatalogued sign ${sign.id} to the sequence`);
        button.title = 'Uncatalogued corpus sign; select to add to sequence';
        button.addEventListener('click', () => addSign(sign.id));
        tile.append(button);
        fragment.append(tile);
        return;
      }
      button.setAttribute('aria-label', `Inspect ${sign.id}, ${sign.name || 'unnamed sign'}`);
      button.append(signGlyph(sign));
      const id = document.createElement('span');
      id.className = 'sign-tile-id';
      id.textContent = sign.id;
      button.append(id);
      const name = document.createElement('span');
      name.className = 'sign-tile-name';
      name.textContent = sign.name || 'unnamed';
      button.append(name);
      button.addEventListener('click', () => openSign(sign));
      const inspect = document.createElement('button');
      inspect.type = 'button';
      inspect.className = 'sign-inspect-button';
      inspect.textContent = '+';
      inspect.setAttribute('aria-label', `Add ${sign.id}, ${sign.name || 'unnamed sign'}, to the sequence`);
      inspect.addEventListener('click', () => addSign(sign.id));
      tile.append(button, inspect);
      fragment.append(tile);
    });
    grid.replaceChildren(fragment);
  }

  function findReadings(id) {
    const readings = [];
    const sign = byId.get(id);
    (data.theories || []).forEach((theory) => {
      (theory.readings || []).filter((item) => item.sign === id || (sign && item.sign === sign.name)).forEach((item) => readings.push({ theory: theory.name, reading: item.reading, by: item.by, url: item.url }));
    });
    return readings;
  }

  function openSign(sign) {
    els.sheetSign.replaceChildren(signGlyph(sign));
    els.sheetName.textContent = sign.name || 'Uncatalogued sign';
    els.sheetId.textContent = sign.id;
    const freq = safeNumber(sign.freq);
    els.sheetFreq.textContent = `Observed frequency: ${freq === null ? '—' : `${freq.toLocaleString()} occurrences`}`;
    const suppliedProfile = sign.pos || {};
    const profile = ['initial', 'medial', 'final'].map((key) => safeNumber(suppliedProfile[key]));
    const labels = ['Initial', 'Medial', 'Final'];
    els.sheetPositions.replaceChildren();
    labels.forEach((label, index) => {
      const share = profile[index];
      const row = document.createElement('div');
      row.className = 'sheet-position';
      const name = document.createElement('span');
      name.textContent = label;
      const track = document.createElement('span');
      track.className = 'sheet-position-track';
      const fill = document.createElement('span');
      fill.style.width = share === null ? '0%' : `${Math.max(0, Math.min(1, share)) * 100}%`;
      track.append(fill);
      const value = document.createElement('span');
      value.textContent = share === null ? '—' : `${(share * 100).toFixed(1)}%`;
      row.append(name, track, value);
      els.sheetPositions.append(row);
    });
    const readings = findReadings(sign.id);
    els.sheetReadings.replaceChildren();
    if (!readings.length) {
      els.sheetReadings.textContent = 'No listed theory proposes a reading for this sign.';
    } else {
      readings.forEach((item) => {
        const chip = document.createElement('span');
        chip.className = 'reading-chip';
        chip.textContent = `${item.by || item.theory}: ${item.reading}`;
        if (item.url) {
          const link = document.createElement('a');
          link.href = item.url;
          link.target = '_blank';
          link.rel = 'noreferrer';
          link.textContent = ' Source';
          chip.append(link);
        }
        els.sheetReadings.append(chip);
      });
    }
    els.sheetCompose.onclick = () => {
      addSign(sign.id);
      signSheet.close();
      document.getElementById('composer-heading').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    if (typeof signSheet.showModal === 'function') signSheet.showModal();
    else signSheet.setAttribute('open', '');
  }

  function renderSeals() {
    const seals = Array.isArray(data.seals) ? data.seals : [];
    els.sealCount.textContent = `${seals.length.toLocaleString()} objects`;
    els.sealGallery.replaceChildren();
    seals.forEach((seal) => {
      const card = document.createElement('article');
      card.className = 'seal-card';
      const wrap = document.createElement('div');
      wrap.className = 'seal-image-wrap';
      if (seal.img) {
        const image = document.createElement('img');
        image.className = 'seal-image';
        image.src = new URL(seal.img, window.location.href).href;
        image.alt = `${seal.name || 'Indus seal'} from ${seal.site || 'an Indus site'}`;
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => {
          const fallback = document.createElement('span');
          fallback.className = 'seal-image-placeholder';
          fallback.textContent = '𐩕';
          wrap.replaceChildren(fallback);
        }, { once: true });
        wrap.append(image);
      } else {
        const fallback = document.createElement('span');
        fallback.className = 'seal-image-placeholder';
        fallback.textContent = '𐩕';
        wrap.append(fallback);
      }
      const copy = document.createElement('div');
      copy.className = 'seal-copy';
      const title = document.createElement('h3');
      title.textContent = seal.name || 'Indus seal';
      const meta = document.createElement('p');
      meta.className = 'seal-meta';
      meta.textContent = [seal.site, seal.museum].filter(Boolean).join(' · ') || 'Site and collection unrecorded';
      const description = document.createElement('p');
      description.className = 'seal-description';
      description.textContent = seal.desc || 'An object from the Indus corpus.';
      copy.append(title, meta, description);
      if (Array.isArray(seal.seq) && seal.seq.length) {
        const sequence = document.createElement('div');
        sequence.className = 'seal-sequence';
        seal.seq.forEach((id, index) => {
          const sign = byId.get(id);
          if (index) {
            const arrow = document.createElement('span');
            arrow.className = 'sequence-arrow';
            arrow.textContent = '›';
            sequence.append(arrow);
          }
          sequence.append(signGlyph(sign));
        });
        copy.append(sequence);
      }
      const credit = document.createElement('small');
      credit.className = 'seal-credit';
      if (seal.creditUrl) {
        credit.append(document.createTextNode(`${seal.credit || 'Image credit'} · `));
        const creditLink = document.createElement('a');
        creditLink.href = seal.creditUrl;
        creditLink.target = '_blank';
        creditLink.rel = 'noreferrer';
        creditLink.textContent = 'View credit';
        credit.append(creditLink);
      } else {
        credit.textContent = seal.credit || 'Image credit not supplied';
      }
      copy.append(credit);
      card.append(wrap, copy);
      els.sealGallery.append(card);
    });
  }

  function renderTheories() {
    const theories = Array.isArray(data.theories) ? data.theories : [];
    els.theoryList.replaceChildren();
    theories.forEach((theory, index) => {
      const label = document.createElement('label');
      label.className = 'theory-option';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'indus-theory';
      radio.value = theory.id;
      radio.checked = index === 0;
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = theory.name || theory.id;
      const hint = document.createElement('small');
      const supported = (theory.predictions || []).filter((item) => ['final_cluster', 'initial_cluster', 'entropy', 'zipf', 'repetition', 'brevity'].includes(item.test)).length;
      hint.textContent = `${supported} testable predictions`;
      copy.append(title, hint);
      label.append(radio, copy);
      radio.addEventListener('change', () => chooseTheory(theory));
      els.theoryList.append(label);
      if (index === 0) state.theory = theory;
    });
    if (state.theory) chooseTheory(state.theory);
  }

  function chooseTheory(theory) {
    state.theory = theory;
    els.run.disabled = !Array.isArray(theory.predictions) || !theory.predictions.some((item) => ['final_cluster', 'initial_cluster', 'entropy', 'zipf', 'repetition', 'brevity'].includes(item.test));
    els.results.replaceChildren();
    els.theoryList.querySelectorAll('.theory-option').forEach((option) => option.classList.toggle('is-selected', option.querySelector('input').value === theory.id));
    els.theoryDetail.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = theory.name || theory.id;
    const summary = document.createElement('p');
    summary.textContent = theory.summary || 'This proposal has no summary in the source data.';
    els.theoryDetail.append(title, summary);
    const readings = document.createElement('div');
    readings.className = 'theory-readings';
    (theory.readings || []).forEach((reading) => {
      const chip = document.createElement('span');
      chip.className = 'reading-chip';
      chip.textContent = `${reading.by || reading.sign}: ${reading.reading}`;
      readings.append(chip);
    });
    if (readings.childElementCount) els.theoryDetail.append(readings);
    const citations = document.createElement('div');
    citations.className = 'theory-citations';
    (theory.cite || []).forEach((cite) => {
      const link = document.createElement('a');
      link.textContent = cite.text || cite.url;
      if (cite.url) {
        link.href = cite.url;
        link.target = '_blank';
        link.rel = 'noreferrer';
      }
      citations.append(link);
    });
    if (citations.childElementCount) els.theoryDetail.append(citations);
  }

  function allCounts(seqList) {
    const counts = new Map();
    let total = 0;
    seqList.forEach((seq) => seq.forEach((id) => {
      counts.set(id, (counts.get(id) || 0) + 1);
      total += 1;
    }));
    return { counts, total };
  }

  function conditionalEntropy(seqList) {
    const next = new Map();
    let transitions = 0;
    seqList.forEach((seq) => {
      for (let i = 0; i < seq.length - 1; i += 1) {
        let followers = next.get(seq[i]);
        if (!followers) { followers = new Map(); next.set(seq[i], followers); }
        followers.set(seq[i + 1], (followers.get(seq[i + 1]) || 0) + 1);
        transitions += 1;
      }
    });
    if (!transitions) return 0;
    let weighted = 0;
    next.forEach((followers) => {
      const count = [...followers.values()].reduce((sum, value) => sum + value, 0);
      let entropy = 0;
      followers.forEach((value) => {
        const probability = value / count;
        entropy -= probability * Math.log2(probability);
      });
      weighted += (count / transitions) * entropy;
    });
    return weighted;
  }

  function shuffledSequences() {
    const signs = corpus.flatMap(({ seq }) => seq);
    for (let i = signs.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [signs[i], signs[j]] = [signs[j], signs[i]];
    }
    let offset = 0;
    return corpus.map(({ seq }) => {
      const shuffled = signs.slice(offset, offset + seq.length);
      offset += seq.length;
      return shuffled;
    });
  }

  function stats() {
    const sequences = corpus.map(({ seq }) => seq);
    const { counts, total } = allCounts(sequences);
    const rank = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const positionsByCount = new Map();
    sequences.forEach((seq) => seq.forEach((id, index) => {
      const entry = positionsByCount.get(id) || [0, 0, 0, 0];
      if (index === 0) entry[0] += 1;
      if (index === seq.length - 1) entry[2] += 1;
      if (index > 0 && index < seq.length - 1) entry[1] += 1;
      entry[3] += 1;
      positionsByCount.set(id, entry);
    }));
    const bigramRows = [...bigrams.entries()].map(([key, count]) => [key.split('\u0000'), count]).sort((a, b) => b[1] - a[1]);
    const entropy = conditionalEntropy(sequences);
    const shuffledEntropy = conditionalEntropy(shuffledSequences());
    const signIndexes = new Map();
    let textRepeated = 0;
    sequences.forEach((seq) => {
      signIndexes.clear();
      let repeated = false;
      seq.forEach((id) => {
        if (signIndexes.has(id)) repeated = true;
        else signIndexes.set(id, true);
      });
      if (repeated) textRepeated += 1;
    });
    const repeatedShare = sequences.length ? textRepeated / sequences.length : 0;
    const immediateRepeated = sequences.filter((seq) => seq.some((id, i) => i > 0 && id === seq[i - 1])).length;
    const immediateRepeatedShare = sequences.length ? immediateRepeated / sequences.length : 0;
    const meanTextLength = sequences.length ? total / sequences.length : 0;
    const maxTextLength = Math.max(0, ...sequences.map((seq) => seq.length));
    const topFive = rank.slice(0, 5).map(([id]) => id);
    const share = (slot) => {
      const denominator = slot === 0 || slot === 2
        ? sequences.filter((seq) => seq.length > 0).length
        : sequences.reduce((sum, seq) => sum + Math.max(0, seq.length - 2), 0);
      if (!denominator) return null;
      let numerator = 0;
      positionsByCount.forEach((profile, id) => {
        if (topFive.includes(id)) numerator += profile[slot];
      });
      return numerator / denominator;
    };
    const zipfPairs = rank.filter(([, n]) => n > 0).map(([id, count], index) => ({ id, count, rank: index + 1 }));
    const xs = zipfPairs.map((item) => Math.log(item.rank));
    const ys = zipfPairs.map((item) => Math.log(item.count));
    const meanX = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    const meanY = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
    const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
    const slope = denominator ? xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0) / denominator : 0;
    const intercept = meanY - slope * meanX;
    return { sequences, rank, total, positionsByCount, bigramRows, entropy, shuffledEntropy, repeatedShare, immediateRepeatedShare, meanTextLength, maxTextLength, finalShare: share(2), initialShare: share(0), slope, intercept };
  }

  function panel(title, wide = false) {
    const node = document.createElement('section');
    node.className = `analysis-panel${wide ? ' wide' : ''}`;
    const heading = document.createElement('h3');
    heading.textContent = title;
    node.append(heading);
    return node;
  }

  function renderZipf(result) {
    const section = panel('Sign frequency rank · log–log');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 520 205');
    svg.setAttribute('class', 'chart-svg');
    const add = (tag, attrs) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
      svg.append(node);
      return node;
    };
    const left = 48, right = 496, top = 13, bottom = 165;
    add('line', { x1: left, y1: top, x2: left, y2: bottom, class: 'chart-axis' });
    add('line', { x1: left, y1: bottom, x2: right, y2: bottom, class: 'chart-axis' });
    const points = result.rank.filter((item) => item[1] > 0).map((item, index) => ({ rank: index + 1, count: item[1] }));
    const maxX = Math.log(points.length || 1);
    const maxY = Math.log(points[0] ? points[0].count : 1);
    const coords = points.map((point) => ({ x: left + (maxX ? Math.log(point.rank) / maxX : 0) * (right - left), y: bottom - (maxY ? Math.log(point.count) / maxY : 0) * (bottom - top) }));
    coords.forEach((point) => add('circle', { cx: point.x, cy: point.y, r: points.length > 150 ? 1.8 : 2.7, class: 'chart-dot' }));
    if (coords.length > 1) {
      const yFor = (logRank) => bottom - Math.max(0, Math.min(1, (result.intercept + result.slope * logRank) / (maxY || 1))) * (bottom - top);
      add('line', { x1: left, y1: yFor(0), x2: right, y2: yFor(maxX), class: 'chart-fit' });
    }
    const xlabel = add('text', { x: (left + right) / 2, y: 195, 'text-anchor': 'middle', class: 'chart-label' }); xlabel.textContent = 'Sign rank';
    const ylabel = add('text', { x: 13, y: 93, transform: 'rotate(-90 13 93)', 'text-anchor': 'middle', class: 'chart-label' }); ylabel.textContent = 'Frequency';
    section.append(svg);
    const note = document.createElement('p');
    note.textContent = `Fitted frequency–rank slope: ${result.slope.toFixed(3)}. Rank and count are shown on logarithmic axes.`;
    section.append(note);
    return section;
  }

  function renderPosition(result) {
    const section = panel('Position of the 15 most frequent signs', true);
    const rows = result.rank.slice(0, 15);
    rows.forEach(([id]) => {
      const profile = result.positionsByCount.get(id) || [0, 0, 0, 0];
      const row = document.createElement('div');
      row.className = 'position-row';
      const label = document.createElement('span'); label.className = 'position-label'; label.textContent = id;
      const track = document.createElement('span'); track.className = 'position-track';
      const positionCount = profile[0] + profile[1] + profile[2];
      ['initial', 'medial', 'final'].forEach((name, index) => {
        const segment = document.createElement('span');
        segment.className = `position-segment ${name}`;
        segment.style.width = `${positionCount ? profile[index] / positionCount * 100 : 0}%`;
        track.append(segment);
      });
      const total = document.createElement('span'); total.className = 'position-total'; total.textContent = profile[3].toLocaleString();
      row.append(label, track, total);
      section.append(row);
    });
    const legend = document.createElement('div'); legend.className = 'position-legend';
    [['initial', 'Initial'], ['medial', 'Medial'], ['final', 'Final']].forEach(([name, label]) => {
      const item = document.createElement('span');
      const swatch = document.createElement('i'); swatch.className = `position-segment ${name}`;
      item.append(swatch, document.createTextNode(label)); legend.append(item);
    });
    section.append(legend);
    return section;
  }

  function renderBigrams(result) {
    const section = panel('Most common adjacent pairs');
    const list = document.createElement('div'); list.className = 'bigrams-list';
    const top = result.bigramRows.slice(0, 10);
    const max = top.length ? top[0][1] : 1;
    top.forEach(([[leftId, rightId], count]) => {
      const row = document.createElement('div'); row.className = 'bigram-row';
      const signs = document.createElement('span'); signs.className = 'bigram-signs';
      signs.append(signGlyph(byId.get(leftId)), signGlyph(byId.get(rightId)));
      const bar = document.createElement('span'); bar.className = 'bigram-bar'; bar.style.width = `${Math.max(4, count / max * 100)}%`;
      const amount = document.createElement('span'); amount.className = 'bigram-count'; amount.textContent = count.toLocaleString();
      row.append(signs, bar, amount); list.append(row);
    });
    if (!top.length) list.textContent = 'No adjacent pairs are available.';
    section.append(list);
    return section;
  }

  function renderEntropy(result) {
    const section = panel('Conditional entropy · H(next sign | sign)');
    const pair = document.createElement('div'); pair.className = 'entropy-pair';
    [[result.entropy, 'Observed corpus'], [result.shuffledEntropy, 'Shuffled baseline']].forEach(([value, label]) => {
      const item = document.createElement('div'); item.className = 'entropy-value';
      const number = document.createElement('strong'); number.textContent = `${value.toFixed(3)} bits`;
      const caption = document.createElement('span'); caption.textContent = label;
      item.append(number, caption); pair.append(item);
    });
    const improvement = result.shuffledEntropy > 0 ? (result.shuffledEntropy - result.entropy) / result.shuffledEntropy : 0;
    const note = document.createElement('p'); note.textContent = `Observed entropy is ${improvement >= 0 ? (improvement * 100).toFixed(1) + '% below' : (Math.abs(improvement) * 100).toFixed(1) + '% above'} this random shuffle baseline.`;
    section.append(pair, note);
    return section;
  }

  function predictionOutcome(prediction, result) {
    const hasObserved = typeof prediction.observed === 'string' && prediction.observed.trim();
    const observedNote = hasObserved ? prediction.observed.trim() : '';
    const answer = (verdict, explanation) => [verdict, explanation, observedNote];
    const expected = prediction.expect;
    switch (prediction.test) {
      case 'final_cluster':
      case 'initial_cluster': {
        const isFinal = prediction.test === 'final_cluster';
        const share = isFinal ? result.finalShare : result.initialShare;
        const position = isFinal ? 'final' : 'initial';
        if (share === null) return answer('inconclusive', `Positional-frequency data is unavailable for ${position} positions.`);
        let consistent;
        if (prediction.check && /share_initial_slots_top5\s*</.test(prediction.check) && /share_final_slots_top5/.test(prediction.check)) {
          consistent = result.initialShare < result.finalShare;
        } else if (isFinal) {
          consistent = expected === 'high' ? share > .5 : expected === 'low' ? share <= .5 : null;
        } else {
          const high = share > .5;
          consistent = expected === 'high' ? high : expected === 'low' ? !high : null;
        }
        if (consistent === null) return answer('inconclusive', `Top-five signs account for ${(share * 100).toFixed(1)}% of ${position} positions; no expected direction was supplied.`);
        return answer(consistent ? 'consistent' : 'not consistent', `Top-five signs account for ${(share * 100).toFixed(1)}% of ${position} positions; “high” means above 50%, “low” means 50% or less.`);
      }
      case 'entropy': {
        if (!result.shuffledEntropy) return answer('inconclusive', 'There are too few transitions to compare against a shuffle baseline.');
        const lowerThanShuffle = result.entropy < result.shuffledEntropy;
        const check = prediction.check || '';
        const expectsMiddle = /between\s+0\s+and\s+the\s+shuffled|well above zero/i.test(check);
        const consistent = expected === 'high' ? lowerThanShuffle && (!expectsMiddle || result.entropy > 0) : expected === 'low' ? !lowerThanShuffle : null;
        if (consistent === null) return answer('inconclusive', `Observed conditional entropy is ${result.entropy.toFixed(3)} bits versus ${result.shuffledEntropy.toFixed(3)} shuffled.`);
        return answer(consistent ? 'consistent' : 'not consistent', `Observed conditional entropy is ${result.entropy.toFixed(3)} bits versus ${result.shuffledEntropy.toFixed(3)} shuffled.${expectsMiddle ? ' The prediction also requires a value above zero.' : ''}`);
      }
      case 'zipf': {
        const slopeLow = Number.isFinite(prediction.minSlope) ? prediction.minSlope : -.7;
        const slopeHigh = Number.isFinite(prediction.maxSlope) ? prediction.maxSlope : -.3;
        const inRange = result.slope >= slopeLow && result.slope <= slopeHigh;
        const consistent = expected === 'high' ? inRange : expected === 'low' ? !inRange : null;
        if (consistent === null) return answer('inconclusive', `The fitted slope is ${result.slope.toFixed(3)}.`);
        return answer(consistent ? 'consistent' : 'not consistent', `The fitted slope is ${result.slope.toFixed(3)}; the reference range is ${slopeLow} to ${slopeHigh}.`);
      }
      case 'repetition': {
        const check = prediction.check || '';
        const usesAnyRepeat = /any_repeated_sign|share_texts_with_any_repeated_sign/.test(check);
        const share = usesAnyRepeat ? result.repeatedShare : result.immediateRepeatedShare;
        const count = Math.round(share * result.sequences.length);
        const label = usesAnyRepeat ? 'texts with any repeated sign' : 'texts with an immediate repeated sign';
        if (expected !== 'high' && expected !== 'low') return answer('inconclusive', `${count} of ${result.sequences.length} ${label} (${(share * 100).toFixed(1)}%).`);
        const thresholdMatch = /(?:<|under|below)\s*(\d+(?:\.\d+)?)\s*%/i.exec(prediction.check || '');
        const threshold = thresholdMatch ? Number(thresholdMatch[1]) / 100 : .1;
        const consistent = expected === 'high' ? share > threshold : share <= threshold;
        return answer(consistent ? 'consistent' : 'not consistent', `${count} of ${result.sequences.length} ${label} (${(share * 100).toFixed(1)}%); “low” is operationalized as ${threshold * 100}% or less.`);
      }
      case 'brevity': {
        const average = result.meanTextLength;
        const consistent = expected === 'low' ? average <= 6 : expected === 'high' ? average > 6 : null;
        if (consistent === null) return answer('inconclusive', `Mean text length is ${average.toFixed(2)} signs; no expected direction was supplied.`);
        return answer(consistent ? 'consistent' : 'not consistent', `Mean text length is ${average.toFixed(2)} signs; low text length is defined as a mean of 6 signs or fewer.`);
      }
      default: return answer('inconclusive', `No browser statistic is defined for the “${prediction.test || 'unspecified'}” test.`);
    }
  }

  function renderPredictions(theory, result) {
    const section = panel('Predictions against this corpus', true);
    const list = document.createElement('div'); list.className = 'prediction-list';
    (theory.predictions || []).forEach((prediction) => {
      const [verdict, explanation, observed] = predictionOutcome(prediction, result);
      const row = document.createElement('div'); row.className = 'prediction-row';
      const text = document.createElement('span'); text.className = 'prediction-text'; text.textContent = prediction.text;
      const outcome = document.createElement('span'); outcome.className = `prediction-result ${verdict.replaceAll(' ', '-')}`; outcome.textContent = verdict;
      const detail = document.createElement('span'); detail.className = 'prediction-explanation'; detail.textContent = explanation;
      row.append(text, outcome, detail);
      if (prediction.check) {
        const check = document.createElement('span');
        check.className = 'prediction-check';
        check.textContent = `Check: ${prediction.check}`;
        row.append(check);
      }
      if (Number.isFinite(prediction.observedValue)) {
        const measured = document.createElement('span');
        measured.className = 'prediction-measured';
        measured.textContent = `Measured: ${prediction.observedValue}`;
        row.append(measured);
      }
      if (observed) {
        const observedNote = document.createElement('span');
        observedNote.className = 'prediction-observed';
        observedNote.textContent = `Observed: ${observed}`;
        row.append(observedNote);
      }
      list.append(row);
    });
    section.append(list);
    return section;
  }

  function runTest() {
    if (!state.theory) return;
    const result = stats();
    els.results.replaceChildren(renderZipf(result), renderPosition(result), renderBigrams(result), renderEntropy(result), renderPredictions(state.theory, result));
    els.results.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }

  function sequenceLogProbability(sequence) {
    let logSum = 0;
    let transitions = 0;
    for (let i = 0; i < sequence.length - 1; i += 1) {
      const from = sequence[i];
      const to = sequence[i + 1];
      const n = bigrams.get(`${from}\u0000${to}`) || 0;
      const denominator = outgoingBigramTotals.get(from) || 0;
      const vocabulary = Math.max(1, countBySign.size);
      const probability = (n + 0.5) / (denominator + 0.5 * vocabulary);
      logSum += Math.log(probability);
      transitions += 1;
    }
    return transitions ? logSum / transitions : null;
  }

  function corpusAverageLogProbability() {
    let logSum = 0;
    let count = 0;
    bigrams.forEach((frequency, key) => {
      const from = key.split('\u0000')[0];
      const denominator = outgoingBigramTotals.get(from) || 0;
      const vocabulary = Math.max(1, countBySign.size);
      const probability = (frequency + 0.5) / (denominator + 0.5 * vocabulary);
      logSum += frequency * Math.log(probability);
      count += frequency;
    });
    return count ? logSum / count : null;
  }

  function renderSequence() {
    els.sequence.replaceChildren();
    if (!state.sequence.length) {
      const empty = document.createElement('p'); empty.className = 'sequence-empty'; empty.textContent = 'Tap signs above to begin'; els.sequence.append(empty);
    } else {
      state.sequence.forEach((id, index) => {
        const item = document.createElement('span'); item.className = 'sequence-item';
        item.append(signGlyph(byId.get(id)));
        const name = document.createElement('small'); name.textContent = id; item.append(name);
        item.setAttribute('aria-label', `${id}, position ${index + 1} from the start`);
        els.sequence.append(item);
      });
    }
    els.undo.disabled = state.sequence.length === 0;
    els.clear.disabled = state.sequence.length === 0;
    const score = sequenceLogProbability(state.sequence);
    const average = corpusAverageLogProbability();
    if (state.sequence.length < 2 || score === null || average === null) {
      els.verdict.textContent = 'Add at least two signs to compare its bigrams with the corpus.';
    } else {
      const ratio = score - average;
      const typical = ratio >= 0;
      els.verdict.textContent = `${typical ? 'Looks like a typical Indus text' : 'Unusual compared with the corpus'} · sequence mean log-probability ${score.toFixed(2)} vs corpus average ${average.toFixed(2)}.`;
    }
  }

  function addSign(id) {
    if (!byId.has(id) || state.sequence.length >= 40) return;
    state.sequence.push(id);
    renderSequence();
  }

  function renderSources() {
    (Array.isArray(data.sources) ? data.sources : []).forEach((source) => {
      const link = document.createElement('a');
      link.textContent = source.text;
      if (source.url) { link.href = source.url; link.target = '_blank'; link.rel = 'noreferrer'; }
      els.sources.append(link);
    });
    const meta = data.meta || {};
    const footer = els.sources.parentElement;
    [['corpus', meta.corpus], ['numbering', meta.numbering], ['disclaimer', meta.disclaimer]].forEach(([kind, text]) => {
      if (!text) return;
      const note = document.createElement('p');
      note.className = `lab-meta lab-meta-${kind}`;
      note.textContent = text;
      footer.append(note);
    });
  }

  document.getElementById('sheet-close').addEventListener('click', () => signSheet.close ? signSheet.close() : signSheet.removeAttribute('open'));
  signSheet.addEventListener('click', (event) => {
    if (event.target === signSheet) signSheet.close();
  });
  els.run.addEventListener('click', runTest);
  els.undo.addEventListener('click', () => { state.sequence.pop(); renderSequence(); });
  els.clear.addEventListener('click', () => { state.sequence = []; renderSequence(); });
  els.summary.textContent = `${corpus.length.toLocaleString()} corpus texts · ${totalSigns.toLocaleString()} sign occurrences · ${bigrams.size.toLocaleString()} distinct adjacent pairs. Source data and sign counts vary by edition.`;
  renderSigns();
  renderSeals();
  renderTheories();
  renderSources();
  renderSequence();
})();
