# day1tabs — Architecture

> Chrome extension (Manifest V3) that auto-closes tabs daily and lets users review what was closed.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Browser                          │
│                                                                 │
│  ┌──────────────┐  ┌────────────────────┐                      │
│  │  panel.js    │  │  onboarding.js     │                      │
│  │  (Side Panel │  │  (First-run setup) │                      │
│  │   + Tab View)│  │                    │                      │
│  └──────┬───────┘  └────────┬───────────┘                      │
│         │                    │                                  │
│         │    chrome.runtime.sendMessage()                       │
│         ▼                    ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              background.js (Entry Point)                │   │
│  │  ┌────────────┬──────────┬──────────────┬────────────┐  │   │
│  │  │constants.js│helpers.js│  state.js    │tracking.js │  │   │
│  │  ├────────────┼──────────┼──────────────┼────────────┤  │   │
│  │  │duplicates. │ reset.js │  undo.js     │messages.js │  │   │
│  │  └────────────┴──────────┴──────────────┴────────────┘  │   │
│  │                                                         │   │
│  │              chrome.storage.local                       │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │ archive, undoData, sacredDomains (never-close domains), resetHour,    │    │   │
│  │  │ resetMinute, resetEnabled, tabTrackerBackup,    │    │   │
│  │  │ duplicateAutoClose, duplicateAutoCloseMinutes,  │    │   │
│  │  │ onboardingComplete                              │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Module Structure (9 files)

The background service worker is split into 8 focused modules plus an entry point. Chrome's `importScripts()` loads them into a shared global scope; Jest tests use `require()` + `Object.assign(globalThis, ...)` for the same effect.

```
background.js (entry point, 103 lines)
    ├── constants.js  (54 lines)  — Thresholds, alarm names, validation constants
    ├── helpers.js    (69 lines)  — Pure functions: URL checks, domain extraction
    ├── state.js      (249 lines) — Mutable state, persistence, focus tracking, classification
    ├── duplicates.js (116 lines) — Duplicate tab detection via chrome.alarms
    ├── tracking.js   (113 lines) — Chrome tab/window event listeners
    ├── reset.js      (244 lines) — Daily reset execution and alarm scheduling
    ├── undo.js       (64 lines)  — Reopen tabs from last reset
    └── messages.js   (267 lines) — Message handler dispatch (panel ↔ background)
```

### UI Files

| File | Lines | Role |
|------|-------|------|
| `panel.js` | 709 | Side panel UI (and tab-view mode after auto-reset) |
| `onboarding.js` | 159 | First-run 3-step wizard |
| `utils.js` | 30 | Shared `escapeHtml`/`escapeAttr` for XSS prevention |

### Dependency Graph

Modules are loaded in order; each depends only on modules loaded before it.

```
constants.js  →  (no deps)
helpers.js    →  constants (chrome.runtime.id)
state.js      →  constants, helpers
duplicates.js →  constants, helpers, state
tracking.js   →  constants, helpers, state, duplicates
reset.js      →  constants, helpers, state, duplicates, tracking
undo.js       →  state
messages.js   →  constants, helpers, state, duplicates, tracking, reset, undo
```

No circular dependencies. Each module is independently testable.

---

## 3. Data Flow

### Tab Lifecycle: Open → Track → Classify → Close → Archive → Reopen

```
TAB RECEIVES FOCUS                    TAB NAVIGATES
    │                                       │
    ▼                                       ▼
onActivated / onFocusChanged          onUpdated
    │                                       │
    ├─ stopFocusTracking()  [prev tab]      ├─ update url/title/favicon
    ├─ ensureTabTracked()                   ├─ preserve activations/focusTime
    ├─ activations++                        └─ checkForDuplicates()
    ├─ startFocusTracking() [this tab]
    └─ checkForDuplicates()

RESET ALARM FIRES (scheduled time)
    │
    ▼
executeReset()
    │
    ├─ 1. Flush focus tracking
    ├─ 2. Query all tabs
    ├─ 3. For each tab, decide: KEEP or CLOSE
    │      Keep if: pinned, never-close domain, active tab, internal URL
    │      Close: everything else
    ├─ 4. Classify each closing tab (Used / Didn't use)
    ├─ 5. Build archive entry + undoData
    ├─ 6. Save to chrome.storage.local
    ├─ 7. Close tabs (batch, fallback to individual)
    ├─ 8. Reset tabTracker = {}
    ├─ 9. Re-init tracking for remaining tabs
    └─ 10. Open panel.html?source=auto (results page)
```

### Tab Classification

Tabs are split into two categories for the user:

```
classifyTab(tabData):
  activations >= 2  OR  focusTime >= 60s  →  "Used"
  everything else                         →  "Didn't use"
```

### Tabs That Are Never Closed

- Pinned tabs
- Active/focused tab in each window
- Tabs matching a never-close domain entry (subdomain-aware)
- Internal URLs: `chrome://`, `about:`, `edge://`, `brave://`
  - Exception: `chrome://newtab` IS closed
