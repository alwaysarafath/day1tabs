// ============================================================
// day1tabs — Shared constants
// ============================================================

/** @type {boolean} Set to true to enable debug logging */
const DEBUG = false;

/** @type {{ WORKHORSE_ACTIVATIONS: number, WORKHORSE_FOCUS_MS: number, GLANCED_FOCUS_MS: number, GHOST_FOCUS_MS: number }} */
const THRESHOLDS = {
  WORKHORSE_ACTIVATIONS: 2,
  WORKHORSE_FOCUS_MS: 60000,    // 1 minute
  GLANCED_FOCUS_MS: 30000,      // 30 seconds
  GHOST_FOCUS_MS: 5000           // 5 seconds
};

const DEFAULT_RESET_HOUR = 0;  // midnight
const DEFAULT_RESET_MINUTE = 0;

const ALARM_RESET = 'day1tabs-reset';
const ALARM_SAVE_TRACKER = 'day1tabs-save-tracker';
const ALARM_DUP_PREFIX = 'dup-close-';
const SAVE_INTERVAL_MINUTES = 2;
const ARCHIVE_RETENTION_DAYS = 1;
const DEFAULT_DUP_DELAY_MINUTES = 10;
const DAILY_PERIOD_MINUTES = 1440; // 24 * 60

/** @type {string[]} Valid classification values for reclassifyTab */
const VALID_CLASSIFICATIONS = ['workhorse', 'glanced', 'ghost'];

/** @type {number} Maximum length for a domain string */
const MAX_DOMAIN_LENGTH = 253;

/** @type {RegExp} Basic domain format validation */
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

// ---- Conditional exports for testing ----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEBUG,
    THRESHOLDS,
    DEFAULT_RESET_HOUR,
    DEFAULT_RESET_MINUTE,
    ALARM_RESET,
    ALARM_SAVE_TRACKER,
    ALARM_DUP_PREFIX,
    SAVE_INTERVAL_MINUTES,
    ARCHIVE_RETENTION_DAYS,
    DEFAULT_DUP_DELAY_MINUTES,
    DAILY_PERIOD_MINUTES,
    VALID_CLASSIFICATIONS,
    MAX_DOMAIN_LENGTH,
    DOMAIN_PATTERN
  };
}
