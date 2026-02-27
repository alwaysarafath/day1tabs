const { buildChrome } = require('./mocks/chrome');
global.chrome = buildChrome();
// DO NOT suppress console — we need the benchmark table output
