module.exports = {
  projects: [
    {
      displayName: 'background',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/background.test.js'],
      setupFiles: ['<rootDir>/tests/setup.js']
    },
    {
      displayName: 'panel',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/panel.test.js'],
      setupFiles: ['<rootDir>/tests/setup.js']
    }
  ]
};
