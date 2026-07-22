import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@/lib/runtime/build-target': path.resolve(
        __dirname,
        'lib/runtime/build-target.ts',
      ),
    },
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '.git/**'],
    fileParallelism: false,
    globalSetup: ['./tests/sql-integration/helpers/global-setup.ts'],
    hookTimeout: 120_000,
    include: ['tests/sql-integration/**/*.sqlserver.test.ts'],
    maxWorkers: 1,
    reporters: [
      'verbose',
      [
        'junit',
        {
          classNameTemplate: '{filename}',
          outputFile: './test-results/sql-integration/test-results-junit.xml',
          suiteName: 'SQL Integration Tests',
        },
      ],
    ],
    testTimeout: 60_000,
  },
})
