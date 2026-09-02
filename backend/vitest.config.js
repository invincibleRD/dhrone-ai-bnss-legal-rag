export default {
  test: {
    coverage: {
      include: ['src/**/*.js'],
      // wiring and entrypoints, nothing to assert on
      exclude: ['src/server.js', 'src/logger.js', 'src/config.js'],
    },
  },
};
