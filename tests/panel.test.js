const injectPanelDom = require('./fixtures/panel-dom');

// Load panel module — it attaches a DOMContentLoaded listener but we call functions directly
let panel;

beforeEach(() => {
  chrome._reset();
  injectPanelDom();
  // Re-require to get fresh module (listeners re-bind to new DOM)
  jest.resetModules();
  jest.doMock('./mocks/chrome', () => ({ buildChrome: () => global.chrome }));
  panel = require('../js/panel');
});

// ============================================================
// 1. renderArchive — Used count correct
// ============================================================
describe('renderArchive — Used count correct', () => {
  test('displays correct count for Used (workhorse) tabs', () => {
    const archiveResult = {
      archive: [{
        date: '2025-01-01',
        timestamp: Date.now() - 30000,
        tabs: [
          { url: 'https://a.com', title: 'A', classification: 'workhorse', favIconUrl: '' },
          { url: 'https://b.com', title: 'B', classification: 'workhorse', favIconUrl: '' },
          { url: 'https://c.com', title: 'C', classification: 'ghost', favIconUrl: '' }
        ],
        stats: { total: 3, reopened: 0, used: 2, didntUse: 1 }
      }]
    };

    panel.renderArchive(archiveResult, {});

    expect(document.getElementById('usedCount').textContent).toBe('2');
  });
});

// ============================================================
// 2. renderArchive — Didn't use count correct
// ============================================================
describe('renderArchive — Didn\'t use count correct', () => {
  test('displays correct count for Didn\'t use (non-workhorse) tabs', () => {
    const archiveResult = {
      archive: [{
        date: '2025-01-01',
        timestamp: Date.now() - 30000,
        tabs: [
          { url: 'https://a.com', title: 'A', classification: 'workhorse', favIconUrl: '' },
          { url: 'https://b.com', title: 'B', classification: 'glanced', favIconUrl: '' },
          { url: 'https://c.com', title: 'C', classification: 'ghost', favIconUrl: '' },
          { url: 'https://d.com', title: 'D', classification: 'ghost', favIconUrl: '' }
        ],
        stats: { total: 4, reopened: 0, used: 1, didntUse: 3 }
      }]
    };

    panel.renderArchive(archiveResult, {});

    expect(document.getElementById('didntUseCount').textContent).toBe('3');
  });
});

// ============================================================
// 3. updateGroupReopenBtn — hidden when all reopened
// ============================================================
describe('updateGroupReopenBtn — hidden when all reopened', () => {
  test('hides reopen button when all tabs in group are reopened', () => {
    const tabs = [
      { url: 'https://a.com', reopened: true },
      { url: 'https://b.com', reopened: true }
    ];

    panel.updateGroupReopenBtn('used', tabs);

    const btn = document.querySelector('.group-reopen-btn[data-reopen="used"]');
    expect(btn.style.display).toBe('none');
  });
});

// ============================================================
// 4. updateGroupReopenBtn — hidden when empty
// ============================================================
describe('updateGroupReopenBtn — hidden when empty', () => {
  test('hides reopen button when group has zero tabs', () => {
    panel.updateGroupReopenBtn('didntUse', []);

    const btn = document.querySelector('.group-reopen-btn[data-reopen="didntUse"]');
    expect(btn.style.display).toBe('none');
  });
});

// ============================================================
// 5. renderNextClose — toggle active/inactive state
// ============================================================
describe('renderNextClose — toggle active/inactive', () => {
  test('adds active class when resetEnabled is true', () => {
    panel.renderNextClose({
      resetEnabled: true,
      nextReset: new Date(Date.now() + 3600000).toISOString()
    });

    const track = document.getElementById('resetToggleTrack');
    expect(track.classList.contains('active')).toBe(true);
    expect(document.getElementById('nextCloseText').textContent).not.toBe('Auto-close is paused');
  });

  test('removes active class and shows paused when resetEnabled is false', () => {
    panel.renderNextClose({ resetEnabled: false });

    const track = document.getElementById('resetToggleTrack');
    expect(track.classList.contains('active')).toBe(false);
    expect(document.getElementById('nextCloseText').textContent).toBe('Auto-close is paused');
  });
});

