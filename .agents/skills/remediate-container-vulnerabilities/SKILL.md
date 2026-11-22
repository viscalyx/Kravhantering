---
name: remediate-container-vulnerabilities
description: Remediate container vulnerability findings from a job, report, or tracking issue.
argument-hint: "[job, report, or issue]"
disable-model-invocation: true
---

# Remediate Container Vulnerabilities

1. Bind the finding to the exact source revision, image identity, package and
   version, and scanner database. Collect the complete scan and inventory
   required by the project's gate for each affected image. Refresh stale
   evidence. Diagnose job failures without package findings before starting
   remediation.
2. Discover the project's security gate, exception policy, and issue-tracking
   conventions. Read existing tracking records and preserve their evidence.
   When tracking is required or authorized, use
   [tracking guidance](references/tracking.md).
3. Check authoritative advisories and the unmodified upstream image for an
   obtainable, compatible fix. If an image update supplies it:
   Call the Skill tool with "update-container-image". Remove only workarounds
   proven unnecessary.
4. Otherwise evaluate these paths in order, recording evidence and why each
   unavailable path cannot solve the finding:
   - Install an obtainable compatible fixed package or base.
   - Build the authenticated upstream fix from source. Record source and patch
     identities, build provenance, package identity, and compatibility tests.
   - Remove unused software only after checking production use, dependency
     closure, native linkage, health checks, trust material, and collateral
     tools. Verify retained capabilities.
   - If no fix is viable and policy allows an exception, present the exact
     scope, owner, residual exposure, rationale, expiry, and any required
     review date for approval. After explicit approval, carry forward the
     approved scope, decision, and evidence.
     Call the Skill tool with "manage-container-vulnerability-exceptions".
     Go to step 6 after the exception skill verifies the result.
5. Rebuild affected images and verify the actual installed fix or removal,
   runtime behavior, and unchanged vulnerability gate with fresh evidence.
   Record exact revisions, image identities, results, remaining findings, and
   verification gaps. Assess operator guidance when behavior changes.
6. Record temporary workarounds and the upstream conditions, checks, and
   cleanup needed to remove them. A passing workaround does not establish that
   the original upstream image is fixed. Update tracking only when authorized.
