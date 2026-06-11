# Ta bort AI-behörighetsflaggor

Status: Antagen 2026-06-11.

Kravhantering tar bort AI-behörighetsflaggorna i databasen för kravområden och
uppdrag i kravunderlag eftersom de inte användes för faktisk åtkomstkontroll av
AI-assisterat författande. Att behålla flaggorna skulle ge en missvisande
säkerhetssignal i UI, dataskyddsexport och behörighetsöversyn; AI-assisterat
författande styrs i stället av den generella autentiserings- och
auktoriseringsgränsen tills en verklig resource-scoped policy införs.

## Övervägda alternativ

- Behålla flaggorna för framtida RBAC: avvisat eftersom oanvända
  behörighetsfält ser ut som aktiv styrning men inte stoppar någon körväg.
- Koppla flaggorna till AI-genereringsvägarna nu: avvisat eftersom rätt policy
  behöver besluta vilka uppdrag, ytor och klienttyper som ska få använda
  AI-assisterat författande, inte bara återanvända ett historiskt fält.
