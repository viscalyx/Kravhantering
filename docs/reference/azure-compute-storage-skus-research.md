# Azure compute and storage SKU research note

Research date: 2026-08-30

## Decision summary

Use six Rocky Linux 10 VMs for the complete four-environment matrix and shared
dependency plane. Standardize on `Standard_D4as_v5` for application-only and
support hosts, and use `Standard_D8as_v5` for both single-node identity
profiles. Use managed, locally redundant Standard SSD E6 disks for operating
systems and low-I/O data, and Premium SSD P10 disks for every topology-local or
shared SQL Server data root.

The plan is **not deployable under the target subscription's current quota**.
The 2026-08-30 read-only Azure Compute usage response for `eastus2` reports 16
of 20 total regional vCPUs in use and 0 of 20 Standard DASv5-family vCPUs in
use. The complete plan needs another 32 vCPUs. Request limits of at least 56
total regional vCPUs and 40 Standard DASv5-family vCPUs. Those targets fit the
current unrelated 16-vCPU VM, the 32-vCPU verification plan, and 8 vCPUs of
quota headroom. Azure enforces both the regional and VM-family quota, and
deallocated VMs still consume quota. See Microsoft's
[vCPU quota contract](https://learn.microsoft.com/en-us/azure/virtual-machines/quotas).

Quota is permission, not an allocation guarantee. Setup must repeat all live
checks and fail before provisioning if quota, SKU restrictions, image
capability, or regional capacity changes. Microsoft explicitly distinguishes
[quota from capacity](https://learn.microsoft.com/en-us/azure/virtual-machines/quotas#quota-and-capacity).

This is deliberately a non-production verification fixture. It supplies enough
headroom for installation, migration, backup, restart, and diagnostic work; it
does not claim production capacity, high availability, performance
qualification, or RHEL certification.

## Concrete resource plan

Do not assign availability zones to these single-instance VMs or disks. The
verification topology makes no availability claim, and leaving the zone unset
avoids narrowing an allocation to one zone. Keep all durable state on managed
disks: the Dasv5 series has no local temporary disk and supports Premium
Storage and Generation 2 VMs, as shown in Microsoft's
[Dasv5 size reference](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/dasv5-series).

<!-- markdownlint-disable MD013 -->
| Role | Count | VM size | vCPU / RAM each | OS disk | Data disks | Sizing reason |
| --- | ---: | --- | --- | --- | --- | --- |
| `app-node-tls` | 1 | `Standard_D4as_v5` | 4 / 16 GiB | E6: `StandardSSD_LRS`, 64 GiB | E6: `StandardSSD_LRS`, 64 GiB | Meets the released 4-vCPU baseline, doubles its 8-GiB RAM baseline, and gives the 4.5-GiB service-memory envelope substantial host headroom. |
| `app-node-http` | 1 | `Standard_D4as_v5` | 4 / 16 GiB | E6: `StandardSSD_LRS`, 64 GiB | E6: `StandardSSD_LRS`, 64 GiB | Same released app-node services and limits as `app-node-tls`; Application Gateway is a separate resource. |
| `single-node/external` | 1 | `Standard_D8as_v5` | 8 / 32 GiB | E6: `StandardSSD_LRS`, 64 GiB | P10: `Premium_LRS`, 128 GiB | Meets the released 8-vCPU single-node baseline and leaves headroom above the 8.5-GiB app, nginx, and SQL Server default envelope. |
| `single-node/hardened-bundled` | 1 | `Standard_D8as_v5` | 8 / 32 GiB | E6: `StandardSSD_LRS`, 64 GiB | P10: `Premium_LRS`, 128 GiB | Meets the released 8-vCPU baseline and leaves 20.5 GiB above the stricter 11.5-GiB complete single-node default envelope. |
| Shared SQL Server support | 1 | `Standard_D4as_v5` | 4 / 16 GiB | E6: `StandardSSD_LRS`, 64 GiB | P10 data: `Premium_LRS`, 128 GiB; E6 backup staging: `StandardSSD_LRS`, 64 GiB | Gives the 4-GiB/200% SQL Server default four times its memory and twice its CPU quota at host level. P10 accommodates two isolated enterprise databases, SQL working files, and growth beyond the released 10-GiB floor. |
| Shared IdP, Kong, HSA adapter, and HSA directory fixture | 1 | `Standard_D4as_v5` | 4 / 16 GiB | E6: `StandardSSD_LRS`, 64 GiB | E6: `StandardSSD_LRS`, 64 GiB | Preserves 13 GiB beyond the released 3-GiB/100% Keycloak default for the host and three fixture workloads. Their released support templates do not define CPU or memory limits. |
<!-- markdownlint-enable MD013 -->

The total is six VMs, 32 vCPUs, 128 GiB of RAM, ten E6 disks, and three
P10 disks. Provisioned managed-disk capacity is 1 TiB: 384 GiB of OS disks and
640 GiB of attached data and backup-staging disks.

Use these disk settings as the handoff to the Bicep decision:

- OS: `StandardSSD_LRS`, 64 GiB, E6 tier, managed disk, read/write caching.
- Low-I/O data: `StandardSSD_LRS`, 64 GiB, E6 tier, XFS, caching `None`.
- SQL-bearing data: `Premium_LRS`, 128 GiB, P10 tier, XFS, caching `None`.
- Do not use ephemeral OS disks, unmanaged disks, shared-disk multi-attach,
  Premium SSD v2, host-local temporary disks, or ZRS for this fixture.
- Keep the SQL backup-staging filesystem separate from the SQL data root. It is
  diagnostic working storage, not the sealed evidence store or a durable
  off-host backup.

E6 supplies 64 GiB, up to 500 base IOPS, and up to 100 MB/s. P10 supplies
128 GiB and is the fixed Premium SSD tier appropriate to the small SQL fixture.
Microsoft lists the capacities and performance ceilings in the
[managed-disk scalability table](https://learn.microsoft.com/en-us/azure/virtual-machines/disks-scalability-targets).
Standard SSD is explicitly intended for lightly used applications and
non-production workloads, while Premium SSD targets performance-sensitive
workloads; see Microsoft's
[managed-disk type guidance](https://learn.microsoft.com/en-us/azure/virtual-machines/disks-types).

## Released containment and storage basis

The released application-node guide recommends 4 vCPUs and 8 GiB RAM. Its
default services reserve 4 GiB/300% CPU for `app-runtime` and 512 MiB/100% CPU
for nginx. See the local
[enterprise deployment guide](../operations/rhel10-production-deploy.md#prepare-rhel-10-host)
and
[production containment contract](../operations/production-quadlet-containment.md#default-service-boundaries).

The single-node guide recommends 8 vCPUs and 16 GiB RAM. The effective release
defaults are 4 GiB for the application, 512 MiB for nginx, 4 GiB for SQL
Server, and 3 GiB for Keycloak, totalling 11.5 GiB. The containment validator
requires that total to fit within 75% of host memory. See the local
[single-node host baseline](../operations/rhel10-production-single-node-self-contained-deploy.md#prepare-rhel-10-host),
[validated containment overrides](../operations/production-quadlet-containment.md#validated-overrides),
and
[`release.env` defaults](../../containers/production/env/release.env.template).

The containment document's earlier default-service table says 2 GiB for
Keycloak, but the released template default, validated-overrides table, and
11.5-GiB total all use 3 GiB. This sizing uses the stricter effective 3-GiB
default. The documentation inconsistency is a separate maintenance concern and
does not justify reducing capacity here.

SQL Server's released data-volume guidance sets a 10-GiB practical floor and
prefers 20–50 GiB for longer histories, while keeping backups and snapshots on
separate storage. See
[SQL Server volume sizing](../operations/rhel10-production-single-node-self-contained-deploy.md#sql-server-volume-sizing).
A 128-GiB P10 leaves room for the database files, transaction logs, system
databases, `tempdb`, two logically isolated enterprise databases, container
layers, and transition-time working growth without presenting the size as a
production forecast.

The shared dependency decision requires separate databases, principals, realms,
clients, credentials, and retained state but permits one SQL Server instance
and one Keycloak instance. The four clean application hosts remain physically
separate. See
[Define the Azure topology and dependency plane](https://github.com/viscalyx/Kravhantering/issues/947)
and
[Define the external dependency test contracts](https://github.com/viscalyx/Kravhantering/issues/958).

The released HSA overlay defines isolated networks, volumes, identities, PKI
roles, a 64-MiB Kong tmpfs, and health checks, but no `MemoryMax`, `CPUQuota`,
or equivalent container limit for Kong, the adapter, or the directory mock.
The IdP-host recommendation therefore has engineering headroom but no released
HSA minimum to prove. Before implementation locks a larger size, measure peak
resident memory, CPU, and disk during the fixed HSA proof on
`Standard_D4as_v5`; fail rather than silently relaxing containment if that
measurement invalidates the recommendation.

## Target-subscription evidence

All checks in this section use authenticated, read-only Azure Resource Manager
calls against the configured target subscription. Identifiers and credentials
remain outside this note. Microsoft's
[Resource SKUs List API](https://learn.microsoft.com/en-us/rest/api/compute/resource-skus/list)
defines an empty `restrictions` collection as no subscription restriction and
returns location, zone, family, and capability data. Its
[Compute Usage List API](https://learn.microsoft.com/en-us/rest/api/compute/usage/list)
returns current usage and limits for a subscription and location.

On 2026-08-30, the `eastus2` responses report:

<!-- markdownlint-disable MD013 -->
| Item | Live target-subscription result |
| --- | --- |
| `Standard_D4as_v5` | Available in `eastus2`; zones 1, 2, and 3 appear; no restrictions; 4 vCPUs; 16 GiB RAM; Hyper-V V1/V2; Premium I/O enabled; no `TrustedLaunchDisabled=True` capability. |
| `Standard_D8as_v5` | Available in `eastus2`; zones 1, 2, and 3 appear; no restrictions; 8 vCPUs; 32 GiB RAM; Hyper-V V1/V2; Premium I/O enabled; no `TrustedLaunchDisabled=True` capability. |
| `StandardSSD_LRS` E6 | Available in `eastus2`; zones 1, 2, and 3 appear; no restrictions. |
| `Premium_LRS` P10 | Available in `eastus2`; zones 1, 2, and 3 appear; no restrictions. |
| Total regional vCPUs | 16 current / 20 limit; only 4 remain. |
| Standard DASv5-family vCPUs | 0 current / 20 limit; the 32-vCPU plan exceeds the family limit by 12. |
| Virtual machines | 1 current / 25,000 limit; six more fit the count quota. The current regional VM is one `Standard_D16s_v5`. |
| Standard SSD managed disks | 0 current / 50,000 limit; ten more fit. |
| Premium managed disks | 2 current / 50,000 limit; three more fit. |
<!-- markdownlint-enable MD013 -->

The pinned
`resf:rockylinux-x86_64:10-base:10.2.20260525` image response in `eastus2`
reports x64, Hyper-V V2, `TrustedLaunchSupported`, SCSI and NVMe controllers,
and a 10-GiB source OS disk. The existing
[Rocky Linux image research](https://github.com/viscalyx/Kravhantering/blob/research/rocky-image-region/docs/reference/rocky-linux-10-azure-image-and-region-research.md)
must remain aligned with
[Determine an official Rocky Linux 10 image and Azure region](https://github.com/viscalyx/Kravhantering/issues/953).
Microsoft's Trusted Launch matrix supports D-family Generation 2 VMs; see
[Trusted Launch for Azure VMs](https://learn.microsoft.com/en-us/azure/virtual-machines/trusted-launch#virtual-machines-sizes).

Request Trusted Launch explicitly on every VM:

```bicep
securityProfile: {
  securityType: 'TrustedLaunch'
  uefiSettings: {
    secureBootEnabled: true
    vTpmEnabled: true
  }
}
```

This is a catalog and control-plane capability result, not a successful boot
test. Implementation still needs one billable boot, SSH, Secure Boot, vTPM,
XFS, and container-start proof before treating the combination as usable.

## Pricing and retention

Prices below are USD public retail consumption meters for `eastus2` on
2026-08-30, without discounts, reservations, savings plans, taxes, or a
subscription-specific agreement. Microsoft's
[Retail Prices API contract](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
defines these as unauthenticated Microsoft retail prices and identifies
`isPrimaryMeterRegion` as the charge meter.

<!-- markdownlint-disable MD013 -->
| Meter | Unit price | Plan quantity | Simple retained estimate |
| --- | ---: | ---: | ---: |
| `Standard_D4as_v5` Linux VM | $0.172/hour | 4 | $0.688/hour |
| `Standard_D8as_v5` Linux VM | $0.344/hour | 2 | $0.688/hour |
| E6 LRS Standard SSD base disk | $4.80/month | 10 | $48.00/month plus Standard SSD transactions |
| P10 LRS Premium SSD base disk | $17.92/month | 3 | $53.76/month |
<!-- markdownlint-enable MD013 -->

The live primary-meter queries are the
[Dasv5 VM prices](https://prices.azure.com/api/retail/prices?currencyCode=USD&$filter=serviceName%20eq%20%27Virtual%20Machines%27%20and%20armRegionName%20eq%20%27eastus2%27%20and%20productName%20eq%20%27Virtual%20Machines%20Dasv5%20Series%27%20and%20priceType%20eq%20%27Consumption%27),
[E6 LRS disk prices](https://prices.azure.com/api/retail/prices?currencyCode=USD&$filter=serviceName%20eq%20%27Storage%27%20and%20armRegionName%20eq%20%27eastus2%27%20and%20productName%20eq%20%27Standard%20SSD%20Managed%20Disks%27%20and%20skuName%20eq%20%27E6%20LRS%27%20and%20priceType%20eq%20%27Consumption%27),
and
[P10 LRS disk prices](https://prices.azure.com/api/retail/prices?currencyCode=USD&$filter=serviceName%20eq%20%27Storage%27%20and%20armRegionName%20eq%20%27eastus2%27%20and%20productName%20eq%20%27Premium%20SSD%20Managed%20Disks%27%20and%20skuName%20eq%20%27P10%20LRS%27%20and%20priceType%20eq%20%27Consumption%27).

All six VMs cost $1.376 per active hour, about $16.51 for the 12-hour active-run
hard limit, $33.02 per 24 hours, or $1,004.48 for 730 active hours. The selected
disks add $101.76 in base monthly retail charges while retained. A 730-hour
month with every VM allocated therefore starts at $1,106.24 for VMs and disks.

The estimate deliberately excludes Standard SSD transactions, snapshots,
bandwidth, DNS, public IPv4 addresses, monitoring, taxes, and SQL Server
licensing. The generic Rocky Linux VM meter does not decide how the fixture's
`MSSQL_PID=Standard` use is licensed; the operator must establish an approved
non-production SQL Server license before provisioning.

Application Gateway is also outside the compute/disk selection but materially
affects retained cost. Its current Standard_v2 retail meters include a
$0.20/hour fixed charge plus $0.008 per capacity-unit hour in
[the live `eastus2` price response](https://prices.azure.com/api/retail/prices?currencyCode=USD&$filter=serviceName%20eq%20%27Application%20Gateway%27%20and%20armRegionName%20eq%20%27eastus2%27%20and%20productName%20eq%20%27Application%20Gateway%20Standard%20v2%27%20and%20priceType%20eq%20%27Consumption%27).
The fixed meter alone is $146 per 730-hour month. Its exact capacity-unit and
network cost belongs in the run-time estimate because the downstream Bicep
decision still owns autoscaling and IP details.

An allocated or guest-shutdown VM continues compute billing. Only a deallocated
VM stops the VM compute meter, while disks and networking continue to incur
charges. See Microsoft's
[VM state and billing table](https://learn.microsoft.com/en-us/azure/virtual-machines/states-billing#power-states-and-billing).
The retained-state warning must therefore distinguish:

- **running or stopped/allocated**: VM, disk, gateway, and network charges;
- **VMs deallocated, gateway running**: disk, gateway, and network charges;
- **VMs deallocated, gateway explicitly suspended**: at least disk and
  applicable network charges; and
- **cleanup complete**: no run resource remains, while the administrator-owned
  empty resource group remains.

Deallocation is a cost control, not a quota release. Only deletion of no-longer
needed VMs releases their vCPU quota, according to Microsoft's
[quota documentation](https://learn.microsoft.com/en-us/azure/virtual-machines/quotas).

## Mandatory fail-closed preflight

Immediately before the Bicep deployment, the trusted Azure path must:

1. Confirm the configured subscription and exact `eastus2` location.
2. Confirm the exact pinned Rocky image exists, remains active, is x64 and V2,
   reports `TrustedLaunchSupported`, and has accepted Marketplace terms.
3. Query both exact VM sizes through Resource SKUs. Require `eastus2`, an empty
   restrictions collection, V2 support, the expected vCPU/RAM values, Premium
   I/O, and no `TrustedLaunchDisabled=True` capability.
4. Query E6 `StandardSSD_LRS` and P10 `Premium_LRS`. Require `eastus2` and no
   subscription or location restriction.
5. Re-enumerate the empty deployment-verification group and compute planned
   incremental use from the frozen selection. For the complete matrix, require
   at least 32 free total-regional and 32 free Standard DASv5-family vCPUs, six
   free VM slots, ten free Standard SSD disk slots, and three free Premium disk
   slots.
6. Display current usage, limits, required increments, post-plan totals, prices,
   omitted meters, and the exact cleanup command before retained-charge consent.
7. Stop without mutation on any stale, missing, restricted, mismatched, or
   insufficient result. Never substitute a size, disk tier, zone, image version,
   or region automatically.
8. Treat an Azure allocation failure after a successful preflight as an
   incomplete retained setup. Do not retry another SKU or zone implicitly.

The Resource SKUs API says restrictions identify a SKU that cannot be used and
are empty when none apply. It does not reserve physical capacity. The
[Resource SKUs response contract](https://learn.microsoft.com/en-us/rest/api/compute/resource-skus/list#resource-sku)
and the
[quota-versus-capacity guidance](https://learn.microsoft.com/en-us/azure/virtual-machines/quotas#quota-and-capacity)
therefore support both the preflight and the fail-closed allocation behavior.

## Assumptions and remaining unknowns

- All six hosts coexist for a complete-matrix run because retained state from
  one clean environment cannot become another environment. Sequential
  execution reduces simultaneous load but does not reduce provisioned quota.
- Released default containment values apply. This note does not size maximum
  allowed overrides or production traffic.
- The shared SQL Server runs one instance with two small, isolated enterprise
  databases; both single-node environments keep their own SQL Server data.
- Only `app-node-tls` enables live HSA proof, but the shared IdP support host
  carries the isolated Kong, adapter, and directory fixture workloads.
- The fixture data remains intentionally small. P10 is transition and
  diagnostic headroom, not an application-data forecast.
- Kong and HSA support workloads lack released CPU and memory limits. A measured
  live proof can require a larger IdP-support size or, preferably, explicit
  containment before implementation.
- SQL Server licensing, Application Gateway autoscale settings, public-IP
  count, backup retention, snapshots, logs, and evidence-store capacity remain
  outside this SKU estimate and must appear as omitted price factors.
- Prices, quota use, SKU restrictions, and physical capacity can change at any
  time. The dated evidence resolves the design choice but never replaces the
  mandatory live preflight.
