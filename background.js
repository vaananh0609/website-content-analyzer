// Background script for Website Content Analyzer Extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Website Content Analyzer installed');
});

// When the action icon is clicked, open the side panel
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Try to open side panel first
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ tabId: tab.id });
      console.log('Side panel opened successfully');
    } else {
      throw new Error('Side panel API not available');
    }
  } catch (err) {
    console.error('Failed to open side panel:', err);
    // Fallback: open popup window
    try {
      const focusedWindow = await chrome.windows.getLastFocused();
      const wLeft = focusedWindow.left || 0;
      const wTop = focusedWindow.top || 0;
      const wWidth = focusedWindow.width || 1200;
      const wHeight = focusedWindow.height || 800;
      const panelWidth = Math.max(400, Math.floor(wWidth / 3));
      const panelHeight = wHeight;
      const panelLeft = wLeft + wWidth - panelWidth;
      const panelTop = wTop;

      await chrome.windows.create({
        url: chrome.runtime.getURL('ui/sidepanel.html'),
        type: 'popup',
        left: panelLeft,
        top: panelTop,
        width: panelWidth,
        height: panelHeight
      });
      console.log('Fallback popup opened');
    } catch (fallbackErr) {
      console.error('Fallback also failed:', fallbackErr);
    }
  }
});
