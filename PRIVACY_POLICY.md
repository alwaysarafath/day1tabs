# Privacy Policy — day1tabs

**Last updated:** February 16, 2026

day1tabs is a Chrome extension that helps you start each day with a clean browser by automatically closing tabs at a scheduled time and archiving them for easy recovery.

Your privacy matters. This policy explains exactly what day1tabs does and does not do with your data.

---

## What Data Is Collected

day1tabs accesses the following information **locally on your device only**:

- **Tab URLs and titles** — Used to track which tabs are open, classify them by usage (workhorse, glanced, ghost), and archive them when a reset occurs.
- **Tab activity timestamps** — Used to determine how recently and how often you interacted with each tab.
- **User settings** — Your preferences such as reset time, never-auto-close domains, and whether auto-reset is enabled.
- **Archive history** — A local record of tabs that were closed during each reset, so you can review and reopen them.

**No personal information, browsing history, passwords, form data, or page content is ever accessed or stored.**

---

## How Your Data Is Used

All data is used exclusively to provide the core functionality of the extension:

1. **Tab management** — Counting open tabs, displaying the badge counter, and determining which tabs to close at reset time.
2. **Never-auto-close filtering** — Checking tab URLs against your saved domains to keep important tabs open during resets.
3. **Archive and undo** — Saving closed tab URLs and titles locally so you can review what was closed and restore tabs if needed.
4. **Settings** — Remembering your preferred reset time, enabled/disabled state, and domain list.

Your data is never used for profiling, advertising, analytics, or any purpose beyond the features described above.

---

## Data Storage

All data is stored **locally on your device** using `chrome.storage.local`, a secure storage API provided by Google Chrome. No data is ever transmitted to any external server.

- Data stays on your machine and is only accessible to the extension itself.
- Uninstalling the extension removes all stored data.
- You can clear all extension data at any time through Chrome's extension settings.

---

## Third-Party Sharing

**day1tabs does not share any data with third parties.** Specifically:

- No data is sent to any server, API, or external service.
- No analytics or telemetry tools are used (no Google Analytics, no Mixpanel, no Sentry, nothing).
- No advertising networks or tracking pixels are included.
- No third-party scripts or SDKs are embedded in the extension.

---

## Permissions Explained

day1tabs requests the following Chrome permissions, each for a specific purpose:

| Permission | Why It's Needed |
|------------|----------------|
| `tabs` | To count open tabs, read their URLs/titles for archiving, close tabs at reset time, and reopen archived tabs. |
| `storage` | To save your settings, archived tabs, and undo data locally on your device. |
| `alarms` | To schedule the daily reset at your chosen time and manage the 30-minute undo window. |

No other permissions are requested. The extension does not access your browsing history, bookmarks, downloads, or any other browser data beyond what is listed above.

---

## User Control

You have full control over your data and the extension's behavior:

- **Toggle auto-reset on or off** at any time from the popup.
- **Change your reset time** in the settings panel.
- **Choose which domains are never closed** by adding or removing them from the Never Auto-Close list.
- **Undo a reset** within 30 minutes to restore all closed tabs.
- **Reopen individual tabs** from the archive at any time.
- **Uninstall the extension** to permanently delete all stored data.

---

## Children's Privacy

day1tabs is not directed at children under the age of 13. The extension does not knowingly collect any personal information from children. Since no data is transmitted externally, there is no risk of children's data being shared or stored on remote servers.

---

## Changes to This Policy

If this privacy policy is updated, the changes will be reflected in this document with an updated date. Since the extension does not collect or transmit data, significant changes to this policy are unlikely.

---

## Contact

If you have questions about this privacy policy or the extension, please reach out:

- **GitHub Issues:** [github.com/himaarafath/day1tabs/issues](https://github.com/himaarafath/day1tabs/issues)
- **Email:** himaarafath@gmail.com

---

**In short:** day1tabs runs entirely on your device. Nothing leaves your browser. Your tabs, your data, your control.
