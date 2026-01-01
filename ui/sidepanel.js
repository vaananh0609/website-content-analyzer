const analyzeButton = document.getElementById('analyze');
const statusEl = document.getElementById('status');
const spinnerEl = document.getElementById('spinner');
const errorEl = document.getElementById('error');

const summaryEl = document.getElementById('summary');
const keywordsEl = document.getElementById('keywords');
const sentimentEl = document.getElementById('sentiment');

const metaTitleEl = document.getElementById('meta-title');
const metaUrlEl = document.getElementById('meta-url');
const metaWordsEl = document.getElementById('meta-words');

const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const panelsByTab = {
  summary: document.getElementById('panel-summary'),
  keywords: document.getElementById('panel-keywords'),
  sentiment: document.getElementById('panel-sentiment')
};

function setSentimentPill(label) {
  if (!sentimentEl) return;
  const normalized = (label || 'Neutral').toLowerCase();
  sentimentEl.classList.remove('positive', 'neutral', 'negative');
  if (normalized === 'positive') sentimentEl.classList.add('positive');
  else if (normalized === 'negative') sentimentEl.classList.add('negative');
  else sentimentEl.classList.add('neutral');
  sentimentEl.textContent = label || 'Neutral';
}

function detectSentiment(text) {
  const s = normalizeText(text).toLowerCase();
  if (!s) return 'Neutral';

  // NOTE: This is a lightweight offline heuristic.
  // Avoid overly-generic positives like "great" (false-positive in "great replacement strategy").

  const POS = [
    { t: 'good', w: 1 },
    { t: 'excellent', w: 2 },
    { t: 'amazing', w: 2 },
    { t: 'best', w: 2 },
    { t: 'love', w: 1 },
    { t: 'success', w: 2 },
    { t: 'benefit', w: 1 },
    { t: 'benefits', w: 1 },
    { t: 'improve', w: 1 },
    { t: 'improvement', w: 1 },
    { t: 'helpful', w: 1 },
    { t: 'tốt', w: 1 },
    { t: 'xuất sắc', w: 2 },
    { t: 'tuyệt vời', w: 2 },
    { t: 'thành công', w: 2 },
    { t: 'lợi ích', w: 1 },
    { t: 'hữu ích', w: 1 },
    { t: 'cải thiện', w: 1 }
  ];

  const NEG = [
    { t: 'bad', w: 1 },
    { t: 'poor', w: 1 },
    { t: 'terrible', w: 2 },
    { t: 'awful', w: 2 },
    { t: 'worst', w: 2 },
    { t: 'worse', w: 1 },
    { t: 'fail', w: 1 },
    { t: 'failure', w: 1 },
    { t: 'harm', w: 2 },
    { t: 'risk', w: 1 },
    { t: 'danger', w: 2 },
    { t: 'threat', w: 2 },
    { t: 'threats', w: 2 },
    { t: 'fear', w: 1 },
    { t: 'fears', w: 1 },
    { t: 'violence', w: 2 },
    { t: 'violent', w: 2 },
    { t: 'assault', w: 2 },
    { t: 'attack', w: 2 },
    { t: 'shooting', w: 2 },
    { t: 'assassinated', w: 3 },
    { t: 'killed', w: 3 },
    { t: 'killing', w: 3 },
    { t: 'death', w: 3 },
    { t: 'dead', w: 3 },
    { t: 'racist', w: 3 },
    { t: 'racism', w: 3 },
    { t: 'sexist', w: 3 },
    { t: 'sexism', w: 3 },
    { t: 'bigot', w: 3 },
    { t: 'bigoted', w: 3 },
    { t: 'bigotry', w: 3 },
    { t: 'hate', w: 2 },
    { t: 'civil war', w: 2 },
    { t: 'tiêu cực', w: 2 },
    { t: 'tệ', w: 2 },
    { t: 'xấu', w: 1 },
    { t: 'kém', w: 1 },
    { t: 'thất bại', w: 2 },
    { t: 'rủi ro', w: 1 },
    { t: 'nguy hiểm', w: 2 },
    { t: 'bạo lực', w: 2 },
    { t: 'phân biệt chủng tộc', w: 3 },
    { t: 'kỳ thị', w: 2 }
  ];

  const escapeRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const phraseRe = (term) => {
    const parts = String(term).trim().split(/\s+/).filter(Boolean).map(escapeRe);
    if (!parts.length) return null;
    return new RegExp(`\\b${parts.join('\\s+')}\\b`, 'g');
  };

  const scoreList = (list) => {
    let score = 0;
    let hits = 0;
    for (const item of list) {
      const re = phraseRe(item.t);
      if (!re) continue;
      const m = s.match(re);
      if (!m) continue;
      hits += m.length;
      score += m.length * (item.w || 1);
    }
    return { score, hits };
  };

  const p = scoreList(POS);
  const n = scoreList(NEG);

  // If evidence is too weak, stay Neutral.
  if (p.hits + n.hits < 2) return 'Neutral';

  const score = p.score - n.score;
  if (score >= 3) return 'Positive';
  if (score <= -3) return 'Negative';
  return 'Neutral';
}

