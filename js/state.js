// ============================================================
// day1tabs — Mutable state, persistence, focus tracking,
//            classification, and shared computations
// ============================================================

// ---- In-Memory State ----
let tabTracker = {};
let currentActiveTabId = null;
let currentActiveStart = null;
let trackingActive = true;
let duplicateDetectionEnabled = false;
let cachedTabCount = 0;
let cachedSacredDomains = [];

// ============================================================
// TAB TRACKER PERSISTENCE (survives service worker kills)
// ============================================================

/**
 * Saves the current tabTracker to chrome.storage.local so it
 * survives service worker termination and restarts.
 */
async function saveTabTracker() {
  try {
    await _restoreReady;
    await chrome.storage.local.set({ tabTrackerBackup: tabTracker });
  } catch (e) {
    console.error('[day1tabs] Failed to save tabTracker backup:', e);
  }
}

/**
 * Restores tabTracker from chrome.storage.local after a service
 * worker restart. Removes stale entries for tabs that no longer
 * exist. Live in-memory data takes precedence over backup data.
 */
async function restoreTabTracker() {
  try {
    const data = await chrome.storage.local.get('tabTrackerBackup');
    const backup = data.tabTrackerBackup;
    if (!backup || typeof backup !== 'object') return;

    const openTabs = await chrome.tabs.query({});
    const openTabIds = new Set(openTabs.map(t => t.id));

    for (const tabIdStr of Object.keys(backup)) {
      const tabId = parseInt(tabIdStr, 10);
      if (!openTabIds.has(tabId)) {
        delete backup[tabIdStr];
        continue;
      }
      if (!tabTracker[tabId]) {
        tabTracker[tabId] = backup[tabIdStr];
      }
    }
  } catch (e) {
    console.error('[day1tabs] Failed to restore tabTracker backup:', e);
  }
}

// Save tracker when Chrome is about to kill the service worker
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(() => {
    saveTabTracker();
  });
}

// Eagerly restore on EVERY service worker wake
const _restoreReady = (typeof chrome !== 'undefined' && chrome.storage)
  ? (async () => {
      await restoreTabTracker();
      await syncCachedSettings();
    })()
  : Promise.resolve();

// ============================================================
// FOCUS TRACKING
// ============================================================

/**
 * Begins tracking focus time for the given tab.
 * @param {number} tabId - Chrome tab ID to track
 */
function startFocusTracking(tabId) {
  currentActiveTabId = tabId;
  currentActiveStart = Date.now();
}

/**
 * Stops tracking focus time for the current active tab,
 * accumulating elapsed time into the tracker, then persists
 * the tracker to storage.
 */
function stopFocusTracking() {
  if (currentActiveTabId !== null && currentActiveStart !== null && tabTracker[currentActiveTabId]) {
    const elapsed = Date.now() - currentActiveStart;
    tabTracker[currentActiveTabId].focusTime += elapsed;
  }
  currentActiveTabId = null;
  currentActiveStart = null;

  saveTabTracker();
}

/**
 * Creates a tracker entry for a tab if one doesn't already exist.
 * @param {number} tabId - Chrome tab ID
 * @param {{ url: string, title?: string, favIconUrl?: string }} tab - Tab data
 */
function ensureTabTracked(tabId, tab) {
  if (!tabTracker[tabId]) {
    tabTracker[tabId] = {
      url: tab.url,
      title: tab.title || 'Untitled',
      favIconUrl: tab.favIconUrl || '',
      activations: 0,
      focusTime: 0,
      lastActivated: null,
      createdAt: Date.now()
    };
  }
}

// ============================================================
// CLASSIFICATION
// ============================================================

/**
 * Classifies a tab based on its usage data.
 * - "workhorse": actively used (≥2 activations OR ≥60s focus)
 * - "glanced": briefly viewed
 * - "ghost": never or barely touched
 * @param {{ activations: number, focusTime: number }} tabData
 * @returns {'workhorse'|'glanced'|'ghost'}
 */
