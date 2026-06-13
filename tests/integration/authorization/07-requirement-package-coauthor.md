<!-- cSpell:words AUTHZ PkgCoAuthor -->

# Fas 7: Kravpaketsmedförfattare

Companion for
[`07-requirement-package-coauthor.spec.ts`](07-requirement-package-coauthor.spec.ts).

Manual cases: `AUTH-10`, `AUTH-11`.

## Flow

1. Create an isolated requirement package with `paul.pkgcoauthor` as
   kravpaketsmedförfattare.
1. Sign in as `paul.pkgcoauthor`.
1. Read the package and verify Paul is listed as co-author.
1. Verify Paul cannot update package metadata.
1. Verify the package co-author assignment appears in self-service privacy
   export data.
