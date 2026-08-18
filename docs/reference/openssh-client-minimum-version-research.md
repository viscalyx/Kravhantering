# OpenSSH client minimum-version research note

Research date: 2026-08-18

## Decision summary

The Azure development workflow supports Windows, macOS, and Linux
workstations. The supported platform names are an explicit contract in
[`AzureDev.Workstation.psm1`](../../scripts/azure-dev/AzureDev.Workstation.psm1).

The complete host-key argument set requires OpenSSH 8.5 or later on every
platform. This is an upstream OpenSSH client feature boundary, not an operating
system boundary. The repository should enforce these platform floors:

<!-- markdownlint-disable MD013 -->
| Platform | Minimum to enforce | Basis |
| --- | --- | --- |
| Windows | Win32-OpenSSH 8.6 | OpenSSH 8.5 contains the required behavior, but Microsoft's official Windows release history jumps from 8.1.0.0 to 8.6.0.0. Version 8.6 is therefore the first supported Microsoft build that contains it. |
| macOS | OpenSSH 8.5 | The option parser and host-file behavior come from upstream OpenSSH. Apple's in-box release history also jumps from OpenSSH 8.1 to 8.6, but a non-Apple OpenSSH 8.5 client is technically sufficient. |
| Linux | OpenSSH 8.5 | The upstream portable OpenSSH 8.5 release is the feature boundary. Distribution package revisions do not change that upstream major/minor floor. |
<!-- markdownlint-enable MD013 -->

A hypothetical Windows build based on upstream OpenSSH 8.5 can support the
features, but Microsoft does not publish a Win32-OpenSSH 8.5 release. The 8.6
Windows floor is therefore a supported-package floor rather than a different
implementation boundary. Microsoft's
[Win32-OpenSSH release history](https://github.com/PowerShell/Win32-OpenSSH#release-history)
lists 8.1.0.0 followed by 8.6.0.0.

Apple's source history shows the same practical vendor jump. Apple package
`OpenSSH-240.40.1` identifies its upstream client as
[OpenSSH 8.1](https://github.com/apple-oss-distributions/OpenSSH/blob/OpenSSH-240.40.1/openssh/version.h),
while `OpenSSH-268.100.4` identifies it as
[OpenSSH 8.6](https://github.com/apple-oss-distributions/OpenSSH/blob/OpenSSH-268.100.4/openssh/version.h).
This does not make 8.6 an OpenSSH feature requirement on macOS because users
can install a portable client independently of the operating system.

## Option-by-option boundary

The repository supplies these host-key options to `ssh` and `scp`:

- `StrictHostKeyChecking=yes`
- `UserKnownHostsFile=<managed path>`
- `GlobalKnownHostsFile=none`
- `KnownHostsCommand=none`
- `VerifyHostKeyDNS=no`
- `UpdateHostKeys=no`

`StrictHostKeyChecking`, `UserKnownHostsFile`, and `GlobalKnownHostsFile`
predate the other relevant boundaries. `VerifyHostKeyDNS` is present in
OpenSSH 3.7p1. `UpdateHostKeys` is introduced in OpenSSH 6.8; the upstream
[6.8 release notes](https://www.openssh.org/txt/release-6.8) describe both the
host-key rotation protocol and its client configuration option.

`KnownHostsCommand` is the newest named option. The upstream
[8.5 release notes](https://www.openssh.org/txt/release-8.5) identify it as a
new client option since OpenSSH 8.4. The
[8.5p1 client manual](https://raw.githubusercontent.com/openssh/openssh-portable/V_8_5_P1/ssh_config.5)
contains the directive, while the
[8.4p1 client manual](https://raw.githubusercontent.com/openssh/openssh-portable/V_8_4_P1/ssh_config.5)
does not.

The value `none` for `GlobalKnownHostsFile` adds a second 8.5 dependency.
OpenSSH 8.5 client startup explicitly recognizes `none` and clears the global
host-file list in
[`ssh.c`](https://github.com/openssh/openssh-portable/blob/V_8_5_P1/ssh.c#L1430-L1447).
OpenSSH 8.4 parses the value only as an ordinary filename in
[the OpenSSH 8.4 parser source](https://github.com/openssh/openssh-portable/blob/V_8_4_P1/readconf.c#L1184-L1210).
Consequently, an older client can accept
`GlobalKnownHostsFile=none` without providing the intended isolation from
global trust data.

Removing only `KnownHostsCommand=none` therefore does **not** safely lower the
minimum version. The current `GlobalKnownHostsFile=none` behavior still
requires OpenSSH 8.5. If both that command option is removed and the global
host-file value is replaced with a safe platform-specific null path, the next
feature boundary is OpenSSH 6.8 because of `UpdateHostKeys`.

## Version reporting and enforcement

PowerShell exposes Windows executable version resources through
`(Get-Command ssh -CommandType Application).Version`. The
[ApplicationInfo API](https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.applicationinfo?view=powershellsdk-7.4.0)
describes this property as the application's source version. Compare its major
and minor components for official Win32-OpenSSH binaries; the remaining
components are Windows servicing/build values.

That metadata is not portable. Microsoft's own
[`Get-Command` documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/get-command?view=powershell-7.6)
shows Unix native applications with version `0.0.0.0`. On macOS and Linux,
resolve the executable with `Get-Command`, invoke that resolved path with
`-V`, and parse the `OpenSSH_<major>.<minor>` product version. The upstream
[`ssh(1)` manual](https://man.openbsd.org/ssh.1) defines `-V` as displaying the
version number and exiting.

Microsoft likewise directs Windows administrators to use `ssh -V` to check
the OpenSSH product version and `Get-Command ssh.exe` to identify the selected
binary in its
[in-box OpenSSH upgrade guidance](https://learn.microsoft.com/en-us/troubleshoot/windows-server/system-management-components/upgrade-in-box-openssh-to-latest-openssh-release).
Using the PowerShell application version on Windows is convenient, but
`ssh -V` remains a suitable fallback when that metadata is absent or zero.

Linux distribution package versions can include an epoch and distribution
revision in addition to the upstream version. For example, Ubuntu publishes
OpenSSH 8.9p1 as package
[`1:8.9p1-3ubuntu0.15`](https://packages.ubuntu.com/jammy/openssh-client).
Enforcement should compare the OpenSSH product major/minor, not the package
manager's full version string.
