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
