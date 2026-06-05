# Requirement Specification Version Locking

Status: Accepted on 2026-06-05.

A `Kravunderlag` is a traced composition of requirement applications. Library
requirements are added only through a concrete `Publicerad kravversion`, and
the resulting requirement application keeps that requirement version as its
basis instead of automatically following later published versions.

`Kravunderlagslokala krav` are separate specification-owned content, not hidden
library requirements. When a local requirement is lifted to the library, the
application creates a new draft library requirement copy and leaves the local
requirement in place in its original kravunderlag.

This preserves the reviewable content basis of a specification while still
allowing the requirements library to evolve independently.

## Considered Options

- Always follow the latest published library version: rejected because a
  specification would silently change after later library publication.
- Copy all library requirement text into a specification item: rejected because
  it would lose the clean link to the library requirement version used as the
  basis.
- Move a local requirement into the library during graduation: rejected because
  the original specification still needs its local history and context.
