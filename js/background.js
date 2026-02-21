// ============================================================
// day1tabs - Background Service Worker
// Core: Tab tracking, classification, midnight reset, undo
// ============================================================

// ---- Constants ----
const THRESHOLDS = {
  WORKHORSE_ACTIVATIONS: 2,
  WORKHORSE_FOCUS_MS: 60000,    // 1 minute
  GLANCED_FOCUS_MS: 30000,      // 30 seconds
  GHOST_FOCUS_MS: 5000           // 5 seconds
};

const DEFAULT_RESET_HOUR = 0;  // midnight
const DEFAULT_RESET_MINUTE = 0;

// ---- In-Memory State ----
// Tracks tab activity for the current session/day
// Structure: { [tabId]: { url, title, favIconUrl, activations, focusTime, lastActivated, createdAt } }
let tabTracker = {};
let currentActiveTabId = null;
let currentActiveStart = null;
let trackingActive = true;

// ============================================================
// INITIALIZATION
// ============================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Set defaults
    await chrome.storage.local.set({
      sacredDomains: [],
      resetHour: DEFAULT_RESET_HOUR,
      resetMinute: DEFAULT_RESET_MINUTE,
      archive: [],
      undoData: null,
      onboardingComplete: false,
      resetEnabled: true,
      duplicateAutoClose: false,
      duplicateAutoCloseMinutes: 10
    });

    // Open onboarding
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/onboarding.html') });
  }

  // Initialize tracking for existing tabs
  await initializeExistingTabs();

  // Schedule the reset alarm
  await scheduleResetAlarm();

  // Update badge
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeExistingTabs();
  await scheduleResetAlarm();
  await updateBadge();
});

async function initializeExistingTabs() {
  const tabs = await chrome.tabs.query({});
  const now = Date.now();

  for (const tab of tabs) {
    if (!tabTracker[tab.id] && tab.url && !isInternalUrl(tab.url)) {
      tabTracker[tab.id] = {
        url: tab.url,
        title: tab.title || 'Untitled',
        favIconUrl: tab.favIconUrl || '',
        activations: 0,
        focusTime: 0,
        lastActivated: null,
        createdAt: now
      };
    }
  }

  // Track the currently active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    startFocusTracking(activeTab.id);
  }
}

// ============================================================
// TAB TRACKING
// ============================================================

// When user switches to a tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!trackingActive) return;

  // Stop tracking previous tab's focus time
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

  // Check for duplicate tabs
  checkForDuplicates(tabId);
});

// When a tab's URL changes (navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!trackingActive) return;

  if (changeInfo.url || changeInfo.title) {
    if (tab.url && !isInternalUrl(tab.url)) {
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
      } else {
        // Update URL and title if changed
        tabTracker[tabId].url = tab.url;
        tabTracker[tabId].title = tab.title || tabTracker[tabId].title;
        tabTracker[tabId].favIconUrl = tab.favIconUrl || tabTracker[tabId].favIconUrl;
      }
    }

    // Update badge whenever a tab's URL changes (new tab navigated, etc.)
    if (changeInfo.url) {
      updateBadge();
      checkForDuplicates(tabId);
    }
  }
});

// When a tab is created
chrome.tabs.onCreated.addListener((tab) => {
  if (!trackingActive) return;
  updateBadge();

  // Check for duplicates after a short delay (URL may not be set yet)
  setTimeout(async () => {
    try {
      const updated = await chrome.tabs.get(tab.id);
      if (updated.url && !isInternalUrl(updated.url)) {
        checkForDuplicates(tab.id);
      }
    } catch (e) {
      // Tab may have been closed already
    }
  }, 1000);
});

// When a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (currentActiveTabId === tabId) {
    stopFocusTracking();
  }
  // Clear any duplicate timer for this tab
  if (duplicateTimers[tabId]) {
    clearTimeout(duplicateTimers[tabId]);
    delete duplicateTimers[tabId];
  }
  // Don't delete from tracker - we need this data for classification
  updateBadge();
});

