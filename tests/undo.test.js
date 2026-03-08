const { buildChrome } = require('./mocks/chrome');
global.chrome = buildChrome();
global.console = { ...console, log: jest.fn(), error: jest.fn(), warn: jest.fn() };

Object.assign(globalThis, require('../js/constants'));
Object.assign(globalThis, require('../js/helpers'));
Object.assign(globalThis, require('../js/state'));
const undo = require('../js/undo');

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
// executeUndo — marks all tabs as reopened
// ============================================================
describe('executeUndo', () => {
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

    const result = await undo.executeUndo();

    expect(result.success).toBe(true);

    const archive = (await chrome.storage.local.get('archive')).archive;
    expect(archive[0].tabs.every(t => t.reopened === true)).toBe(true);
    expect(archive[0].stats.reopened).toBe(2);
  });

  test('returns failure when no undo data available', async () => {
    chrome.storage.local.set({ undoData: null });

    const result = await undo.executeUndo();

    expect(result.success).toBe(false);
    expect(result.reason).toContain('No undo data');
  });

  test('skips tabs already open', async () => {
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

    // a.com is already open
    chrome.tabs._setTabs([
      { id: 1, url: 'https://a.com', title: 'A', active: true, windowId: 1 }
    ]);
    chrome.tabs.query.mockImplementation(() => Promise.resolve(chrome.tabs._tabs()));

    const result = await undo.executeUndo();

    expect(result.success).toBe(true);
    expect(result.count).toBe(1); // only b.com reopened
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://b.com', pinned: false });
  });
});
