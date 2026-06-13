# Obligatorisk kravunderlagsansvarig

Status: Antagen 2026-06-11.

Ett `Kravunderlag` ska alltid ha en aktuell `Kravunderlagsansvarig`.
Ansvarstilldelningen är en levande kravansvarstilldelning som används för
behörighet, dataskyddsexport, behörighetsöversyn och praktisk förvaltning av
kravunderlaget.

Nya kravunderlag får därför inloggad användare som kravunderlagsansvarig vid
skapande. Byte av kravunderlagsansvarig sker som en separat explicit åtgärd,
inte som en vanlig metadataändring i formuläret.

Migrationen som gör `responsible_hsa_id` obligatorisk failar om befintliga
kravunderlag saknar värde. Den gissar inte en fallback-person och skapar inte
en generell placeholder, eftersom det skulle skapa en felaktig aktiv
ansvarstilldelning.

## Övervägda alternativ

- Tillåta kravunderlag utan ansvarig: avvisat eftersom åtkomst, uppföljning och
  dataskydd då saknar en tydlig aktuell ansvarstilldelning.
- Backfilla alla saknade värden med en placeholder: avvisat eftersom en
  placeholder skulle se ut som en verklig ansvarstilldelning.
- Kräva manuell rättning före migration: valt eftersom det bevarar
  ansvarsinvariantens verksamhetsbetydelse och gör datakvalitetsbristen synlig.