// When window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (!trackingActive) return;

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus entirely
    stopFocusTracking();
  } else {
    // Switched to a different window — track its active tab
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
      if (tabs[0] && tabs[0].url && !isInternalUrl(tabs[0].url)) {
        stopFocusTracking();
        ensureTabTracked(tabs[0].id, tabs[0]);
        // Count this as an activation (user intentionally came to this window)
        if (currentActiveTabId !== tabs[0].id) {
          tabTracker[tabs[0].id].activations++;
          tabTracker[tabs[0].id].lastActivated = Date.now();
        }
        startFocusTracking(tabs[0].id);
      } else {
        stopFocusTracking();
      }
    });
  }
});

function startFocusTracking(tabId) {
  currentActiveTabId = tabId;
  currentActiveStart = Date.now();
}

function stopFocusTracking() {
  if (currentActiveTabId !== null && currentActiveStart !== null && tabTracker[currentActiveTabId]) {
    const elapsed = Date.now() - currentActiveStart;
    tabTracker[currentActiveTabId].focusTime += elapsed;
  }
  currentActiveTabId = null;
  currentActiveStart = null;
}

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

function classifyTab(tabData) {
  // Workhorse: heavily used
  if (tabData.activations >= THRESHOLDS.WORKHORSE_ACTIVATIONS ||
      tabData.focusTime >= THRESHOLDS.WORKHORSE_FOCUS_MS) {
    return 'workhorse';
  }

  // Ghost: never meaningfully interacted with
  if (tabData.activations === 0 || tabData.focusTime < THRESHOLDS.GHOST_FOCUS_MS) {
    return 'ghost';
  }

  // Glanced: briefly touched
  return 'glanced';
}

// ============================================================
// MIDNIGHT RESET
// ============================================================

async function scheduleResetAlarm() {
  // Clear existing alarm
  await chrome.alarms.clear('day1tabs-reset');

  const data = await chrome.storage.local.get(['resetHour', 'resetMinute', 'resetEnabled']);

  if (data.resetEnabled === false) return;

  const hour = data.resetHour ?? DEFAULT_RESET_HOUR;
  const minute = data.resetMinute ?? DEFAULT_RESET_MINUTE;

  // Calculate next reset time
  const now = new Date();
  let resetTime = new Date();
  resetTime.setHours(hour, minute, 0, 0);

  // If reset time has already passed today, schedule for tomorrow
  if (resetTime <= now) {
    resetTime.setDate(resetTime.getDate() + 1);
  }

  const delayInMinutes = (resetTime.getTime() - now.getTime()) / 60000;

  chrome.alarms.create('day1tabs-reset', {
    delayInMinutes: delayInMinutes,
    periodInMinutes: 24 * 60  // Repeat daily
  });

  console.log(`[day1tabs] Reset scheduled for ${resetTime.toLocaleString()}`);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'day1tabs-reset') {
    await executeReset('auto');
  }
});

