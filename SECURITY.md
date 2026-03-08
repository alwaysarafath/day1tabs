# day1tabs — Security

## Permissions

day1tabs requests four Chrome permissions, each with a specific purpose:

| Permission | Why |
|------------|-----|
| `tabs` | Query open tabs, read URLs/titles for tracking and classification, close tabs during reset |
| `storage` | Persist settings, tab tracker backup, archive data, and undo data locally |
| `alarms` | Schedule the daily reset and duplicate-close timers (survives service worker termination) |
| `sidePanel` | Display the main UI as a Chrome side panel |

No host permissions, no `<all_urls>`, no network access, no `activeTab`.

## Data Handling

- **All data is stored locally** in `chrome.storage.local`. Zero data is transmitted to any server.
- No analytics, no telemetry, no external API calls.
- Tab URLs and titles are stored only in the local archive (retained for 1 day) and the undo buffer.
- The `tabTrackerBackup` is used solely to survive service worker restarts and is cleared on each reset.

## Input Validation

All message handler inputs are validated before processing:

| Input | Validation |
|-------|------------|
| `resetHour` | Must be integer 0-23 |
| `resetMinute` | Must be integer 0-59 |
| `sacredDomain` | Stripped of protocol/path, validated against domain regex, max 253 chars |
| `tabIndex` (reclassifyTab) | Must be non-negative integer |
| `newClassification` (reclassifyTab) | Must be one of: `workhorse`, `glanced`, `ghost` |
| `urls` (reopenTabs) | Each must be a string matching `^https?://` — blocks `javascript:`, `data:`, `blob:`, `file:`, `chrome:` |
| Message sender | `sender.id` must match `chrome.runtime.id` |

All storage reads for array fields use `Array.isArray()` guards to handle corrupted or missing data gracefully.

## XSS Prevention

- **Render-side escaping**: All user-controlled strings (tab titles, URLs, domain names) are passed through `escapeHtml()` or `escapeAttr()` before DOM insertion via `innerHTML`.
- **No inline event handlers**: Favicon `onerror` handlers are attached via `addEventListener()` after DOM creation, not via inline `onerror="..."` attributes.
- **Content Security Policy**: The extension runs in its own origin with Chrome's default CSP for MV3 extensions, which blocks inline scripts and `eval()`.

## Debug Logging

All `console.log` calls are gated behind a `DEBUG` flag (default: `false`) in `constants.js`. Only `console.error` for actual failures is always active. This prevents accidental logging of URLs or user data in production.
