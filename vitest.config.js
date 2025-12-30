import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Test files pattern
    include: ['tests/**/*.test.js'],

    // Timeout for each test (anti-ban delays can be slow)
    testTimeout: 10000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [
        'src/index.js',  // Entry point
        'src/validate-env.js',  // CLI tool
      ],
    },

    // Reporter
    reporters: ['verbose'],

    // Global setup
    globals: true,
  },
});
