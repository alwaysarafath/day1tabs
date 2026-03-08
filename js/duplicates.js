// ============================================================
// day1tabs — Duplicate tab detection and auto-close
// Uses chrome.alarms so timers survive SW termination in MV3
// Depends on: constants, helpers, state (via global scope)
// ============================================================

/**
 * Clears all pending duplicate-close alarms without affecting
 * the main reset alarm or other alarms.
 */
async function clearAllDuplicateTimers() {
  const allAlarms = await chrome.alarms.getAll();
  for (const alarm of allAlarms) {
    if (alarm.name.startsWith(ALARM_DUP_PREFIX)) {
      await chrome.alarms.clear(alarm.name);
    }
  }
}

/**
 * Checks if the given tab has duplicates (same URL) open and
 * schedules alarms to auto-close the extras. Skips sacred
 * domains, pinned tabs, and internal URLs.
 * @param {number} triggeredByTabId - The tab that triggered the check
 */
async function checkForDuplicates(triggeredByTabId) {
  if (!duplicateDetectionEnabled) return;

  const data = await chrome.storage.local.get('duplicateAutoCloseMinutes');
  const delayMinutes = data.duplicateAutoCloseMinutes || DEFAULT_DUP_DELAY_MINUTES;
  const sacredDomains = cachedSacredDomains;

  let triggerTab;
  try {
    triggerTab = await chrome.tabs.get(triggeredByTabId);
  } catch (e) {
    return;
  }

  if (!triggerTab.url || isInternalUrl(triggerTab.url)) return;
  if (triggerTab.pinned) return;

  const domain = extractDomain(triggerTab.url);
  if (sacredDomains.some(sd => isDomainMatch(domain, sd))) return;

  const allTabs = await chrome.tabs.query({});
  const sameUrlTabs = allTabs.filter(t => t.url === triggerTab.url);

  if (sameUrlTabs.length < 2) {
    await chrome.alarms.clear(`${ALARM_DUP_PREFIX}${triggeredByTabId}`);
    return;
  }

  const [focusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const focusedId = focusedTab ? focusedTab.id : null;

  const focusedDup = sameUrlTabs.find(t => t.id === focusedId);
  const keepTabId = focusedDup ? focusedDup.id : triggeredByTabId;

  await chrome.alarms.clear(`${ALARM_DUP_PREFIX}${keepTabId}`);

  for (const dup of sameUrlTabs) {
    if (dup.id === keepTabId) continue;

    const alarmName = `${ALARM_DUP_PREFIX}${dup.id}`;
    const existing = await chrome.alarms.get(alarmName);
    if (existing) continue;

    chrome.alarms.create(alarmName, { delayInMinutes: delayMinutes });
  }
}

/**
 * Records a duplicate tab closure in today's log in storage.
 * @param {{ url: string, title?: string, favIconUrl?: string }} tab
 */
async function logDuplicateClosure(tab) {
  const data = await chrome.storage.local.get(['duplicatesClosedToday', 'duplicatesClosedDate']);
  const today = new Date().toISOString().split('T')[0];

  let list = Array.isArray(data.duplicatesClosedToday) ? data.duplicatesClosedToday : [];
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

/**
 * Handles a fired duplicate-close alarm by closing the target tab
 * (unless it has been pinned since the alarm was set).
 * @param {{ name: string }} alarm - Chrome alarm object
 */
async function handleDupAlarm(alarm) {
  const tabId = parseInt(alarm.name.replace(ALARM_DUP_PREFIX, ''));
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.pinned) return;
    await logDuplicateClosure(tab);
    await chrome.tabs.remove(tabId);
    if (DEBUG) console.log(`[day1tabs] Closed duplicate tab ${tabId}`);
  } catch (e) {
    // Tab may already be closed
  }
}

// ---- Conditional exports for testing ----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { clearAllDuplicateTimers, checkForDuplicates, logDuplicateClosure, handleDupAlarm };
}
