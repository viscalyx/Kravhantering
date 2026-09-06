import { defineConfig } from '@playwright/test'
import prodlike from './playwright.prodlike.config'

export default defineConfig({
  ...prodlike,
  testMatch: ['**/mcp/seeded-scan.spec.ts'],
  metadata: {},
  retries: process.env.CI ? 2 : 0,
  use: { ...prodlike.use, trace: 'on-first-retry' },
})
