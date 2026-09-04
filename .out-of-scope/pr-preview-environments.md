# Pull Request Preview Environments

Kravhantering does not provide maintainer-started public live environments for
pull requests.

## Why This Is Out of Scope

Pull request validation is kept as finite automated checks rather than a
long-running public deployment surface. A useful preview would execute
untrusted pull request code in a multi-service environment and expose the
application and Keycloak through a public tunnel. Supporting that surface
would require dedicated controls for dynamic origins and credentials, public
traffic, source selection, URL publication, lease monitoring, and cleanup.

The expected review benefit does not justify making that security and lifecycle
boundary part of the project's supported CI infrastructure. Automated container
verification remains in the Container PR Smoke workflow. Reviewers who need
interactive browser exploration can use the documented, human-operated GitHub
Codespaces workflow instead.

## Prior Requests

- #1038: "Prototype maintainer-started 60-minute PR preview environments"
