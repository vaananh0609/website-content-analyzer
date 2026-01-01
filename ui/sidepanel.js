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

function renderKeywords(items) {
  if (!keywordsEl) return;
  if (!items || !items.length) {
    keywordsEl.textContent = '—';
    return;
  }
  keywordsEl.textContent = items.map(x => `- ${x.term} (${x.count})`).join('\n');
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

      const text = mainText && mainText.length >= 400 ? mainText : bodyText;

      const headingRoot = mainEl || document;
      const headings = Array.from(headingRoot.querySelectorAll('h1,h2,h3'))
        .map(getText)
        .filter(Boolean)
        .slice(0, 50);

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

analyzeButton.addEventListener('click', async function() {
  setError('');
  setLoading(true);
  setStatus('Analyzing...');
  summaryEl.textContent = 'Analyzing...';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const page = await getPageData();
    const payload = {
      text: page?.text || '',
      title: page?.title || tab.title || '',
      headings: page?.headings || [],
      mainText: page?.mainText || '',
      noiseText: page?.noiseText || '',
      task: 'full'
    };

    const response = await fetch('http://127.0.0.1:8000/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const errorMsg = data?.error || `HTTP ${response.status}`;
      throw new Error(errorMsg || 'Local NLP service error');
    }

    if (!data || !Array.isArray(data.summary) || !data.summary.length) {
      throw new Error('Không có tóm tắt để hiển thị');
    }

    summaryEl.textContent = data.summary.map((item) => `- ${item}`).join('\n');
    renderKeywords(data.keywords || []);
    setSentimentPill(data.sentiment);
    setMetadata({
      title: payload.title,
      url: tab.url || '',
      wordCount: typeof data.word_count === 'number' ? data.word_count : undefined
    });
    setStatus('Ready');
    selectTab('summary');
  } catch (error) {
    const message = (error && error.message) || 'Failed to analyze';
    setError(message);
    summaryEl.textContent = 'Error: ' + message;
    setStatus('Error');
  } finally {
    setLoading(false);
  }
});

setStatus('Ready');
selectTab('summary');

