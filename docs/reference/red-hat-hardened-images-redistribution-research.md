# Red Hat Hardened Images redistribution research

Research date: 2026-08-19

## Decision summary

Publishing a Kravhantering image derived from the current Red Hat Hardened
Images Node.js 24 image is permitted in principle, subject to the Red Hat
Universal Base Image (UBI) End User License Agreement (EULA), every component
license, and the release gates below.

The exact public Node.js image identifies its distribution scope as `public`
and identifies the UBI EULA as its license terms. The UBI EULA permits copying,
modification, and redistribution under the component licenses, and Red Hat
documents pushing custom UBI-based images to another registry. This supports
both GHCR publication and inclusion of the same OCI image in a disconnected
release bundle.

Publication should remain blocked until Red Hat confirms in writing, or an
authorized organizational reviewer accepts, how to satisfy the notice
requirement for this Hardened Image. The UBI EULA requires every derived image
distribution to include an unmodified copy of that EULA, while the current
Red Hat source Containerfile deletes `/usr/share/licenses`. This is a
documentation and artifact mismatch, not evidence that the EULA requirement
can be ignored.

This note records primary-source facts and a conservative engineering release
gate. It is not legal advice. An organizational reviewer must decide how these
terms and any separately negotiated Red Hat agreement apply to the releasing
entity.

## Exact image evidence

The reviewed tag is `registry.access.redhat.com/hi/nodejs:24`. On the research
date, its OCI index resolves to these platform manifests:

- amd64:
  `sha256:22892855e12e6cc97cad24806a5f9d1d194362614176c70d243f2f7df6616035`
- arm64:
  `sha256:0914f8850ba19f145ddb00c7293ee0c4f0e0a89be0b72eb31f8432067374f434`

