const bg = require('../js/background');

// Helper: reset chrome mocks + background state between tests
beforeEach(() => {
  chrome._reset();
  bg._setState({
    tabTracker: {},
    currentActiveTabId: null,
    currentActiveStart: null,
    trackingActive: true,
    duplicateDetectionEnabled: false,
    cachedTabCount: 0,
    cachedSacredDomains: []
  });
});

// ============================================================
// 1. classifyTab — V3 two-category: Used vs Didn't use
// ============================================================
describe('classifyTab — V3 Used / Didn\'t use', () => {
  test('tabs with high activations classify as Used (workhorse)', () => {
    const result = bg.classifyTab({ activations: 3, focusTime: 10000 });
    expect(result).toBe('workhorse');
  });

  test('tabs with high focus time classify as Used (workhorse)', () => {
    const result = bg.classifyTab({ activations: 1, focusTime: 90000 });
    expect(result).toBe('workhorse');
  });

  test('tabs with zero activations classify as Didn\'t use (ghost)', () => {
    const result = bg.classifyTab({ activations: 0, focusTime: 0 });
    expect(result).toBe('ghost');
  });

  test('tabs with brief interaction classify as Didn\'t use (glanced)', () => {
    const result = bg.classifyTab({ activations: 1, focusTime: 15000 });
    expect(result).toBe('glanced');
  });

  test('panel treats only workhorse as Used, everything else as Didn\'t use', () => {
    const tabs = [
      { activations: 5, focusTime: 120000 },  // Used
      { activations: 1, focusTime: 15000 },    // Didn't use (glanced)
      { activations: 0, focusTime: 0 },         // Didn't use (ghost)
      { activations: 0, focusTime: 3000 },      // Didn't use (ghost)
    ];

    const classified = tabs.map(t => bg.classifyTab(t));
    const used = classified.filter(c => c === 'workhorse');
    const didntUse = classified.filter(c => c !== 'workhorse');

    expect(used).toHaveLength(1);
    expect(didntUse).toHaveLength(3);
  });
});

// ============================================================
// 2. executeReset — never-close domains survive
// ============================================================
describe('executeReset — never-close domains survive', () => {
  test('tabs on sacred domains are not closed', async () => {
    chrome.storage.local.set({
      sacredDomains: ['github.com'],
      resetEnabled: true,
      archive: [],
      duplicatesClosedToday: []
    });

    chrome.tabs._setTabs([
      { id: 1, url: 'https://github.com/repo', title: 'GH', active: true, windowId: 1 },
      { id: 2, url: 'https://github.com/other', title: 'GH2', active: false, windowId: 1 },
      { id: 3, url: 'https://example.com', title: 'Ex', active: false, windowId: 1 }
    ]);

    // Active tabs query returns tab 1
    chrome.tabs.query.mockImplementation((q) => {
      const tabs = chrome.tabs._tabs();
      if (q.active === true && !q.currentWindow && !q.windowId) {
        return Promise.resolve(tabs.filter(t => t.active));
      }
      return Promise.resolve(tabs);
    });

    await bg.executeReset('manual');

    // Tab 3 (example.com) should be removed; tab 2 (github.com) should survive
    const removedIds = chrome.tabs.remove.mock.calls[0]?.[0] || [];
    expect(removedIds).toContain(3);
    expect(removedIds).not.toContain(2);
  });
});

