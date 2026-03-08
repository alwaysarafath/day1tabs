// ============================================================
// day1tabs — Midnight reset and alarm scheduling
// Depends on: constants, helpers, state, tracking (via global scope)
// ============================================================

/**
 * Schedules (or clears) the daily reset alarm based on the user's
 * configured reset time. Uses a 24-hour repeating alarm.
 */
async function scheduleResetAlarm() {
  await chrome.alarms.clear(ALARM_RESET);

  const data = await chrome.storage.local.get(['resetHour', 'resetMinute', 'resetEnabled']);

  if (data.resetEnabled === false) return;

  const hour = data.resetHour ?? DEFAULT_RESET_HOUR;
  const minute = data.resetMinute ?? DEFAULT_RESET_MINUTE;

  const now = new Date();
  let resetTime = new Date();
  resetTime.setHours(hour, minute, 0, 0);

  if (resetTime <= now) {
    resetTime.setDate(resetTime.getDate() + 1);
  }

  const delayInMinutes = (resetTime.getTime() - now.getTime()) / 60000;

  chrome.alarms.create(ALARM_RESET, {
    delayInMinutes: delayInMinutes,
    periodInMinutes: DAILY_PERIOD_MINUTES
  });

  if (DEBUG) console.log(`[day1tabs] Reset scheduled for ${resetTime.toLocaleString()}`);
}

/**
 * Executes the tab reset: closes all non-protected tabs, archives
 * them with classification data, saves undo data, and opens the
 * results panel. Protected tabs include: active tabs, pinned tabs,
 * sacred domain tabs, and internal/extension URLs.
 * @param {'auto'|'manual'} source - What triggered the reset
 */
async function executeReset(source) {
  source = source || 'auto';
  if (DEBUG) console.log(`[day1tabs] executeReset called, source=${source}`);

  const data = await chrome.storage.local.get(['sacredDomains', 'resetEnabled']);

  if (source !== 'manual' && data.resetEnabled === false) {
    if (DEBUG) console.log('[day1tabs] Reset skipped — auto-close is disabled');
    return;
  }

  stopFocusTracking();

  const sacredDomains = Array.isArray(data.sacredDomains) ? data.sacredDomains : [];
  const allTabs = await chrome.tabs.query({});

  const activeTabs = await chrome.tabs.query({ active: true });
  const activeTabIds = new Set(activeTabs.map(t => t.id));

  if (DEBUG) console.log(`[day1tabs] Total tabs: ${allTabs.length}, sacred: ${sacredDomains.join(', ')}, active: ${activeTabIds.size}`);

  const tabsToClose = [];
  const tabsToKeep = [];
  const archiveEntries = [];

  for (const tab of allTabs) {
    if (!tab.url || isInternalUrl(tab.url)) {
      if (tab.url && tab.url.startsWith('chrome://newtab')) {
        tabsToClose.push(tab.id);
      } else {
        tabsToKeep.push(tab);
      }
      continue;
    }

    if (activeTabIds.has(tab.id)) {
      tabsToKeep.push(tab);
      continue;
    }

    if (tab.pinned) {
      tabsToKeep.push(tab);
      continue;
    }

    const domain = extractDomain(tab.url);
    if (sacredDomains.some(sd => isDomainMatch(domain, sd))) {
      tabsToKeep.push(tab);
      continue;
    }

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
  const duplicatesClosedToday = Array.isArray(dupData.duplicatesClosedToday) ? dupData.duplicatesClosedToday : [];

  // Save archive
  const archive = await chrome.storage.local.get('archive');
  const existingArchive = Array.isArray(archive.archive) ? archive.archive : [];

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

  existingArchive.unshift(todayArchive);
  const trimmedArchive = existingArchive.slice(0, ARCHIVE_RETENTION_DAYS);

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
    duplicatesClosedToday: []
  });

  if (DEBUG) console.log(`[day1tabs] tabsToClose: ${tabsToClose.length}, tabsToKeep: ${tabsToKeep.length}`);

  // Ensure at least one tab will remain
  const hasKeptNormalTab = tabsToKeep.some(t => !isInternalUrl(t.url));
  if (!hasKeptNormalTab) {
    if (DEBUG) console.log('[day1tabs] No normal tabs kept, creating new tab');
    await chrome.tabs.create({ url: 'chrome://newtab' });
  }

  // Close all marked tabs
  if (tabsToClose.length > 0) {
    if (DEBUG) console.log(`[day1tabs] Closing ${tabsToClose.length} tabs`);
    try {
      await chrome.tabs.remove(tabsToClose);
    } catch (e) {
      console.error('[day1tabs] Batch close failed, closing individually:', e);
      for (const tabId of tabsToClose) {
        try {
          await chrome.tabs.remove(tabId);
        } catch (e2) {
          console.error(`[day1tabs] Failed to close tab ${tabId}:`, e2);
        }
      }
    }
  }

  // Reset tracker for new day
  resetTracker();
  await chrome.storage.local.set({ tabTrackerBackup: null });

  // Re-initialize tracking for remaining tabs
  await initializeExistingTabs();

  // Close any existing day1tabs tabs before opening the results panel
  try {
    const ownExtId = chrome.runtime.id;
    const extensionTabs = await chrome.tabs.query({ url: `chrome-extension://${ownExtId}/*` });
    if (extensionTabs.length > 0) {
      if (DEBUG) console.log(`[day1tabs] Closing ${extensionTabs.length} existing day1tabs tab(s)`);
      await chrome.tabs.remove(extensionTabs.map(t => t.id));
    }
  } catch (e) {
    // Ignore — non-critical cleanup
  }

  // Show results after reset
  if (tabsToClose.length > 0) {
    await chrome.storage.local.set({ lastResetSource: source });
    try {
      if (source === 'auto') {
        await chrome.tabs.create({
          url: chrome.runtime.getURL('pages/panel.html?source=auto'),
          active: true
        });
      } else {
        const [focusedWindow] = await chrome.windows.getAll({ windowTypes: ['normal'] });
        if (focusedWindow) {
          await chrome.sidePanel.open({ windowId: focusedWindow.id });
        }
      }
    } catch (e) {
      // Ignore — panel open is best-effort
    }
  }

  if (DEBUG) console.log(`[day1tabs] Reset complete. Closed ${tabsToClose.length}, kept ${tabsToKeep.length}.`);
}

// ---- Conditional exports for testing ----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { scheduleResetAlarm, executeReset };
}
