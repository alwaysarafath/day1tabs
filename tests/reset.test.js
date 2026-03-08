const { buildChrome } = require('./mocks/chrome');
global.chrome = buildChrome();
global.console = { ...console, log: jest.fn(), error: jest.fn(), warn: jest.fn() };

Object.assign(globalThis, require('../js/constants'));
Object.assign(globalThis, require('../js/helpers'));
Object.assign(globalThis, require('../js/state'));
Object.assign(globalThis, require('../js/duplicates'));
Object.assign(globalThis, require('../js/tracking'));
const reset = require('../js/reset');

beforeEach(() => {
  chrome._reset();
  _setState({
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
// scheduleResetAlarm
// ============================================================
describe('scheduleResetAlarm', () => {
  test('creates alarm with 24-hour period', async () => {
    chrome.storage.local.set({ resetHour: 2, resetMinute: 0, resetEnabled: true });

    await reset.scheduleResetAlarm();

    expect(chrome.alarms.clear).toHaveBeenCalledWith('day1tabs-reset');
    expect(chrome.alarms.create).toHaveBeenCalledWith('day1tabs-reset', expect.objectContaining({
      periodInMinutes: 24 * 60
    }));

    const opts = chrome.alarms.create.mock.calls[0][1];
    expect(opts.delayInMinutes).toBeGreaterThan(0);
  });

  test('does not create alarm when resetEnabled is false', async () => {
    chrome.storage.local.set({ resetEnabled: false });

    await reset.scheduleResetAlarm();

    expect(chrome.alarms.clear).toHaveBeenCalledWith('day1tabs-reset');
    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });
});

// ============================================================
// executeReset — never-close domains survive
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

    chrome.tabs.query.mockImplementation((q) => {
      const tabs = chrome.tabs._tabs();
      if (q.active === true && !q.currentWindow && !q.windowId) {
        return Promise.resolve(tabs.filter(t => t.active));
      }
      return Promise.resolve(tabs);
    });

    await reset.executeReset('manual');

    const removedIds = chrome.tabs.remove.mock.calls[0]?.[0] || [];
    expect(removedIds).toContain(3);
    expect(removedIds).not.toContain(2);
  });
});

// ============================================================
// executeReset — pinned tabs survive
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

    await reset.executeReset('manual');

    const removedIds = chrome.tabs.remove.mock.calls[0]?.[0] || [];
    expect(removedIds).not.toContain(1); // pinned
    expect(removedIds).not.toContain(2); // active
    expect(removedIds).toContain(3);
  });
});

// ============================================================
// executeReset — active tab survives
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

    await reset.executeReset('manual');

    const removedIds = chrome.tabs.remove.mock.calls[0]?.[0] || [];
    expect(removedIds).not.toContain(1);
    expect(removedIds).toContain(2);
  });
});

// ============================================================
// executeReset — closes existing day1tabs extension tabs
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
      { id: 50, url: 'chrome-extension://fakeid/pages/panel.html?source=auto', title: 'day1tabs', active: false, windowId: 1 }
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

    await reset.executeReset('manual');

    const allRemovedIds = chrome.tabs.remove.mock.calls.flat().flat();
    expect(allRemovedIds).toContain(50);
    expect(allRemovedIds).toContain(2);
    expect(allRemovedIds).not.toContain(1);
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

    await reset.executeReset('manual');

    const allRemovedIds = chrome.tabs.remove.mock.calls.flat().flat();
    expect(allRemovedIds).toContain(2);
    expect(allRemovedIds).not.toContain(1);
  });
});

// ============================================================
// executeReset — clears tabTrackerBackup
// ============================================================
describe('executeReset — clears tabTrackerBackup', () => {
  test('executeReset clears tabTrackerBackup from storage', async () => {
    chrome.storage.local.set({
      sacredDomains: [],
      resetEnabled: true,
      archive: [],
      duplicatesClosedToday: [],
      tabTrackerBackup: { 1: { activations: 3, focusTime: 90000 } }
    });

    chrome.tabs._setTabs([
      { id: 1, url: 'https://active.com', title: 'Active', active: true, windowId: 1 },
      { id: 2, url: 'https://example.com', title: 'Ex', active: false, windowId: 1 }
    ]);

    chrome.tabs.query.mockImplementation((q) => {
      const tabs = chrome.tabs._tabs();
      if (q.active === true) return Promise.resolve(tabs.filter(t => t.active));
      return Promise.resolve(tabs);
    });

    await reset.executeReset('manual');

    const stored = await chrome.storage.local.get('tabTrackerBackup');
    expect(stored.tabTrackerBackup).toBeNull();
  });
});

// ============================================================
// executeReset — other extension tabs are closed
// ============================================================
describe('executeReset — other extension tabs are closed', () => {
  test('other extension tabs ARE closed during executeReset', async () => {
    chrome.storage.local.set({
      sacredDomains: [],
      resetEnabled: true,
      archive: [],
      duplicatesClosedToday: []
    });

    chrome.tabs._setTabs([
      { id: 1, url: 'https://active.com', title: 'Active', active: true, windowId: 1 },
      { id: 2, url: 'chrome-extension://otherid/popup.html', title: 'Other Ext', active: false, windowId: 1 },
      { id: 3, url: 'chrome-extension://fakeid/pages/panel.html', title: 'day1tabs', active: false, windowId: 1 }
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

    await reset.executeReset('manual');

    const allRemovedIds = chrome.tabs.remove.mock.calls.flat().flat();
    expect(allRemovedIds).toContain(2);  // other extension — closed
    expect(allRemovedIds).not.toContain(1);  // active tab — kept
  });
});
