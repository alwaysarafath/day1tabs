// ============================================================
// day1tabs — Undo: reopen tabs closed by the last reset
// Depends on: state (via global scope)
// ============================================================

/**
 * Reopens all tabs from the last reset via stored undo data.
 * Skips tabs that are already open. Marks all archive entries
 * as reopened and clears the undo data.
 * @returns {Promise<{ success: boolean, count?: number, reason?: string }>}
 */
async function executeUndo() {
  const data = await chrome.storage.local.get(['undoData', 'archive']);
  const undoData = data.undoData;

  if (!undoData) {
    return { success: false, reason: 'No undo data available' };
  }

  const archiveArr = Array.isArray(data.archive) ? data.archive : [];

  const openTabs = await chrome.tabs.query({});
  const openUrls = new Set(openTabs.map(t => t.url));

  let reopenedCount = 0;
  for (const tab of undoData.tabs) {
    if (openUrls.has(tab.url)) {
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

  await chrome.storage.local.set({ undoData: null });

  return { success: true, count: reopenedCount };
}

// ---- Conditional exports for testing ----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { executeUndo };
}
