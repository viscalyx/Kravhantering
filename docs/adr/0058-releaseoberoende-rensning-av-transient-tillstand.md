# Releaseoberoende rensning av transient tillstånd

Status: Antagen 2026-09-04.

Den gemensamma schemalagda rensningen av transient tillstånd är en
värdhanterad driftfunktion med en livscykel som är skild från den aktiva
applikationsreleasen. En uppgradering eller återgång får inte ta bort eller
ersätta rensningstjänsten enbart för att applikationsreleasen ändras.

Rensningstjänsten använder en separat konfigurerad och låst identitet för
rensningsavbilden. Målreleasen måste verifiera avbilden mot både sin
egen databasmodell och varje källreleases databasmodell som är giltig för
återgång. Ett rensningsmål som inte finns i en giltig äldre databasmodell är
inte tillämpligt; andra kompatibilitets-, behörighets- och anslutningsfel är
misslyckade utfall.

Rensningstjänsten får stoppas inom releaseövergångens vilolägeskontrakt medan
beständigt tillstånd migreras eller återställs. En kompatibel tjänst måste
starta och verifieras innan driftöverlämning för releaseövergång. Den normala
schemaläggningen fortsätter därefter oberoende av aktiv applikationsrelease;
manuell körning används endast för återhämtning efter fel.

## Övervägda alternativ

- Knyta rensningstjänsten till den aktiva applikationsreleasens Quadlet-mål och
  avbild för databasjobb: avvisat eftersom en giltig återgång då kan stoppa
  rensningen eller välja en avbild som saknar rensningskommandot.
- Begränsa hur länge en äldre applikationsrelease får vara aktiv eller kräva
  periodisk manuell rensning under återgång: avvisat eftersom det behandlar
  releasekopplingen i stället för att ta bort den.
