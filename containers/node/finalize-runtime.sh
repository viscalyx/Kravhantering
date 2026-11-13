#!/bin/sh
# Finish package-dependent build work before removing unused runtime software.
set -eu

[ "$(id -u)" = 0 ]

# This explicit closure is unused by the supported Node.js workloads. A changed
# base or workload dependency must fail the transaction for a fresh assessment.
build_only_packages='krb5-libs libcurl-minimal curl librepo libdnf microdnf rpm rpm-libs libsolv libmodulemd'

# Preserve trust configuration and the package database used by external SBOM
# tools. The provisioner checks its RPM toolchain before this finalizer runs.
trust_checksums=$(mktemp)
trap 'rm -f "$trust_checksums"' 0 HUP INT TERM
sha256sum /etc/pki/tls/certs/ca-bundle.crt /etc/pki/tls/openssl.cnf \
  /etc/crypto-policies/back-ends/opensslcnf.config \
  /usr/lib64/libssl.so.3 /usr/lib64/libcrypto.so.3 > "$trust_checksums"

# shellcheck disable=SC2086 # Split the reviewed package list into arguments.
rpm -e --test $build_only_packages
# shellcheck disable=SC2086 # Use the same dependency-checked transaction.
rpm -e $build_only_packages

sha256sum --check --status "$trust_checksums"
test -s /usr/lib/sysimage/rpm/rpmdb.sqlite
for executable in curl rpm microdnf; do
  test ! -e "/usr/bin/$executable"
done
for library in libgssapi_krb5.so.2 libkrb5.so.3 libcurl.so.4; do
  test ! -e "/usr/lib64/$library"
done
node -e 'require("node:crypto").createHash("sha256").update("runtime").digest(); if (!require("node:tls").rootCertificates.length) process.exit(1)'