async function executeReset(source) {
  source = source || 'auto';
  console.log(`[day1tabs] executeReset called, source=${source}`);

  const data = await chrome.storage.local.get(['sacredDomains', 'resetEnabled']);

  // Only check resetEnabled for scheduled (auto) resets, not manual
  if (source !== 'manual' && data.resetEnabled === false) {
    console.log('[day1tabs] Reset skipped — auto-close is disabled');
    return;
  }

  // Flush current focus tracking
  stopFocusTracking();

  const sacredDomains = data.sacredDomains || [];
  const allTabs = await chrome.tabs.query({});
  console.log(`[day1tabs] Total tabs found: ${allTabs.length}, sacred domains: ${sacredDomains.join(', ')}`);

  const tabsToClose = [];
  const tabsToKeep = [];
  const archiveEntries = [];

  for (const tab of allTabs) {
    // Skip internal chrome pages — but close new-tab pages (empty clutter)
    if (!tab.url || isInternalUrl(tab.url)) {
      if (tab.url && tab.url.startsWith('chrome://newtab')) {
        tabsToClose.push(tab.id);  // close but don't archive
      } else {
        tabsToKeep.push(tab);
      }
      continue;
    }

    // Skip pinned tabs
    if (tab.pinned) {
      tabsToKeep.push(tab);
      continue;
    }

    // Check if tab's domain is in never-close list
    const domain = extractDomain(tab.url);
    if (sacredDomains.some(sd => isDomainMatch(domain, sd))) {
      tabsToKeep.push(tab);
      continue;
    }

    // This tab gets reset
    const trackingData = tabTracker[tab.id] || {
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      activations: 0,
      focusTime: 0,
      lastActivated: null,
      createdAt: Date.now()
    };

    const classification = classifyTab(trackingData);

    archiveEntries.push({
      url: trackingData.url,
      title: trackingData.title || tab.title || 'Untitled',
      favIconUrl: trackingData.favIconUrl || tab.favIconUrl || '',
      classification: classification,
      activations: trackingData.activations,
      focusTime: trackingData.focusTime,
      closedAt: Date.now()
    });

    tabsToClose.push(tab.id);
  }

  // Include duplicates auto-closed during the day
  const dupData = await chrome.storage.local.get('duplicatesClosedToday');
  const duplicatesClosedToday = dupData.duplicatesClosedToday || [];

  // Save archive
  const archive = await chrome.storage.local.get('archive');
  const existingArchive = archive.archive || [];

  // Detect duplicate URLs
  const urlCounts = {};
  for (const entry of archiveEntries) {
    urlCounts[entry.url] = (urlCounts[entry.url] || 0) + 1;
  }
  const duplicates = Object.entries(urlCounts)
    .filter(([, count]) => count >= 2)
    .map(([url, count]) => {
      const tab = archiveEntries.find(e => e.url === url);
      return { url, title: tab.title, favIconUrl: tab.favIconUrl, count };
    });

  const todayArchive = {
    date: new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    tabs: archiveEntries,
    duplicates: duplicates,
    duplicatesClosed: duplicatesClosedToday,
    stats: {
      total: archiveEntries.length,
      reopened: 0,
      used: archiveEntries.filter(t => t.classification === 'workhorse').length,
      didntUse: archiveEntries.filter(t => t.classification !== 'workhorse').length
    }
  };

  // Keep only last 1 day for free tier (could be extended for paid)
  existingArchive.unshift(todayArchive);
  const trimmedArchive = existingArchive.slice(0, 1);

  // Save undo data — persists until next reset
  const undoData = {
    tabs: allTabs.filter(t => tabsToClose.includes(t.id)).map(t => ({
      url: t.url,
      pinned: t.pinned,
      windowId: t.windowId
    })),
    resetAt: Date.now()
  };

  await chrome.storage.local.set({
    archive: trimmedArchive,
    undoData: undoData,
    duplicatesClosedToday: []  // reset for new day
  });

  console.log(`[day1tabs] tabsToClose: ${tabsToClose.length}, tabsToKeep: ${tabsToKeep.length}`);

  // Ensure at least one tab will remain so the browser doesn't quit
  const hasKeptNormalTab = tabsToKeep.some(t => !isInternalUrl(t.url));
  if (!hasKeptNormalTab) {
    console.log('[day1tabs] No normal tabs kept, creating new tab');
    await chrome.tabs.create({ url: 'chrome://newtab' });
  }

  // Close all marked tabs across all windows
  if (tabsToClose.length > 0) {
    console.log(`[day1tabs] About to close tab IDs: ${tabsToClose.join(', ')}`);
    try {
      await chrome.tabs.remove(tabsToClose);
      console.log('[day1tabs] Batch close succeeded');
    } catch (e) {
      console.error('[day1tabs] Batch close failed, closing individually:', e);
      for (const tabId of tabsToClose) {
        try {
          await chrome.tabs.remove(tabId);
          console.log(`[day1tabs] Closed tab ${tabId}`);
        } catch (e2) {
          console.error(`[day1tabs] Failed to close tab ${tabId}:`, e2);
        }
      }
    }
  } else {
    console.log('[day1tabs] No tabs to close');
  }

  // Reset tracker for new day
  tabTracker = {};

  // Re-initialize tracking for remaining tabs
  await initializeExistingTabs();
  await updateBadge();

  // Open side panel after reset
  if (tabsToClose.length > 0) {
    await chrome.storage.local.set({ lastResetSource: source });
    try {
      const [focusedWindow] = await chrome.windows.getAll({ windowTypes: ['normal'] });
      if (focusedWindow) {
        await chrome.sidePanel.open({ windowId: focusedWindow.id });
      }
    } catch (e) {
      console.log('[day1tabs] Could not open side panel after reset:', e);
    }
  }

  console.log(`[day1tabs] Reset complete. Closed ${tabsToClose.length} tabs. Kept ${tabsToKeep.length}.`);
}

