# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Kravhantering. Use it together with the RHEL production
upgrade guide for the deployed topology and the GitHub Release notes for the
target version.

## Unreleased

### Requirement area owners must have valid HSA-IDs before upgrade

Confirm that every requirement area has an owner and that every owner has a
valid HSA-ID before running `db-job migrate`. HSA-ID validation accepts two
uppercase country-code letters, 10 digits, `-`, and an alphanumeric suffix; it
is not limited to Swedish `SE` identifiers. If the upgrade stops because an
owner or HSA-ID is missing or invalid, repair the owner data and rerun the
target release migration.