// ============================================================
// 3. executeReset — pinned tabs survive
// ============================================================
describe('executeReset — pinned tabs survive', () => {
  test('pinned tabs are never closed', async () => {
    chrome.storage.local.set({
      sacredDomains: [],
      resetEnabled: true,
      archive: [],
      duplicatesClosedToday: []
    });

    chrome.tabs._setTabs([
      { id: 1, url: 'https://mail.google.com', title: 'Mail', pinned: true, active: false, windowId: 1 },
      { id: 2, url: 'https://example.com', title: 'Ex', pinned: false, active: true, windowId: 1 },
      { id: 3, url: 'https://random.com', title: 'Rand', pinned: false, active: false, windowId: 1 }
    ]);

    chrome.tabs.query.mockImplementation((q) => {
      const tabs = chrome.tabs._tabs();
      if (q.active === true) return Promise.resolve(tabs.filter(t => t.active));
      return Promise.resolve(tabs);
    });

    await bg.executeReset('manual');

    const removedIds = chrome.tabs.remove.mock.calls[0]?.[0] || [];
    expect(removedIds).not.toContain(1); // pinned
    expect(removedIds).not.toContain(2); // active
    expect(removedIds).toContain(3);
  });
});

// ============================================================
// 4. executeReset — active tab survives
// ============================================================
describe('executeReset — active tab survives', () => {
  test('the active tab in each window is never closed', async () => {
    chrome.storage.local.set({
      sacredDomains: [],
      resetEnabled: true,
      archive: [],
      duplicatesClosedToday: []
    });

    chrome.tabs._setTabs([
      { id: 1, url: 'https://active.com', title: 'Active', active: true, windowId: 1 },
      { id: 2, url: 'https://inactive.com', title: 'Inactive', active: false, windowId: 1 }
    ]);

    chrome.tabs.query.mockImplementation((q) => {
      const tabs = chrome.tabs._tabs();
      if (q.active === true) return Promise.resolve(tabs.filter(t => t.active));
      return Promise.resolve(tabs);
    });

    await bg.executeReset('manual');

    const removedIds = chrome.tabs.remove.mock.calls[0]?.[0] || [];
    expect(removedIds).not.toContain(1);
    expect(removedIds).toContain(2);
  });
});

// ============================================================
// 5. checkForDuplicates — exact URL match, not domain
// ============================================================
describe('checkForDuplicates — exact URL match', () => {
  test('only exact URL duplicates are flagged', async () => {
    bg._setState({ duplicateDetectionEnabled: true, cachedSacredDomains: [] });

    chrome.storage.local.set({ duplicateAutoCloseMinutes: 10 });

    chrome.tabs._setTabs([
      { id: 1, url: 'https://example.com/page1', title: 'P1', pinned: false, active: true, lastFocusedWindow: true },
      { id: 2, url: 'https://example.com/page1', title: 'P1 dup', pinned: false, active: false },
      { id: 3, url: 'https://example.com/page2', title: 'P2', pinned: false, active: false }
    ]);

    chrome.tabs.query.mockImplementation((q) => {
      const tabs = chrome.tabs._tabs();
      if (q.active === true && q.lastFocusedWindow) {
        return Promise.resolve(tabs.filter(t => t.active && t.lastFocusedWindow));
      }
      return Promise.resolve(tabs);
    });

    await bg.checkForDuplicates(1);

    // Alarm should be created for tab 2 (same URL as tab 1), but NOT tab 3 (different path)
    const alarmNames = chrome.alarms.create.mock.calls.map(c => c[0]);
    expect(alarmNames).toContain('dup-close-2');
    expect(alarmNames).not.toContain('dup-close-3');
  });
});

// ============================================================
// 6. checkForDuplicates — skips never-close domains
// ============================================================
describe('checkForDuplicates — skips never-close domains', () => {
  test('duplicates of sacred domains are not scheduled for closure', async () => {
    bg._setState({ duplicateDetectionEnabled: true, cachedSacredDomains: ['github.com'] });

    chrome.storage.local.set({ duplicateAutoCloseMinutes: 10 });

    chrome.tabs._setTabs([
      { id: 1, url: 'https://github.com/repo', title: 'GH', pinned: false },
      { id: 2, url: 'https://github.com/repo', title: 'GH dup', pinned: false }
    ]);

    chrome.tabs.query.mockImplementation(() => Promise.resolve(chrome.tabs._tabs()));

    await bg.checkForDuplicates(1);

    // No alarm should be created — domain is sacred
    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });
});