// ============================================================
// UNDO
// ============================================================

async function executeUndo() {
  const data = await chrome.storage.local.get(['undoData', 'archive']);
  const undoData = data.undoData;

  if (!undoData) {
    return { success: false, reason: 'No undo data available' };
  }

  const archiveArr = data.archive || [];

  // Get all currently open URLs to avoid duplicates (e.g. never-close tabs still open)
  const openTabs = await chrome.tabs.query({});
  const openUrls = new Set(openTabs.map(t => t.url));

  // Only reopen tabs that aren't already open in the browser
  let reopenedCount = 0;
  for (const tab of undoData.tabs) {
    if (openUrls.has(tab.url)) {
      openUrls.add(tab.url); // already there, skip
      continue;
    }
    try {
      await chrome.tabs.create({
        url: tab.url,
        pinned: tab.pinned
      });
      openUrls.add(tab.url);
      reopenedCount++;
    } catch (e) {
      console.error('[day1tabs] Error reopening tab:', e);
    }
  }

  // Mark all archive tabs as reopened (full undo)
  if (archiveArr.length > 0) {
    for (const tab of archiveArr[0].tabs) {
      tab.reopened = true;
    }
    archiveArr[0].stats = {
      total: archiveArr[0].tabs.length,
      reopened: archiveArr[0].tabs.length,
      used: 0,
      didntUse: 0
    };
    await chrome.storage.local.set({ archive: archiveArr });
  }

  // Clear undo data
  await chrome.storage.local.set({ undoData: null });
  await updateBadge();

  return { success: true, count: reopenedCount };
}

// ============================================================
// BADGE
// ============================================================

