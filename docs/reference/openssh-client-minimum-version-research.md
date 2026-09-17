# OpenSSH client minimum-version research note

This note is for maintainers reviewing the Azure development workflow's SSH
compatibility floor or host-key options. For workstation setup, use the
[workstation prerequisites](../development/azure-vm-remote-ssh-development.md#step-3-install-workstation-prerequisites).

## Decision summary

The workflow enforces OpenSSH 8.6 on Windows and OpenSSH 8.5 on macOS and
Linux in
[`AzureDev.Azure.psm1`](../../scripts/azure-dev/AzureDev.Azure.psm1).
The upstream feature boundary is 8.5 on all three platforms.

Windows uses a higher package floor because Microsoft's
[Win32-OpenSSH release history](https://github.com/PowerShell/Win32-OpenSSH#release-history)
lists 8.1.0.0 followed by 8.6.0.0, with no 8.5 release. This explains the
platform difference; it does not establish a different upstream feature
requirement for Windows.

## Option-by-option boundary

The host-key arguments in
[`AzureDev.Config.psm1`](../../scripts/azure-dev/AzureDev.Config.psm1)
include two independent OpenSSH 8.5 dependencies:

- `KnownHostsCommand=none` disables command-supplied host keys. The option is
  new in the upstream
  [8.5 release notes](https://www.openssh.org/txt/release-8.5).
- `GlobalKnownHostsFile=none` disables global host-key files. OpenSSH 8.5
  explicitly recognizes `none` and clears the global host-file list in
  [`ssh.c`](https://github.com/openssh/openssh-portable/blob/V_8_5_P1/ssh.c#L1430-L1438).
  OpenSSH 8.4 instead treats the value as an ordinary filename in
  [the option parser](https://github.com/openssh/openssh-portable/blob/V_8_4_P1/readconf.c#L1184-L1210).
  Acceptance of this argument by an older client therefore does not prove
  that file-based global trust is disabled: it can read a file named `none`.

Removing only `KnownHostsCommand=none` does **not** safely lower the minimum
version. Any proposal to lower the floor must also preserve the semantics
of `GlobalKnownHostsFile=none` and verify the remaining host-key options.

## Version reporting and enforcement

The check resolves `ssh` with PowerShell's `Get-Command` and uses:

- Windows: the executable's application version metadata. A version of
  `0.0.0.0` causes an error; the current implementation has no `ssh -V`
  fallback.
- macOS and Linux: `-V` on the resolved executable, parsing the major and
  minor components of `OpenSSH_<major>.<minor>`. A failed invocation or
  unrecognized version causes an error.

When changing this check, compare the selected client's upstream product
version, not a distribution package revision. Keep the version check and
host-key arguments consistent so an accepted client provides the required
trust isolation.