// ============================================================
// 7. checkForDuplicates — early return when disabled
// ============================================================
describe('checkForDuplicates — early return when disabled', () => {
  test('does nothing when duplicate detection is disabled', async () => {
    bg._setState({ duplicateDetectionEnabled: false });

    await bg.checkForDuplicates(1);

    expect(chrome.tabs.get).not.toHaveBeenCalled();
    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });
});

// ============================================================
// 8. renderBadge — DISABLED (badge removed)
// ============================================================
// Badge functionality commented out — no longer showing open tab counts.

// ============================================================
// 9. handleMessage(reopenTabs) — marks tab as reopened
// ============================================================
describe('handleMessage(reopenTabs) — marks tab as reopened', () => {
  test('marks reopened tabs in the archive', async () => {
    chrome.storage.local.set({
      archive: [{
        date: '2025-01-01',
        tabs: [
          { url: 'https://example.com', title: 'Ex', classification: 'ghost', reopened: false },
          { url: 'https://other.com', title: 'Oth', classification: 'workhorse', reopened: false }
        ],
        stats: { total: 2, reopened: 0, used: 1, didntUse: 1 }
      }]
    });

    chrome.tabs._setTabs([]);
    chrome.tabs.query.mockImplementation(() => Promise.resolve([]));

    const result = await bg.handleMessage({ action: 'reopenTabs', urls: ['https://example.com'] });

    expect(result.success).toBe(true);

    const archive = (await chrome.storage.local.get('archive')).archive;
    const tab = archive[0].tabs.find(t => t.url === 'https://example.com');
    expect(tab.reopened).toBe(true);
    expect(archive[0].stats.reopened).toBe(1);
  });
});

// ============================================================
// 10. executeUndo — marks all tabs as reopened
// ============================================================
describe('executeUndo — marks all tabs as reopened', () => {
  test('marks all archive tabs as reopened on full undo', async () => {
    chrome.storage.local.set({
      undoData: {
        tabs: [
          { url: 'https://a.com', pinned: false, windowId: 1 },
          { url: 'https://b.com', pinned: false, windowId: 1 }
        ],
        resetAt: Date.now()
      },
      archive: [{
        date: '2025-01-01',
        tabs: [
          { url: 'https://a.com', title: 'A', classification: 'ghost' },
          { url: 'https://b.com', title: 'B', classification: 'workhorse' }
        ],
        stats: { total: 2, reopened: 0, used: 1, didntUse: 1 }
      }]
    });

    chrome.tabs._setTabs([]);
    chrome.tabs.query.mockImplementation(() => Promise.resolve([]));

    const result = await bg.executeUndo();

    expect(result.success).toBe(true);

    const archive = (await chrome.storage.local.get('archive')).archive;
    expect(archive[0].tabs.every(t => t.reopened === true)).toBe(true);
    expect(archive[0].stats.reopened).toBe(2);
  });
});

// ============================================================
// 11. handleMessage(updateSettings) — saves and reschedules
// ============================================================
describe('handleMessage(updateSettings) — saves and reschedules', () => {
  test('stores settings and reschedules alarm when time changes', async () => {
    chrome.storage.local.set({ resetHour: 0, resetMinute: 0, resetEnabled: true });

    const result = await bg.handleMessage({
      action: 'updateSettings',
      resetHour: 8,
      resetMinute: 30
    });

    expect(result.success).toBe(true);

    // Verify stored
    const data = await chrome.storage.local.get(['resetHour', 'resetMinute']);
    expect(data.resetHour).toBe(8);
    expect(data.resetMinute).toBe(30);

    // Alarm should have been cleared and recreated
    expect(chrome.alarms.clear).toHaveBeenCalledWith('day1tabs-reset');
    expect(chrome.alarms.create).toHaveBeenCalledWith('day1tabs-reset', expect.objectContaining({
      periodInMinutes: 1440
    }));
  });
});

