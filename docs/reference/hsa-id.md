# HSA-id

HSA-id är en unik identifierare för de objekt som
[Katalogtjänst HSA](https://www.inera.se/tjanster/alla-tjanster-a-o/katalogtjanst-hsa/)
håller information om.

HSA-id byggs upp av HSA-id-prefix och HSA-id-suffix, i formatet
`{hsa-id-prefix}-{hsa-id-suffix}`.

Exempel: `SE5560000001-abc123` där `SE5560000001` är HSA-id-prefixet
och `abc123` är HSA-id-suffixet.

HSA-id får inte vara längre än 31 tecken.

<!-- markdownlint-disable-next-line MD013 -->
Referens: <https://openehr.atlassian.net/wiki/spaces/SWE/pages/1922990156/HSA-identitet+och+Organisationsnummer>

Se även källkodens validering i
[lib/auth/hsa-id.ts](../../lib/auth/hsa-id.ts#L1-L20).

## HSA-id-prefix

HSA-id-prefix är delen före bindestrecket och består av följande delar i
angiven ordning:

- landskoden - t.ex. `SE`
- organisationsnummer - 10 tecken utan bindestreck, t.ex. regionens
  organisationsnummer; `2321000131`

> [!NOTE]
> Kravhantering tillåter vilken två bokstavskod (A–Z) som helst för
> landskoden

## HSA-id-suffix

HSA-id-suffix är delen efter bindestrecket och består av valfria bokstäver
(A-Z och a-z) och/eller siffror (0-9). Tecknen `å`, `ä`, `ö` samt
`@`-tecken är inte tillåtna.
