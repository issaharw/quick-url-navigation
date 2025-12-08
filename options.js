const showUrlCheckbox = document.getElementById('showUrl');
const savedIndicator = document.getElementById('savedIndicator');

// Load saved setting
chrome.storage.sync.get(['showUrl'], (result) => {
  // Default to true if not set
  showUrlCheckbox.checked = result.showUrl !== false;
});

// Save setting when changed
showUrlCheckbox.addEventListener('change', () => {
  chrome.storage.sync.set({ showUrl: showUrlCheckbox.checked }, () => {
    // Show saved indicator
    savedIndicator.classList.add('show');
    setTimeout(() => {
      savedIndicator.classList.remove('show');
    }, 1500);
  });
});