function classifyTab(tabData) {
  if (tabData.activations >= THRESHOLDS.WORKHORSE_ACTIVATIONS ||
      tabData.focusTime >= THRESHOLDS.WORKHORSE_FOCUS_MS) {
    return 'workhorse';
  }

  if (tabData.activations === 0 || tabData.focusTime < THRESHOLDS.GHOST_FOCUS_MS) {
    return 'ghost';
  }

  return 'glanced';
}

// ============================================================
// SHARED COMPUTATIONS (de-duplicated from multiple call sites)
// ============================================================

/**
 * Reads duplicateAutoClose and sacredDomains from storage and
 * caches them in module-scoped variables for fast access.
 */
async function syncCachedSettings() {
  const cachedData = await chrome.storage.local.get(['duplicateAutoClose', 'sacredDomains']);
  duplicateDetectionEnabled = !!cachedData.duplicateAutoClose;
  cachedSacredDomains = Array.isArray(cachedData.sacredDomains) ? cachedData.sacredDomains : [];
}

/**
 * Computes archive statistics from a list of archived tab entries.
 * @param {Array<{ classification: string, reopened?: boolean }>} tabs
 * @returns {{ total: number, reopened: number, used: number, didntUse: number }}
 */
function computeArchiveStats(tabs) {
  const nonReopened = tabs.filter(t => !t.reopened);
  return {
    total: tabs.length,
    reopened: tabs.filter(t => t.reopened).length,
    used: nonReopened.filter(t => t.classification === 'workhorse').length,
    didntUse: nonReopened.filter(t => t.classification !== 'workhorse').length
  };
}

/**
 * Clears the in-memory tabTracker for a new day cycle.
 */
function resetTracker() {
  tabTracker = {};
}

// ---- Conditional exports for testing ----
if (typeof module !== 'undefined' && module.exports) {
  // Proxy state variables to globalThis so other modules can reference
  // them by name (matching Chrome's importScripts shared-global behavior)
  Object.defineProperties(globalThis, {
    tabTracker: {
      get() { return tabTracker; },
      set(v) { tabTracker = v; },
      configurable: true
    },
    currentActiveTabId: {
      get() { return currentActiveTabId; },
      set(v) { currentActiveTabId = v; },
      configurable: true
    },
    currentActiveStart: {
      get() { return currentActiveStart; },
      set(v) { currentActiveStart = v; },
      configurable: true
    },
    trackingActive: {
      get() { return trackingActive; },
      set(v) { trackingActive = v; },
      configurable: true
    },
    duplicateDetectionEnabled: {
      get() { return duplicateDetectionEnabled; },
      set(v) { duplicateDetectionEnabled = v; },
      configurable: true
    },
    cachedTabCount: {
      get() { return cachedTabCount; },
      set(v) { cachedTabCount = v; },
      configurable: true
    },
    cachedSacredDomains: {
      get() { return cachedSacredDomains; },
      set(v) { cachedSacredDomains = v; },
      configurable: true
    }
  });

  module.exports = {
    saveTabTracker,
    restoreTabTracker,
    _restoreReady,
    startFocusTracking,
    stopFocusTracking,
    ensureTabTracked,
    classifyTab,
    syncCachedSettings,
    computeArchiveStats,
    resetTracker,
    _getState: () => ({ tabTracker, currentActiveTabId, currentActiveStart, trackingActive, duplicateDetectionEnabled, cachedTabCount, cachedSacredDomains }),
    _setState: (patch) => {
      if ('tabTracker' in patch) tabTracker = patch.tabTracker;
      if ('currentActiveTabId' in patch) currentActiveTabId = patch.currentActiveTabId;
      if ('currentActiveStart' in patch) currentActiveStart = patch.currentActiveStart;
      if ('trackingActive' in patch) trackingActive = patch.trackingActive;
      if ('duplicateDetectionEnabled' in patch) duplicateDetectionEnabled = patch.duplicateDetectionEnabled;
      if ('cachedTabCount' in patch) cachedTabCount = patch.cachedTabCount;
      if ('cachedSacredDomains' in patch) cachedSacredDomains = patch.cachedSacredDomains;
    }
  };
}
