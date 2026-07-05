# Forensisk loggning av AI-säkerhetsblockeringar

Status: Antagen 2026-07-05.

Kravhantering skriver fortsatt metadata om AI-säkerhetsblockeringar till
säkerhetsloggen. Därutöver kan Admin Center styra en separat forensisk
JSON-loggström som innehåller rått blockerat innehåll och matchade
AI-säkerhetsregeltermer. Inställningen är på som standard under den aktuella
diagnostikfasen, men är avsedd att kunna bli avstängd som standard i en senare
ändring.

Den forensiska händelsen använder samma request-id, korrelations-id och
event-id som metadatahändelsen så att loggströmmar kan korreleras även när de
routas till olika loggmål. I den forensiska händelsen ligger dessa identiteter
och beslutsmetadata på toppnivå. `request` används för transportmetadata som
metod, sökväg, IP-adress och user agent. Metadatahändelsen skrivs alltid till
`security-audit` och innehåller inte rå prompt, modellutdata,
reparations-JSON, bilddata eller matchade regeltermer. Den forensiska
händelsen skrivs till `security-forensics` och begränsas till de textdelar som
faktiskt screenades i det blockerade steget, till exempel behov/context,
reparationsinput, streamad resonering eller slutligt modellutdata.

Inställningen påverkar bara den forensiska JSON-loggen. Den aktiverar eller
stänger inte av AI-säkerhetsfiltret, metadatahändelsen, blockeringsbeteendet
eller användarens felmeddelande.

## Övervägda alternativ

- Endast metadata i `security-audit`: avvisat eftersom det inte ger tillräcklig
  evidens för att diagnostisera falska positiva blockeringar och trimma
  AI-säkerhetsregler.
- Lägga rått blockerat innehåll i den befintliga `security-audit`-händelsen:
  avvisat eftersom säkerhetsloggens metadata-kontrakt då skulle börja bära
  promptar, modellresonering, personuppgifter, hemligheter och fientlig text.
- Separat forensisk kanal bakom Admin Center-inställning: valt eftersom det ger
  diagnostisk evidens samtidigt som loggning, åtkomst och retention kan styras
  striktare än för metadatahändelser.
- Ha inställningen av som standard redan nu: avvisat för den aktuella
  diagnostikfasen eftersom förvaltningen behöver samla in underlag för falskt
  positiva AI-säkerhetsregler. En senare ändring kan byta standard till
  avstängt när underlaget är insamlat.
