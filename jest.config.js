module.exports = {
  projects: [
    {
      displayName: 'panel',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/panel.test.js'],
      setupFiles: ['<rootDir>/tests/setup.js']
    },
    {
      displayName: 'security',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/security.test.js'],
      setupFiles: ['<rootDir>/tests/setup.js']
    },
    {
      displayName: 'constants',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/constants.test.js']
    },
    {
      displayName: 'helpers',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/helpers.test.js'],
      setupFiles: ['<rootDir>/tests/setup.js']
    },
    {
      displayName: 'state',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/state.test.js']
    },
    {
      displayName: 'tracking',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/tracking.test.js']
    },
    {
      displayName: 'duplicates',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/duplicates.test.js']
    },
    {
      displayName: 'reset',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/reset.test.js']
    },
    {
      displayName: 'undo',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/undo.test.js']
    },
    {
      displayName: 'messages',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/messages.test.js']
    },
    {
      displayName: 'perf',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/performance.test.js'],
      setupFiles: ['<rootDir>/tests/perf-setup.js']
    }
  ]
};
