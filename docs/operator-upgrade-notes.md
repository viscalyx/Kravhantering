# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Kravhantering. Use it together with the RHEL production
upgrade guide for the deployed topology and the GitHub Release notes for the
target version.

## Unreleased

### Requirement package and area owners must have HSA-IDs before upgrade

Confirm that every requirement package has an owner with a HSA-ID and every
requirement area has an owner with a valid HSA-ID before running
`db-job migrate`. Area owner HSA-IDs must use two uppercase country-code
letters, 10 digits, `-`, and an alphanumeric suffix. This migration cannot be
rolled back: it removes the legacy `owners` rows, and their original names,
email addresses and timestamps cannot be reconstructed from
`requirement_areas.owner_hsa_id` without data loss.

### Custom UI terminology must be exported before upgrade if it must be retained

Export any custom UI terminology values you need to keep before running
`db-job migrate`; migration rollback will not restore them.