function setStatus(stateText) {
  statusEl.textContent = `Status: ${stateText || ''}`;
}

function setLoading(isLoading) {
  analyzeButton.disabled = isLoading;
  spinnerEl.setAttribute('data-visible', isLoading ? 'true' : 'false');
}

function setError(message) {
  const visible = Boolean(message);
  errorEl.textContent = message || '';
  errorEl.setAttribute('data-visible', visible ? 'true' : 'false');
}

function selectTab(tabKey) {
  tabs.forEach((tab) => {
    const isSelected = tab.dataset.tab === tabKey;
    tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  });

  Object.entries(panelsByTab).forEach(([key, panel]) => {
    if (!panel) return;
    if (key === tabKey) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
  });
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
});

function setMetadata({ title, url, wordCount }) {
  metaTitleEl.textContent = title || '—';
  metaUrlEl.textContent = url || '—';
  metaWordsEl.textContent = typeof wordCount === 'number' ? String(wordCount) : '—';
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[\t\r]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractKeywords(pageDataOrText, maxKeywords = 12, minCount = 1) {
  const pageData = typeof pageDataOrText === 'string'
    ? { text: pageDataOrText, title: '', headings: [] }
    : (pageDataOrText || { text: '', title: '', headings: [] });

  // Scale weights to keep integer scores (prevents decimals in UI output).
  const W = {
    TITLE_TERM: 60,
    TITLE_PHRASE: 80,
    HEADING_TERM: 40,
    HEADING_PHRASE: 50,
    MAIN_TERM: 10,
    MAIN_PHRASE: 10,
    NOISE_TERM: 3,
    NOISE_PHRASE: 3
  };

  const englishStop = new Set([
    'the','a','an','and','or','but','if','then','else','when','while','for','to','of','in','on','at','by','from','with','as','into','about','over','under',
    'is','are','was','were','be','been','being','do','does','did','can','could','should','would','will','may','might','must',
    'this','that','these','those','it','its','they','them','their','we','you','your','i','he','she','his','her','our','us',
    'not','no','yes','more','most','less','very','also','just','than','too'
  ]);

  const vietnameseStop = new Set([
    'và','là','của','cho','trong','với','một','những','các','để','khi','thì','từ','đến','trên','dưới','về','này','đó','đang','được','bị','có','không',
    'ở','ra','vào','như','theo','hơn','rất','cũng'
  ]);

  const isStop = (t) => englishStop.has(t) || vietnameseStop.has(t);

  // Tokenizer that preserves common technical hyphenated terms like "k-means".
  // Example: "k-means clustering" => ["k-means","clustering"].
  const tokenize = (s) => {
    const cleaned = normalizeText(s);
    if (!cleaned) return [];

    const tokens = [];
    const re = /[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*/gu;
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      const t = String(m[0] || '').toLowerCase();
      if (!t) continue;
      if (t.length < 2) continue;
      if (/^\d+$/.test(t)) continue;
      tokens.push(t);
    }
    return tokens;
  };

  const addWeightedTerms = (tokens, weight, counts) => {
    for (const t of tokens) {
      if (t.length < 3) continue;
      if (isStop(t)) continue;
      counts.set(t, (counts.get(t) || 0) + weight);
    }
  };

  const addWeightedPhrases = (tokens, weight, counts) => {
    const words = tokens.filter(t => t.length >= 2);
    for (let i = 0; i < words.length - 1; i++) {
      const w1 = words[i];
      const w2 = words[i + 1];
      if (isStop(w1) || isStop(w2)) continue;
      const bi = `${w1} ${w2}`;
      counts.set(bi, (counts.get(bi) || 0) + weight);

      if (i < words.length - 2) {
        const w3 = words[i + 2];
        if (isStop(w3)) continue;
        const tri = `${w1} ${w2} ${w3}`;
        counts.set(tri, (counts.get(tri) || 0) + weight);
      }
    }
  };

  const counts = new Map();

  const titleTokens = tokenize(pageData.title || '');
  addWeightedTerms(titleTokens, W.TITLE_TERM, counts);
  addWeightedPhrases(titleTokens, W.TITLE_PHRASE, counts);

  const headingText = Array.isArray(pageData.headings) ? pageData.headings.join(' ') : '';
  const headingTokens = tokenize(headingText);
  addWeightedTerms(headingTokens, W.HEADING_TERM, counts);
  addWeightedPhrases(headingTokens, W.HEADING_PHRASE, counts);

  // Main body text (prefer mainText if provided; fallback to text).
  const mainTokens = tokenize(pageData.mainText || pageData.text || '');
  addWeightedTerms(mainTokens, W.MAIN_TERM, counts);
  addWeightedPhrases(mainTokens, W.MAIN_PHRASE, counts);

  // Down-weight likely boilerplate (footer/nav/sidebar/newsletter), but keep it as context.
  const noiseTokens = tokenize(pageData.noiseText || '');
  addWeightedTerms(noiseTokens, W.NOISE_TERM, counts);
  addWeightedPhrases(noiseTokens, W.NOISE_PHRASE, counts);

  const results = Array.from(counts.entries())
    .filter(([term]) => term.length >= 3)
    // Prefer longer phrases first, then higher score.
    .sort((a, b) => {
      const aWords = a[0].split(' ').length;
      const bWords = b[0].split(' ').length;
      if (aWords !== bWords) return bWords - aWords;
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

  const picked = [];
  for (const [term, score] of results) {
    if (picked.length >= maxKeywords) break;

    // If we already have a phrase that contains this single word, skip the single word.
    if (!term.includes(' ')) {
      const containedInPhrase = picked.some(p => p.term.split(' ').includes(term));
      if (containedInPhrase) continue;
    }

    picked.push({ term, count: score });
  }

  // Final cleanup: if a single-word keyword is part of any returned phrase, drop it.
  const wordsInPhrases = new Set(
    picked
      .filter(p => p.term.includes(' '))
      .flatMap(p => p.term.split(' '))
  );

  const finalPicked = picked.filter(p => {
    if (p.term.includes(' ')) return true;
    return !wordsInPhrases.has(p.term);
  });

  // Compute real frequency (occurrences) for display.
  // We keep the weighted score for ranking, but show frequency to avoid confusion like "9 => 90".
  const frequencyTokens = tokenize([
    pageData.title || '',
    Array.isArray(pageData.headings) ? pageData.headings.join(' ') : '',
    pageData.mainText || pageData.text || ''
  ].join('\n'));

  const countOccurrences = (haystackTokens, needleTokens) => {
    if (!needleTokens.length) return 0;
    if (needleTokens.length === 1) {
      const needle = needleTokens[0];
      let c = 0;
      for (const t of haystackTokens) if (t === needle) c++;
      return c;
    }

    let c = 0;
    for (let i = 0; i <= haystackTokens.length - needleTokens.length; i++) {
      let ok = true;
      for (let j = 0; j < needleTokens.length; j++) {
        if (haystackTokens[i + j] !== needleTokens[j]) {
          ok = false;
          break;
        }
      }
      if (ok) c++;
    }
    return c;
  };

  return finalPicked
    .slice(0, Math.max(maxKeywords * 5, maxKeywords))
    .map(({ term, count: score }) => ({
      term,
      count: countOccurrences(frequencyTokens, tokenize(term)),
      score
    }))
    .filter(x => x.count >= minCount)
    // Keep ranking by weighted score, but only display terms meeting minCount.
    .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term))
    .slice(0, maxKeywords);
}

function renderKeywords(items) {
  if (!keywordsEl) return;
  if (!items || !items.length) {
    keywordsEl.textContent = '—';
    return;
  }
  keywordsEl.textContent = items.map(x => `- ${x.term} (${x.count})`).join('\n');
}

function countWords(text) {
  const cleaned = normalizeText(text).replace(/\n/g, ' ');
  if (!cleaned) return 0;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  return tokens.length;
}

function splitSentences(text) {
  const cleaned = normalizeText(text);
  if (!cleaned) return [];
  const parts = cleaned
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?。！？])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  return parts;
}


