<!-- markdownlint-disable MD013 MD041 -->
<!-- container-vulnerability-reconciliation:v1 role=app-runtime release=v1.2.3 previous=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc desired=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd -->
<!-- markdownlint-enable MD013 -->

## Automated reconciliation · `2026-08-30T12:34:56Z`

The trusted public state for release image `app-runtime` in published release
`v1.2.3` changed.

### Added · 1

- `CVE-2026-0001` · `new-package` (`deb`) · High · Unexcepted · installed
  `3.0.1-1` · fixed `3.0.1-2` ·
  [Debian](https://security-tracker.debian.org/tracker/CVE-2026-1234)

### Changed · 1

- `CVE-2026-1234` · `alpha` (`deb`) · installed `3.0.1-1` · severity High → Critical;
  exception state Unexcepted → Excepted;
  fixed version `3.0.1-2` → `3.0.2-1`;
  all other public fields are unchanged.

### Removed · 1

- `CVE-2026-9999` · `removed-package` (`deb`) · installed
  `3.0.1-1` · no longer present in the
  trusted public state. This does not claim that the finding is fixed.
