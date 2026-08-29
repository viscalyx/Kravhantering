import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  ssr: {
    noExternal: ['next-intl'],
  },
  test: {
    // Serve Vitest UI at root so Codespaces port forwarding works (default is /__vitest__/)
    uiBase: '/',

    // Use jsdom environment for testing React components
    environment: 'jsdom',

    // Setup file (equivalent to Jest's setupFilesAfterEnv)
    setupFiles: ['./vitest.setup.ts'],

    // Test file patterns (equivalent to Jest's testMatch)
    include: ['**/*.{spec,test}.{ts,tsx,js,jsx,mjs}'],

    // Exclude Playwright integration/release-smoke tests, guide tests, HSA
    // node:test contract suites, local worktrees, node_modules, and .git.
    exclude: [
      'containers/hsa-directory-mock/test/**',
      'containers/hsa-mtls-provisioner/test/**',
      'containers/hsa-person-lookup-adapter/test/**',
      '**/tests/integration/**',
      '**/tests/sql-integration/**',
      '**/tests/guide/**',
      '**/tests/release-smoke/**',
      '**/.worktrees/**',
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
      reporter: ['text', 'json', 'json-summary', 'html', 'clover', 'lcov'],
      include: [
        'app/**/*.{ts,tsx,js,jsx,mjs,cjs}',
        'components/**/*.{ts,tsx,js,jsx,mjs,cjs}',
        'hooks/**/*.{ts,tsx,js,jsx,mjs,cjs}',
        'i18n/**/*.{ts,tsx,js,jsx,mjs,cjs}',
        'lib/**/*.{ts,tsx,js,jsx,mjs,cjs}',
        'proxy.{ts,tsx,js,jsx,mjs,cjs}',
        'scripts/**/*.{js,mjs}',
      ],
      exclude: [
        '**/*.d.ts',
        '**/__tests__/**',
        '**/*.{test,spec}.{ts,tsx,js,jsx,mjs}',
        'test-utils/**',
        'vitest.setup.ts',
        // Audited sources that cannot execute in the deployed runtime.
        'app/[[]locale[]]/admin/error-boundary-test/page.tsx',
        'app/[[]locale[]]/error-boundary-test/ErrorBoundaryTestTrigger.tsx',
        'app/[[]locale[]]/error-boundary-test/page.tsx',
        'app/[[]locale[]]/error-boundary-test/test-route-helpers.ts',
        'app/[[]locale[]]/requirements/[[]id[]]/_detail/types.ts',
        'lib/reports/data/fetch-deviation.ts',
        'lib/reports/data/fetch-requirement.ts',
        'lib/reports/types.ts',
        'lib/requirements/types.ts',
        'lib/runtime/build-target.ts',
        'lib/runtime/build-target.local-prod.ts',
        'lib/runtime/expo-sqlite-unavailable.ts',
        // Side-effect-only build orchestration with no importable logic seam.
        'scripts/prebuild.js',
        // Side-effect-only local Docker/systemd orchestration. Its deterministic
        // argument and artifact contract lives in the covered companion module.
        'scripts/containers/production-smoke-debug.mjs',
        // Local Compose orchestration; argument contracts are covered without
        // treating subprocess branches as deterministic production logic.
        'scripts/devcontainer/hsa-mock.mjs',
        'scripts/devcontainer/kong.mjs',
      ],
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },

    // Globals (makes test functions available without imports)
    globals: true,
  },

  resolve: {
    alias: {
      // Module path mapping (equivalent to Jest's moduleNameMapper)
      '@': path.resolve(import.meta.dirname, '.'),
      // Always resolve the build-target to the dev implementation in tests.
      // Webpack aliases do not apply to vitest; this explicit alias ensures
      // tests never accidentally use the local-prod or prod frozen constants.
      '@/lib/runtime/build-target': path.resolve(
        import.meta.dirname,
        'lib/runtime/build-target.ts',
      ),
    },
  },

  // Handle CSS and asset imports (CSS modules will be handled automatically)
})
