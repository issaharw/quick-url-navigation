// Open a centered popup window
async function openCenteredPopup() {
  // Get current window to calculate center position
  const currentWindow = await chrome.windows.getCurrent();
  
  const popupWidth = 500;
  const popupHeight = 500;
  
  const left = Math.round(currentWindow.left + (currentWindow.width - popupWidth) / 2);
  const top = Math.round(currentWindow.top + (currentWindow.height - popupHeight) / 2 - 100);
  
  chrome.windows.create({
    url: 'popup.html',
    type: 'popup',
    width: popupWidth,
    height: popupHeight,
    left: left,
    top: top,
    focused: true
  });
}

// Listen for keyboard shortcut command
chrome.commands.onCommand.addListener(async function(command) {
  if (command === "open-modal") {
    // Get the active tab
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0]) {
      const tabId = tabs[0].id;
      const tabUrl = tabs[0].url || '';
      
      // Check if this is a restricted page
      const isRestricted = tabUrl.startsWith('chrome://') || 
                          tabUrl.startsWith('chrome-extension://') ||
                          tabUrl.startsWith('edge://') ||
                          tabUrl.startsWith('about:') ||
                          tabUrl === '';
      
      if (isRestricted) {
        // Open centered popup window for restricted pages
        openCenteredPopup();
        return;
      }
      
      try {
        // Try to send message to content script
        await chrome.tabs.sendMessage(tabId, {action: "toggleModal"});
      } catch (error) {
        // Content script not injected yet, inject it first
        try {
          await chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ["styles.css"]
          });
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content.js"]
          });
          // Now send the message
          await chrome.tabs.sendMessage(tabId, {action: "toggleModal"});
        } catch (injectError) {
          // Cannot inject on this page, open centered popup as fallback
          openCenteredPopup();
        }
      }
    }
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "openURL") {
    // Create new tab with the URL
    chrome.tabs.create({url: request.url});
  } else if (request.action === "switchToTab") {
    // Switch to existing tab
    chrome.tabs.update(request.tabId, { active: true });
    chrome.windows.update(request.windowId, { focused: true });
  } else if (request.action === "search") {
    // Search tabs, bookmarks and history
    searchAll(request.query).then(results => {
      sendResponse({ results: results });
    });
    return true; // Keep channel open for async response
  }
});

// Search tabs, bookmarks and history
async function searchAll(query) {
  if (!query.trim()) return [];
  
  const searchQuery = query.toLowerCase();
  
  // Search open tabs
  const tabs = await searchTabs(searchQuery);
  
  // Search bookmarks
  const bookmarks = await searchBookmarks(searchQuery);
  
  // Search history
  const history = await searchHistory(searchQuery);
  
  // Combine results, prioritizing tabs, then history, then bookmarks
  let results = [
    ...tabs.map(t => ({ ...t, type: 'tab' })),
    ...history.map(h => ({ ...h, type: 'history' })),
    ...bookmarks.map(b => ({ ...b, type: 'bookmark' }))
  ];
  
  // Remove duplicates
  const seen = new Set();
  results = results.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  
  return results.slice(0, 15);
}

function searchTabs(query) {
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

function searchBookmarks(query) {
  return new Promise(resolve => {
    chrome.bookmarks.search(query, (results) => {
      resolve(results
        .filter(b => b.url)
        .slice(0, 5)
        .map(b => ({
          title: b.title || b.url,
          url: b.url
        }))
      );
    });
  });
}

function searchHistory(query) {
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