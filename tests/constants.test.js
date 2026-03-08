const c = require('../js/constants');

describe('constants', () => {
  test('THRESHOLDS has all required keys', () => {
    expect(c.THRESHOLDS).toEqual({
      WORKHORSE_ACTIVATIONS: 2,
      WORKHORSE_FOCUS_MS: 60000,
      GLANCED_FOCUS_MS: 30000,
      GHOST_FOCUS_MS: 5000
    });
  });

  test('default reset time is midnight', () => {
    expect(c.DEFAULT_RESET_HOUR).toBe(0);
    expect(c.DEFAULT_RESET_MINUTE).toBe(0);
  });

  test('alarm name constants are strings', () => {
    expect(typeof c.ALARM_RESET).toBe('string');
    expect(typeof c.ALARM_SAVE_TRACKER).toBe('string');
    expect(typeof c.ALARM_DUP_PREFIX).toBe('string');
  });

  test('timing constants are positive numbers', () => {
    expect(c.SAVE_INTERVAL_MINUTES).toBeGreaterThan(0);
    expect(c.ARCHIVE_RETENTION_DAYS).toBeGreaterThan(0);
    expect(c.DEFAULT_DUP_DELAY_MINUTES).toBeGreaterThan(0);
    expect(c.DAILY_PERIOD_MINUTES).toBe(1440);
  });

  test('VALID_CLASSIFICATIONS contains expected values', () => {
    expect(c.VALID_CLASSIFICATIONS).toEqual(['workhorse', 'glanced', 'ghost']);
  });

  test('domain validation constants are defined', () => {
    expect(c.MAX_DOMAIN_LENGTH).toBe(253);
    expect(c.DOMAIN_PATTERN).toBeInstanceOf(RegExp);
    expect(c.DOMAIN_PATTERN.test('github.com')).toBe(true);
    expect(c.DOMAIN_PATTERN.test('<script>')).toBe(false);
  });

  test('DEBUG flag is boolean', () => {
    expect(typeof c.DEBUG).toBe('boolean');
  });
});
