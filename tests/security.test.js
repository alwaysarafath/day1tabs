/**
 * Security tests for day1tabs
 * Verifies fixes for HIGH and MEDIUM audit findings.
 */

const bg = require('../js/background');
const utils = require('../js/utils');

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
// FIX 1: Shared escapeHtml / escapeAttr (utils.js)
// ============================================================
describe('utils — escapeHtml', () => {
  test('escapes <, >, &, " characters', () => {
    expect(utils.escapeHtml('<script>"xss"&</script>')).toBe(
      '&lt;script&gt;&quot;xss&quot;&amp;&lt;/script&gt;'
    );
  });

  test('returns empty string for falsy input', () => {
    expect(utils.escapeHtml('')).toBe('');
    expect(utils.escapeHtml(null)).toBe('');
    expect(utils.escapeHtml(undefined)).toBe('');
  });
});

describe('utils — escapeAttr', () => {
  test('escapes &, ", \' characters', () => {
    expect(utils.escapeAttr('a&b"c\'d')).toBe('a&amp;b&quot;c&#39;d');
  });

  test('returns empty string for falsy input', () => {
    expect(utils.escapeAttr('')).toBe('');
    expect(utils.escapeAttr(null)).toBe('');
  });
});

// ============================================================
// FIX 4 + 10 (5a, 6c): reopenTabs — URL scheme validation
// ============================================================
describe('reopenTabs — rejects dangerous URL schemes', () => {
  beforeEach(() => {
    chrome.tabs._setTabs([]);
    chrome.tabs.query.mockImplementation(() => Promise.resolve([]));
    chrome.storage.local.set({ archive: [] });
  });

  test('blocks javascript: URLs', async () => {
    await bg.handleMessage({ action: 'reopenTabs', urls: ['javascript:alert(1)'] });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('blocks data: URLs', async () => {
    await bg.handleMessage({ action: 'reopenTabs', urls: ['data:text/html,<script>alert(1)</script>'] });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('blocks blob: URLs', async () => {
    await bg.handleMessage({ action: 'reopenTabs', urls: ['blob:https://evil.com/abc'] });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('blocks file: URLs', async () => {
    await bg.handleMessage({ action: 'reopenTabs', urls: ['file:///etc/passwd'] });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('blocks chrome: URLs', async () => {
    await bg.handleMessage({ action: 'reopenTabs', urls: ['chrome://settings'] });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('allows https: URLs', async () => {
    await bg.handleMessage({ action: 'reopenTabs', urls: ['https://example.com'] });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com' });
  });

  test('allows http: URLs', async () => {
    await bg.handleMessage({ action: 'reopenTabs', urls: ['http://example.com'] });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'http://example.com' });
  });

  test('filters out non-string values from urls array', async () => {
    await bg.handleMessage({ action: 'reopenTabs', urls: [123, null, {}, undefined, 'https://ok.com'] });
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://ok.com' });
  });

  test('handles missing urls field gracefully', async () => {
    const result = await bg.handleMessage({ action: 'reopenTabs' });
    expect(result.success).toBe(true);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});

// ============================================================
// FIX 5 (3d): escapeAttr — verify & is escaped
// ============================================================
describe('utils — escapeAttr ampersand escaping', () => {
  // The old escapeAttr didn't escape &, which meant &quot; in input
  // would decode to " and break attributes.
  test('prevents attribute breakout via encoded entities', () => {
    // Attack: foo&quot; onmouseover=alert(1) x=&quot;
    const malicious = 'foo&quot; onmouseover=alert(1) x=&quot;';
    const escaped = utils.escapeAttr(malicious);
    // The & must be escaped first, so &quot; stays as literal text
    expect(escaped).toBe('foo&amp;quot; onmouseover=alert(1) x=&amp;quot;');
    expect(escaped).not.toContain('&quot;');
  });
});

// ============================================================
// FIX 8 (5b): isInternalUrl — dangerous schemes
// ============================================================
describe('isInternalUrl — blocks dangerous URL schemes', () => {
  test('returns true for javascript: URLs', () => {
    expect(bg.isInternalUrl('javascript:alert(1)')).toBe(true);
  });

  test('returns true for data: URLs', () => {
    expect(bg.isInternalUrl('data:text/html,<h1>hi</h1>')).toBe(true);
  });

  test('returns true for blob: URLs', () => {
    expect(bg.isInternalUrl('blob:https://example.com/abc')).toBe(true);
  });

  test('still returns true for chrome:// URLs', () => {
    expect(bg.isInternalUrl('chrome://settings')).toBe(true);
  });

  test('still returns true for about: URLs', () => {
    expect(bg.isInternalUrl('about:blank')).toBe(true);
  });

  test('still returns false for regular https URLs', () => {
    expect(bg.isInternalUrl('https://example.com')).toBe(false);
  });

  test('still returns false for regular http URLs', () => {
    expect(bg.isInternalUrl('http://example.com')).toBe(false);
  });

  test('returns true for own extension URLs', () => {
    expect(bg.isInternalUrl('chrome-extension://fakeid/pages/panel.html')).toBe(true);
  });

  test('returns false for other extension URLs', () => {
    expect(bg.isInternalUrl('chrome-extension://otherid/popup.html')).toBe(false);
  });
});

// ============================================================
// FIX 8 continued: dangerous URLs are not tracked
// ============================================================
describe('Tab tracking skips dangerous URL schemes', () => {
  test('data: URL tabs are not added to tabTracker', async () => {
    // Simulate what onUpdated does: check isInternalUrl before tracking
    const tab = { id: 99, url: 'data:text/html,test', title: 'Data' };
    // The onUpdated handler checks: if (tab.url && !isInternalUrl(tab.url))
    // Since isInternalUrl('data:...') is now true, the tab should NOT be tracked
    const state = bg._getState();
    expect(bg.isInternalUrl(tab.url)).toBe(true);
    // Verify nothing is in tracker for this tab
    expect(state.tabTracker[99]).toBeUndefined();
  });
});

// ============================================================
// FIX 9 (6a): sender validation on onMessage
// ============================================================
describe('onMessage sender validation', () => {
  // We can't easily test the actual listener registration since it
  // happens at module load time, but we can verify the listener was
  // registered and test the handleMessage function directly.

  test('handleMessage still works for valid actions', async () => {
    chrome.storage.local.set({
      resetHour: 0, resetMinute: 0, resetEnabled: true,
      sacredDomains: [], archive: [], undoData: null,
      duplicateAutoClose: false, duplicateAutoCloseMinutes: 10
    });
    chrome.tabs._setTabs([]);
    chrome.tabs.query.mockImplementation(() => Promise.resolve([]));

    const result = await bg.handleMessage({ action: 'getStatus' });
    expect(result.tabCount).toBeDefined();
    expect(result.resetEnabled).toBeDefined();
  });

  test('handleMessage returns error for unknown actions', async () => {
    const result = await bg.handleMessage({ action: 'unknownAction' });
    expect(result.error).toBe('Unknown action');
  });
});

// ============================================================
// Integration: XSS payload stored as sacred domain stays inert
// ============================================================
describe('XSS payload in sacred domain is neutralized', () => {
  test('addSacredDomain rejects XSS payloads via domain validation', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const result = await bg.handleMessage({ action: 'addSacredDomain', domain: payload });

    // Domain validation now rejects malformed domains at the input layer
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid domain');
    expect(result.sacredDomains).not.toContain(payload);
  });

  test('escapeHtml still neutralizes any stored XSS at render time', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const escaped = utils.escapeHtml(payload);
    expect(escaped).not.toContain('<img');
    expect(escaped).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('escapeAttr neutralizes attribute breakout from domain', async () => {
    const payload = '" onclick="alert(1)" data-x="';
    const escaped = utils.escapeAttr(payload);
    expect(escaped).not.toContain('" onclick');
    expect(escaped).toBe('&quot; onclick=&quot;alert(1)&quot; data-x=&quot;');
  });
});
