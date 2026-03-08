const { buildChrome } = require('./mocks/chrome');
global.chrome = buildChrome();
global.console = { ...console, log: jest.fn(), error: jest.fn(), warn: jest.fn() };

Object.assign(globalThis, require('../js/constants'));
Object.assign(globalThis, require('../js/helpers'));
Object.assign(globalThis, require('../js/state'));
const dups = require('../js/duplicates');

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

describe('checkForDuplicates', () => {
  test('does nothing when disabled', async () => {
    _setState({ duplicateDetectionEnabled: false });
    await dups.checkForDuplicates(1);
    expect(chrome.tabs.get).not.toHaveBeenCalled();
  });

  test('creates alarm for duplicate tabs', async () => {
    _setState({ duplicateDetectionEnabled: true, cachedSacredDomains: [] });
    chrome.storage.local.set({ duplicateAutoCloseMinutes: 10 });

    chrome.tabs._setTabs([
      { id: 1, url: 'https://a.com/page', title: 'A', pinned: false, active: true, lastFocusedWindow: true },
      { id: 2, url: 'https://a.com/page', title: 'A dup', pinned: false, active: false }
    ]);
    chrome.tabs.query.mockImplementation((q) => {
      const tabs = chrome.tabs._tabs();
      if (q.active && q.lastFocusedWindow) return Promise.resolve(tabs.filter(t => t.active && t.lastFocusedWindow));
      return Promise.resolve(tabs);
    });

    await dups.checkForDuplicates(1);
    expect(chrome.alarms.create).toHaveBeenCalledWith('dup-close-2', { delayInMinutes: 10 });
  });

  test('skips sacred domains', async () => {
    _setState({ duplicateDetectionEnabled: true, cachedSacredDomains: ['github.com'] });
    chrome.storage.local.set({ duplicateAutoCloseMinutes: 10 });

    chrome.tabs._setTabs([
      { id: 1, url: 'https://github.com/repo', title: 'GH', pinned: false },
      { id: 2, url: 'https://github.com/repo', title: 'GH dup', pinned: false }
    ]);
    chrome.tabs.query.mockImplementation(() => Promise.resolve(chrome.tabs._tabs()));

    await dups.checkForDuplicates(1);
    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });
});

describe('logDuplicateClosure', () => {
  test('logs closure to storage', async () => {
    await dups.logDuplicateClosure({ url: 'https://a.com', title: 'A', favIconUrl: '' });
    const data = await chrome.storage.local.get('duplicatesClosedToday');
    expect(data.duplicatesClosedToday).toHaveLength(1);
    expect(data.duplicatesClosedToday[0].url).toBe('https://a.com');
  });
});

describe('clearAllDuplicateTimers', () => {
  test('clears all dup-close alarms', async () => {
    chrome.alarms.create('dup-close-1', { delayInMinutes: 5 });
    chrome.alarms.create('dup-close-2', { delayInMinutes: 5 });
    chrome.alarms.create('day1tabs-reset', { delayInMinutes: 60 });

    await dups.clearAllDuplicateTimers();

    const remaining = await chrome.alarms.getAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('day1tabs-reset');
  });
});

describe('handleDupAlarm', () => {
  test('closes the duplicate tab', async () => {
    chrome.tabs._setTabs([
      { id: 5, url: 'https://a.com', title: 'A', pinned: false }
    ]);
    await dups.handleDupAlarm({ name: 'dup-close-5' });
    expect(chrome.tabs.remove).toHaveBeenCalledWith(5);
  });

  test('skips pinned tabs', async () => {
    chrome.tabs._setTabs([
      { id: 5, url: 'https://a.com', title: 'A', pinned: true }
    ]);
    await dups.handleDupAlarm({ name: 'dup-close-5' });
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });
});
