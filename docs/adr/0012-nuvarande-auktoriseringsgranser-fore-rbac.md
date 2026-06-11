# Nuvarande auktoriseringsgränser före RBAC

Status: Antagen 2026-06-05.

Kravhantering auktoriserar i dag från det verifierade aktörssammanhang som
beskrivs i ADR 0007, med kanoniska IdP-roller som `Admin`, `Reviewer` och
`PrivacyOfficer`, samt HSA-ID-matchning där ett arbetsflöde har en tilldelad
aktör. `Admin` skyddar Admin Center och mutationer av referensdata,
`PrivacyOfficer` skyddar dataskydds- och retentionsflöden, och körningar för
behörighetsöversyn hanteras av administratörer medan tilldelade granskare får
besluta sina egna granskningsrader genom verifierat HSA-ID.

Behörighet för kravbibliotek, kravunderlag, avsteg, förslag, rapporter och
live AI-assisterat författande dokumenteras avsiktligt inte här som en färdig
uppdragsbaserad RBAC-modell. Dessa arbetsflöden har i dag en
auktoriseringstjänstegräns och viss autentisering eller rollstyrning på
route-nivå, men resource-scoped fail-closed decisions baserade på
kravområdesägare, kravområdesmedförfattare, kravunderlagsansvariga,
kravunderlagsmedförfattare och andra uppdrag är fortsatt planerade i
[issue #270](https://github.com/viscalyx/Kravhantering/issues/270).

När issue #270 implementeras ska denna ADR antingen ersättas av en ny ADR för
uppdragsbaserad auktorisering eller uppdateras om den implementerade policyn är
en direkt förfining av denna nuvarande gräns.

## Övervägda alternativ

- Dokumentera målmatrisen i issue #270 som nuvarande arkitektur: avvisat
  eftersom det skulle överdriva vad den körande applikationen faktiskt
  upprätthåller i dag.
- Frysa slutlig RBAC-policy i denna ADR: avvisat eftersom issue #270 fortsatt
  spårar öppna implementationsval kring ägarlivscykel, förvaltning av
  kravurvalsfrågor, rapportsynlighet, MCP enforcement och live AI-assisterat
  författande.
- Lämna auktorisering odokumenterad tills RBAC är färdigt: avvisat eftersom
  nuvarande gräns är säkerhetsrelevant och lätt att missförstå.
