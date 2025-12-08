// Track the popup window ID
let popupWindowId = null;

// Open or close the centered popup window
async function togglePopup() {
  // Check if popup is already open
  if (popupWindowId !== null) {
    try {
      const window = await chrome.windows.get(popupWindowId);
      if (window) {
        // Popup exists, close it
        await chrome.windows.remove(popupWindowId);
        popupWindowId = null;
        return;
      }
    } catch (e) {
      // Window doesn't exist anymore
      popupWindowId = null;
    }
  }
  
  // Open new popup
  const currentWindow = await chrome.windows.getCurrent();
  
  const popupWidth = 750;
  const popupHeight = 500;
  
  const left = Math.round(currentWindow.left + (currentWindow.width - popupWidth) / 2);
  const top = Math.round(currentWindow.top + (currentWindow.height - popupHeight) / 2);
  
  const popup = await chrome.windows.create({
    url: 'popup.html',
    type: 'popup',
    width: popupWidth,
    height: popupHeight,
    left: left,
    top: top,
    focused: true
  });
  
  popupWindowId = popup.id;
}

// Clean up when popup is closed
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) {
    popupWindowId = null;
  }
});

// Listen for keyboard shortcut command
chrome.commands.onCommand.addListener(async function(command) {
  if (command === "open-modal") {
    await togglePopup();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "openURL") {
    chrome.tabs.create({ url: request.url });
  } else if (request.action === "switchToTab") {
    chrome.tabs.update(request.tabId, { active: true });
    chrome.windows.update(request.windowId, { focused: true });
  } else if (request.action === "search") {
    searchAll(request.query).then(results => {
      sendResponse({ results: results });
    });
    return true;
  }
});

// Search tabs, bookmarks and history
async function searchAll(query) {
  if (!query.trim()) return [];
  
  const searchQuery = query.toLowerCase();
  
  const tabs = await searchTabs(searchQuery);
  const bookmarks = await searchBookmarks(searchQuery);
  const history = await searchHistory(searchQuery);
  
  // Combine results: tabs first, then history, then bookmarks
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
  
  return results.slice(0, 20);
}

function searchTabs(query) {
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
        .slice(0, 8)
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
      maxResults: 15
    }, (results) => {
      resolve(results.map(h => ({
        title: h.title || h.url,
        url: h.url
      })));
    });
  });
}