async function updateBadge() {
  try {
    const tabs = await chrome.tabs.query({});
    const count = tabs.length;

    const text = count > 0 ? String(count) : '';

    // Color coding
    let color;
    if (count <= 10) color = '#22c55e';       // green
    else if (count <= 30) color = '#f59e0b';   // amber
    else if (count <= 60) color = '#f97316';    // orange
    else color = '#ef4444';                     // red

    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch (e) {
    // Ignore errors during startup
  }
}

// ============================================================
// HELPERS
// ============================================================

function isInternalUrl(url) {
  return !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://');
}


function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isDomainMatch(tabHostname, storedDomain) {
  return tabHostname === storedDomain || tabHostname.endsWith('.' + storedDomain);
}

// ============================================================
// DUPLICATE TAB AUTO-CLOSE
// ============================================================

// Timers for duplicate tabs: { [tabId]: timeoutId }
let duplicateTimers = {};

function clearAllDuplicateTimers() {
  for (const tabId of Object.keys(duplicateTimers)) {
    clearTimeout(duplicateTimers[tabId]);
  }
  duplicateTimers = {};
}

async function checkForDuplicates(triggeredByTabId) {
  const data = await chrome.storage.local.get(['duplicateAutoClose', 'duplicateAutoCloseMinutes', 'sacredDomains']);
  if (!data.duplicateAutoClose) return;

  const delayMs = (data.duplicateAutoCloseMinutes || 10) * 60 * 1000;
  const sacredDomains = data.sacredDomains || [];

  let triggerTab;
  try {
    triggerTab = await chrome.tabs.get(triggeredByTabId);
  } catch (e) {
    return;
  }

  if (!triggerTab.url || isInternalUrl(triggerTab.url)) return;

  // Never auto-close pinned tabs
  if (triggerTab.pinned) return;

  // Never auto-close duplicates of never-close domains
  const domain = extractDomain(triggerTab.url);
  if (sacredDomains.some(sd => isDomainMatch(domain, sd))) return;

  // Find ALL tabs with this URL
  const allTabs = await chrome.tabs.query({});
  const sameUrlTabs = allTabs.filter(t => t.url === triggerTab.url);

  if (sameUrlTabs.length < 2) {
    if (duplicateTimers[triggeredByTabId]) {
      clearTimeout(duplicateTimers[triggeredByTabId]);
      delete duplicateTimers[triggeredByTabId];
    }
    return;
  }

  // Find the currently focused tab among the duplicates
  const [focusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const focusedId = focusedTab ? focusedTab.id : null;

  const focusedDup = sameUrlTabs.find(t => t.id === focusedId);
  const keepTabId = focusedDup ? focusedDup.id : triggeredByTabId;

  // Cancel timer on the tab we're keeping
  if (duplicateTimers[keepTabId]) {
    clearTimeout(duplicateTimers[keepTabId]);
    delete duplicateTimers[keepTabId];
  }

  // Start timers on all other copies
  for (const dup of sameUrlTabs) {
    if (dup.id === keepTabId) continue;
    if (duplicateTimers[dup.id]) continue;

    duplicateTimers[dup.id] = setTimeout(async () => {
      delete duplicateTimers[dup.id];
      try {
        const tabToClose = await chrome.tabs.get(dup.id);
        if (tabToClose.pinned) return; // Never close pinned tabs
        await logDuplicateClosure(tabToClose);
        await chrome.tabs.remove(dup.id);
      } catch (e) {
        // Tab may already be closed
      }
    }, delayMs);
  }
}

async function logDuplicateClosure(tab) {
  const data = await chrome.storage.local.get(['duplicatesClosedToday', 'duplicatesClosedDate']);
  const today = new Date().toISOString().split('T')[0];

  // Reset if it's a new calendar day
  let list = data.duplicatesClosedToday || [];
  if (data.duplicatesClosedDate !== today) {
    list = [];
  }

  list.push({
    url: tab.url,
    title: tab.title || 'Untitled',
    favIconUrl: tab.favIconUrl || '',
    closedAt: Date.now()
  });
  await chrome.storage.local.set({ duplicatesClosedToday: list, duplicatesClosedDate: today });
}

// ============================================================
// MESSAGE HANDLING (from popup & archive page)
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(e => {
      console.error('[day1tabs] Message handler error:', e);
      sendResponse({ error: e.message });
    });
  return true; // async response
});

