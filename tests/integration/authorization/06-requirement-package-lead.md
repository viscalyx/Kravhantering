<!-- cSpell:words AUTHZ PkgCoAuthor -->

# Fas 6: Kravpaketsansvarig

Companion for
[`06-requirement-package-lead.spec.ts`](06-requirement-package-lead.spec.ts).

Manual cases: `AUTH-10`, `AUTH-11`.

## Flow

1. Create an isolated requirement package led by `leo.pkglead`.
1. Sign in as `leo.pkglead`.
1. Update package metadata while keeping `paul.pkgcoauthor` as co-author.
1. Verify the package lead remains `leo.pkglead`.
1. Verify the package lead cannot perform the Admin-only archive action.
