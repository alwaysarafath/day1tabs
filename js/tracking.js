// ============================================================
// day1tabs — Tab event listeners and initialization
// Depends on: constants, helpers, state (via global scope)
// ============================================================

/**
 * Scans all currently open tabs and creates tracker entries for
 * any non-internal tabs not yet tracked. Starts focus tracking
 * for the currently active tab.
 */
async function initializeExistingTabs() {
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    if (!tabTracker[tab.id] && tab.url && !isInternalUrl(tab.url)) {
      ensureTabTracked(tab.id, tab);
    }
  }

  // Track the currently active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    startFocusTracking(activeTab.id);
  }
}

/**
 * Registers all Chrome tab/window event listeners for tracking
 * tab activations, URL changes, closures, and window focus changes.
 */
function registerTrackingListeners() {
  // When user switches to a tab
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (!trackingActive) return;

    await _restoreReady;
    stopFocusTracking();

    const tabId = activeInfo.tabId;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url && !isInternalUrl(tab.url)) {
        ensureTabTracked(tabId, tab);
        tabTracker[tabId].activations++;
        tabTracker[tabId].lastActivated = Date.now();
        startFocusTracking(tabId);
      }
    } catch (e) {
      // Tab may have been closed
    }

    checkForDuplicates(tabId);
  });

  // When a tab's URL or load status changes
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!trackingActive) return;

    const hasUrl = !!changeInfo.url;
    const isComplete = changeInfo.status === 'complete';
    if (!hasUrl && !isComplete) return;

    if (tab.url && !isInternalUrl(tab.url)) {
      if (!tabTracker[tabId]) {
        ensureTabTracked(tabId, tab);
      } else {
        if (hasUrl) tabTracker[tabId].url = tab.url;
        tabTracker[tabId].title = tab.title || tabTracker[tabId].title;
        tabTracker[tabId].favIconUrl = tab.favIconUrl || tabTracker[tabId].favIconUrl;
      }
    }

    if (isComplete && duplicateDetectionEnabled) {
      checkForDuplicates(tabId);
    }
  });

  // When a tab is closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (currentActiveTabId === tabId) {
      stopFocusTracking();
    }
    chrome.alarms.clear(`${ALARM_DUP_PREFIX}${tabId}`);
  });

  // When window focus changes
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (!trackingActive) return;
    await _restoreReady;

    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      stopFocusTracking();
    } else {
      const tabs = await chrome.tabs.query({ active: true, windowId });
      if (tabs[0] && tabs[0].url && !isInternalUrl(tabs[0].url)) {
        stopFocusTracking();
        ensureTabTracked(tabs[0].id, tabs[0]);
        if (currentActiveTabId !== tabs[0].id) {
          tabTracker[tabs[0].id].activations++;
          tabTracker[tabs[0].id].lastActivated = Date.now();
        }
        startFocusTracking(tabs[0].id);
      } else {
        stopFocusTracking();
      }
    }
  });
}

// ---- Conditional exports for testing ----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initializeExistingTabs, registerTrackingListeners };
}
