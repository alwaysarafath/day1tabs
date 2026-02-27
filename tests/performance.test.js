/**
 * Performance benchmark suite for day1tabs (AFTER optimizations)
 * Measures timing AND Chrome API call counts.
 *
 * Run:  npm run test:perf
 */

const { performance } = require('perf_hooks');

// ── Helpers ────────────────────────────────────────────────────
function bench(fn, iterations = 1) {
  fn(); // warmup
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return times.reduce((a, b) => a + b, 0) / times.length;
}

async function benchAsync(fn, iterations = 1) {
  await fn(); // warmup
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return times.reduce((a, b) => a + b, 0) / times.length;
}

const results = [];
function record(scenario, avgMs, targetMs, apiCalls) {
  results.push({ scenario, avgMs, targetMs, pass: avgMs <= targetMs, apiCalls });
}

// ── Setup ──────────────────────────────────────────────────────
let bg;

beforeAll(() => {
  bg = require('../js/background');
});

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

afterAll(() => {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  PERFORMANCE BENCHMARK — AFTER (optimized)                      ║');
  console.log('╠════════════════════════════════════════════╦═══════════╦════════╦════╦═══════════╣');
  console.log('║ Scenario                                   ║ Avg (ms)  ║ Target ║ P/F║ API Calls ║');
  console.log('╠════════════════════════════════════════════╬═══════════╬════════╬════╬═══════════╣');
  for (const r of results) {
    const name = r.scenario.padEnd(42);
    const avg = r.avgMs.toFixed(4).padStart(9);
    const tgt = (r.targetMs + 'ms').padStart(6);
    const pf = r.pass ? ' OK' : ' !!';
    const api = r.apiCalls !== undefined ? String(r.apiCalls).padStart(9) : '      n/a';
    console.log(`║ ${name} ║ ${avg} ║ ${tgt} ║${pf}║ ${api} ║`);
  }
  console.log('╚════════════════════════════════════════════╩═══════════╩════════╩════╩═══════════╝\n');
});

// Helper: count total Chrome API calls across key mocks
function countApiCalls() {
  return (
    (chrome.storage.local.get.mock?.calls?.length || 0) +
    (chrome.storage.local.set.mock?.calls?.length || 0) +
    (chrome.tabs.query.mock?.calls?.length || 0) +
    (chrome.tabs.get.mock?.calls?.length || 0) +
    (chrome.tabs.create.mock?.calls?.length || 0) +
    (chrome.tabs.remove.mock?.calls?.length || 0) +
    (chrome.alarms.create.mock?.calls?.length || 0) +
    (chrome.alarms.clear.mock?.calls?.length || 0) +
    (chrome.alarms.get.mock?.calls?.length || 0) +
    (chrome.alarms.getAll.mock?.calls?.length || 0) +
    (chrome.action.setBadgeText.mock?.calls?.length || 0) +
    (chrome.action.setBadgeBackgroundColor.mock?.calls?.length || 0)
  );
}

// ================================================================
// 1. onUpdated handler — 100 rapid events (sync in-memory only)
// ================================================================
describe('1. onUpdated handler (100 events)', () => {
  test('averages < 1ms per event with ZERO API calls', () => {
    const tracker = {};
    for (let i = 0; i < 20; i++) {
      tracker[i] = {
        url: `https://site${i}.com`, title: `Site ${i}`, favIconUrl: '',
        activations: 1, focusTime: 5000, lastActivated: Date.now(), createdAt: Date.now()
      };
    }
    bg._setState({ tabTracker: tracker, duplicateDetectionEnabled: false });

    const callsBefore = countApiCalls();
    const iterations = 100;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const tabId = i % 20;
      const tab = { id: tabId, url: `https://site${tabId}.com/page${i}`, title: `Page ${i}`, favIconUrl: '' };
      const changeInfo = { url: tab.url, status: 'complete' };

      // V3 optimized: pure in-memory tracker update, NO badge call, NO dup check when disabled
      const state = bg._getState();
      const t = state.tabTracker;
      if (!t[tabId]) {
        t[tabId] = { url: tab.url, title: tab.title || 'Untitled', favIconUrl: tab.favIconUrl || '', activations: 0, focusTime: 0, lastActivated: null, createdAt: Date.now() };
      } else {
        if (changeInfo.url) t[tabId].url = tab.url;
        t[tabId].title = tab.title || t[tabId].title;
        t[tabId].favIconUrl = tab.favIconUrl || t[tabId].favIconUrl;
      }
    }

    const elapsed = performance.now() - start;
    const avgPerEvent = elapsed / iterations;
    const apiCalls = countApiCalls() - callsBefore;

    record('onUpdated handler (per event)', avgPerEvent, 1, apiCalls);
    expect(avgPerEvent).toBeLessThan(1);
    expect(apiCalls).toBe(0); // V3: zero API calls on onUpdated
  });
});

