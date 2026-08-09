# Rocky Linux 10 Azure image and region research note

Research date: 2026-08-09

## Decision summary

Prefer the newly published official RESF Marketplace x64 Base plan for the
deployment guide smoke test:

```text
Publisher: resf
Offer:     rockylinux-x86_64
SKU/plan:  10-base
Version:   10.2.20260525
URN:       resf:rockylinux-x86_64:10-base:10.2.20260525
```

Use `eastus2`, the repository's existing Azure development default. Live
target-subscription queries prove that the exact image is available there and
in `swedencentral`. Keep the region configurable, but fail before provisioning
when the pinned image or VM size is not available there. Do not silently switch
regions or versions.

Use the official RESF Community Gallery only as a fallback. Its Rocky Linux 10
replication is selective and has less reliable regional coverage than the new
Marketplace plan.

The target subscription can read this free image but cannot deploy it yet. The
Compute response contains a purchase plan and `az vm image terms show` reports
`accepted: false`. An authorized operator must review and accept the free RESF
terms once before the setup can provision a VM. This research deliberately did
not mutate that subscription state.

No VM deployment is part of this research ticket. Boot behavior and the chosen
VM size remain implementation verification concerns.

## Live Marketplace catalog

Microsoft's public Marketplace Catalog API currently exposes four official
Rocky Linux 10 RESF plans in the Swedish commercial market:

<!-- markdownlint-disable MD013 -->
| Architecture | Disk layout | Publisher | Offer | SKU/plan | Latest URN |
| --- | --- | --- | --- | --- | --- |
| x64 | Base | `resf` | `rockylinux-x86_64` | `10-base` | `resf:rockylinux-x86_64:10-base:latest` |
| x64 | LVM | `resf` | `rockylinux-x86_64` | `10-lvm` | `resf:rockylinux-x86_64:10-lvm:latest` |
| ARM64 | Base | `resf` | `rockylinux-aarch64` | `10-base` | `resf:rockylinux-aarch64:10-base:latest` |
| ARM64 | LVM | `resf` | `rockylinux-aarch64` | `10-lvm` | `resf:rockylinux-aarch64:10-lvm:latest` |
<!-- markdownlint-enable MD013 -->

The x64 and ARM64 `10-base` and `10-lvm` plans each report:

```json
{
  "isFree": true,
  "isStopSell": false,
  "isHidden": false,
  "isPrivate": false,
  "vmSecuritytype": "Trusted",
  "metadata": {
    "generation": "2"
  },
  "pricingTypes": [
    "Free"
  ]
}
```

The x64 offer's `bigCatLastModifiedDate` is
`2026-07-09T20:20:06.557941+00:00`. The ARM64 offer's corresponding timestamp is
`2026-07-13T15:03:05.3311083+00:00`. The publication dates explain why
Microsoft's separate Rocky Linux guidance, which still lists only RESF Rocky
Linux 9, is stale for Rocky Linux 10.

Primary live catalog responses:

