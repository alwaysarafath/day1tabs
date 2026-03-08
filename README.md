# day1tabs

Start every day with a clean browser. day1tabs is a Chrome extension that automatically closes your unused tabs at a scheduled time each day, archives them with usage data, and lets you reopen anything you need. Pinned tabs and "never-close" domains are always protected.

## Install for Development

```bash
git clone <repo-url>
cd day1tabs
npm install
```

Load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the project root

## Run Tests

```bash
npm test
```

This runs the full Jest suite across 11 projects (145 tests covering all modules, security, panel UI, and performance benchmarks).

## Module Structure

The background service worker is split into focused modules:

| Module | Purpose |
|--------|---------|
| `constants.js` | Thresholds, alarm names, timing constants |
| `helpers.js` | Pure utilities: URL validation, domain matching |
| `state.js` | Tab tracker, focus tracking, classification |
| `tracking.js` | Chrome tab/window event listeners |
| `duplicates.js` | Duplicate tab detection and auto-close |
| `reset.js` | Daily reset execution and scheduling |
| `undo.js` | Reopen tabs from the last reset |
| `messages.js` | Message routing between panel and background |
| `background.js` | Entry point: loads modules, wires listeners |

UI: `panel.js` (side panel), `onboarding.js` (first-run), `utils.js` (XSS escaping).

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full dependency graph, storage keys, and design decisions.

## How to Contribute

1. Fork the repo and create a feature branch
2. Make changes — keep modules under 300 lines, single responsibility
3. Run `npm test` and ensure all tests pass
4. Add tests for new functionality in the appropriate per-module test file
5. Open a pull request with a clear description

See [SECURITY.md](SECURITY.md) for the security model and input validation approach.