async function handleMessage(message) {
  switch (message.action) {
    case 'getStatus': {
      const data = await chrome.storage.local.get(['resetHour', 'resetMinute', 'resetEnabled', 'undoData', 'sacredDomains', 'archive', 'duplicateAutoClose', 'duplicateAutoCloseMinutes']);
      const tabs = await chrome.tabs.query({});
      const tabCount = tabs.length;
      const windowCount = new Set(tabs.map(t => t.windowId)).size;

      // Count tabs that would actually be closed
      const sacredDomains = data.sacredDomains || [];
      const resettableCount = tabs.filter(t => {
        if (!t.url || isInternalUrl(t.url)) return false;
        if (t.pinned) return false;
        const domain = extractDomain(t.url);
        if (sacredDomains.some(sd => isDomainMatch(domain, sd))) return false;
        return true;
      }).length;

      // Calculate next close time
      const hour = data.resetHour ?? DEFAULT_RESET_HOUR;
      const minute = data.resetMinute ?? DEFAULT_RESET_MINUTE;
      const now = new Date();
      let nextReset = new Date();
      nextReset.setHours(hour, minute, 0, 0);
      if (nextReset <= now) nextReset.setDate(nextReset.getDate() + 1);

      const undoAvailable = !!data.undoData;
      const undoTabCount = undoAvailable ? data.undoData.tabs.length : 0;

      // Count how many tabs have already been reopened from the archive
      let reopenedCount = 0;
      const archiveArr = data.archive || [];
      if (archiveArr.length > 0) {
        reopenedCount = archiveArr[0].tabs.filter(t => t.reopened).length;
      }
      const undoRemainingCount = Math.max(0, undoTabCount - reopenedCount);

      return {
        tabCount,
        windowCount,
        resettableCount,
        resetEnabled: data.resetEnabled !== false,
        nextReset: nextReset.toISOString(),
        resetHour: hour,
        resetMinute: minute,
        undoAvailable,
        undoTabCount,
        undoRemainingCount,
        sacredDomains: data.sacredDomains || [],
        duplicateAutoClose: !!data.duplicateAutoClose,
        duplicateAutoCloseMinutes: data.duplicateAutoCloseMinutes || 10
      };
    }

    case 'getArchive': {
      const data = await chrome.storage.local.get(['archive', 'duplicatesClosedToday', 'duplicatesClosedDate']);
      const today = new Date().toISOString().split('T')[0];
      const dupList = (data.duplicatesClosedDate === today) ? (data.duplicatesClosedToday || []) : [];
      return {
        archive: data.archive || [],
        duplicatesClosedToday: dupList
      };
    }

    case 'undo': {
      return await executeUndo();
    }

    case 'manualReset': {
      console.log('[day1tabs] manualReset message received');
      await executeReset('manual');
      return { success: true };
    }

    case 'reopenTabs': {
      const urls = message.urls || [];

      // Get all currently open URLs to avoid duplicates
      const openTabs = await chrome.tabs.query({});
      const openUrls = new Set(openTabs.map(t => t.url));

      let actuallyOpened = 0;
      for (const url of urls) {
        if (openUrls.has(url)) continue; // skip already-open tabs
        try {
          await chrome.tabs.create({ url });
          openUrls.add(url); // track so we don't open same URL twice in this batch
          actuallyOpened++;
        } catch (e) {}
      }

      // Mark these tabs as reopened in the archive
      const archiveResult = await chrome.storage.local.get('archive');
      const archiveArr = archiveResult.archive || [];
      if (archiveArr.length > 0) {
        const latestDay = archiveArr[0];
        for (const url of urls) {
          // Mark the first non-reopened matching tab
          const tab = latestDay.tabs.find(t => t.url === url && !t.reopened);
          if (tab) tab.reopened = true;
        }
        // Recalculate stats
        const nonReopened = latestDay.tabs.filter(t => !t.reopened);
        latestDay.stats = {
          total: latestDay.tabs.length,
          reopened: latestDay.tabs.filter(t => t.reopened).length,
          used: nonReopened.filter(t => t.classification === 'workhorse').length,
          didntUse: nonReopened.filter(t => t.classification !== 'workhorse').length
        };
        await chrome.storage.local.set({ archive: archiveArr });
      }

      return { success: true, count: urls.length };
    }

    case 'reclassifyTab': {
      // User manually reclassifies a tab in the archive
      const { date, tabIndex, newClassification } = message;
      const data = await chrome.storage.local.get('archive');
      const archive = data.archive || [];
      const dayArchive = archive.find(a => a.date === date);
      if (dayArchive && dayArchive.tabs[tabIndex]) {
        dayArchive.tabs[tabIndex].classification = newClassification;
        // Recalculate stats (only count non-reopened tabs in category counts)
        const nonReopened = dayArchive.tabs.filter(t => !t.reopened);
        dayArchive.stats = {
          total: dayArchive.tabs.length,
          reopened: dayArchive.tabs.filter(t => t.reopened).length,
          used: nonReopened.filter(t => t.classification === 'workhorse').length,
          didntUse: nonReopened.filter(t => t.classification !== 'workhorse').length
        };
        await chrome.storage.local.set({ archive });
        return { success: true };
      }
      return { success: false };
    }

    case 'updateSettings': {
      const updates = {};
      if (message.resetHour !== undefined) updates.resetHour = message.resetHour;
      if (message.resetMinute !== undefined) updates.resetMinute = message.resetMinute;
      if (message.resetEnabled !== undefined) updates.resetEnabled = message.resetEnabled;
      if (message.sacredDomains !== undefined) updates.sacredDomains = message.sacredDomains;
      if (message.onboardingComplete !== undefined) updates.onboardingComplete = message.onboardingComplete;
      if (message.duplicateAutoClose !== undefined) updates.duplicateAutoClose = message.duplicateAutoClose;
      if (message.duplicateAutoCloseMinutes !== undefined) updates.duplicateAutoCloseMinutes = message.duplicateAutoCloseMinutes;

      await chrome.storage.local.set(updates);

      // Reschedule alarm if time changed
      if (updates.resetHour !== undefined || updates.resetMinute !== undefined || updates.resetEnabled !== undefined) {
        await scheduleResetAlarm();
      }

      // Clear duplicate timers if feature disabled
      if (updates.duplicateAutoClose === false) {
        clearAllDuplicateTimers();
      }

      return { success: true };
    }

    case 'addSacredDomain': {
      const data = await chrome.storage.local.get('sacredDomains');
      const domains = data.sacredDomains || [];
      let domain = message.domain.toLowerCase().trim();
      domain = domain.replace(/^https?:\/\//, '');
      domain = domain.replace(/^www\./, '');
      domain = domain.replace(/[\/\?#].*$/, '');
      domain = domain.replace(/\.+$/, '');
      if (domain && !domains.includes(domain)) {
        domains.push(domain);
        await chrome.storage.local.set({ sacredDomains: domains });
      }
      return { success: true, sacredDomains: domains };
    }

    case 'removeSacredDomain': {
      const data = await chrome.storage.local.get('sacredDomains');
      const domains = (data.sacredDomains || []).filter(d => d !== message.domain);
      await chrome.storage.local.set({ sacredDomains: domains });
      return { success: true, sacredDomains: domains };
    }

    case 'getCurrentTabs': {
      // Return current tab tracking data for debugging/display
      stopFocusTracking(); // flush
      const tabs = await chrome.tabs.query({});
      const activeTab = tabs.find(t => t.active);
      if (activeTab) startFocusTracking(activeTab.id);

      const tracked = [];
      for (const tab of tabs) {
        if (tab.url && !isInternalUrl(tab.url)) {
          const data = tabTracker[tab.id] || { activations: 0, focusTime: 0 };
          tracked.push({
            tabId: tab.id,
            url: tab.url,
            title: tab.title,
            favIconUrl: tab.favIconUrl,
            activations: data.activations,
            focusTime: data.focusTime,
            classification: classifyTab(data)
          });
        }
      }
      return { tabs: tracked };
    }

    default:
      return { error: 'Unknown action' };
  }
}

// Periodically update badge
setInterval(updateBadge, 30000); // every 30 seconds

// Open side panel when user clicks the extension icon
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
