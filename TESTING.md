# Testing — day1tabs

## Quick start

```bash
npm install
npm test
npm run test:coverage   # with coverage report
```

## Architecture

- **Jest** with two projects: `node` env for background, `jsdom` env for panel
- **Manual Chrome API mocks** (not `jest-chrome`) to cover MV3 APIs (`sidePanel`, `action`, etc.)
- **Conditional `module.exports`** at the bottom of `background.js` and `panel.js` — Chrome ignores these (`typeof module === 'undefined'` in extension context); Jest picks them up

## Test files

| File | Env | Tests |
|------|-----|-------|
| `tests/background.test.js` | node | 12 cases |
| `tests/panel.test.js` | jsdom | 6 cases + helper tests |

## What each test covers

### background.test.js

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | classifyTab — V3 Used / Didn't use | Two-category split: workhorse = Used, ghost+glanced = Didn't use |
| 2 | executeReset — never-close domains survive | Sacred domain tabs are not removed |
| 3 | executeReset — pinned tabs survive | Pinned tabs are never closed |
| 4 | executeReset — active tab survives | Focused tab per window is preserved |
| 5 | checkForDuplicates — exact URL match | Only exact URL matches flagged, not same-domain |
| 6 | checkForDuplicates — skips never-close domains | Sacred domains are exempt from duplicate detection |
| 7 | checkForDuplicates — early return when disabled | No work done when feature is off |
| 8 | renderBadge — count and color coding | Badge text + color thresholds (green/amber/orange/red) |
| 9 | handleMessage(reopenTabs) — marks tab as reopened | Archive entry gets `reopened: true`, stats recalculated |
| 10 | executeUndo — marks all tabs as reopened | Full undo sets every archive tab to reopened |
| 11 | handleMessage(updateSettings) — saves and reschedules | Storage updated, alarm rescheduled on time change |
| 12 | scheduleResetAlarm — correct time and period | 24-hour period, positive delay, no alarm when disabled |

### panel.test.js

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | renderArchive — Used count | Correct count displayed in `#usedCount` |
| 2 | renderArchive — Didn't use count | Correct count displayed in `#didntUseCount` |
| 3 | updateGroupReopenBtn — hidden when all reopened | Button hidden when no tabs left to reopen |
| 4 | updateGroupReopenBtn — hidden when empty | Button hidden for empty groups |
| 5 | renderNextClose — toggle active/inactive | Toggle class + text matches `resetEnabled` state |
| 6 | renderNeverCloseDomains — chips and count | DOM chips rendered, singular/plural count text |
| + | formatTime, escapeHtml, escapeAttr, extractDomain | Pure helper function correctness |

## Mock details

`tests/mocks/chrome.js` provides a complete `chrome` global with:
- `storage.local` — in-memory key-value store with `get`/`set`
- `tabs` — queryable in-memory tab array with `get`/`query`/`create`/`remove`
- `alarms` — in-memory alarm store with `create`/`clear`/`get`/`getAll`
- `action` — `setBadgeText`/`setBadgeBackgroundColor` spies
- `runtime` — `sendMessage`/`getURL`/`getManifest` + event listener stubs
- `sidePanel`, `windows` — minimal stubs

Each mock has `_reset()` to clear state between tests.
