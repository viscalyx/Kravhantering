<!-- markdownlint-disable MD013 MD041 -->
<!-- container-vulnerability-release:v1 role=app-runtime release=v1.2.3 -->
<!-- container-vulnerability-release-context:v1 channel=stable -->
<!-- container-vulnerability-monitoring-ended:v1 ended=2026-08-30T15:29:54Z -->
<!-- markdownlint-enable MD013 -->

> [!WARNING]
> Monitoring ended for release image `app-runtime` in published release
> `v1.2.3` on `2026-08-30T15:29:54Z`. Its last trusted scan still recorded 1
> public affected observation. It is not confirmed as fixed and may still
> affect users running this release.

The last trusted state below was reconciled `2026-08-29T12:34:56Z` at manifest
`sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.
The release is no longer scanned, so its current vulnerability state is
unknown.

## Last known public findings

### `CVE-2026-1234`

<!-- markdownlint-disable MD013 -->
| Package | Type | Severity | Exception state | Manifest digest | Installed | Fixed | Advisories |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `alpha` | `deb` | High | Unexcepted | `sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` | `3.0.1-1` | `3.0.1-2` | [Debian](https://security-tracker.debian.org/tracker/CVE-2026-1234) |
<!-- markdownlint-enable MD013 -->

## Lifecycle

This stable release left the supported and monitored release window.

This terminal body is frozen. Automation no longer scans or updates this
release image version. Put any later human analysis in comments.
