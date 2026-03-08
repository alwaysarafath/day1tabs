const { buildChrome } = require('./mocks/chrome');
global.chrome = buildChrome();
global.console = { ...console, log: jest.fn(), error: jest.fn(), warn: jest.fn() };

Object.assign(globalThis, require('../js/constants'));
Object.assign(globalThis, require('../js/helpers'));
Object.assign(globalThis, require('../js/state'));

// checkForDuplicates is needed by tracking listeners (it's in background.js for now)
// Provide a no-op stub since we're testing tracking in isolation
globalThis.checkForDuplicates = jest.fn();

const { initializeExistingTabs, registerTrackingListeners } = require('../js/tracking');

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
  checkForDuplicates.mockClear();
});

describe('initializeExistingTabs', () => {
  test('tracks all non-internal open tabs', async () => {
    chrome.tabs._setTabs([
      { id: 1, url: 'https://a.com', title: 'A', active: false, windowId: 1 },
      { id: 2, url: 'https://b.com', title: 'B', active: true, windowId: 1, currentWindow: true },
      { id: 3, url: 'chrome://settings', title: 'Settings', active: false, windowId: 1 }
    ]);
    chrome.tabs.query.mockImplementation((q) => {
      const tabs = chrome.tabs._tabs();
      if (q.active === true && q.currentWindow) return Promise.resolve(tabs.filter(t => t.active && t.currentWindow));
      return Promise.resolve(tabs);
    });

    await initializeExistingTabs();

    const s = _getState();
    expect(s.tabTracker[1]).toBeDefined();
    expect(s.tabTracker[2]).toBeDefined();
    expect(s.tabTracker[3]).toBeUndefined(); // internal URL
    expect(s.currentActiveTabId).toBe(2);
  });

  test('does not overwrite existing tracker data', async () => {
    _setState({
      tabTracker: { 1: { url: 'https://a.com', activations: 5, focusTime: 50000 } }
    });

    chrome.tabs._setTabs([
      { id: 1, url: 'https://a.com', title: 'A', active: true, windowId: 1, currentWindow: true }
    ]);
    chrome.tabs.query.mockImplementation((q) => {
      const tabs = chrome.tabs._tabs();
      if (q.active === true && q.currentWindow) return Promise.resolve(tabs.filter(t => t.active));
      return Promise.resolve(tabs);
    });

    await initializeExistingTabs();
    expect(_getState().tabTracker[1].activations).toBe(5); // not overwritten
  });
});

describe('registerTrackingListeners', () => {
  test('registers all expected Chrome event listeners', () => {
    registerTrackingListeners();

    expect(chrome.tabs.onActivated.addListener).toHaveBeenCalled();
    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
    expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalled();
    expect(chrome.windows.onFocusChanged.addListener).toHaveBeenCalled();
  });
});
