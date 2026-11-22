# Manual tests for {{area}}

{{Describe the workflows covered. State what to record after a run, such as
the revision, environment, and result.}}

## Test users

{{List the accounts or roles, access required, and how to sign in.}}

## Shared preparation

1. {{Set up the test environment, fixtures, and initial state.}}
2. {{Explain how to reset between runs and what to preserve.}}

## {{Subarea}}

### {{CASE-ID}}: {{workflow and expected outcome}}

**Purpose:** {{State the behavior to verify.}}

**Users:** {{Identify the roles needed for this case.}}

**Prerequisites:** {{State the initial conditions and case-specific data.}}

**Separate preparation:** {{If needed, provide the command or instructions,
inputs, expected setup, and reset steps.}}

{{Choose either the counterpart or human observation branch. Keep required
details visible. Use the project's mapping format. Keep the matching
comment block only if the project uses this `manual-mapping` format.}}

**Automated counterpart:** [{{spec name}}]({{relative-spec-path}}),
{{stable case ID or exact test selector}}.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "{{configured runner}}",
    "suite": "{{configured suite}}",
    "spec": "{{repository-relative spec path}}",
    "caseId": "{{CASE-ID}}"
  },
  "reference": "{{selected configuration and justified variants}}",
  "outcomes": ["{{observable result the test protects}}"]
}
```
-->

**Requires human observation:** {{State what a person must observe or do
and which equipment, client, or setup they need.}}

<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "{{observation category allowed by the validator}}",
    "observation": "{{specific observation or action}}"
  },
  "reference": "{{selected configuration and justified variants}}",
  "outcomes": ["{{observable result to verify}}"]
}
```
-->

**Supporting evidence:** {{If relevant, identify each related automated or
provider check and the distinct outcome it verifies. Add it to the project's
mapping metadata when supported.}}

**Steps:**

1. {{Describe an action through the public interface.}}
2. {{Describe the next action and what to check.}}

**Expected results:**

- {{Describe the observable outcome of each relevant action.}}
- {{State the final condition and relevant access boundaries.}}