async function getPageData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      const getText = (el) => (el && el.innerText ? el.innerText : '').trim();
      const pickMain = () => {
        const candidates = Array.from(document.querySelectorAll('main, article, [role="main"]'));
        let best = null;
        let bestLen = 0;
        for (const el of candidates) {
          const t = getText(el);
          const len = t.length;
          if (len > bestLen) {
            best = el;
            bestLen = len;
          }
        }
        return best;
      };

      const mainEl = pickMain();
      const mainText = mainEl ? getText(mainEl) : '';
      const bodyText = String(document.body?.innerText || '');

      // Prefer main content for analysis/summarization when it looks real; fallback to full body.
      const text = mainText && mainText.length >= 400 ? mainText : bodyText;

      // Headings inside main content (prefer), fallback to all page headings.
      const headingRoot = mainEl || document;
      const headings = Array.from(headingRoot.querySelectorAll('h1,h2,h3'))
        .map(getText)
        .filter(Boolean)
        .slice(0, 50);

      // Boilerplate-ish sections to down-weight in keyword extraction.
      const noiseEls = Array.from(document.querySelectorAll('nav, footer, aside, header'));
      const noiseText = noiseEls.map(getText).filter(Boolean).join('\n').slice(0, 20000);

      return {
        title: String(document.title || ''),
        headings,
        text,
        mainText,
        noiseText
      };
    }
  });
  return result[0].result;
}

