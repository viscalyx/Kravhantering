# HSA-id

HSA-id är en unik identifierare för de objekt som
[Katalogtjänst HSA](https://www.inera.se/tjanster/alla-tjanster-a-o/katalogtjanst-hsa/)
håller information om.

Den här referensen beskriver formatet som Kravhantering accepterar för
utvecklare och den som konfigurerar identitetsleverantörens HSA-id-uppgift.

HSA-id byggs upp av HSA-id-prefix och HSA-id-suffix, i formatet
`{hsa-id-prefix}-{hsa-id-suffix}`.

Exempel: `SE5560000001-abc123` där `SE5560000001` är HSA-id-prefixet
och `abc123` är HSA-id-suffixet.

HSA-id får inte vara längre än 31 tecken.

Referens: <https://openehr.atlassian.net/wiki/spaces/SWE/pages/1922990156/HSA-identitet+och+Organisationsnummer>

Se även källkodens validering i
[lib/auth/hsa-id.ts](../../lib/auth/hsa-id.ts). Formatkontrollen visar inte
om identifieraren finns i HSA.

## HSA-id-prefix

HSA-id-prefix är delen före bindestrecket och består av följande delar i
angiven ordning:

- landskoden - två versala bokstäver (A–Z), t.ex. `SE`
- organisationsnummer - exakt 10 siffror utan bindestreck, t.ex. regionens
  organisationsnummer; `2321000131`

> [!NOTE]
> Kravhantering tillåter valfri kombination av två versala bokstäver (A–Z)
> för landskoden, inte enbart `SE`.

## HSA-id-suffix

HSA-id-suffix är delen efter bindestrecket och består av 1–18 tecken:
bokstäver (A-Z och a-z) och/eller siffror (0-9). Tecknen `å`, `ä`, `ö` samt
`@`-tecken är inte tillåtna. Suffixet får inte vara tomt.