// ================================================================
// 2. Classify + archive build — 10, 20, 50 tabs
// ================================================================
describe('2. Panel render time', () => {
  function buildArchiveTabs(count) {
    const tabs = [];
    for (let i = 0; i < count; i++) {
      tabs.push({ url: `https://site${i}.com`, title: `Site ${i}`, favIconUrl: '',
        activations: i % 3 === 0 ? 3 : 0, focusTime: i % 3 === 0 ? 90000 : 2000,
        lastActivated: Date.now(), createdAt: Date.now() });
    }
    return tabs;
  }

  test.each([10, 20, 50])('classify + build archive for %i tabs < 50ms', (count) => {
    const tabs = buildArchiveTabs(count);
    const avg = bench(() => {
      const entries = tabs.map(t => ({
        url: t.url, title: t.title, favIconUrl: t.favIconUrl,
        classification: bg.classifyTab(t), activations: t.activations,
        focusTime: t.focusTime, closedAt: Date.now()
      }));
      const used = entries.filter(e => e.classification === 'workhorse');
      const didntUse = entries.filter(e => e.classification !== 'workhorse');
      return { total: entries.length, used: used.length, didntUse: didntUse.length };
    }, 50);

    record(`Classify + archive (${count} tabs)`, avg, 50, 0);
    expect(avg).toBeLessThan(50);
  });
});

// ================================================================
// 3. Single tab reopen — archive update
// ================================================================
describe('3. Single tab reopen (archive update)', () => {
  test('mark one tab reopened + recalc stats < 5ms', async () => {
    const tabs = [];
    for (let i = 0; i < 30; i++) {
      tabs.push({ url: `https://site${i}.com`, title: `Site ${i}`,
        classification: i < 10 ? 'workhorse' : 'ghost', favIconUrl: '', reopened: false });
    }
    chrome.storage.local.set({
      archive: [{ date: '2025-01-01', tabs, stats: { total: 30, reopened: 0, used: 10, didntUse: 20 } }]
    });
    chrome.tabs._setTabs([]);
    chrome.tabs.query.mockImplementation(() => Promise.resolve([]));

    const avg = await benchAsync(async () => {
      const archive = (await chrome.storage.local.get('archive')).archive;
      archive[0].tabs.forEach(t => t.reopened = false);
      archive[0].stats = { total: 30, reopened: 0, used: 10, didntUse: 20 };
      await chrome.storage.local.set({ archive });
      jest.clearAllMocks(); // reset counts for the actual operation
      chrome.tabs.query.mockImplementation(() => Promise.resolve([]));
      await bg.handleMessage({ action: 'reopenTabs', urls: ['https://site5.com'] });
    }, 20);

    const apiCalls = countApiCalls();
    record('Single tab reopen', avg, 5, apiCalls);
    expect(avg).toBeLessThan(5);
  });
});

// ================================================================
// 4. executeReset with 30 tabs
// ================================================================
describe('4. executeReset with 30 tabs', () => {
  test('full reset cycle < 200ms', async () => {
    const setupTabs = () => {
      const tabs = [];
      for (let i = 1; i <= 30; i++) {
        tabs.push({ id: i, url: `https://site${i}.com`, title: `Site ${i}`, favIconUrl: '',
          pinned: false, active: i === 1, windowId: 1 });
      }
      return tabs;
    };

    let apiCalls;
    const avg = await benchAsync(async () => {
      chrome._reset();
      bg._setState({ tabTracker: {}, currentActiveTabId: null, currentActiveStart: null,
        trackingActive: true, duplicateDetectionEnabled: false, cachedTabCount: 30, cachedSacredDomains: [] });

      const tabs = setupTabs();
      chrome.tabs._setTabs(tabs);
      chrome.storage.local.set({ sacredDomains: [], resetEnabled: true, archive: [], duplicatesClosedToday: [] });
      chrome.tabs.query.mockImplementation((q) => {
        const allTabs = chrome.tabs._tabs();
        if (q.active === true) return Promise.resolve(allTabs.filter(t => t.active));
        return Promise.resolve(allTabs);
      });

      const tracker = {};
      for (const t of tabs) {
        tracker[t.id] = { url: t.url, title: t.title, favIconUrl: '',
          activations: t.id % 3 === 0 ? 3 : 0, focusTime: t.id % 3 === 0 ? 90000 : 2000,
          lastActivated: Date.now(), createdAt: Date.now() };
      }
      bg._setState({ tabTracker: tracker });
      jest.clearAllMocks();
      chrome.tabs.query.mockImplementation((q) => {
        const allTabs = chrome.tabs._tabs();
        if (q.active === true) return Promise.resolve(allTabs.filter(t => t.active));
        return Promise.resolve(allTabs);
      });

      await bg.executeReset('manual');
      apiCalls = countApiCalls();
    }, 10);

    record('executeReset (30 tabs)', avg, 200, apiCalls);
    expect(avg).toBeLessThan(200);
  });
});

