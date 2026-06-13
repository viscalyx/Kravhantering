<!-- cSpell:words AUTHZ areaco -->

# Fas 3: Kravområdesmedförfattare

Companion for
[`03-requirement-area-coauthor.spec.ts`](03-requirement-area-coauthor.spec.ts).

Manual cases: `AUTH-10`, `AUTH-11`.

## Flow

1. Create an isolated requirement area and assign `cora.coauthor` as
   kravområdesmedförfattare.
1. Sign in as `cora.coauthor`.
1. Verify the co-author can create a requirement in the assigned requirement
   area through both REST API and UI.
1. Verify the requirement-area co-author assignment appears in self-service
   privacy export data.
1. Verify AI model access without scope returns 403 before provider access.
1. Verify the co-author cannot update requirement-area metadata.
1. Verify the co-author cannot update requirement-area co-authors.