// ============================================================
// 12. executeReset — closes existing day1tabs extension tabs
// ============================================================
describe('executeReset — closes existing day1tabs extension tabs', () => {
  test('closes any pre-existing day1tabs panel tabs before opening results', async () => {
    chrome.storage.local.set({
      sacredDomains: [],
      resetEnabled: true,
      archive: [],
      duplicatesClosedToday: []
    });

    chrome.tabs._setTabs([
      { id: 1, url: 'https://active.com', title: 'Active', active: true, windowId: 1 },
      { id: 2, url: 'https://example.com', title: 'Ex', active: false, windowId: 1 },
      { id: 50, url: 'chrome-extension://iaklgpbfkohkghhmjjdfeiekemnnkklp/pages/panel.html?source=auto', title: 'day1tabs', active: false, windowId: 1 }
    ]);

    chrome.tabs.query.mockImplementation((q) => {
      const tabs = chrome.tabs._tabs();
      if (q.url) {
        const pattern = new RegExp('^' + q.url.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        return Promise.resolve(tabs.filter(t => t.url && pattern.test(t.url)));
      }
      if (q.active === true) return Promise.resolve(tabs.filter(t => t.active));
      return Promise.resolve(tabs);
    });

    await bg.executeReset('manual');

    // The extension tab (id 50) should have been closed via the pre-cleanup query
    // and the normal tab (id 2) should also be closed by the reset itself
    const allRemovedIds = chrome.tabs.remove.mock.calls.flat().flat();
    expect(allRemovedIds).toContain(50);
    expect(allRemovedIds).toContain(2);
    expect(allRemovedIds).not.toContain(1); // active tab survives
  });

  test('does not error when no existing day1tabs tabs are present', async () => {
    chrome.storage.local.set({
      sacredDomains: [],
      resetEnabled: true,
      archive: [],
      duplicatesClosedToday: []
    });

    chrome.tabs._setTabs([
      { id: 1, url: 'https://active.com', title: 'Active', active: true, windowId: 1 },
      { id: 2, url: 'https://example.com', title: 'Ex', active: false, windowId: 1 }
    ]);

    chrome.tabs.query.mockImplementation((q) => {
      const tabs = chrome.tabs._tabs();
      if (q.url) {
        const pattern = new RegExp('^' + q.url.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        return Promise.resolve(tabs.filter(t => t.url && pattern.test(t.url)));
      }
      if (q.active === true) return Promise.resolve(tabs.filter(t => t.active));
      return Promise.resolve(tabs);
    });

    await bg.executeReset('manual');

    // Should not throw; tab 2 is still closed normally
    const allRemovedIds = chrome.tabs.remove.mock.calls.flat().flat();
    expect(allRemovedIds).toContain(2);
    expect(allRemovedIds).not.toContain(1);
  });
});

// ============================================================
// 13. scheduleResetAlarm — correct time and period
// ============================================================
describe('scheduleResetAlarm — correct time and period', () => {
  test('creates alarm with 24-hour period', async () => {
    chrome.storage.local.set({ resetHour: 2, resetMinute: 0, resetEnabled: true });

    await bg.scheduleResetAlarm();

    expect(chrome.alarms.clear).toHaveBeenCalledWith('day1tabs-reset');
    expect(chrome.alarms.create).toHaveBeenCalledWith('day1tabs-reset', expect.objectContaining({
      periodInMinutes: 24 * 60
    }));

    // delayInMinutes should be positive
    const opts = chrome.alarms.create.mock.calls[0][1];
    expect(opts.delayInMinutes).toBeGreaterThan(0);
  });

  test('does not create alarm when resetEnabled is false', async () => {
    chrome.storage.local.set({ resetEnabled: false });

    await bg.scheduleResetAlarm();

    expect(chrome.alarms.clear).toHaveBeenCalledWith('day1tabs-reset');
    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });
});
