const { buildChrome } = require('./mocks/chrome');
global.chrome = buildChrome();
global.console = { ...console, log: jest.fn(), error: jest.fn(), warn: jest.fn() };

Object.assign(globalThis, require('../js/constants'));
Object.assign(globalThis, require('../js/helpers'));
Object.assign(globalThis, require('../js/state'));
Object.assign(globalThis, require('../js/duplicates'));
Object.assign(globalThis, require('../js/tracking'));
Object.assign(globalThis, require('../js/reset'));
Object.assign(globalThis, require('../js/undo'));
const messages = require('../js/messages');

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
// handleMessage(reopenTabs) — marks tab as reopened
// ============================================================
describe('handleMessage(reopenTabs)', () => {
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

    const result = await messages.handleMessage({ action: 'reopenTabs', urls: ['https://example.com'] });

    expect(result.success).toBe(true);

    const archive = (await chrome.storage.local.get('archive')).archive;
    const tab = archive[0].tabs.find(t => t.url === 'https://example.com');
    expect(tab.reopened).toBe(true);
    expect(archive[0].stats.reopened).toBe(1);
  });
});

// ============================================================
// handleMessage(updateSettings) — saves and reschedules
// ============================================================
describe('handleMessage(updateSettings)', () => {
  test('stores settings and reschedules alarm when time changes', async () => {
    chrome.storage.local.set({ resetHour: 0, resetMinute: 0, resetEnabled: true });

    const result = await messages.handleMessage({
      action: 'updateSettings',
      resetHour: 8,
      resetMinute: 30
    });

    expect(result.success).toBe(true);

    const data = await chrome.storage.local.get(['resetHour', 'resetMinute']);
    expect(data.resetHour).toBe(8);
    expect(data.resetMinute).toBe(30);

    expect(chrome.alarms.clear).toHaveBeenCalledWith('day1tabs-reset');
    expect(chrome.alarms.create).toHaveBeenCalledWith('day1tabs-reset', expect.objectContaining({
      periodInMinutes: 1440
    }));
  });
});

// ============================================================
// handleMessage(getStatus) — returns status info
// ============================================================
describe('handleMessage(getStatus)', () => {
  test('returns valid status for valid actions', async () => {
    chrome.storage.local.set({
      resetHour: 0, resetMinute: 0, resetEnabled: true,
      sacredDomains: [], archive: [], undoData: null,
      duplicateAutoClose: false, duplicateAutoCloseMinutes: 10
    });
    chrome.tabs._setTabs([]);
    chrome.tabs.query.mockImplementation(() => Promise.resolve([]));

    const result = await messages.handleMessage({ action: 'getStatus' });
    expect(result.tabCount).toBeDefined();
    expect(result.resetEnabled).toBeDefined();
  });

  test('returns error for unknown actions', async () => {
    const result = await messages.handleMessage({ action: 'unknownAction' });
    expect(result.error).toBe('Unknown action');
  });
});

// ============================================================
// Security: updateSettings — type-checks resetHour/resetMinute
// ============================================================
describe('handleMessage(updateSettings) — input validation', () => {
  test('rejects non-integer resetHour', async () => {
    chrome.storage.local.set({ resetHour: 0, resetMinute: 0, resetEnabled: true });

    await messages.handleMessage({ action: 'updateSettings', resetHour: 'abc' });
    const data = await chrome.storage.local.get('resetHour');
    expect(data.resetHour).toBe(0); // unchanged
  });

  test('rejects out-of-range resetHour', async () => {
    chrome.storage.local.set({ resetHour: 0, resetMinute: 0, resetEnabled: true });

    await messages.handleMessage({ action: 'updateSettings', resetHour: 25 });
    const data = await chrome.storage.local.get('resetHour');
    expect(data.resetHour).toBe(0); // unchanged
  });

  test('rejects out-of-range resetMinute', async () => {
    chrome.storage.local.set({ resetHour: 0, resetMinute: 0, resetEnabled: true });

    await messages.handleMessage({ action: 'updateSettings', resetMinute: 61 });
    const data = await chrome.storage.local.get('resetMinute');
    expect(data.resetMinute).toBe(0); // unchanged
  });
});

// ============================================================
// Security: addSacredDomain — domain validation
// ============================================================
describe('handleMessage(addSacredDomain) — domain validation', () => {
  test('rejects domains exceeding max length', async () => {
    const longDomain = 'a'.repeat(254) + '.com';
    const result = await messages.handleMessage({ action: 'addSacredDomain', domain: longDomain });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid domain');
  });

  test('rejects domains with invalid characters', async () => {
    const result = await messages.handleMessage({ action: 'addSacredDomain', domain: 'evil <script>' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid domain');
  });

  test('accepts valid domains', async () => {
    const result = await messages.handleMessage({ action: 'addSacredDomain', domain: 'github.com' });
    expect(result.success).toBe(true);
    expect(result.sacredDomains).toContain('github.com');
  });
});

// ============================================================
// Security: reclassifyTab — validates tabIndex and classification
// ============================================================
describe('handleMessage(reclassifyTab) — input validation', () => {
  beforeEach(() => {
    chrome.storage.local.set({
      archive: [{
        date: '2025-01-01',
        tabs: [{ url: 'https://a.com', title: 'A', classification: 'ghost', reopened: false }],
        stats: { total: 1, reopened: 0, used: 0, didntUse: 1 }
      }]
    });
  });

  test('rejects non-number tabIndex', async () => {
    const result = await messages.handleMessage({
      action: 'reclassifyTab', date: '2025-01-01', tabIndex: 'abc', newClassification: 'workhorse'
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid tabIndex');
  });

  test('rejects negative tabIndex', async () => {
    const result = await messages.handleMessage({
      action: 'reclassifyTab', date: '2025-01-01', tabIndex: -1, newClassification: 'workhorse'
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid tabIndex');
  });

  test('rejects invalid classification string', async () => {
    const result = await messages.handleMessage({
      action: 'reclassifyTab', date: '2025-01-01', tabIndex: 0, newClassification: 'evil'
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid classification');
  });

  test('accepts valid reclassification', async () => {
    const result = await messages.handleMessage({
      action: 'reclassifyTab', date: '2025-01-01', tabIndex: 0, newClassification: 'workhorse'
    });
    expect(result.success).toBe(true);
  });
});
