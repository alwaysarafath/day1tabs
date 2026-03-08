// ============================================================
// day1tabs — Message handling (from panel & onboarding pages)
// Depends on: constants, helpers, state, reset, undo,
//             duplicates (via global scope)
// ============================================================

/**
 * Registers the chrome.runtime.onMessage listener that dispatches
 * incoming messages to handleMessage. Only accepts messages from
 * the extension's own context (sender.id check).
 */
function registerMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;

    handleMessage(message)
      .then(sendResponse)
      .catch(e => {
        console.error('[day1tabs] Message handler error:', e);
        sendResponse({ error: e.message });
      });
    return true;
  });
}

/**
 * Routes an incoming message to the appropriate handler based on
 * message.action and returns the result.
 * @param {{ action: string, [key: string]: any }} message
 * @returns {Promise<Object>}
 */
async function handleMessage(message) {
  switch (message.action) {
    case 'getStatus': {
      const data = await chrome.storage.local.get(['resetHour', 'resetMinute', 'resetEnabled', 'undoData', 'sacredDomains', 'archive', 'duplicateAutoClose', 'duplicateAutoCloseMinutes']);
      const tabs = await chrome.tabs.query({});
      const tabCount = tabs.length;
      const windowCount = new Set(tabs.map(t => t.windowId)).size;

      const sacredDomains = Array.isArray(data.sacredDomains) ? data.sacredDomains : [];
      const resettableCount = tabs.filter(t => {
        if (!t.url || isInternalUrl(t.url)) return false;
        if (t.pinned) return false;
        const domain = extractDomain(t.url);
        if (sacredDomains.some(sd => isDomainMatch(domain, sd))) return false;
        return true;
      }).length;

      const hour = data.resetHour ?? DEFAULT_RESET_HOUR;
      const minute = data.resetMinute ?? DEFAULT_RESET_MINUTE;
      const now = new Date();
      let nextReset = new Date();
      nextReset.setHours(hour, minute, 0, 0);
      if (nextReset <= now) nextReset.setDate(nextReset.getDate() + 1);

      const undoAvailable = !!data.undoData;
      const undoTabCount = undoAvailable ? data.undoData.tabs.length : 0;

      let reopenedCount = 0;
      const archiveArr = Array.isArray(data.archive) ? data.archive : [];
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
        sacredDomains: sacredDomains,
        duplicateAutoClose: !!data.duplicateAutoClose,
        duplicateAutoCloseMinutes: data.duplicateAutoCloseMinutes || DEFAULT_DUP_DELAY_MINUTES
      };
    }

    case 'getArchive': {
      const data = await chrome.storage.local.get(['archive', 'duplicatesClosedToday', 'duplicatesClosedDate']);
      const today = new Date().toISOString().split('T')[0];
      const dupList = (data.duplicatesClosedDate === today && Array.isArray(data.duplicatesClosedToday))
        ? data.duplicatesClosedToday
        : [];
      return {
        archive: Array.isArray(data.archive) ? data.archive : [],
        duplicatesClosedToday: dupList
      };
    }

    case 'undo': {
      return await executeUndo();
    }

    case 'manualReset': {
      if (DEBUG) console.log('[day1tabs] manualReset message received');
      await executeReset('manual');
      return { success: true };
    }

    case 'reopenTabs': {
      const rawUrls = message.urls || [];
      const urls = rawUrls.filter(u => typeof u === 'string' && /^https?:\/\//i.test(u));

      const openTabs = await chrome.tabs.query({});
      const openUrls = new Set(openTabs.map(t => t.url));

      let actuallyOpened = 0;
      for (const url of urls) {
        if (openUrls.has(url)) continue;
        try {
          await chrome.tabs.create({ url });
          openUrls.add(url);
          actuallyOpened++;
        } catch (e) {}
      }

      const archiveResult = await chrome.storage.local.get('archive');
      const archiveArr = Array.isArray(archiveResult.archive) ? archiveResult.archive : [];
      if (archiveArr.length > 0) {
        const latestDay = archiveArr[0];
        for (const url of urls) {
          const tab = latestDay.tabs.find(t => t.url === url && !t.reopened);
          if (tab) tab.reopened = true;
        }
        latestDay.stats = computeArchiveStats(latestDay.tabs);
        await chrome.storage.local.set({ archive: archiveArr });
      }

      return { success: true, count: urls.length };
    }

    case 'reclassifyTab': {
      const { date, tabIndex, newClassification } = message;

      // Validate tabIndex is a non-negative integer
      if (typeof tabIndex !== 'number' || !Number.isInteger(tabIndex) || tabIndex < 0) {
        return { success: false, error: 'Invalid tabIndex' };
      }

      // Validate classification is one of the allowed values
      if (!VALID_CLASSIFICATIONS.includes(newClassification)) {
        return { success: false, error: 'Invalid classification' };
      }

      const reclassData = await chrome.storage.local.get('archive');
      const archive = Array.isArray(reclassData.archive) ? reclassData.archive : [];
      const dayArchive = archive.find(a => a.date === date);
      if (dayArchive && dayArchive.tabs[tabIndex]) {
        dayArchive.tabs[tabIndex].classification = newClassification;
        dayArchive.stats = computeArchiveStats(dayArchive.tabs);
        await chrome.storage.local.set({ archive });
        return { success: true };
      }
      return { success: false };
    }

    case 'updateSettings': {
      const updates = {};

      // Type-check resetHour and resetMinute
      if (message.resetHour !== undefined) {
        const h = Number(message.resetHour);
        if (Number.isInteger(h) && h >= 0 && h <= 23) {
          updates.resetHour = h;
        }
      }
      if (message.resetMinute !== undefined) {
        const m = Number(message.resetMinute);
        if (Number.isInteger(m) && m >= 0 && m <= 59) {
          updates.resetMinute = m;
        }
      }

      if (message.resetEnabled !== undefined) updates.resetEnabled = message.resetEnabled;
      if (message.sacredDomains !== undefined) updates.sacredDomains = message.sacredDomains;
      if (message.onboardingComplete !== undefined) updates.onboardingComplete = message.onboardingComplete;
      if (message.duplicateAutoClose !== undefined) updates.duplicateAutoClose = message.duplicateAutoClose;
      if (message.duplicateAutoCloseMinutes !== undefined) updates.duplicateAutoCloseMinutes = message.duplicateAutoCloseMinutes;

      await chrome.storage.local.set(updates);

      if (updates.resetHour !== undefined || updates.resetMinute !== undefined || updates.resetEnabled !== undefined) {
        await scheduleResetAlarm();
      }

      if (updates.duplicateAutoClose !== undefined) {
        duplicateDetectionEnabled = !!updates.duplicateAutoClose;
      }
      if (updates.sacredDomains !== undefined) {
        cachedSacredDomains = updates.sacredDomains;
      }

      if (updates.duplicateAutoClose === false) {
        clearAllDuplicateTimers();
      }

      return { success: true };
    }

    case 'addSacredDomain': {
      const domainData = await chrome.storage.local.get('sacredDomains');
      const domains = Array.isArray(domainData.sacredDomains) ? domainData.sacredDomains : [];
      let domain = String(message.domain || '').toLowerCase().trim();
      domain = domain.replace(/^https?:\/\//, '');
      domain = domain.replace(/^www\./, '');
      domain = domain.replace(/[\/\?#].*$/, '');
      domain = domain.replace(/\.+$/, '');

      // Validate domain length and format
      if (!domain || domain.length > MAX_DOMAIN_LENGTH || !DOMAIN_PATTERN.test(domain)) {
        return { success: false, sacredDomains: domains, error: 'Invalid domain' };
      }

      if (!domains.includes(domain)) {
        domains.push(domain);
        await chrome.storage.local.set({ sacredDomains: domains });
      }
      cachedSacredDomains = domains;
      return { success: true, sacredDomains: domains };
    }

    case 'removeSacredDomain': {
      const removeData = await chrome.storage.local.get('sacredDomains');
      const domains = (Array.isArray(removeData.sacredDomains) ? removeData.sacredDomains : []).filter(d => d !== message.domain);
      await chrome.storage.local.set({ sacredDomains: domains });
      cachedSacredDomains = domains;
      return { success: true, sacredDomains: domains };
    }

    case 'getCurrentTabs': {
      stopFocusTracking();
      const tabs = await chrome.tabs.query({});
      const activeTab = tabs.find(t => t.active);
      if (activeTab) startFocusTracking(activeTab.id);

      const tracked = [];
      for (const tab of tabs) {
        if (tab.url && !isInternalUrl(tab.url)) {
          const tData = tabTracker[tab.id] || { activations: 0, focusTime: 0 };
          tracked.push({
            tabId: tab.id,
            url: tab.url,
            title: tab.title,
            favIconUrl: tab.favIconUrl,
            activations: tData.activations,
            focusTime: tData.focusTime,
            classification: classifyTab(tData)
          });
        }
      }
      return { tabs: tracked };
    }

    default:
      return { error: 'Unknown action' };
  }
}

// ---- Conditional exports for testing ----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { handleMessage, registerMessageListener };
}