Both platform configurations identify version `24.18.1`, set
`distribution-scope=public`, and set `com.redhat.license_terms` to Red Hat's
UBI EULA page. The immutable upstream
[Node.js 24 Containerfile](https://gitlab.com/redhat/hummingbird/containers/-/blob/330c62fdb1237bcf107ea9f116478392de514c67/images/nodejs-24/hummingbird/default/Containerfile)
contains the same labels. The public registry provides the
[multi-platform manifest](https://registry.access.redhat.com/v2/hi/nodejs/manifests/24)
and the
[amd64 image configuration](https://registry.access.redhat.com/v2/hi/nodejs/blobs/sha256:32dca7533e9e7906a03f6822478b671609fdfcf9a1847fbe20f3a001dc32af5b)
as primary artifact evidence.

Red Hat separately states that Hardened Images can be used without a
subscription and describes building custom application images from them. See
the [Hardened Images overview](https://docs.redhat.com/en/documentation/red_hat_hardened_images/1-latest/discover-evaluate_red_hat_hardened_images_overview)
and
[custom-image procedure](https://docs.redhat.com/en/documentation/red_hat_hardened_images/1-latest/html-single/build_and_deploy_secure_minimal_containers_with_red_hat_hardened_images/index#build-custom-application-images_deploy-hardened-images).
The
[Node.js catalog entry](https://catalog.redhat.com/en/software/containers/hi/nodejs/69c576b93c12f133e877c1b6)
also offers unauthenticated retrieval, but says use is subject to Red Hat's
subscription agreement and that an existing negotiated agreement controls
where applicable. No separate Hardened Images EULA appears in Red Hat's public
EULA list.

The image labels are therefore the strongest product-specific public evidence
that the UBI EULA governs this exact artifact. They do not decide whether a
releasing organization's separate Red Hat agreement changes its obligations.

## Factual redistribution obligations

### Carry the UBI EULA unmodified

The [UBI EULA](https://www.redhat.com/licenses/EULA_Red_Hat_Universal_Base_Image_English_20190422.pdf)
grants a perpetual, worldwide license to the covered programs. It says the
individual component licenses permit running, copying, modification, and
redistribution, subject to each component's obligations. Section 2 requires an
unmodified copy of the EULA in every distribution of a container image sourced,
built, or otherwise derived from the covered programs.

The current Red Hat Node.js Containerfile removes `/usr/share/licenses` during
its build. A downstream release must not assume that inheriting the Red Hat
layers alone carries the required unmodified EULA. The final-image inspection
must prove that an unmodified copy is present, and the disconnected bundle must
preserve it with the image.

### Remove Red Hat marks from a modified image

Section 2 of the UBI EULA requires Red Hat trademarks to be removed before a
modified image is distributed. It also prohibits statements that imply Red Hat
supports or endorses the derived image, except under the stated certification
conditions.

Red Hat's
[trademark guidelines](https://www.redhat.com/en/about/trademark-guidelines-and-policies)
say modified Red Hat software must use its own distinct product name and have
Red Hat marks removed. Truthful textual references to the relationship with a
Red Hat product remain possible, but they must not imply affiliation,
certification, support, or endorsement. The guidelines do not permit Red Hat
logos without a separate written agreement.

The release check must cover both visible files and OCI metadata. The current
base config includes Red Hat vendor, maintainer, component, CPE, and image-name
labels. An implementation must replace or remove branding that would identify
the Kravhantering derivative as Red Hat's product while retaining a truthful
license and provenance record.

### Satisfy every component and added-package license

The UBI EULA does not replace the licenses of the software components inside
the image. Its sections 1 and 6 make those terms independently applicable and
require compliance with bundled third-party software terms.

This applies equally to every tool, native library, npm dependency, copied
binary, certificate bundle, and other package that Kravhantering adds. The MIT
license for Kravhantering does not relicense those components. The release must
produce a license inventory for the complete final image, retain required
copyright and license notices, and meet source-code or offer requirements where
an applicable license imposes them.

Red Hat documents that public UBI repositories contain packages intended for
free redistribution and require no subscription. See
[UBI images and repositories](https://access.redhat.com/articles/4238681).
In contrast, Red Hat says a UBI image containing packages installed from
subscription-entitled RHEL repositories should not be redistributed. See
[installing additional packages in UBI containers](https://access.redhat.com/solutions/7113923).
Consequently, a public Kravhantering image must not acquire packages implicitly
from a subscribed build host. Added Red Hat packages must be traceable to a
redistributable source, and independently sourced third-party packages must
pass their own license review.

### Apply export controls to each distribution channel

Section 5 of the UBI EULA places compliance with applicable export, re-export,
sanctions, restricted-party, restricted-end-use, and encryption rules on the
distributor. The factual obligation applies to GHCR and disconnected bundles;
the EULA does not create an offline-distribution exception.

The organization must determine the applicable screening, authorization, and
reporting process for its locations and recipients. This note does not decide
those jurisdiction-specific questions.

## Supported release gate

Before the first derived Hardened Image is published to GHCR or placed in a
disconnected release bundle, require all of the following:

1. Pin the reviewed base by digest and record its OCI license-term and
   distribution-scope labels for every released architecture.
2. Obtain written Red Hat clarification or approval from the organization's
   authorized legal or licensing reviewer that the UBI EULA governs the exact
   Hardened Image and that the proposed notice placement satisfies section 2.
3. Include the complete, unmodified UBI EULA in the final derived image and
   preserve it in every image transport and disconnected bundle.
4. Publish under Kravhantering naming, remove inherited Red Hat product marks
   and misleading vendor metadata, and make no Red Hat support, certification,
   affiliation, or endorsement claim.
5. Generate an SBOM and license/notice inventory from the complete deployable
   image, including all application dependencies and every required third-party
   tool or package, rather than relying on the base-image SBOM.
6. Verify every added component's redistribution, notice, and source-code
   obligations and include the required material in the image or accompanying
   release artifacts.
7. Prove package provenance and reject content obtained from subscription-only
   RHEL repositories unless separate redistribution rights are documented.
8. Apply the organization's export-control and sanctions checks to both GHCR
   publication and disconnected delivery.
9. Re-run these checks when the base digest, its license label, the upstream
   Containerfile, added runtime content, or the releasing organization's Red
   Hat agreement changes.

Red Hat's
[UBI redistribution procedure](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/building_running_and_managing_containers/working-with-container-images#redistributing-ubi-images_working-with-container-images)
expressly describes pushing a modified UBI-based image to another registry and
warns against calling it Red Hat certified or supported without certification.
The transport-neutral wording of the UBI EULA supports the same obligations for
GHCR and an OCI image copied into a disconnected bundle.

## Organizational judgments that remain

The primary sources do not decide these organization-specific questions:

- whether an existing negotiated Red Hat agreement supersedes or changes any
  of the public terms for the releasing entity;
- whether Red Hat's UBI EULA label on Hardened Images is sufficient despite the
  upstream removal of `/usr/share/licenses`, or whether Red Hat should correct
  or clarify the artifact;
- which exact files and OCI labels count as removable Red Hat marks in the
  planned derivative;
- which export classifications, destinations, recipients, authorizations, or
  reports apply; and
- whether the complete set of application dependencies and required tools
  satisfies their individual licenses in the intended public and disconnected
  distribution model.

These questions do not negate the documented redistribution path. They make
the decision conditional: no first publication until the named release gate is
owned and accepted.