// ============================================================
// 6. renderNeverCloseDomains — chips and count text
// ============================================================
describe('renderNeverCloseDomains — chips and count text', () => {
  test('renders domain chips and updates count', () => {
    panel.renderNeverCloseDomains(['github.com', 'google.com', 'slack.com']);

    const container = document.getElementById('nevercloseDomains');
    const chips = container.querySelectorAll('.neverclose-chip');
    expect(chips).toHaveLength(3);

    const countEl = document.getElementById('nevercloseCount');
    expect(countEl.textContent).toBe('3 domains');
  });

  test('uses singular "domain" for single entry', () => {
    panel.renderNeverCloseDomains(['github.com']);

    const countEl = document.getElementById('nevercloseCount');
    expect(countEl.textContent).toBe('1 domain');
  });

  test('renders empty state correctly', () => {
    panel.renderNeverCloseDomains([]);

    const container = document.getElementById('nevercloseDomains');
    const chips = container.querySelectorAll('.neverclose-chip');
    expect(chips).toHaveLength(0);
    expect(document.getElementById('nevercloseCount').textContent).toBe('0 domains');
  });
});

// ============================================================
// Bonus: Pure helper tests
// ============================================================
describe('formatTime', () => {
  test('formats midnight as 12:00 AM', () => {
    expect(panel.formatTime(0, 0)).toBe('12:00 AM');
  });

  test('formats noon as 12:00 PM', () => {
    expect(panel.formatTime(12, 0)).toBe('12:00 PM');
  });

  test('formats 1:05 PM correctly', () => {
    expect(panel.formatTime(13, 5)).toBe('1:05 PM');
  });

  test('formats 9:30 AM correctly', () => {
    expect(panel.formatTime(9, 30)).toBe('9:30 AM');
  });
});

describe('escapeHtml', () => {
  test('escapes angle brackets and quotes', () => {
    expect(panel.escapeHtml('<script>"xss"</script>')).toBe('&lt;script&gt;&quot;xss&quot;&lt;/script&gt;');
  });

  test('returns empty string for falsy input', () => {
    expect(panel.escapeHtml('')).toBe('');
    expect(panel.escapeHtml(null)).toBe('');
    expect(panel.escapeHtml(undefined)).toBe('');
  });
});

describe('escapeAttr', () => {
  test('escapes ampersand and quotes', () => {
    expect(panel.escapeAttr('a&b"c\'d')).toBe('a&amp;b&quot;c&#39;d');
  });

  test('returns empty string for falsy input', () => {
    expect(panel.escapeAttr('')).toBe('');
  });
});

describe('extractDomain', () => {
  test('strips www prefix', () => {
    expect(panel.extractDomain('https://www.github.com/repo')).toBe('github.com');
  });

  test('returns empty string for invalid URL', () => {
    expect(panel.extractDomain('not-a-url')).toBe('');
  });
});

// ============================================================
// "Missing something?" hint
// ============================================================
describe('"Missing something?" hint', () => {
  test('hint is displayed after auto-close', async () => {
    chrome.storage.local.set({ lastResetSource: 'auto', hintDismissCount: 0 });

    await panel.showMissingHint({ archive: [] });

    const hint = document.getElementById('missingHint');
    expect(hint.style.display).toBe('flex');
  });

  test('hint is NOT displayed after manual close', async () => {
    chrome.storage.local.set({ lastResetSource: 'manual', hintDismissCount: 0 });

    await panel.showMissingHint({ archive: [] });

    const hint = document.getElementById('missingHint');
    expect(hint.style.display).toBe('none');
  });

  test('hint is NOT displayed after 5th auto-close (hintDismissCount >= 5)', async () => {
    chrome.storage.local.set({ lastResetSource: 'auto', hintDismissCount: 5 });

    await panel.showMissingHint({ archive: [] });

    const hint = document.getElementById('missingHint');
    expect(hint.style.display).toBe('none');
  });

  test('dismiss button increments hintDismissCount', async () => {
    chrome.storage.local.set({ lastResetSource: 'auto', hintDismissCount: 2 });

    await panel.showMissingHint({ archive: [] });

    const dismissBtn = document.getElementById('missingHintDismiss');
    dismissBtn.click();

    // Wait for async storage write
    await new Promise(r => setTimeout(r, 10));

    const stored = await chrome.storage.local.get('hintDismissCount');
    expect(stored.hintDismissCount).toBe(3);

    const hint = document.getElementById('missingHint');
    expect(hint.style.display).toBe('none');
  });
});

