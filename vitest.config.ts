import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Serve Vitest UI at root so Codespaces port forwarding works (default is /__vitest__/)
    uiBase: '/',

    // Use jsdom environment for testing React components
    environment: 'jsdom',

    // Setup file (equivalent to Jest's setupFilesAfterEnv)
    setupFiles: ['./vitest.setup.ts'],

    // Test file patterns (equivalent to Jest's testMatch)
    include: ['**/*.{spec,test}.{ts,tsx,js,jsx,mjs}'],

    // Exclude Playwright integration tests, guide tests, and .git directory
    exclude: [
      '**/tests/integration/**',
      '**/tests/guide/**',
      '**/node_modules/**',
      '.git/**',
    ],

    reporters: [
      'verbose', // Use default reporter for console output
      [
        'junit',
        {
          outputFile: './test-results/test-results-junit.xml', // Output file for JUnit report
          suiteName: 'Vitest Tests', // Name of the test suites
          classNameTemplate: '{filename}', // Template for class names in the report
        },
      ],
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage', // Output coverage reports to ./coverage folder
      reporter: ['text', 'json', 'html', 'clover', 'lcov'], // Multiple formats including Codecov-compatible ones
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        // Include deterministic script logic in coverage.
        'scripts/**/*.{js,mjs}',
      ],
      exclude: [
        '**/*.d.ts',
        '**/__tests__/**',
        '**/*.{test,spec}.{ts,tsx,js,jsx,mjs}',
        'test-utils/**',
        'vitest.setup.ts',
        // Exclude orchestration-only scripts that mainly shell out / wire env.
        'scripts/prebuild.js',
      ],
      thresholds: {
        branches: 45,
        functions: 40,
        lines: 50,
        statements: 50,
      },
    },

    // Globals (makes test functions available without imports)
    globals: true,
  },

  resolve: {
    alias: {
      // Module path mapping (equivalent to Jest's moduleNameMapper)
      '@': path.resolve(__dirname, '.'),
      // Always resolve the build-target to the dev implementation in tests.
      // Webpack aliases do not apply to vitest; this explicit alias ensures
      // tests never accidentally use the local-prod or prod frozen constants.
      '@/lib/runtime/build-target': path.resolve(
        __dirname,
        'lib/runtime/build-target.ts',
      ),
    },
  },

  // Handle CSS and asset imports (CSS modules will be handled automatically)
})
