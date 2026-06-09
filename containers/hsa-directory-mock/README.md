# HSA Directory Mock Contract

This directory owns the devcontainer-local mock for the HSA directory SOAP
method `GetHsaPerson` and a narrow JSON lookup facade used by the local Kong
route. The mock exists so Kravhantering can verify the future HSA lookup
integration through Kong before the production API-management and real HSA
integration are known.

## Scope

The mock implements this SOAP 1.1 endpoint:

```text
POST /svr-hsaws2/hsaws
Content-Type: text/xml; charset=utf-8
Accept: text/xml
```

It also implements a dev-only REST/JSON lookup facade:

```text
POST /hsa/person-records/lookup
Content-Type: application/json
```

```json
{ "hsaId": "SE5560000001-annaj" }
```

The facade returns a single normalized person record when all HSA records for
the submitted HSA-ID agree on name and e-mail, `404` when the HSA-ID is not
found, and `409` when matching HSA records conflict. It intentionally does not
implement authentication, authorization, client certificates, organization
lookups, or non-person HSA methods.

In devcontainer use, Kong exposes the SOAP path at
`http://kong:8000/svr-hsaws2/hsaws` and the REST lookup path at
`http://kong:8000/hsa/person-records/lookup`. Kong routes both paths to
`http://hsa-directory-mock:8080`; the JSON-to-person adapter is mock-owned
until the production API-management transformation is known.

`GET /health` is a container health endpoint only. It is not routed through
Kong.

## Namespaces

The request parser matches namespace URI and local name, not XML prefix.

```text
SOAP 1.1 envelope:   http://schemas.xmlsoap.org/soap/envelope/
WS-Addressing:       http://www.w3.org/2005/08/addressing
HSA responder:       urn:riv:hsa:HsaWsResponder:3
```

Generated responses use deterministic prefixes:

- `soap` for the SOAP envelope
- `hsa` for `GetHsaPersonResponse`, `userInformations`, `userInformation`,
  person fields, and `HsaWsFault`
- `ns2` for the WS-Addressing namespace declaration where the HSA response or
  fault detail mirrors the source contract examples

## Request Rules

The mock requires:

- SOAP 1.1 `Envelope`, `Header`, and `Body`
- non-empty `add:MessageID`
- `add:To` equal to `SE165565594230-1000`
- `urn:GetHsaPerson`
- exactly one of `urn:hsaIdentity` and `urn:personalIdentityNumber`

`searchBase` may be omitted, empty, or `c=SE`. Other values return a SOAP
Fault with `HsaWsFault/code = 6`.

The canonical request shape is:

```xml
<soap:Envelope
    xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:add="http://www.w3.org/2005/08/addressing"
    xmlns:urn="urn:riv:hsa:HsaWsResponder:3">
  <soap:Header>
    <add:MessageID>mock-001</add:MessageID>
    <add:To>SE165565594230-1000</add:To>
  </soap:Header>
  <soap:Body>
    <urn:GetHsaPerson>
      <urn:hsaIdentity>SE1000-004</urn:hsaIdentity>
      <urn:searchBase>c=SE</urn:searchBase>
    </urn:GetHsaPerson>
  </soap:Body>
</soap:Envelope>
```

## Response Rules

Successful lookups return HTTP `200` with:

```text
soap:Envelope/soap:Body/hsa:GetHsaPersonResponse/hsa:userInformations
```

No matching HSA person record is not a fault. It returns HTTP `200` and an
empty `hsa:userInformations` wrapper.

SOAP Faults return HTTP `500` with `soap:Fault` and
`detail/hsa:HsaWsFault`.

| Fault code | Meaning in the mock |
| ---: | --- |
| `3` | Invalid request shape or input, for example both identifiers supplied. |
| `6` | Unsupported `searchBase` or an unexpected mock-side lookup error. |

Other HTTP statuses:

| Status | When |
| ---: | --- |
| `200` | Health check and successful SOAP or REST lookup. |
| `404` | Unknown path. |
| `405` | Wrong method on the SOAP or REST lookup path. |

## Fixture Register

The fixture source of truth is
[fixtures/hsa-personer.json](./fixtures/hsa-personer.json). It contains HSA
person records, not application users. Some records intentionally share HSA-ID
values with Keycloak dev users or SQL seed data so application integration
tests can look up person and contact data for existing
Kravansvarstilldelningar.

