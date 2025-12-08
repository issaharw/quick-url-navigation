const input = document.getElementById('url-input');
const resultsContainer = document.getElementById('results');
const infoIcon = document.getElementById('info-icon');

let results = [];
let selectedIndex = -1;
let debounceTimer = null;
let showUrl = true;

// Load settings
chrome.storage.sync.get(['showUrl'], (result) => {
  showUrl = result.showUrl !== false; // Default to true
});

// Open options page when clicking info icon
infoIcon.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Get favicon URL for a given page URL
function getFaviconUrl(url) {
  try {
    const urlObj = new URL(url);
    // Use Google's favicon service as fallback
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
  } catch {
    return null;
  }
}

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
  results = results.slice(0, 20);
  
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
      resolve(matches.slice(0, 8).map(tab => ({
        title: tab.title || tab.url,
        url: tab.url,
        tabId: tab.id,
        windowId: tab.windowId,
        favIconUrl: tab.favIconUrl
      })));
    });
  });
}

async function searchBookmarks(query) {
  return new Promise(resolve => {
    chrome.bookmarks.search(query, (results) => {
      resolve(results
        .filter(b => b.url) // Only items with URLs (not folders)
        .slice(0, 8)
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
      maxResults: 15
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
      resultsContainer.innerHTML = '<div class="no-results">No matches found. Press Enter to search.</div>';
    } else {
      resultsContainer.innerHTML = '';
    }
    return;
  }

  let html = '';

  results.forEach((item, index) => {
    const selected = index === selectedIndex ? 'selected' : '';
    
    // Get favicon - use tab's favicon if available, otherwise use Google's service
    const faviconUrl = item.favIconUrl || getFaviconUrl(item.url);
    const faviconHtml = faviconUrl 
      ? `<img src="${escapeHtml(faviconUrl)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="fallback-icon" style="display:none">🌐</span>`
      : `<span class="fallback-icon">🌐</span>`;
    
    // Action text and arrow
    const actionLabels = {
      tab: 'Switch to Tab',
      history: 'Open',
      bookmark: 'Open'
    };
    const actionLabel = actionLabels[item.type];
    
    const urlHtml = showUrl ? `<div class="result-url">${escapeHtml(item.url)}</div>` : '';
    
    html += `
      <div class="result-item ${selected}" data-index="${index}">
        <div class="result-favicon">${faviconHtml}</div>
        <div class="result-content">
          <div class="result-title">${escapeHtml(item.title)}</div>
          ${urlHtml}
        </div>
        <div class="result-action">
          ${actionLabel}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14"></path>
            <path d="m12 5 7 7-7 7"></path>
          </svg>
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
      // Switch to existing tab - send to background and close immediately
      chrome.runtime.sendMessage({ 
        action: 'switchToTab', 
        tabId: item.tabId, 
        windowId: item.windowId 
      });
    } else {
      chrome.runtime.sendMessage({ action: 'openURL', url: item.url });
    }
    window.close();
  }
}

function openURL(query) {
  // Search on Google
  const searchURL = 'https://www.google.com/search?q=' + encodeURIComponent(query);
  chrome.runtime.sendMessage({ action: 'openURL', url: searchURL });
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

// Close popup when window loses focus
window.addEventListener('blur', () => {
  window.close();
});
