// ============================================================
// day1tabs — Shared Utilities
// Escape functions used across panel and onboarding pages
// ============================================================

/**
 * Escapes HTML special characters to prevent XSS when inserting
 * user-controlled strings into innerHTML.
 * @param {string|null|undefined} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Escapes characters that could break HTML attribute values.
 * @param {string|null|undefined} str
 * @returns {string}
 */
function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- Conditional exports for testing (Chrome ignores this) ----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHtml, escapeAttr };
}
