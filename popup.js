const input = document.getElementById('url-input');
const resultsContainer = document.getElementById('results');

let results = [];
let selectedIndex = -1;
let debounceTimer = null;

// Search open tabs, history and bookmarks
async function search(query) {
  if (!query.trim()) {
    results = [];
    renderResults();
    return;
  }

  const searchQuery = query.toLowerCase();
  
  // Search open tabs
  const tabs = await searchTabs(searchQuery);
  
  // Search bookmarks
  const bookmarks = await searchBookmarks(searchQuery);
  
  // Search history
  const history = await searchHistory(searchQuery);
  
  // Combine results, prioritizing open tabs, then history, then bookmarks
  results = [
    ...tabs.map(t => ({ ...t, type: 'tab' })),
    ...history.map(h => ({ ...h, type: 'history' })),
    ...bookmarks.map(b => ({ ...b, type: 'bookmark' }))
  ];
  
  // Remove duplicates (same URL), keeping the first occurrence (tabs > history > bookmarks)
  const seen = new Set();
  results = results.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  
  // Limit results
  results = results.slice(0, 15);
  
  selectedIndex = results.length > 0 ? 0 : -1;
  renderResults();
}

async function searchTabs(query) {
  return new Promise(resolve => {
    chrome.tabs.query({}, (tabs) => {
      const matches = tabs.filter(tab => {
        const title = (tab.title || '').toLowerCase();
        const url = (tab.url || '').toLowerCase();
        return title.includes(query) || url.includes(query);
      });
      resolve(matches.slice(0, 5).map(tab => ({
        title: tab.title || tab.url,
        url: tab.url,
        tabId: tab.id,
        windowId: tab.windowId
      })));
    });
  });
}

async function searchBookmarks(query) {
  return new Promise(resolve => {
    chrome.bookmarks.search(query, (results) => {
      resolve(results
        .filter(b => b.url) // Only items with URLs (not folders)
        .slice(0, 5)
        .map(b => ({
          title: b.title || b.url,
          url: b.url
        }))
      );
    });
  });
}

async function searchHistory(query) {
  return new Promise(resolve => {
    chrome.history.search({
      text: query,
      maxResults: 10
    }, (results) => {
      resolve(results.map(h => ({
        title: h.title || h.url,
        url: h.url
      })));
    });
  });
}

function renderResults() {
  if (results.length === 0) {
    if (input.value.trim()) {
      resultsContainer.innerHTML = '<div class="no-results">No matches found. Press Enter to navigate to URL.</div>';
    } else {
      resultsContainer.innerHTML = '';
    }
    return;
  }

  let html = '';
  let currentType = null;

  results.forEach((item, index) => {
    if (item.type !== currentType) {
      currentType = item.type;
      const labels = {
        tab: '🔄 Switch to tab',
        history: '🕐 History',
        bookmark: '⭐ Bookmarks'
      };
      html += `<div class="section-label">${labels[currentType]}</div>`;
    }

    const icons = { tab: '🔄', history: '🕐', bookmark: '⭐' };
    const icon = icons[item.type];
    const selected = index === selectedIndex ? 'selected' : '';
    
    html += `
      <div class="result-item ${selected}" data-index="${index}">
        <div class="result-icon">${icon}</div>
        <div class="result-content">
          <div class="result-title">${escapeHtml(item.title)}</div>
          <div class="result-url">${escapeHtml(item.url)}</div>
        </div>
      </div>
    `;
  });

  resultsContainer.innerHTML = html;

  // Add click handlers
  resultsContainer.querySelectorAll('.result-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      openResult(index);
    });
  });

  // Scroll selected into view
  const selectedEl = resultsContainer.querySelector('.selected');
  if (selectedEl) {
    selectedEl.scrollIntoView({ block: 'nearest' });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function openResult(index) {
  if (index >= 0 && index < results.length) {
    const item = results[index];
    if (item.type === 'tab' && item.tabId) {
      // Switch to existing tab
      chrome.tabs.update(item.tabId, { active: true });
      chrome.windows.update(item.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: item.url });
    }
    window.close();
  }
}

function openURL(query) {
  // Search on Google
  const searchURL = 'https://www.google.com/search?q=' + encodeURIComponent(query);
  chrome.tabs.create({ url: searchURL });
  window.close();
}

// Input event handlers
input.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    search(input.value);
  }, 150);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (results.length > 0) {
      selectedIndex = (selectedIndex + 1) % results.length;
      renderResults();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (results.length > 0) {
      selectedIndex = selectedIndex <= 0 ? results.length - 1 : selectedIndex - 1;
      renderResults();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedIndex >= 0 && results.length > 0) {
      openResult(selectedIndex);
    } else if (input.value.trim()) {
      openURL(input.value.trim());
    }
  } else if (e.key === 'Escape') {
    window.close();
  }
});

// Focus input on load
input.focus();
