# Remediation tracking

Follow the project's issue and authorization rules. Find existing records
before creating new ones, preserve unrelated content, and use its labels and
linking conventions. Group findings according to the project's practice while
keeping every affected image and vulnerability identifiable.

Keep the record sufficient for another maintainer to continue without chat:

- **Action and status:** what changed, why, what was verified, and what remains.
  Distinguish an installed workaround or approved exception from an upstream
  fix. Link relevant changes and evidence.
- **Evidence:** package, ecosystem and version; affected images and digests;
  source revision; scanner and database time; advisories; complete reports.
- **Attempts:** compatibility constraints, candidate fixes, results, and why
  unsuccessful installation, patching, or removal paths failed.
- **Next checks and cleanup:** authoritative upstream sources, exact fix
  criteria, how to inspect the unmodified image, temporary changes to remove,
  and required rebuild, runtime, and scanner verification. Record exception
  scope, approval, review, and expiry when applicable.

Keep temporary remediation and its cleanup visible until the project's closure
criteria are met. A workaround passing a scan does not prove the upstream image
contains the fix. Update records when evidence or status changes.
