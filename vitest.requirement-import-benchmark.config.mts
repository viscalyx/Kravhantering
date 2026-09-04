import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
      '@/lib/runtime/build-target': path.resolve(
        import.meta.dirname,
        'lib/runtime/build-target.ts',
      ),
    },
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '.git/**'],
    fileParallelism: false,
    include: [
      'tests/performance/requirement-import-transactions.sqlserver.test.ts',
    ],
    maxWorkers: 1,
    reporters: 'verbose',
    testTimeout: 7_200_000,
  },
})
