const { buildChrome } = require('./mocks/chrome');
global.chrome = buildChrome();
// Suppress console noise
global.console = { ...console, log: jest.fn(), error: jest.fn(), warn: jest.fn() };

Object.assign(globalThis, require('../js/constants'));
Object.assign(globalThis, require('../js/helpers'));
const state = require('../js/state');

beforeEach(() => {
  chrome._reset();
  state._setState({
    tabTracker: {},
    currentActiveTabId: null,
    currentActiveStart: null,
    trackingActive: true,
    duplicateDetectionEnabled: false,
    cachedTabCount: 0,
    cachedSacredDomains: []
  });
});

describe('classifyTab', () => {
  test('workhorse: high activations', () => {
    expect(state.classifyTab({ activations: 3, focusTime: 1000 })).toBe('workhorse');
  });

  test('workhorse: high focus time', () => {
    expect(state.classifyTab({ activations: 1, focusTime: 90000 })).toBe('workhorse');
  });

  test('ghost: zero activations', () => {
    expect(state.classifyTab({ activations: 0, focusTime: 0 })).toBe('ghost');
  });

  test('ghost: very low focus time', () => {
    expect(state.classifyTab({ activations: 1, focusTime: 3000 })).toBe('ghost');
  });

  test('glanced: moderate interaction', () => {
    expect(state.classifyTab({ activations: 1, focusTime: 15000 })).toBe('glanced');
  });
});

describe('focus tracking', () => {
  test('startFocusTracking sets active tab', () => {
    state.startFocusTracking(42);
    const s = state._getState();
    expect(s.currentActiveTabId).toBe(42);
    expect(s.currentActiveStart).toBeGreaterThan(0);
  });

  test('stopFocusTracking accumulates focus time', () => {
    state._setState({
      tabTracker: { 1: { focusTime: 0 } },
      currentActiveTabId: 1,
      currentActiveStart: Date.now() - 5000
    });
    state.stopFocusTracking();
    const s = state._getState();
    expect(s.tabTracker[1].focusTime).toBeGreaterThanOrEqual(5000);
    expect(s.currentActiveTabId).toBeNull();
  });
});

describe('ensureTabTracked', () => {
  test('creates tracker entry if none exists', () => {
    state.ensureTabTracked(5, { url: 'https://a.com', title: 'A', favIconUrl: '' });
    const s = state._getState();
    expect(s.tabTracker[5]).toBeDefined();
    expect(s.tabTracker[5].url).toBe('https://a.com');
    expect(s.tabTracker[5].activations).toBe(0);
  });

  test('does not overwrite existing entry', () => {
    state._setState({ tabTracker: { 5: { url: 'https://old.com', activations: 3 } } });
    state.ensureTabTracked(5, { url: 'https://new.com', title: 'New' });
    expect(state._getState().tabTracker[5].url).toBe('https://old.com');
  });
});

describe('syncCachedSettings', () => {
  test('reads duplicate and sacred settings from storage', async () => {
    chrome.storage.local.set({ duplicateAutoClose: true, sacredDomains: ['github.com'] });
    await state.syncCachedSettings();
    const s = state._getState();
    expect(s.duplicateDetectionEnabled).toBe(true);
    expect(s.cachedSacredDomains).toEqual(['github.com']);
  });
});

describe('computeArchiveStats', () => {
  test('computes correct stats', () => {
    const tabs = [
      { classification: 'workhorse', reopened: false },
      { classification: 'ghost', reopened: true },
      { classification: 'glanced', reopened: false }
    ];
    const stats = state.computeArchiveStats(tabs);
    expect(stats).toEqual({ total: 3, reopened: 1, used: 1, didntUse: 1 });
  });

  test('handles empty array', () => {
    expect(state.computeArchiveStats([])).toEqual({ total: 0, reopened: 0, used: 0, didntUse: 0 });
  });
});

describe('resetTracker', () => {
  test('clears tabTracker', () => {
    state._setState({ tabTracker: { 1: { url: 'a' } } });
    state.resetTracker();
    expect(state._getState().tabTracker).toEqual({});
  });
});

describe('restoreTabTracker', () => {
  test('restores from backup, removes stale tabs', async () => {
    chrome.storage.local.set({
      tabTrackerBackup: {
        10: { url: 'https://alive.com', activations: 2, focusTime: 5000 },
        99: { url: 'https://stale.com', activations: 1, focusTime: 1000 }
      }
    });
    chrome.tabs._setTabs([
      { id: 10, url: 'https://alive.com', title: 'Alive', active: true, windowId: 1 }
    ]);
    chrome.tabs.query.mockImplementation(() => Promise.resolve(chrome.tabs._tabs()));

    await state.restoreTabTracker();
    const s = state._getState();
    expect(s.tabTracker[10]).toBeDefined();
    expect(s.tabTracker[99]).toBeUndefined();
  });

  test('live data wins over backup', async () => {
    state._setState({
      tabTracker: { 10: { url: 'https://a.com', activations: 5, focusTime: 90000 } }
    });
    chrome.storage.local.set({
      tabTrackerBackup: { 10: { url: 'https://a.com', activations: 2, focusTime: 30000 } }
    });
    chrome.tabs._setTabs([{ id: 10, url: 'https://a.com', active: true, windowId: 1 }]);
    chrome.tabs.query.mockImplementation(() => Promise.resolve(chrome.tabs._tabs()));

    await state.restoreTabTracker();
    expect(state._getState().tabTracker[10].activations).toBe(5);
  });

  test('initialization works normally when storage backup is empty', async () => {
    chrome.tabs._setTabs([
      { id: 10, url: 'https://a.com', title: 'A', active: true, windowId: 1 }
    ]);
    chrome.tabs.query.mockImplementation(() => Promise.resolve(chrome.tabs._tabs()));

    state._setState({ tabTracker: {} });
    await state.restoreTabTracker();

    const s = state._getState();
    expect(Object.keys(s.tabTracker)).toHaveLength(0);
  });

  test('restored tabTracker correctly classifies tabs as Used', async () => {
    chrome.storage.local.set({
      tabTrackerBackup: {
        10: { url: 'https://used.com', title: 'Used', favIconUrl: '', activations: 5, focusTime: 120000, lastActivated: Date.now(), createdAt: Date.now() }
      }
    });

    chrome.tabs._setTabs([
      { id: 10, url: 'https://used.com', title: 'Used', active: true, windowId: 1 }
    ]);
    chrome.tabs.query.mockImplementation(() => Promise.resolve(chrome.tabs._tabs()));

    state._setState({ tabTracker: {} });
    await state.restoreTabTracker();

    const s = state._getState();
    const classification = state.classifyTab(s.tabTracker[10]);
    expect(classification).toBe('workhorse');
  });
});

describe('stopFocusTracking — persistence', () => {
  test('tabTracker is saved to storage when stopFocusTracking is called', async () => {
    state._setState({
      tabTracker: {
        1: { url: 'https://a.com', title: 'A', favIconUrl: '', activations: 3, focusTime: 50000, lastActivated: Date.now(), createdAt: Date.now() }
      },
      currentActiveTabId: 1,
      currentActiveStart: Date.now() - 5000
    });

    state.stopFocusTracking();

    await new Promise(r => setTimeout(r, 10));

    const stored = await chrome.storage.local.get('tabTrackerBackup');
    expect(stored.tabTrackerBackup).toBeDefined();
    expect(stored.tabTrackerBackup[1]).toBeDefined();
    expect(stored.tabTrackerBackup[1].activations).toBe(3);
    expect(stored.tabTrackerBackup[1].focusTime).toBeGreaterThanOrEqual(55000);
  });
});