- day1tabs extension URLs — protected
  - Other extensions' `chrome-extension://` URLs are NOT protected

---

## 4. Storage Schema

All data lives in `chrome.storage.local`. No data is transmitted externally.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `resetHour` | `number` | `0` | Hour for daily reset (0–23) |
| `resetMinute` | `number` | `0` | Minute for daily reset (0–59) |
| `resetEnabled` | `boolean` | `true` | Whether auto-close is active |
| `sacredDomains` | `string[]` | `[]` | Never-close domains — survive every reset |
| `duplicateAutoClose` | `boolean` | `false` | Auto-close duplicate tabs |
| `duplicateAutoCloseMinutes` | `number` | `10` | Delay before closing duplicates |
| `onboardingComplete` | `boolean` | `false` | First-run wizard completed |
| `archive` | `DayArchive[]` | `[]` | Reset history (max 1 entry retained) |
| `undoData` | `object\|null` | `null` | Tab restore data from last reset |
| `tabTrackerBackup` | `object\|null` | `null` | Persisted tabTracker (survives SW termination) |
| `duplicatesClosedToday` | `object[]` | `[]` | Duplicates auto-closed during the day |
| `duplicatesClosedDate` | `string` | `""` | ISO date for duplicate log rotation |
| `lastResetSource` | `string` | `""` | `"auto"` or `"manual"` |
| `hintDismissCount` | `number` | `0` | Times user dismissed the hint (hidden after 5) |

### Object Shapes

```
DayArchive {
  date:               string       // "YYYY-MM-DD"
  timestamp:          number       // Date.now() at reset
  tabs:               TabEntry[]
  duplicates:         DupEntry[]   // URLs appearing 2+ times at reset
  duplicatesClosed:   TabEntry[]   // Dups auto-closed during the day
  stats: { total, reopened, used, didntUse }
}

TabEntry {
  url, title, favIconUrl, classification, activations, focusTime, closedAt
  reopened?:          boolean      // set to true when user reopens
}
```

---

## 5. Service Worker Lifecycle

MV3 service workers can be terminated at any time. day1tabs handles this via:

1. **`tabTrackerBackup`** in `chrome.storage.local` — saved on every focus change and periodically via alarm
2. **`_restoreReady`** — eagerly restores tracker on every SW wake (module-level promise)
3. **`chrome.alarms`** — reset scheduling and duplicate timers survive SW death
4. **`onSuspend`** — final save attempt before termination

All event handlers that modify `tabTracker` await `_restoreReady` before proceeding. On restore, live data always wins over backup data. Stale entries are cleaned up by cross-referencing with `chrome.tabs.query()`.

---

## 6. Security Hardening

- **XSS**: All user strings escaped via `escapeHtml()`/`escapeAttr()`. No inline event handlers.
- **URL schemes**: `reopenTabs` only allows `http(s)://`. `isInternalUrl()` blocks `javascript:`, `data:`, `blob:`.
- **Sender validation**: `onMessage` rejects messages from foreign extension contexts.
- **Input validation**: Domain format + length, resetHour/resetMinute range, reclassifyTab whitelist.
- **Defensive reads**: `Array.isArray()` guards on all storage array fields.
- **Debug logging**: All `console.log` gated behind `DEBUG` flag (default `false`).

See [SECURITY.md](SECURITY.md) for full details.

---

## 7. Removed Files

These dead files were removed during cleanup (unreachable in manifest, no links from live pages):

- `pages/popup.html`, `js/popup.js`, `css/popup.css` — Legacy browser action popup, superseded by side panel
- `pages/archive.html`, `js/archive.js`, `css/archive.css` — Standalone archive page, superseded by panel's integrated archive

---

## 8. Alarms

| Alarm Name | Schedule | Action |
|------------|----------|--------|
| `day1tabs-reset` | Daily at configured time, 24h repeat | Restore tracker, `executeReset('auto')` |
| `day1tabs-save-tracker` | Every 2 min (repeating) | Persist `tabTracker` to storage |
| `dup-close-{tabId}` | One-shot after delay | Close the duplicate tab |

## 9. Message Protocol (UI → Background)

| Action | Returns |
|--------|---------|
| `getStatus` | `{ tabCount, windowCount, resettableCount, resetEnabled, nextReset, ... }` |
| `getArchive` | `{ archive[], duplicatesClosedToday[] }` |
| `manualReset` | `{ success }` |
| `undo` | `{ success, count }` |
| `reopenTabs` | `{ success, count }` |
| `reclassifyTab` | `{ success }` |
| `updateSettings` | `{ success }` |
| `addSacredDomain` | `{ success, sacredDomains[] }` | (adds a never-close domain)
| `removeSacredDomain` | `{ success, sacredDomains[] }` | (removes a never-close domain)
| `getCurrentTabs` | `{ tabs: [{ tabId, url, title, activations, focusTime, classification }] }` |
