<!-- markdownlint-disable MD013 MD041 -->
<!-- container-vulnerability-release:v1 role=app-runtime release=v1.2.3 -->
<!-- container-vulnerability-release-context:v1 channel=stable -->
<!-- container-vulnerability-current-state:v1 generation=c97d3505ed45eb490eecc5abffc74a17b666b6c7f836525fea1f9d919f16a1c6 bank=none parts=0 status=active -->
<!-- markdownlint-enable MD013 -->

Release image `app-runtime` for published release `v1.2.3` has 3 public
fixable High or Critical affected observations at manifest
`sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.
Last reconciled `2026-08-29T12:34:56Z`.

## `GHSA-2345-6789-cfgh`

<!-- markdownlint-disable MD013 -->
| Package | Type | Severity | Exception state | Manifest digest | Installed | Fixed | Advisories |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `alpha` | `npm` | Critical | Excepted | `sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` | `1.0.0` | `1.0.1` | [GHSA](https://github.com/advisories/GHSA-2345-6789-cfgh) |
<!-- markdownlint-enable MD013 -->

## `CVE-2026-1234`

<!-- markdownlint-disable MD013 -->
| Package | Type | Severity | Exception state | Manifest digest | Installed | Fixed | Advisories |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `alpha` | `deb` | High | Unexcepted | `sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` | `3.0.1-1` | `3.0.1-2` | [Debian](https://security-tracker.debian.org/tracker/CVE-2026-1234) |
| `zlib` | `deb` | High | Unexcepted | `sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` | `1.2.13` | `1.3.1`, `1.3.2` | [Debian](https://security-tracker.debian.org/tracker/CVE-2026-1234) |
<!-- markdownlint-enable MD013 -->

## Lifecycle

This stable release is supported and monitored.

Automation replaces this complete issue body with the latest trusted public
state while this exact release remains monitored. Put human analysis in
comments. The issue closes as completed when no public findings remain and can
reopen if public findings return before monitoring ends.