// ============================================================
// Tab usage info display
// ============================================================
describe('Tab usage info', () => {
  test('tab usage info is always visible (no toggle icon)', () => {
    const archiveResult = {
      archive: [{
        date: '2025-01-01',
        timestamp: Date.now() - 300000,
        tabs: [
          { url: 'https://a.com', title: 'A', classification: 'workhorse', favIconUrl: '', activations: 4, focusTime: 154000 }
        ],
        stats: { total: 1, reopened: 0, used: 1, didntUse: 0 }
      }]
    };

    panel.renderArchive(archiveResult, {});

    const usedList = document.getElementById('usedList');
    const detail = usedList.querySelector('.tab-usage-detail');
    expect(detail).not.toBeNull();
    expect(detail.textContent).toContain('Visited 4 times');
    expect(detail.textContent).toContain('2m 34s');

    // No toggle icon should exist
    const toggle = usedList.querySelector('.tab-usage-toggle');
    expect(toggle).toBeNull();
  });

  test('tab item has never-close button', () => {
    const archiveResult = {
      archive: [{
        date: '2025-01-01',
        timestamp: Date.now() - 300000,
        tabs: [
          { url: 'https://github.com/repo', title: 'Repo', classification: 'workhorse', favIconUrl: '' }
        ],
        stats: { total: 1, reopened: 0, used: 1, didntUse: 0 }
      }]
    };

    panel.renderArchive(archiveResult, {});

    const usedList = document.getElementById('usedList');
    const ncBtn = usedList.querySelector('.tab-neverclose-btn');
    expect(ncBtn).not.toBeNull();
    expect(ncBtn.dataset.domain).toBe('github.com');
    expect(ncBtn.textContent).toBe('Never close');
  });
});

// ============================================================
// Time formatting (formatDuration)
// ============================================================
describe('formatDuration', () => {
  test('formats sub-10s as "< 10s"', () => {
    expect(panel.formatDuration(3000)).toBe('< 10s');
    expect(panel.formatDuration(0)).toBe('< 10s');
  });

  test('formats seconds correctly', () => {
    expect(panel.formatDuration(30000)).toBe('30s');
    expect(panel.formatDuration(45000)).toBe('45s');
  });

  test('formats minutes correctly', () => {
    expect(panel.formatDuration(60000)).toBe('1m');
    expect(panel.formatDuration(154000)).toBe('2m 34s');
  });

  test('formats hours correctly', () => {
    expect(panel.formatDuration(3600000)).toBe('1h');
    expect(panel.formatDuration(5400000)).toBe('1h 30m');
  });
});

// ============================================================
// Footer content
// ============================================================
describe('Footer redesign', () => {
  test('footer contains Review, Share, Coffee icons and contact text link', () => {
    const footer = document.querySelector('.panel-footer');
    expect(footer.innerHTML).toContain('Review');
    expect(footer.innerHTML).toContain('Share');
    expect(footer.innerHTML).toContain('Coffee');
    // Contact is in footer-line2 as text link
    const line2 = footer.querySelector('.footer-line2');
    expect(line2.innerHTML).toContain('day1tabs.com/contact');
    expect(line2.innerHTML).toContain('contact');
  });

  test('footer does NOT contain RAM estimate text', () => {
    const archiveResult = {
      archive: [{
        date: '2025-01-01',
        timestamp: Date.now() - 300000,
        tabs: [
          { url: 'https://a.com', title: 'A', classification: 'ghost', favIconUrl: '' }
        ],
        stats: { total: 1, reopened: 0, used: 0, didntUse: 1 }
      }]
    };

    panel.renderArchive(archiveResult, {});

    const footer = document.querySelector('.panel-footer');
    expect(footer.textContent).not.toContain('MB freed');
    expect(footer.textContent).not.toContain('GB freed');
  });
});

// ============================================================
// formatResetTime — no "just now"
// ============================================================
describe('formatResetTime', () => {
  test('never returns "just now" or "today" — always shows full date', () => {
    const result = panel.formatResetTime(Date.now() - 5000);
    expect(result).not.toBe('just now');
    expect(result).not.toContain('today');
    // Should contain day name (e.g. "Fri") and month
    expect(result).toMatch(/\w{3}/); // at least a 3-letter abbreviation
  });

  test('shows actual date for recent timestamps', () => {
    const result = panel.formatResetTime(Date.now() - 300000);
    expect(result).not.toContain('today');
    expect(result).not.toContain('just now');
  });
});

// ============================================================
// History hint — no keyboard shortcut
// ============================================================
describe('History hint', () => {
  test('history hint does not contain Ctrl+H shortcut', () => {
    const hint = document.querySelector('.history-hint');
    expect(hint.textContent).not.toContain('Ctrl+H');
    expect(hint.textContent).toContain('Check history');
  });
});
