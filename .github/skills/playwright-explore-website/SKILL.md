---
name: playwright-explore-website
description: >-
  Explore a website with Playwright MCP and produce test scenarios, selectors,
  and navigation steps. Use when designing end-to-end coverage or preparing
  inputs for `playwright-generate-test`.
---

## Website Exploration for Testing

Explore the website and identify key functionalities.

### Specific Instructions

- Summarize the current repository test cases first so you know what is already covered.
- Navigate to the provided `URL` with the Playwright MCP Server. If no `URL` is provided, ask the user for one.
- Identify and interact with `3-5` core features or user flows.
- Document the user interactions, relevant UI elements and locators, and the expected outcomes.
- Close the browser context when finished.
- Provide a concise summary of your findings.
- Verify no existing test case already covers a finding. If one does, drop it and continue exploring until you have uncovered coverage gaps.
- Propose test cases from the exploration.
- Use the `playwright-generate-test` skill to generate the proposed test cases.
