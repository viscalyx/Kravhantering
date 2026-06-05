# Stable Requirement Identity And Versioned Content

Status: Accepted on 2026-06-05.

A `Krav` has a stable `Krav-ID` across its lifetime, while editable
requirement text, verification information and business metadata live in
`Kravversion` rows. A new draft or review version does not replace the
`Publicerad kravversion`; published use continues to point at the latest
published version until another version is reviewed and published.

Lifecycle status belongs to requirement versions, not only to the stable
requirement row. List views and filtering therefore calculate
`Beräknad kravstatus` for a requirement when multiple versions exist, rather
than treating the newest version as automatically usable.

This preserves stable identity for traceability while allowing draft changes,
review work and archive workflows to proceed without silently changing the
version already available to requirement specifications and users.

## Considered Options

- Store one mutable requirement row only: rejected because drafts, review
  changes and history would overwrite the published requirement state.
- Treat the newest version as the usable version: rejected because a draft or
  review version must not become usable until publication.
- Store lifecycle status only on the stable requirement row: rejected because
  different versions of the same requirement can be draft, review, published or
  archived at the same time.
