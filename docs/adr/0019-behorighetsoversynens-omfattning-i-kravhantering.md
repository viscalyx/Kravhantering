# Behörighetsöversynens omfattning i Kravhantering

Status: Antagen 2026-06-05.

Kravhanterings `Behörighetsöversyn` i appen omfattar de uppdrag som
applikationen äger och kan ta ögonblicksbild av: kravområdesägare,
kravområdesmedförfattare, kravpaketsansvariga, kravpaketsmedförfattare,
kravunderlagsansvariga och kravunderlagsmedförfattare. Varje översynskörning
lagrar en ögonblicksbild av bevisläget, så senare uppdragsändringar skriver
inte om vad som granskas vid översynstillfället.

Globala IdP-roller som `Admin`, `Reviewer` och `PrivacyOfficer`, åtkomst till
source-code repository, plattformsbehörigheter och externt tilldelad MCP- eller
client access granskas fortsatt i de system där behörigheterna tilldelas.
Kravhantering kan registrera en extern evidence reference för dessa
granskningar, men låtsas inte att en granskning i appen är auktoritativ för
behörigheter som applikationen inte äger.

## Övervägda alternativ

- Granska varje behörighet i Kravhantering: avvisat eftersom IdP-roller,
  repository access, plattformsbehörigheter och external client access inte
  tilldelas av Kravhantering och inte kan inventeras auktoritativt där.
- Bara granska globala IdP-roller: avvisat eftersom applikationsägda uppdrag
  behöver resource-context review i Kravhantering.
- Räkna om historiska granskningsbevis från levande uppdrag: avvisat eftersom
  `Behörighetsöversyn` måste bevara vad som faktiskt granskas vid tillfället.
