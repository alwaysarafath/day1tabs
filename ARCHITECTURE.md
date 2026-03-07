# day1tabs — Architecture

> Chrome extension (Manifest V3) that auto-closes tabs daily and lets users review what was closed.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Browser                          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │  popup.js    │  │  panel.js    │  │  onboarding.js     │    │
│  │  (Badge UI)  │  │  (Side Panel │  │  (First-run setup) │    │
│  │              │  │   + Tab View)│  │                    │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘    │
│         │                 │                    │                │
│         │    chrome.runtime.sendMessage()      │                │
│         ▼                 ▼                    ▼                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  background.js                          │   │
│  │                  (Service Worker)                        │   │
│  │                                                         │   │
│  │  ┌─────────────┐  ┌──────────┐  ┌───────────────────┐  │   │
│  │  │ Tab Tracker │  │  Alarms  │  │  Reset Engine     │  │   │
│  │  │ (in-memory) │  │          │  │                   │  │   │
│  │  │ tabTracker{}│  │ daily    │  │ classify → close  │  │   │
│  │  │ focusTime   │  │ dup-close│  │ → archive → undo  │  │   │
│  │  │ activations │  │          │  │                   │  │   │
│  │  └─────────────┘  └──────────┘  └───────────────────┘  │   │
│  │                                                         │   │
│  │              chrome.storage.local                       │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │ archive, undoData, sacredDomains, resetHour,    │    │   │
│  │  │ resetMinute, resetEnabled, duplicateAutoClose,  │    │   │
│  │  │ duplicateAutoCloseMinutes, onboardingComplete   │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────┐                                              │
│  │  archive.js  │  (Standalone page — detailed history view)   │
│  └──────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
```

### File Responsibilities

| File | Role |
|------|------|
| `js/background.js` | Service worker. Core engine: tab tracking, classification, reset execution, alarm scheduling, duplicate detection, badge, message handling |
| `js/panel.js` | Side panel UI (and tab-view mode after auto-reset). Shows last reset results, settings, reopen controls |
| `js/popup.js` | Badge popup. Quick stats, toggle, settings, undo |
| `js/archive.js` | Full archive page. Detailed breakdown with reclassify, group reopen, RAM estimates |
| `js/onboarding.js` | First-run flow. 3-step wizard: welcome → never-close domains → confirmation |
| `pages/*.html` | HTML shells for each UI surface |
| `css/*.css` | Styles for each UI surface |
| `manifest.json` | MV3 manifest. Permissions: `tabs`, `storage`, `alarms`, `sidePanel` |

---

## 2. Data Flow

### Tab Lifecycle: Open → Track → Classify → Close → Archive → Reopen

```
TAB OPENED                          TAB RECEIVES FOCUS
    │                                       │
    ▼                                       ▼
onCreated                            onActivated / onFocusChanged
    │                                       │
    ├─ updateBadge()                        ├─ stopFocusTracking()  [prev tab]
    └─ checkForDuplicates()                 ├─ ensureTabTracked()
                                            ├─ activations++
                                            ├─ startFocusTracking() [this tab]
                                            └─ checkForDuplicates()

TAB NAVIGATES                        TAB LOSES FOCUS
    │                                       │
    ▼                                       ▼
onUpdated                            stopFocusTracking()
    │                                       │
    ├─ update url/title/favicon             └─ focusTime += elapsed
    ├─ preserve activations/focusTime
    └─ checkForDuplicates()

RESET ALARM FIRES (midnight)
    │
    ▼
executeReset()
    │
    ├─ 1. Flush focus tracking
    ├─ 2. Query all tabs
    ├─ 3. For each tab, decide: KEEP or CLOSE
    │      Keep if: pinned, sacred domain, active tab, internal URL
    │      Close: everything else
    ├─ 4. Classify each closing tab (workhorse / glanced / ghost)
    ├─ 5. Build archive entry + undoData
    ├─ 6. Save to chrome.storage.local
    ├─ 7. Close tabs (batch, fallback to individual)
    ├─ 8. Reset tabTracker = {}
    ├─ 9. Re-init tracking for remaining tabs
    └─ 10. Open panel.html?source=auto (results page)

USER REOPENS TAB(S)
    │
    ▼
reopenTabs / undo message
    │
    ├─ chrome.tabs.create() for each URL (skip already-open)
    ├─ Mark archive entries as reopened: true
    └─ Recalculate stats
```

### Tab Classification Logic

```
classifyTab(tabData):

  activations >= 2  OR  focusTime >= 60s  →  "workhorse"  (heavily used)
  activations == 0  OR  focusTime < 5s    →  "ghost"      (never touched)
  everything else                         →  "glanced"    (briefly seen)
```

### Tabs That Are Never Closed

- Pinned tabs
- Active/focused tab in each window
- Tabs matching a `sacredDomains` entry (subdomain-aware)
- Internal URLs: `chrome://`, `about:`, `edge://`, `brave://`
  - Exception: `chrome://newtab` IS closed
- day1tabs extension URLs (`chrome-extension://{OUR_ID}/`) — protected
  - Other extensions' `chrome-extension://` URLs are NOT protected and will be closed normally

---

## 3. Storage Schema

All data lives in `chrome.storage.local`.

### Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `resetHour` | `number` | `0` | Hour for daily reset (0–23) |
| `resetMinute` | `number` | `0` | Minute for daily reset (0–59) |
| `resetEnabled` | `boolean` | `true` | Whether auto-close is active |
| `sacredDomains` | `string[]` | `[]` | Domains that survive every close |
| `duplicateAutoClose` | `boolean` | `false` | Auto-close duplicate tabs |
| `duplicateAutoCloseMinutes` | `number` | `10` | Delay before closing duplicates |
| `onboardingComplete` | `boolean` | `false` | First-run wizard completed |

### Archive

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `archive` | `DayArchive[]` | `[]` | Reset history (max 1 entry in free tier) |
| `undoData` | `object \| null` | `null` | Tab restore data; cleared after undo or next reset |
| `lastResetSource` | `string` | `""` | `"auto"` or `"manual"` |

### Duplicate Tracking

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `duplicatesClosedToday` | `object[]` | `[]` | Duplicates auto-closed during the day |
| `duplicatesClosedDate` | `string` | `""` | ISO date string; resets list on new calendar day |

### Object Shapes

```
DayArchive {
  date:               string       // "YYYY-MM-DD"
  timestamp:          number       // Date.now() at reset
  tabs:               TabEntry[]
  duplicates:         DupEntry[]   // URLs appearing 2+ times at reset
  duplicatesClosed:   TabEntry[]   // Dups auto-closed during the day
  stats: {
    total:            number
    reopened:         number
    used:             number       // workhorse count
    didntUse:         number       // glanced + ghost count
  }
}

TabEntry {
  url:                string
  title:              string
  favIconUrl:         string | null
  classification:     "workhorse" | "glanced" | "ghost"
  activations:        number
  focusTime:          number       // milliseconds
  closedAt:           number       // Date.now()
  reopened?:          boolean      // set to true when user reopens
}

DupEntry {
  url:                string
  title:              string
  favIconUrl:         string | null
  count:              number       // how many copies existed
}

UndoData {
  tabs: [{ url, pinned, windowId }]
  resetAt:            number       // Date.now()
}
```

### Service Worker Persistence (v3.1)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `tabTrackerBackup` | `object \| null` | `null` | Snapshot of tabTracker; persisted on tab switch, onSuspend, and every 2 min via alarm. Cleared after executeReset(). |
| `hintDismissCount` | `number` | `0` | How many times the "Missing something?" hint has been dismissed. Hint hidden after 5. |
| `lastResetSource` | `string` | `""` | `"auto"` or `"manual"` — used to decide whether to show the missing-something hint. |

### In-Memory State (background.js only, backed up to storage)

```
tabTracker[tabId] = {
  url, title, favIconUrl,
  activations:        number       // times tab received focus
  focusTime:          number       // ms of active focus time
  lastActivated:      number       // timestamp
  createdAt:          number       // timestamp
}

currentActiveTabId:   number | null
currentActiveStart:   number | null   // timestamp when focus began
trackingActive:       boolean         // pause/resume flag
```

**Suspend/Restore Pattern (v3.1):** Chrome kills MV3 service workers after ~30s of inactivity. The `tabTracker` is now persisted to `chrome.storage.local` under the key `tabTrackerBackup` on these events:
1. Every `stopFocusTracking()` call (tab switch, window blur)
2. `chrome.runtime.onSuspend` listener (Chrome about to kill the worker)
3. Every 2 minutes via the `day1tabs-save-tracker` alarm (safety net)

**Eager Restore on Every Wake (v3.1 critical fix):** The service worker can restart for ANY event — not just `onInstalled`/`onStartup`, but also `onActivated`, `onUpdated`, alarms, and messages. A module-level promise `_restoreReady` eagerly calls `restoreTabTracker()` on every wake. All event handlers that modify `tabTracker` (`onActivated`, `onFocusChanged`) and `saveTabTracker()` await this promise before proceeding. This prevents:
- Empty `tabTracker` overwriting a good backup on first save after wake
- Tracking data loss when the SW restarts for tab events

On restore, `restoreTabTracker()` reads the backup and merges it with any live data — live data always wins. Stale entries (tabs that no longer exist) are cleaned up by cross-referencing with `chrome.tabs.query()`. The backup is cleared to `null` after `executeReset()` completes.

---

## 4. Event Flow

### Chrome Events → Actions

```
chrome.runtime.onInstalled (reason: 'install')
  → Initialize storage defaults
  → Open onboarding.html
  → initializeExistingTabs()
  → scheduleResetAlarm()
  → updateBadge()

chrome.runtime.onStartup
  → initializeExistingTabs()
  → scheduleResetAlarm()
  → updateBadge()

chrome.tabs.onCreated
  → updateBadge()
  → checkForDuplicates() (after 1s delay — URL may not be set yet)

chrome.tabs.onActivated
  → await _restoreReady (ensure backup loaded before modifying tracker)
  → stopFocusTracking() [previous tab]
  → ensureTabTracked() + activations++
  → startFocusTracking() [new tab]
  → checkForDuplicates()

chrome.tabs.onUpdated (url or title changed)
  → Update tracker entry (preserve activations/focusTime)
  → updateBadge()
  → checkForDuplicates()

chrome.tabs.onRemoved
  → stopFocusTracking() (if this was active tab)
  → Clear duplicate alarm for this tab
  → updateBadge()
  → Note: tracker entry is NOT deleted (needed for classification)

chrome.windows.onFocusChanged
  → await _restoreReady
  → WINDOW_ID_NONE: stopFocusTracking()
  → Other window: stopFocusTracking() + startFocusTracking(new active tab)

chrome.action.onClicked
  → chrome.sidePanel.open()
```

### Alarms

| Alarm Name | Schedule | Action |
|------------|----------|--------|
| `day1tabs-reset` | Daily at `resetHour:resetMinute`, repeats every 24h | Restore tabTracker from backup, then `executeReset('auto')` |
| `day1tabs-save-tracker` | Every 2 minutes (repeating) | Persist `tabTracker` to `tabTrackerBackup` in storage (safety net) |
| `dup-close-{tabId}` | One-shot, fires after `duplicateAutoCloseMinutes` | Close the duplicate tab |

### Message Protocol (UI → Background)

| Action | Sent By | Returns |
|--------|---------|---------|
| `getStatus` | popup, panel | `{ tabCount, windowCount, resettableCount, resetEnabled, nextReset, resetHour, resetMinute, undoAvailable, undoTabCount, sacredDomains, duplicateAutoClose, duplicateAutoCloseMinutes }` |
| `getArchive` | panel, archive | `{ archive[], duplicatesClosedToday[] }` |
| `manualReset` | popup, panel | `{ success }` |
| `undo` | popup, panel | `{ success, count }` |
| `reopenTabs` | panel, archive | `{ success, count }` |
| `reclassifyTab` | archive | `{ success }` |
| `updateSettings` | popup, panel | `{ success }` |
| `addSacredDomain` | popup, panel, onboarding | `{ success, sacredDomains[] }` |
| `removeSacredDomain` | popup, panel, onboarding | `{ success, sacredDomains[] }` |
| `getCurrentTabs` | (debug) | `[{ tabId, url, title, activations, focusTime, classification }]` |

---

## 5. Performance Considerations

### Current Optimizations

1. **In-place button updates on single-tab reopen** — clicking "Open" on one tab updates only that button's DOM instead of rebuilding all tab elements. A lightweight `updateArchiveChrome()` refreshes only counters, reopen-button visibility, and the footer.

2. **Parallel storage reads** — all `getStatus` + `getArchive` calls use `Promise.all()` instead of sequential `await`, cutting the wait from 2 round-trips to 1.

3. **Event delegation** — tab reopen buttons and never-close domain chips use a single delegated listener on the container instead of per-element listeners. Eliminates listener teardown/re-creation on re-render.

4. **DocumentFragment batching** — `renderTabList` and `renderNeverCloseDomains` build all elements into a fragment and insert once, avoiding N individual `appendChild` calls (N layout recalculations).

5. **Lazy favicon loading** — `<img loading="lazy">` defers off-screen favicon decoding until the tab item scrolls into view.

6. **Badge update interval** — badge refreshes every 30 seconds via `setInterval`, not on every single tab event. Individual tab events also trigger immediate updates.

### Architecture Constraints to Be Aware Of

1. **In-memory tracker with backup** — `tabTracker` lives in the service worker's memory, backed up to `chrome.storage.local` on tab switches, onSuspend, and via a 2-minute periodic alarm. If Chrome terminates the SW (MV3 idle timeout), the tracker is restored from backup on next wake. Live data always takes precedence over backup data during merge.

2. **Full archive re-render on bulk actions** — "Reopen all", "Fresh Start", and group reopens still do a full DOM rebuild via `renderArchive()` since the entire tab list state changes. Only single-tab reopens use the lightweight path.

3. **Archive limited to 1 entry** — `archive.slice(0, 1)` in `executeReset` means only the most recent reset is retained. Historical data is discarded.

4. **`innerHTML` for tab items** — each tab item is built via HTML string + `innerHTML`. For 20 tabs this is fast; at 100+ tabs the string parsing overhead would become measurable. Current scale (typical: 10–30 tabs) is well within safe range.

5. **Duplicate check queries all tabs** — `checkForDuplicates` calls `chrome.tabs.query({ url })` on every tab activation/creation/navigation. At normal tab counts this is sub-millisecond, but it's the most frequently called chrome API.

6. **No favicon caching** — favicons are loaded from their original URLs. If a favicon server is slow, the panel may show placeholder letters until images arrive. The `loading="lazy"` attribute mitigates this for off-screen items.

---

## 6. Panel UX Flow (v3.1)

### Post-Reset Panel Layout

```
┌─────────────────────────────────────────────────────┐
│ [Missing something? Add to never-close → Settings]  │  ← hint (auto-close, first 5 times)
│ "X tabs closed · Fri, Mar 7, 2:45 PM"              │  ← archive summary (always full date)
│                                                      │
│ ▾ Used (N) ℹ                  [Reopen all]          │  ← expanded by default
│   ├─ tab item                                       │
│   │   Visited 4 times · 2m 34s                      │  ← usage always visible
│   │               [Never close] [Open]              │  ← buttons always visible
│   └─ tab item                                       │
│       Visited 1 time · 45s                          │
│                       [Never close] [Open]          │
│                                                      │
│ ▾ Didn't use (N) ℹ            [Reopen all]          │  ← expanded by default
│   ├─ tab item                                       │
│   │   Visited 0 times · < 10s                       │
│   │               [Never close] [Open]              │
│   └─ tab item                                       │
│                                                      │
│              [Reopen everything]                     │  ← centered
│ Looking for something older? Check history           │  ← reassurance
│                                                      │
│ [Review] · [Share] · [Coffee]                       │  ← icon footer (3 icons only)
│ day1tabs.com · contact · v3.1.0                     │  ← text links
└─────────────────────────────────────────────────────┘
```

### Hint System
- "Missing something?" hint shown after auto-close only (not manual)
- Tracked via `hintDismissCount` in storage (hidden after 5 dismissals)
- "Settings" link opens settings panel and scrolls to never-close section

### Tab Usage Details
- Usage data (visit count + focus time) is always visible below each tab's domain
- Shows: "Visited N times · Xm Ys" (or "< 10s")
- Data comes from `activations` and `focusTime` in the archive entry
- No toggle icon — info is always expanded

### Never-Close Button
- Each tab item has a "Never close" button (always visible, not hover-only)
- Clicking it sends `addSacredDomain` message and updates the button to "Added"
- Shows toast: "{domain} added to never-close"

### Tab Groups
- Used and Didn't use groups are expanded by default (no `collapsed` class)
- Users can click the header to collapse/expand
- Tooltips (second person): "You visited these tabs more than once or spent over a minute on them." / "You visited these tabs once or less, or spent under a minute on them."

### Summary Line
- Always shows full date/time: "X tabs closed · Fri, Mar 7, 2:45 PM"
- Never shows "just now" or "today"

### Footer
- Icon row: Review (CWS) · Share (Web Share API / clipboard) · Coffee (BMC) — 3 icons only
- Text row: day1tabs.com · contact · version
- No RAM estimate (removed in v3.1)
- No CTA cards in tab-view mode (footer icons cover this)
