// Create modal HTML
let results = [];
let selectedIndex = -1;
let debounceTimer = null;

function createModal() {
  if (document.getElementById('quick-url-modal')) {
    return; // Modal already exists
  }

  const modalHTML = `
    <div id="quick-url-modal" class="quick-url-modal hidden">
      <div class="quick-url-modal-content">
        <div class="quick-url-header">
          <h3>Quick URL Navigator</h3>
          <span class="quick-url-close">&times;</span>
        </div>
        <input 
          type="text" 
          id="quick-url-input" 
          placeholder="Search bookmarks, history, or enter URL..." 
          autocomplete="off"
        />
        <div id="quick-url-results" class="quick-url-results"></div>
        <div class="quick-url-hint">↑↓ Navigate • Enter to open • Esc to close</div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Get modal elements
  const modal = document.getElementById('quick-url-modal');
  const input = document.getElementById('quick-url-input');
  const closeBtn = document.querySelector('.quick-url-close');

  // Close button click
  closeBtn.addEventListener('click', () => {
    closeModal();
  });

  // Click outside modal to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Handle input
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
        closeModal();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  });
}

function search(query) {
  if (!query.trim()) {
    results = [];
    renderResults();
    return;
  }

  // Request search from background script
  chrome.runtime.sendMessage({ action: "search", query: query }, (response) => {
    if (response && response.results) {
      results = response.results;
      selectedIndex = results.length > 0 ? 0 : -1;
      renderResults();
    }
  });
}

function renderResults() {
  const container = document.getElementById('quick-url-results');
  if (!container) return;

  if (results.length === 0) {
    const input = document.getElementById('quick-url-input');
    if (input && input.value.trim()) {
      container.innerHTML = '<div class="quick-url-no-results">No matches found. Press Enter to navigate to URL.</div>';
    } else {
      container.innerHTML = '';
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
      html += `<div class="quick-url-section-label">${labels[currentType]}</div>`;
    }

    const icons = { tab: '🔄', history: '🕐', bookmark: '⭐' };
    const icon = icons[item.type];
    const selected = index === selectedIndex ? 'selected' : '';
    
    html += `
      <div class="quick-url-result-item ${selected}" data-index="${index}">
        <div class="quick-url-result-icon">${icon}</div>
        <div class="quick-url-result-content">
          <div class="quick-url-result-title">${escapeHtml(item.title)}</div>
          <div class="quick-url-result-url">${escapeHtml(item.url)}</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Add click handlers
  container.querySelectorAll('.quick-url-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      openResult(index);
    });
  });

  // Scroll selected into view
  const selectedEl = container.querySelector('.selected');
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
      chrome.runtime.sendMessage({ 
        action: "switchToTab", 
        tabId: item.tabId, 
        windowId: item.windowId 
      });
    } else {
      chrome.runtime.sendMessage({ action: "openURL", url: item.url });
    }
    closeModal();
  }
}

function openModal() {
  const modal = document.getElementById('quick-url-modal');
  const input = document.getElementById('quick-url-input');
  const container = document.getElementById('quick-url-results');
  
  if (modal) {
    modal.classList.remove('hidden');
    input.value = '';
    results = [];
    selectedIndex = -1;
    if (container) container.innerHTML = '';
    input.focus();
  }
}

function closeModal() {
  const modal = document.getElementById('quick-url-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function openURL(query) {
  // Search on Google
  const searchURL = 'https://www.google.com/search?q=' + encodeURIComponent(query);
  chrome.runtime.sendMessage({ action: "openURL", url: searchURL });
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleModal") {
    const modal = document.getElementById('quick-url-modal');
    if (!modal) {
      createModal();
      openModal();
    } else if (modal.classList.contains('hidden')) {
      openModal();
    } else {
      closeModal();
    }
  }
});

// Create modal when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createModal);
} else {
  createModal();
}
