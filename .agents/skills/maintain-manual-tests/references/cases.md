# Manual cases

## Case writing

Resolve [area template](../templates/area.md) links from the case's destination.

- Write concrete actions and observable outcomes in the project's language.
  State the failure purpose of each bounded variant.
- Keep technical assertions (requests, identifiers, receipt replay, archive
  inspection, pixels, and geometry) in automation or separately runnable
  preparation. Separate preparation commands, required inputs, expected setup,
  and reset steps from the UI procedure.
- Reuse existing fault tools at the actual failure boundary. A lost reply after
  a committed transaction requires control of response delivery; taking the
  browser offline alone does not establish that failure.
- Verify current controls, content, and outcomes in both manual cases and
  matching specs. When retiring UI, describe and assert the resulting workflow
  and remove checks whose sole purpose is confirming the old element's absence.
  Keep functional absence checks for filtering, permissions, and state
  transitions such as closing a dialog.

## Mapping and identity

### Test placement

Keep functional counterparts focused on manual user journeys with concrete
actions through the public interface and outcomes a person can observe.
When the project requires a manual counterpart, identify it before adding or
expanding a functional scenario. Use variants that protect distinct behavior.

Place standalone HTTP, archive, numeric rendering, resource and stress checks
in the project's unit, server, browser, or measurement suites. Use a real
browser for rendering checks. Follow the project's suite and tag conventions
when placing technical checks or moving existing coverage.

Keep fixture setup and observation helpers separate from the journey. Automated
assertions may verify its visible outcomes, such as a preserved placement or
an unchanged image; internal-state assertions do not replace the UI journey.

### Counterparts

Give each ordinary case one discovered functional counterpart. Compare its UI
actions and protected outcomes with the test's actual actions and assertions;
a request-only check cannot establish browser-form behavior. Isolated fixtures
may differ from manual data when roles, state, and access boundaries are
equivalent. Exact test-title transcription in manual prose is optional.

Technical evidence cannot serve as an ordinary manual counterpart.
Use a real browser, public controls, and production styles for browser
counterparts. Distinguish controlled responses from persistence and restart
checks against the real server.

### Identity lifecycle

Follow the project's identity conventions. Where cases use stable IDs,
give distinct scenarios distinct IDs and keep test selectors aligned.

Preserve IDs across renames and moves. Split distinct surviving workflows into
new IDs, update index and links together, and record retired IDs with their
survivor or accepted coverage loss in the affected area. Retired IDs remain
unavailable for reuse.

### Metadata

Follow the format the existing cases and validator use. For projects using
the JSON `manual-mapping` format, apply the following rules.

Place one JSON block fenced as `manual-mapping` beneath each `### CASE-ID: ...`
heading. Enclose only the fenced block in an HTML comment (`<!--` and `-->`)
to hide metadata in rendered Markdown. Keep required configuration,
preparation, steps, outcomes, and human observations in visible case prose.
Use the template's ordinary or human-observation branch. Supply:

- `reference`: selected configuration and bounded variants, including their
  failure purpose where several variants share one discovered test.
- `outcomes`: a nonempty array of protected observable results.
- Exactly one `counterpart` object or `humanObservation` object.
- `counterpart`: repository-relative `spec` path and exactly one `caseId` or
  `title`. A `title` selects an exact discovered name; use
  `describe title > test title` when a describe path disambiguates it.
  A `caseId` selects the stable ID prefix. Either selector must resolve to one
  test after generated definitions expand.
- Explicit references include `runner` and `suite`:
  `playwright` / `integration`, `playwright` / `technical-browser`,
  `vitest` / `browser`, or `vitest` / `server`.
  Omission of both selects legacy Playwright integration discovery.
  Supply both fields for new counterparts and discoverable evidence.
  Resolve them to the actual configured suites. Technical browser and server
  selectors support the case as evidence.
- `humanObservation`: `kind` and a concrete `observation` the human must
  perform. Kinds are `screen-reader`, `physical-microphone-audio`,
  `os-permission`, `physical-input`, `visual-symbol-recognition`, and
  `external-client`.
  Name the actual speech, device, permission, physical action, symbol meaning,
  or external-account/client compatibility required. Paid or nondeterministic
  execution alone is not a human exception.
- Optional `evidence` array: each item has `kind` (`overlap`, `technical`, or
  `real-provider`), a `spec`, exactly one `title` or `caseId`, and `purpose`.
  Integration/browser overlap and technical browser/server references resolve
  by discovery using the same runner, suite and selector fields.
  Real-provider references verify the file and selector structure without
  loading or executing that separate suite; keep runner and suite omitted.
  Record actual provider execution separately from human observation and
  synthetic integration.

Evidence never adds a second ordinary counterpart. Human-observation cases may
cite nearby automation as evidence without claiming it performs the human
observation.

For example, a moved browser workflow keeps its ID and identifies the new suite:

```json
{
  "runner": "vitest",
  "suite": "browser",
  "spec": "<repository-relative browser spec>",
  "caseId": "CASE-01"
}
```

Use test discovery to verify generated selectors without running test bodies.
Mapping validation checks structure and identity. Compare the manual actions
and outcomes with automated actions and assertions before accepting a moved
or consolidated counterpart.
