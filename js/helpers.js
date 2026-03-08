// ============================================================
// day1tabs — Pure utility functions (no state, no side effects)
// ============================================================

/**
 * Checks whether a URL is internal/protected and should be skipped
 * by tracking, classification, and reset logic.
 * @param {string|null|undefined} url - The URL to check
 * @returns {boolean} true if the URL should be skipped
 */
function isInternalUrl(url) {
  if (!url) return true;

  // Dangerous or non-navigable schemes — never track, always skip
  if (url.startsWith('javascript:') ||
      url.startsWith('data:') ||
      url.startsWith('blob:')) {
    return true;
  }

  // Browser internal pages — always protected
  if (url.startsWith('chrome://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://') ||
      url.startsWith('brave://')) {
    return true;
  }

  // Only protect OUR extension's URLs, not other extensions
  if (url.startsWith('chrome-extension://')) {
    const ownId = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.id : null;
    if (ownId && url.startsWith(`chrome-extension://${ownId}/`)) {
      return true;
    }
    return false; // other extension — not internal
  }

  return false;
}

/**
 * Extracts the hostname from a URL, stripping www. prefix.
 * @param {string} url - A valid URL string
 * @returns {string} The bare hostname, or '' on parse failure
 */
function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Checks if a tab's hostname matches a stored sacred domain,
 * including subdomain matching (e.g. api.github.com matches github.com).
 * @param {string} tabHostname - The tab's extracted hostname
 * @param {string} storedDomain - The user-configured sacred domain
 * @returns {boolean}
 */
function isDomainMatch(tabHostname, storedDomain) {
  return tabHostname === storedDomain || tabHostname.endsWith('.' + storedDomain);
}

// ---- Conditional exports for testing ----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isInternalUrl, extractDomain, isDomainMatch };
}
