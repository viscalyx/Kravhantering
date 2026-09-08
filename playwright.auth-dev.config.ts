import { defineConfig } from '@playwright/test'
import config from './playwright.config'

// The main dev suite delegates these scenarios to prodlike. This focused
// runner also verifies the HTTP cookie contract without shared login state.
export default defineConfig({
  ...config,
  testIgnore: [],
  testMatch: '**/authentication/login.spec.ts',
  globalSetup: undefined,
})