async function runSummary(text) {
  const response = await fetch('http://127.0.0.1:8000/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text, task: 'summary' })
  });

  const raw = await response.text().catch(() => '');
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }

  if (!response.ok) {
    const detail = data?.detail;
    const detailMsg = Array.isArray(detail)
      ? detail.map(d => d?.msg).filter(Boolean).join('; ')
      : (typeof detail === 'string' ? detail : '');
    const message = data?.error || detailMsg || raw || `HTTP ${response.status}`;
    throw new Error(message || 'Local NLP service error');
  }

  if (!data || !data.summary) {
    throw new Error('No summary available');
  }

  return data.summary;
}





function buildWordAwareChunks(text, maxWords = 1000) {
  if (!text) return [];
  const sentences = splitSentences(text);
  if (!sentences.length) {
    const fallbackTokens = normalizeText(text)
      .split(/\s+/)
      .filter(Boolean);
    if (!fallbackTokens.length) return [];
    const fallbackChunks = [];
    for (let i = 0; i < fallbackTokens.length; i += maxWords) {
      fallbackChunks.push(fallbackTokens.slice(i, i + maxWords).join(' '));
    }
    return fallbackChunks;
  }

  const chunks = [];
  let currentChunk = [];
  let currentCount = 0;

  for (const sentence of sentences) {
    const tokenCount = sentence.split(/\s+/).filter(Boolean).length;
    if (tokenCount === 0) continue;
    if (currentCount + tokenCount > maxWords && currentChunk.length) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [];
      currentCount = 0;
    }
    currentChunk.push(sentence);
    currentCount += tokenCount;
  }

  if (currentChunk.length) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks;
}

async function summarizeChunks(text, chunkWordSize = 1000) {
  summaryEl.innerText = '';

  const chunks = buildWordAwareChunks(text, chunkWordSize);
  if (!chunks.length) {
    summaryEl.innerText = '- Không có văn bản để tóm tắt.';
    return;
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;
    try {
      const summary = await runSummary(chunk);
      summaryEl.innerText += `- ${summary}\n`;
    } catch (e) {
      summaryEl.innerText += `- [Lỗi phần ${i + 1}: ${e.message}]\n`;
    }
  }
}


analyzeButton.addEventListener('click', async function() {
  setError('');
  setLoading(true);
  setStatus('Analyzing...');
  summaryEl.textContent = 'Analyzing...';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const page = await getPageData();
    const text = page?.text || '';

    setSentimentPill(detectSentiment(page?.mainText || text));

    renderKeywords(extractKeywords({
      text,
      title: page?.title || tab.title || '',
      headings: page?.headings || [],
      mainText: page?.mainText || '',
      noiseText: page?.noiseText || ''
    }, 5, 5));
    const wordCount = countWords(text);
    const title = tab.title || page?.title || '';
    const url = tab.url || '';
    setMetadata({ title, url, wordCount });
    await summarizeChunks(text, 1000);
    setStatus('Ready');
    setLoading(false);
    selectTab('summary');
  } catch (e) {
    setError(e.message || 'Failed to analyze');
    summaryEl.textContent = 'Error: ' + (e.message || 'Failed to analyze');
    setStatus('Error');
    setLoading(false);
  }
});
setStatus('Ready');
selectTab('summary');

