# DB-förvaltade AI-säkerhetsregler

Status: Antagen 2026-07-03.

AI-säkerhetsregler för AI-assisterat författande ska förvaltas i databasen med
required seed-data som källa för standardregler och standardord. Runtime ska
läsa den aktiva regeluppsättningen från databasen och lagra den i cache under
en Admin Center-styrd TTL. Om regeluppsättningen inte kan läsas ska
AI-assistering stoppas innan modellkatalog, bygge av promptar eller anrop till
modellleverantör.

Standardord lagras som rader märkta som standard och aktiva. Administratörer
kan inaktivera standardord, ändra riktning per term och lägga till egna
termer. Egna termer lagras som icke-standard och kan tas bort; standardtermer
tas inte bort utan inaktiveras. Nya standardtermer från required seed ska bli
aktiva vid uppgradering, och en egen term som sammanfaller med en ny
standardterm ska hanteras som standardterm i stället för att visas dubbelt.

Admin Center ska spara AI-flikens inställningar direkt utan en gemensam
Spara-knapp. Säkerhetsregeltermer sparas som små operationer per term medan
andra AI-inställningar sparas när kontrollen commit:as. Varje mutation ska
loggas som privilegierad administrativ åtgärd med metadata utan själva termen.

## Övervägda alternativ

- Behålla AI-säkerhetsregler som hårdkodade reguljära uttryck: avvisat eftersom
  förvaltningen behöver kunna trimma standardord och egna kompletteringar utan
  kodändring.
- Lagra hela regelsättet som en JSON-konfiguration: avvisat eftersom
  standardord, egna termer, aktiv status och riktning behöver kunna hanteras,
  valideras, seedas och loggas i åtgärdsloggen på radnivå.
- Ha fallback i kod när databasen inte kan läsas: avvisat eftersom
  systemet då skulle kunna köra AI-assistering med ett annat regelsätt än det
  som förvaltningen ser och styr i Admin Center.
- Spara AI-flikens ändringar med en gemensam Spara-knapp: avvisat eftersom
  administration av termer och befintliga AI-inställningar ska ge direkt och
  tydlig återkoppling per kontroll.
