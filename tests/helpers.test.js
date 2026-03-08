const { buildChrome } = require('./mocks/chrome');
global.chrome = buildChrome();

const { isInternalUrl, extractDomain, isDomainMatch } = require('../js/helpers');

describe('isInternalUrl', () => {
  test('returns true for null/undefined/empty', () => {
    expect(isInternalUrl(null)).toBe(true);
    expect(isInternalUrl(undefined)).toBe(true);
    expect(isInternalUrl('')).toBe(true);
  });

  test('blocks dangerous schemes', () => {
    expect(isInternalUrl('javascript:alert(1)')).toBe(true);
    expect(isInternalUrl('data:text/html,hi')).toBe(true);
    expect(isInternalUrl('blob:https://evil.com/abc')).toBe(true);
  });

  test('blocks browser internal pages', () => {
    expect(isInternalUrl('chrome://settings')).toBe(true);
    expect(isInternalUrl('about:blank')).toBe(true);
    expect(isInternalUrl('edge://settings')).toBe(true);
    expect(isInternalUrl('brave://settings')).toBe(true);
  });

  test('blocks own extension URLs', () => {
    expect(isInternalUrl('chrome-extension://fakeid/pages/panel.html')).toBe(true);
  });

  test('allows other extension URLs', () => {
    expect(isInternalUrl('chrome-extension://otherid/popup.html')).toBe(false);
  });

  test('allows http/https URLs', () => {
    expect(isInternalUrl('https://example.com')).toBe(false);
    expect(isInternalUrl('http://example.com')).toBe(false);
  });
});

describe('extractDomain', () => {
  test('extracts hostname without www', () => {
    expect(extractDomain('https://www.github.com/repo')).toBe('github.com');
    expect(extractDomain('https://github.com/repo')).toBe('github.com');
  });

  test('returns empty string for invalid URLs', () => {
    expect(extractDomain('not-a-url')).toBe('');
    expect(extractDomain('')).toBe('');
  });
});

describe('isDomainMatch', () => {
  test('matches exact domain', () => {
    expect(isDomainMatch('github.com', 'github.com')).toBe(true);
  });

  test('matches subdomain', () => {
    expect(isDomainMatch('api.github.com', 'github.com')).toBe(true);
  });

  test('does not match partial domain names', () => {
    expect(isDomainMatch('notgithub.com', 'github.com')).toBe(false);
  });
});
