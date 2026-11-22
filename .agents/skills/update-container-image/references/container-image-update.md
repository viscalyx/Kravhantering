# Container image updates

1. Discover the image's current identity, version lane, supported platforms,
   and all active consumers and update automation. Search build definitions,
   deployment configuration, workflows, scripts, tests, and documentation,
   including hidden files. Separate active references from historical examples
   and placeholders.
2. Verify the requested image reference against the registry and check
   compatibility against primary upstream sources. For a request for the
   latest version, establish the project's version and platform constraints
   before choosing a target.
3. Resolve immutable identities from the registry according to the project's
   policy. Distinguish a multi-platform index from a platform manifest and
   its image config. Confirm every required platform is supported.
   For an existing pin with both a tag and a digest, resolve the tag alone
   and compare its digest of the same kind and platform with the recorded
   digest. For a digest-only pin, fetch that digest directly and verify its
   identity and platform. For verification-only requests, compare current
   consumers with the expected references, report matches, mismatches, and
   gaps, and stop before editing.
4. Synchronize every affected consumer, lock, fixture, and active example.
   Update recorded tags, digests, and image IDs together where applicable.
   Keep build and runtime dependencies compatible, including native modules.
   Review inherited security workarounds against the new base and remove only
   those proven unnecessary. Preserve unrelated references and placeholders.
5. Run the project's relevant image, runtime, security, release, and integration
   checks. Search again for old references and account for intentional matches.
   Update operator guidance when deployment or upgrade behavior changes.
   Report the selected identity, changed consumers, and verification results.

Inspect automation before running it. Registry lookup is distinct from actions
that change issues, branches, releases, or deployments.
