// Manual Chrome Extension API mock for MV3
// Covers: storage, tabs, alarms, action, runtime, sidePanel, windows

function makeStore() {
  let data = {};
  return {
    get: jest.fn((keys) => {
      if (typeof keys === 'string') keys = [keys];
      if (!keys) return Promise.resolve({ ...data });
      const result = {};
      for (const k of keys) {
        if (k in data) result[k] = data[k];
      }
      return Promise.resolve(result);
    }),
    set: jest.fn((obj) => {
      Object.assign(data, obj);
      return Promise.resolve();
    }),
    _data: () => data,
    _reset: () => { data = {}; }
  };
}

function makeAlarms() {
  let alarms = {};
  return {
    create: jest.fn((name, opts) => { alarms[name] = opts; }),
    clear: jest.fn((name) => {
      delete alarms[name];
      return Promise.resolve(true);
    }),
    get: jest.fn((name) => Promise.resolve(alarms[name] || null)),
    getAll: jest.fn(() => Promise.resolve(
      Object.entries(alarms).map(([name, opts]) => ({ name, ...opts }))
    )),
    onAlarm: { addListener: jest.fn() },
    _alarms: () => alarms,
    _reset: () => { alarms = {}; }
  };
}

function makeTabs() {
  let tabs = [];
  return {
    query: jest.fn((q) => Promise.resolve(
      tabs.filter(t => {
        if (q.url !== undefined) {
          // Simple Chrome match-pattern support: convert * to .*
          const pattern = new RegExp('^' + q.url.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
          if (!t.url || !pattern.test(t.url)) return false;
        }
        if (q.active !== undefined && t.active !== q.active) return false;
        if (q.currentWindow && !t.currentWindow) return false;
        if (q.lastFocusedWindow && !t.lastFocusedWindow) return false;
        if (q.windowId !== undefined && t.windowId !== q.windowId) return false;
        return true;
      })
    )),
    get: jest.fn((id) => {
      const t = tabs.find(tab => tab.id === id);
      return t ? Promise.resolve(t) : Promise.reject(new Error('Tab not found'));
    }),
    create: jest.fn((opts) => {
      const newTab = { id: Math.floor(Math.random() * 90000) + 10000, ...opts };
      tabs.push(newTab);
      return Promise.resolve(newTab);
    }),
    remove: jest.fn((ids) => {
      const arr = Array.isArray(ids) ? ids : [ids];
      tabs = tabs.filter(t => !arr.includes(t.id));
      return Promise.resolve();
    }),
    onActivated: { addListener: jest.fn() },
    onUpdated: { addListener: jest.fn() },
    onCreated: { addListener: jest.fn() },
    onRemoved: { addListener: jest.fn() },
    _tabs: () => tabs,
    _setTabs: (t) => { tabs = t; },
    _reset: () => { tabs = []; }
  };
}

function buildChrome() {
  const storage = { local: makeStore() };
  const tabs = makeTabs();
  const alarms = makeAlarms();

  return {
    storage,
    tabs,
    alarms,
    action: {
      setBadgeText: jest.fn(() => Promise.resolve()),
      setBadgeBackgroundColor: jest.fn(() => Promise.resolve()),
      onClicked: { addListener: jest.fn() }
    },
    runtime: {
      id: 'fakeid',
      onInstalled: { addListener: jest.fn() },
      onStartup: { addListener: jest.fn() },
      onSuspend: { addListener: jest.fn() },
      onMessage: { addListener: jest.fn() },
      getURL: jest.fn((path) => `chrome-extension://fakeid/${path}`),
      getManifest: jest.fn(() => ({ version: '3.0.0' })),
      sendMessage: jest.fn(() => Promise.resolve({}))
    },
    sidePanel: {
      open: jest.fn(() => Promise.resolve())
    },
    windows: {
      WINDOW_ID_NONE: -1,
      getAll: jest.fn(() => Promise.resolve([{ id: 1 }])),
      onFocusChanged: { addListener: jest.fn() }
    },
    // Reset all mocks and internal state
    _reset: function () {
      storage.local._reset();
      tabs._reset();
      alarms._reset();
      jest.clearAllMocks();
    }
  };
}

module.exports = { buildChrome };