- `SE1000-004`: Kalle Bson Karlsson, `kalle@sos.se`.
  Canonical contract example, also found by personnummer `191212121212`.
- `SE1000-005`: Anna Andersson, no e-mail.
  Optional `middleName` and `mail` omitted.
- `SE1000-MULTI`: Kalle Bson Karlsson and Kalle Karlsson.
  Multiple `userInformation` records for one lookup.
- `SE1000-NOTFOUND`: documented no-hit identity.
  Returns empty `userInformations`.
- `SE5560000001-annaj`: Anna Johansson.
  Seeded requirement-package lead and requirement-area owner.
- `SE5560000001-erikl`: Erik Lindberg.
  Seeded requirement-package lead and requirement-area owner.
- `SE5560000001-marias`: Maria Svensson.
  Seeded requirement-package lead and requirement-area owner.
- `SE5560000001-saraholm`: Sara Holm.
  Dogfood owner, specification lead, and co-author fixture.
- `SE5560000001-karlpersson`: Karl Persson.
  Dogfood owner and specification lead fixture.
- `SE5560000001-linneab`: Linnea Bergström.
  Area owner, specification lead, and review-related seed fixture.
- `SE5560000001-oscarn`: Oscar Nilsson.
  Dogfood owner and specification lead fixture.
- `SE5560000001-emmal`: Emma Lindqvist.
  Dogfood owner and specification lead fixture.
- `SE5560000001-kalle1`: Kalle Svensson.
  Duplicate-name privacy and co-author fixture.
- `SE5560000001-kalle2`: Kalle Svensson.
  Duplicate-name privacy and co-author fixture.
- `SE5560000001-areaowner1`: Olle AreaOwner.
  Dev-auth requirement-area owner fixture.
- `SE5560000001-areaco1`: Cora CoAuthor.
  Dev-auth requirement-area co-author fixture.
- `SE5560000001-specresp1`: Petra SpecificationResp.
  Dev-auth specification lead fixture.
- `SE5560000001-pkgco1`: Paul PkgCoAuthor.
  Dev-auth requirement-package co-author fixture.
- `SE5560000001-reviewer1`: Rita Reviewer.
  Dev-auth Kravgranskare fixture.
- `SE5560000001-admin1`: Ada Admin.
  Admin and PrivacyOfficer fixture.
- `SE5560000001-admin2`: Only Admin.
  Admin-only fixture.
- `SE5560000001-privacy1`: Disa PrivacyOfficer.
  PrivacyOfficer fixture.
- `SE5560000001-noroles1`: Noah NoRoles.
  Authenticated user with no global roles.
- `SE5560000001-2001`: Pia Paket.
  Extra requirement-package lead fixture.
- `SE5560000001-2002`: Pontus Paket.
  Extra requirement-package co-author fixture.
- `SE5560000001-3001`: Beata Översyn.
  Assigned reviewer for access review scenarios.
- `SE5560000001-3002`: Diana Dataskydd.
  Assigned reviewer for privacy scenarios.
- `SE5560000001-3003`: Gunnar Gallring.
  Assigned reviewer for retention/erasure scenarios.

Any syntactically valid but unknown `hsaIdentity` also returns an empty
`hsa:userInformations` wrapper. `SE1000-NOTFOUND` exists so tests can use a
named no-hit case.

## Lifecycle

The devcontainer starts the mock automatically. To manage only this service,
run these commands from the repository root:

```sh
npm run devcontainer:hsa-mock:config
npm run devcontainer:hsa-mock:build
npm run devcontainer:hsa-mock:up
npm run devcontainer:hsa-mock:recreate
npm run devcontainer:hsa-mock:status
npm run devcontainer:hsa-mock:verify
npm run devcontainer:hsa-mock:logs
npm run devcontainer:hsa-mock:restart
npm run devcontainer:hsa-mock:down
```

`status` starts the mock if it is not already running and checks
`http://127.0.0.1:8080/health` from inside the mock container.

`verify` starts the mock and Kong if needed, then posts a SOAP request through
`http://kong:8000/svr-hsaws2/hsaws` and a REST lookup through
`http://kong:8000/hsa/person-records/lookup`.

Run the mock's non-Docker SOAP contract tests with:

```sh
npm run test:hsa-mock
```
