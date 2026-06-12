# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Kravhantering. Use it together with the RHEL production
upgrade guide for the deployed topology and the GitHub Release notes for the
target version.

## Unreleased

### Responsibility assignments must have valid HSA-id values before upgrade

Confirm that every live requirement-area owner, requirement-area co-author,
specification lead, specification co-author, and requirement-package lead has a
valid HSA-id before running `db-job migrate`. The migration creates
`requirement_responsibility_people`, removes duplicated live display-name
columns, and cannot reconstruct removed name snapshots on rollback without data
loss.

### Custom UI terminology must be exported before upgrade if it must be retained

Export any custom UI terminology values you need to keep before running
`db-job migrate`; migration rollback will not restore them.