- [RESF x64 Marketplace catalog](https://catalogapi.azure.com/offers/resf.rockylinux-x86_64?api-version=2018-08-01-beta&market=SE)
- [RESF ARM64 Marketplace catalog](https://catalogapi.azure.com/offers/resf.rockylinux-aarch64?api-version=2018-08-01-beta&market=SE)
- [Official RESF x64 Marketplace listing](https://marketplace.microsoft.com/en-us/product/virtual-machines/resf.rockylinux-x86_64)

Microsoft's current general guidance remains useful for distinguishing the free
RESF community build from CIQ's separately published products. See
[Rocky Linux options on Azure](https://learn.microsoft.com/en-us/azure/virtual-machines/workloads/rocky-linux/rocky-linux-options).

`market=SE` means that the plan can be offered commercially in Sweden. It does
not mean that the Compute image is replicated to the `swedencentral` Azure
region. Only an authenticated Compute catalog query can prove region
availability.

## Chosen variant

Choose x64 Base, `resf:rockylinux-x86_64:10-base`, because:

- the production deployment guides target the ordinary x64 server platform;
- Base avoids introducing an LVM-specific storage layout into a smoke test whose
  purpose is to exercise the guides; and
- the exact upstream Base artifact remains downloadable and verifiable from
  RESF.

The current RESF Rocky Linux 10 x64 image directory contains:

```text
Rocky-10-Azure-Base-10.2-20260525.0.x86_64.vhdfixed.xz
Rocky-10-Azure-LVM-10.2-20260525.0.x86_64.vhdfixed.xz
```

The directory also provides per-file checksums and detached signatures. See the
[official Rocky Linux 10 x64 image directory](https://download.rockylinux.org/pub/rocky/10/images/x86_64/).

The live Azure Compute catalog returns versions `10.1.20251126` and
`10.2.20260525`. The latter matches the current RESF artifact's release and
build date and is therefore the exact pinned version. The VHD filename alone
would not have established that Azure version mapping.

## Region and exact version preflight

Authenticated read-only Compute queries against the target subscription prove
that `resf:rockylinux-x86_64:10-base:10.2.20260525` is available in `eastus2`,
`swedencentral`, `northeurope`, `westeurope`, and `eastus`. Both listed versions
are available in all five regions. The target subscription's Compute catalog
rejects `swedensouth` as an unsupported location.

Choose `eastus2` to preserve the repository's existing Azure development
default. Keep the location in the new environment file so an operator can
deliberately choose another proven region.

Use these read-only commands after authenticating to the target subscription:

```powershell
$ImageUrn = 'resf:rockylinux-x86_64:10-base:10.2.20260525'
$ImageProjection = '{resolvedVersion:name,location:location,plan:plan,' +
  'architecture:architecture,hyperVGeneration:hyperVGeneration,' +
  'features:features}'

az vm image list `
  --location $Location `
  --publisher resf `
  --offer rockylinux-x86_64 `
  --sku 10-base `
  --all `
  --query "[].{version:name,architecture:architecture,urn:urn}" `
  --output json

az vm image show `
  --location $Location `
  --urn $ImageUrn `
  --query $ImageProjection `
  --output json
```

The setup workflow must:

1. query the pinned URN before creating any resource;
2. fail if the query returns no image in the requested region;
3. persist the exact version and full URN in diagnostic evidence;
4. pass the pinned version to Bicep; and
5. verify VM-size availability and quota separately before deployment.

Do not use `latest` inside the Bicep deployment. It makes two runs select
different images without an explicit evidence change.

## Plan and terms behavior

The public catalog reports `legalTermsType: "None"`, `pricingTypes: ["Free"]`,
and `isPIRequired: false` for the new plans. This proves that RESF adds no
software charge and the catalog does not require purchase intent. Azure VM
compute, disks, networking, and other provisioned resources still incur normal
Azure charges.

The live Compute response for the pinned image returns this non-null plan in
both `eastus2` and `swedencentral`:

```json
{
  "name": "10-base",
  "product": "rockylinux-x86_64",
  "publisher": "resf"
}
```

The plan must be copied into every VM request. The target subscription's
read-only terms response reports `accepted: false`, so provisioning would fail
until an authorized operator accepts the plan terms. Microsoft's rule is
authoritative:

- when `az vm image show` returns `plan: null`, omit the VM `plan` block;
- when it returns a plan, copy its `name`, `product`, and `publisher` values into
  the VM request; and
- when terms are not accepted, stop and show the operator the manual acceptance
  command. Never accept terms silently.

Use these read-only checks:

```powershell
$Image = az vm image show `
  --location $Location `
  --urn 'resf:rockylinux-x86_64:10-base:10.2.20260525' `
  --output json | ConvertFrom-Json

if ($null -ne $Image.plan) {
  az vm image terms show `
    --urn 'resf:rockylinux-x86_64:10-base:10.2.20260525' `
    --output json
}
```

Microsoft documents the purchase-plan and terms rules in
[Find and use Marketplace purchase plan information](https://learn.microsoft.com/en-us/azure/virtual-machines/linux/cli-ps-findimage)
and the
[`az vm image terms` reference](https://learn.microsoft.com/en-us/cli/azure/vm/image/terms?view=azure-cli-latest).

This research performs neither `az vm image terms accept` nor a VM deployment.

## Generation and Trusted Launch

The live Marketplace catalog classifies all four Rocky Linux 10 plans as
Generation 2 and `Trusted`. The target-subscription Compute response confirms
that the pinned x64 image is `V2` and `TrustedLaunchSupported`; it also reports
accelerated networking support, SCSI and NVMe disk controllers, and no
hibernation support. The current Rocky Linux 10 build definition agrees:
its x64 Azure Base and LVM profiles produce fixed VHDs with UEFI firmware and an
EFI partition, and the boot package set includes the signed x64 shim. See the
versioned RESF sources for
[the Azure image profiles](https://git.resf.org/sig_core/rocky-kiwi-descriptions/src/commit/114b1cf0905a1ec622175137344b0d02b4305fe6/cloud/cloud.xml#L132-L162)
and
[the boot packages](https://git.resf.org/sig_core/rocky-kiwi-descriptions/src/commit/114b1cf0905a1ec622175137344b0d02b4305fe6/components/boot.xml#L1-L22).

The specification can therefore request Trusted Launch explicitly:

```bicep
securityProfile: {
  securityType: 'TrustedLaunch'
  uefiSettings: {
    secureBootEnabled: true
    vTpmEnabled: true
  }
}
```

This is a catalog capability result, not a boot-test result. Implementation must
still verify that the chosen VM size supports Trusted Launch and that one
disposable VM reaches SSH with Secure Boot and vTPM enabled. See
[Trusted Launch for Azure VMs](https://learn.microsoft.com/en-us/azure/virtual-machines/trusted-launch).

## Deployable Bicep image syntax

Use the exact pinned version and mandatory live-verified `plan` block.

```bicep
@description('Azure region validated during preflight.')
param location string = 'eastus2'

@description('Pinned, live-verified RESF Rocky Linux 10 image version.')
param rockyImageVersion string = '10.2.20260525'

@description('VM size validated for region, quota, and Trusted Launch support.')
param vmSize string

resource vm 'Microsoft.Compute/virtualMachines@2025-04-01' = {
  name: 'guide-smoke-rocky10'
  location: location
  plan: {
    name: '10-base'
    product: 'rockylinux-x86_64'
    publisher: 'resf'
  }
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    securityProfile: {
      securityType: 'TrustedLaunch'
      uefiSettings: {
        secureBootEnabled: true
        vTpmEnabled: true
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'resf'
        offer: 'rockylinux-x86_64'
        sku: '10-base'
        version: rockyImageVersion
      }
      osDisk: {
        createOption: 'FromImage'
      }
    }
    // osProfile and networkProfile use the smoke environment's normal modules.
  }
}
```

The image and security properties follow the
[`Microsoft.Compute/virtualMachines@2025-04-01` Bicep reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.compute/2025-04-01/virtualmachines).

The corresponding Azure CLI shape is:

```powershell
az vm create `
  --resource-group $ResourceGroup `
  --name $VmName `
  --location $Location `
  --image 'resf:rockylinux-x86_64:10-base:10.2.20260525' `
  --plan-name 10-base `
  --plan-product rockylinux-x86_64 `
  --plan-publisher resf `
  --security-type TrustedLaunch `
  --enable-secure-boot true `
  --enable-vtpm true `
  --admin-username azureuser `
  --ssh-key-values $SshPublicKeyPath
```

The three `--plan-*` arguments are required for this image.

## Community Gallery fallback

RESF identifies its public gallery as:

```text
rocky-dc1c6aa6-905b-4d9c-9577-63ccc28c482a
```

The Rocky Linux 10 x64 image definition is `Rocky-10-x86_64`. A live
target-subscription query finds versions `10.0.20250609` and `10.1.20251126` in
`eastus`, but finds no image definition in `eastus2` or `swedencentral`. RESF
explains that replication remains selective because it pays storage costs per
region. See
[Rocky Linux included in Azure Community Galleries](https://rockylinux.org/news/rocky-on-azure-community-gallery/)
and
[Azure Community Gallery images](https://forums.rockylinux.org/t/azure-community-gallery-images/19417).

Re-query the gallery before using it:

```powershell
az sig image-version list-community `
  --public-gallery-name rocky-dc1c6aa6-905b-4d9c-9577-63ccc28c482a `
  --gallery-image-definition Rocky-10-x86_64 `
  --location $Location `
  --output json
```

If the fallback is ever needed, pin this live-verified identifier in Bicep
through `imageReference.communityGalleryImageId`:

```text
/CommunityGalleries/rocky-dc1c6aa6-905b-4d9c-9577-63ccc28c482a/Images/
Rocky-10-x86_64/Versions/10.1.20251126
```

The image definition reports x64, Linux, generalized, Generation 2, and
`TrustedLaunchSupported`, with accelerated networking and SCSI/NVMe controller
support. Do not use `/Versions/latest`.

The fallback Bicep image reference would be:

```bicep
storageProfile: {
  imageReference: {
    communityGalleryImageId: '/CommunityGalleries/rocky-dc1c6aa6-905b-4d9c-9577-63ccc28c482a/Images/Rocky-10-x86_64/Versions/10.1.20251126'
  }
  osDisk: {
    createOption: 'FromImage'
  }
}
```

Microsoft documents the identifier and deployment shape in
[Create a VM from a generalized gallery image](https://learn.microsoft.com/en-us/azure/virtual-machines/vm-generalized-image-version)
and the
[Community Gallery image REST API](https://learn.microsoft.com/en-us/rest/api/compute/community-gallery-images/get?view=rest-compute-2025-04-01).

The fallback is currently inferior: it requires changing to `eastus` and is one
release behind the pinned Marketplace image. Use it only if the Marketplace
offer becomes unavailable and a fresh authenticated query still proves the
exact gallery version in an operator-approved region.

## Remaining verification boundary

The exact image, plan, terms state, and regional presence were verified with
read-only calls against the target subscription on the research date. No paid
Marketplace terms were accepted and no Azure resources were created.

Before implementation can deploy, an authorized operator must review and
accept the free plan terms. The setup must then re-query `accepted` and fail
without provisioning unless it is `true`. Region policy, quota, and the chosen
VM size also remain preflight concerns. The manual subscription mutation is
tracked by
[Accept the free RESF Rocky Linux 10 Marketplace terms](https://github.com/viscalyx/Kravhantering/issues/959).

The following fact requires a small billable deployment and therefore remains
outside this read-only research ticket:

- successful boot, SSH, Secure Boot, vTPM, Azure agent, and required network
  behavior for the chosen image and size.
