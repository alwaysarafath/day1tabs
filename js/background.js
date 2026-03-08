// ============================================================
// day1tabs - Background Service Worker (entry point)
// Loads modules and wires Chrome event listeners
// ============================================================

// ---- Load sub-modules ----
// Chrome service worker: importScripts makes everything global
// Node/Jest: require + assign to globalThis for same effect
if (typeof importScripts !== 'undefined') {
  importScripts('constants.js', 'helpers.js', 'state.js', 'duplicates.js', 'tracking.js', 'reset.js', 'undo.js', 'messages.js');
} else if (typeof module !== 'undefined') {
  Object.assign(globalThis, require('./constants'));
  Object.assign(globalThis, require('./helpers'));
  Object.assign(globalThis, require('./state'));
  Object.assign(globalThis, require('./duplicates'));
  Object.assign(globalThis, require('./tracking'));
  Object.assign(globalThis, require('./reset'));
  Object.assign(globalThis, require('./undo'));
  Object.assign(globalThis, require('./messages'));
}

// ============================================================
// INITIALIZATION
// ============================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      sacredDomains: [],
      resetHour: DEFAULT_RESET_HOUR,
      resetMinute: DEFAULT_RESET_MINUTE,
      archive: [],
      undoData: null,
      onboardingComplete: false,
      resetEnabled: true,
      duplicateAutoClose: false,
      duplicateAutoCloseMinutes: DEFAULT_DUP_DELAY_MINUTES
    });
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/onboarding.html') });
  }

  await syncCachedSettings();
  await restoreTabTracker();
  await initializeExistingTabs();
  await scheduleResetAlarm();
  chrome.alarms.create(ALARM_SAVE_TRACKER, { periodInMinutes: SAVE_INTERVAL_MINUTES });
});

chrome.runtime.onStartup.addListener(async () => {
  await syncCachedSettings();
  await restoreTabTracker();
  await initializeExistingTabs();
  await scheduleResetAlarm();
  chrome.alarms.create(ALARM_SAVE_TRACKER, { periodInMinutes: SAVE_INTERVAL_MINUTES });
});

// ============================================================
// EVENT LISTENER WIRING
// ============================================================

registerTrackingListeners();
registerMessageListener();

// Alarm dispatcher
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_RESET) {
    await restoreTabTracker();
    await executeReset('auto');
  } else if (alarm.name === ALARM_SAVE_TRACKER) {
    saveTabTracker();
  } else if (alarm.name.startsWith(ALARM_DUP_PREFIX)) {
    await handleDupAlarm(alarm);
  }
});

// Open side panel when user clicks the extension icon
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// ---- Conditional exports for testing (Chrome ignores this) ----
if (typeof module !== 'undefined' && module.exports) {
  const _state = require('./state');
  const _dups = require('./duplicates');
  module.exports = {
    ...require('./constants'),
    ...require('./helpers'),
    ...require('./reset'),
    ...require('./undo'),
    ...require('./messages'),
    classifyTab: _state.classifyTab,
    saveTabTracker: _state.saveTabTracker,
    restoreTabTracker: _state.restoreTabTracker,
    stopFocusTracking: _state.stopFocusTracking,
    computeArchiveStats: _state.computeArchiveStats,
    syncCachedSettings: _state.syncCachedSettings,
    _getState: _state._getState,
    _setState: _state._setState,
    checkForDuplicates: _dups.checkForDuplicates,
    clearAllDuplicateTimers: _dups.clearAllDuplicateTimers,
    handleDupAlarm: _dups.handleDupAlarm
  };
}