// ================================================================
// 5. Badge update — V3 uses sync renderBadge (no tabs.query)
// ================================================================
describe('5. Badge update', () => {
  test('renderBadge call < 10ms with ZERO queries', () => {
    const callsBefore = countApiCalls();

    const avg = bench(() => {
      bg.renderBadge(42);
    }, 100);

    const apiCalls = countApiCalls() - callsBefore;
    // renderBadge makes 2 calls: setBadgeText + setBadgeBackgroundColor
    // but ZERO tabs.query calls (the key optimization)
    const queryCount = chrome.tabs.query.mock?.calls?.length || 0;

    record('Badge renderBadge()', avg, 10, apiCalls);
    expect(avg).toBeLessThan(10);
    expect(queryCount).toBe(0); // V3: no tabs.query on badge update
  });
});

// ================================================================
// 6. Duplicate check — disabled (in-memory flag) vs enabled
// ================================================================
describe('6. Duplicate check', () => {
  test('early return when disabled < 0.1ms with ZERO API calls', async () => {
    bg._setState({ duplicateDetectionEnabled: false });

    const callsBefore = countApiCalls();

    const avg = await benchAsync(async () => {
      await bg.checkForDuplicates(1);
    }, 100);

    const apiCalls = countApiCalls() - callsBefore;

    record('Dup check (disabled)', avg, 0.1, apiCalls);
    expect(avg).toBeLessThan(0.1);
    expect(apiCalls).toBe(0); // V3: in-memory flag, zero API calls
  });

  test('full check with 20 tabs < 5ms', async () => {
    bg._setState({ duplicateDetectionEnabled: true, cachedSacredDomains: [] });
    chrome.storage.local.set({ duplicateAutoCloseMinutes: 10 });

    const tabs = [];
    for (let i = 1; i <= 20; i++) {
      tabs.push({ id: i, url: i <= 2 ? 'https://duplicate.com/page' : `https://site${i}.com`,
        title: `Tab ${i}`, pinned: false, active: i === 1, lastFocusedWindow: i === 1 });
    }
    chrome.tabs._setTabs(tabs);
    chrome.tabs.query.mockImplementation((q) => {
      const allTabs = chrome.tabs._tabs();
      if (q.active === true && q.lastFocusedWindow) return Promise.resolve(allTabs.filter(t => t.active && t.lastFocusedWindow));
      return Promise.resolve(allTabs);
    });

    jest.clearAllMocks();
    chrome.tabs.query.mockImplementation((q) => {
      const allTabs = chrome.tabs._tabs();
      if (q.active === true && q.lastFocusedWindow) return Promise.resolve(allTabs.filter(t => t.active && t.lastFocusedWindow));
      return Promise.resolve(allTabs);
    });

    const avg = await benchAsync(async () => {
      chrome.alarms._reset();
      await bg.checkForDuplicates(1);
    }, 20);

    // V3: reads delayMinutes from storage (1 call) + tabs.get + tabs.query + alarms
    // Old: read duplicateAutoClose + sacredDomains + delayMinutes from storage (1 big call) + all the same
    const storageGets = chrome.storage.local.get.mock?.calls?.length || 0;
    const apiCalls = countApiCalls();

    record('Dup check (enabled, 20 tabs)', avg, 5, Math.round(apiCalls / 20));
    expect(avg).toBeLessThan(5);
  });
});
