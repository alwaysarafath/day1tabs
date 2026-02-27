const { buildChrome } = require('./mocks/chrome');

// Install global chrome mock
global.chrome = buildChrome();

// Suppress console noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};
